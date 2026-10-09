// Per-account sync store. Runs on Cloudflare Pages Functions (env.DB = D1) and in the Vite dev server.
// Every request is scoped to the signed-in user (session cookie); conflicts resolve by last-writer-wins
// on the client timestamp; changes are handed out by a per-user cursor.
//
// POST /api/sync        { cursor, push: [{ k, at, v }] }  → { cursor, more, changes: [{ k, at, v }] }
// PUT  /api/sync/blob   ?k&at   body = gzipped book text part
// GET  /api/sync/blob   ?k      → bytes
import { getUser } from './auth.js'

const KEY = /^(?:cols|(?:meta|pos|marks):[A-Za-z0-9-]{1,40}|doc:[A-Za-z0-9-]{1,40}:\d{1,16}:\d{1,4})$/
const MAX_SMALL = 96 * 1024 // per JSON record (meta with a cover image is the largest, ~20 KB)
const MAX_BLOB = 1_900_000 // D1 row limit is 2 MB
const MAX_PUSH = 200
const PULL_LIMIT = 300
const USER_QUOTA = 300 * 1024 * 1024 // ponytail: ~600 books of text per account on the free plan; raise with a paid plan
const FUTURE_SKEW = 2 * 60 * 1000

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
})
const fail = (status, error) => json({ error }, status)
const te = new TextEncoder()
const td = new TextDecoder()

// Client clocks order edits (so offline changes keep their real time); a clock far in the future
// would win forever, so it is clamped to "now".
const clampAt = at => Math.min(Math.floor(at), Date.now() + FUTURE_SKEW)

const UPSERT = `INSERT INTO rec (uid, k, at, seq, v, size)
  VALUES (?1, ?2, ?3, (SELECT IFNULL(MAX(seq), 0) + 1 FROM rec WHERE uid = ?1), ?4, ?5)
  ON CONFLICT (uid, k) DO UPDATE SET at = excluded.at, seq = excluded.seq, v = excluded.v, size = excluded.size
  WHERE excluded.at > rec.at`

export async function handleSync(request, env) {
  if (request.method !== 'POST') return fail(405, 'POST only')
  const user = await getUser(request, env)
  if (!user) return fail(401, 'Signed out')
  if (+request.headers.get('content-length') > 4 * 1024 * 1024) return fail(413, 'Too large')
  let body
  try { body = await request.json() } catch { return fail(400, 'Invalid JSON') }
  const { cursor = 0, push = [] } = body || {}
  if (!Number.isInteger(cursor) || cursor < 0) return fail(400, 'Bad cursor')
  if (!Array.isArray(push) || push.length > MAX_PUSH) return fail(400, 'Bad push')

  const stmts = []
  for (const r of push) {
    if (!KEY.test(r?.k || '') || r.k.startsWith('doc:')) return fail(400, `Bad key ${r?.k}`)
    if (!Number.isFinite(r.at) || r.at <= 0 || r.v === undefined) return fail(400, 'Bad record')
    const v = te.encode(JSON.stringify(r.v))
    if (v.length > MAX_SMALL) return fail(413, `Record too large: ${r.k}`)
    stmts.push(env.DB.prepare(UPSERT).bind(user.id, r.k, clampAt(r.at), v, v.length))
  }
  if (stmts.length) await env.DB.batch(stmts)

  const { results } = await env.DB.prepare(
    `SELECT k, at, seq, CASE WHEN k LIKE 'doc:%' THEN NULL ELSE v END AS v FROM rec
     WHERE uid = ?1 AND seq > ?2 ORDER BY seq LIMIT ?3`,
  ).bind(user.id, cursor, PULL_LIMIT).all()
  return json({
    cursor: results.length ? results[results.length - 1].seq : cursor,
    more: results.length === PULL_LIMIT,
    changes: results.map(r => ({ k: r.k, at: r.at, v: r.v ? JSON.parse(td.decode(new Uint8Array(r.v))) : null })),
  })
}

export async function handleBlob(request, env) {
  const user = await getUser(request, env)
  if (!user) return fail(401, 'Signed out')
  const q = new URL(request.url).searchParams
  const k = q.get('k') || ''
  if (!KEY.test(k) || !k.startsWith('doc:')) return fail(400, 'Bad key')

  if (request.method === 'GET') {
    const row = await env.DB.prepare('SELECT v FROM rec WHERE uid = ?1 AND k = ?2').bind(user.id, k).first()
    if (!row) return fail(404, 'Not found')
    return new Response(new Uint8Array(row.v), { headers: { 'content-type': 'application/octet-stream', 'cache-control': 'private, no-store' } })
  }
  if (request.method === 'PUT') {
    const at = +q.get('at')
    if (!Number.isFinite(at) || at <= 0) return fail(400, 'Bad at')
    const v = new Uint8Array(await request.arrayBuffer())
    if (!v.length || v.length > MAX_BLOB) return fail(413, 'Part too large')
    const used = await env.DB.prepare('SELECT IFNULL(SUM(size), 0) AS n FROM rec WHERE uid = ?1').bind(user.id).first()
    if (used.n + v.length > USER_QUOTA) return fail(507, 'Your sync storage is full')
    await env.DB.prepare(UPSERT).bind(user.id, k, clampAt(at), v, v.length).run()
    return json({ ok: true })
  }
  return fail(405, 'GET or PUT only')
}
