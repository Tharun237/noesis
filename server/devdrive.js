// A stand-in for Google Drive's app folder, for local development and the end-to-end tests ONLY (it answers
// nowhere but localhost with DEV_LOGIN=1). It speaks the few Drive calls src/lib/drive.js makes, in Drive's
// own shapes, so the app runs exactly the code it runs against Google. Like Drive, it does not forget: what
// it holds is written to a file in the system's temporary folder, so it is still there when the dev server
// is started again. (Kept only in memory, it emptied itself at every restart, and every test profile that was
// signed in then met a folder emptied behind its back: real, but not what the tests were about.)
//
//   GET    /drive/v3/changes/startPageToken
//   GET    /drive/v3/changes?pageToken=
//   GET    /drive/v3/files                       (list)
//   GET    /drive/v3/files/<id>?alt=media
//   DELETE /drive/v3/files/<id>
//   POST   /upload/drive/v3/files?uploadType=multipart
//   PATCH  /upload/drive/v3/files/<id>?uploadType=multipart
//   POST   /upload/drive/v3/files?uploadType=resumable   → Location: the upload's own address
//   PUT    <that address>  Content-Range: bytes a-b/n | bytes */n   → 308 + Range, or the file
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const KEPT = join(tmpdir(), 'noesis-devdrive.json')
const drives = new Map() // development name → { seq, files: Map<id, { id, name, appProperties, bytes, seq }>, removed: [{ id, seq }] }
try {
  for (const [who, d] of Object.entries(JSON.parse(readFileSync(KEPT, 'utf8')))) {
    drives.set(who, { seq: d.seq, removed: d.removed, files: new Map(d.files.map(f => [f.id, { ...f, bytes: new Uint8Array(Buffer.from(f.bytes, 'base64')) }])) })
  }
} catch { /* nothing kept yet */ }
let saving = null
const keep = () => {
  saving ??= setTimeout(() => {
    saving = null
    const all = Object.fromEntries([...drives].map(([who, d]) => [who, { seq: d.seq, removed: d.removed, files: [...d.files.values()].map(f => ({ ...f, bytes: Buffer.from(f.bytes).toString('base64') })) }]))
    try { writeFileSync(KEPT, JSON.stringify(all)) } catch { /* a stand-in that cannot write is only forgetful */ }
  }, 200)
}
const te = new TextEncoder()
const td = new TextDecoder()
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
const refuse = (status, reason, message) => json({ error: { code: status, message, errors: [{ reason }] } }, status)
const isLocal = url => ['localhost', '127.0.0.1'].includes(new URL(url).hostname)
const shown = f => ({ id: f.id, name: f.name, appProperties: f.appProperties })

function indexOf(bytes, pattern, from = 0) {
  outer: for (let i = from; i <= bytes.length - pattern.length; i++) {
    for (let j = 0; j < pattern.length; j++) if (bytes[i + j] !== pattern[j]) continue outer
    return i
  }
  return -1
}
// multipart/related: the file's details as JSON, then its content
function parts(bytes, type) {
  const boundary = te.encode('--' + /boundary=([^;]+)/.exec(type)[1].replace(/"/g, ''))
  const gap = te.encode('\r\n\r\n')
  const a = indexOf(bytes, boundary)
  const metaFrom = indexOf(bytes, gap, a) + gap.length
  const b = indexOf(bytes, boundary, metaFrom)
  const bodyFrom = indexOf(bytes, gap, b) + gap.length
  const end = indexOf(bytes, boundary, bodyFrom)
  return { meta: JSON.parse(td.decode(bytes.subarray(metaFrom, b - 2))), body: bytes.slice(bodyFrom, end - 2) }
}

// Resumable uploads under way: the address itself is the permission (as on Drive), so its pieces carry no pass.
const sessions = new Map() // upload id → { who, meta, total, bytes, got }
function piece(request, sid, d) {
  const up = sessions.get(sid)
  if (!up) return refuse(404, 'notFound', 'Upload session not found')
  const range = /^bytes (?:(\d+)-(\d+)|\*)\/(\d+)$/.exec(request.headers.get('content-range') || '')
  if (!range || +range[3] !== up.total) return refuse(400, 'badRequest', 'Bad Content-Range')
  const status = () => new Response(null, { status: 308, headers: up.got ? { range: `bytes=0-${up.got - 1}` } : {} })
  return (async () => {
    if (range[1] != null) {
      const body = new Uint8Array(await request.arrayBuffer())
      if (+range[1] !== up.got || body.length !== +range[2] - +range[1] + 1) return status() // not where it left off: say where that is
      up.bytes.set(body, up.got)
      up.got += body.length
    }
    if (up.got < up.total) return status()
    sessions.delete(sid)
    const f = { id: crypto.randomUUID(), name: up.meta.name, appProperties: up.meta.appProperties || {}, bytes: up.bytes, seq: ++d.seq }
    d.files.set(f.id, f)
    keep()
    return json(shown(f))
  })()
}

export async function handleDevDrive(request, env) {
  if (env.DEV_LOGIN !== '1' || !isLocal(request.url)) return refuse(404, 'notFound', 'Not found')
  const session = /\/api\/devdrive\/upload\/session\/([^/?]+)/.exec(new URL(request.url).pathname)?.[1]
  if (session && request.method === 'PUT') return piece(request, session, drives.get(sessions.get(session)?.who) || { seq: 0, files: new Map() })
  const who = (request.headers.get('authorization') || '').replace(/^Bearer /, '')
  if (!who.startsWith('dev:')) return refuse(401, 'authError', 'Invalid Credentials')
  const d = drives.get(who) ?? drives.set(who, { seq: 0, files: new Map(), removed: [] }).get(who)
  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/api\/devdrive/, '')
  const id = /\/files\/([^/]+)$/.exec(path)?.[1]

  if (path === '/drive/v3/changes/startPageToken') return json({ startPageToken: String(d.seq) })
  if (path === '/drive/v3/changes') {
    const since = +url.searchParams.get('pageToken')
    return json({
      newStartPageToken: String(d.seq),
      changes: [
        ...d.removed.filter(r => r.seq > since).map(r => ({ fileId: r.id, removed: true })),
        ...[...d.files.values()].filter(f => f.seq > since).map(f => ({ fileId: f.id, removed: false, file: shown(f) })),
      ],
    })
  }
  if (path === '/drive/v3/files') return json({ files: [...d.files.values()].map(shown) })
  if (path === '/upload/drive/v3/files' && url.searchParams.get('uploadType') === 'resumable') {
    const total = +request.headers.get('x-upload-content-length')
    if (!(total > 0)) return refuse(400, 'badRequest', 'X-Upload-Content-Length is needed')
    const sid = crypto.randomUUID()
    sessions.set(sid, { who, meta: await request.json(), total, bytes: new Uint8Array(total), got: 0 })
    return new Response(null, { status: 200, headers: { location: `${url.protocol}//${request.headers.get('host') || url.host}/api/devdrive/upload/session/${sid}` } })
  }
  if (path.startsWith('/upload/drive/v3/files')) {
    const { meta, body } = parts(new Uint8Array(await request.arrayBuffer()), request.headers.get('content-type'))
    const f = id ? d.files.get(id) : { id: crypto.randomUUID(), name: meta.name }
    if (!f) return refuse(404, 'notFound', 'File not found')
    Object.assign(f, { appProperties: { ...f.appProperties, ...meta.appProperties }, bytes: body, seq: ++d.seq })
    d.files.set(f.id, f)
    keep()
    return json(shown(f))
  }
  if (id) {
    const f = d.files.get(id)
    if (!f) return refuse(404, 'notFound', 'File not found')
    if (request.method === 'DELETE') {
      d.files.delete(id)
      d.removed.push({ id, seq: ++d.seq })
      keep()
      return new Response(null, { status: 204 })
    }
    return new Response(f.bytes, { headers: { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' } })
  }
  return refuse(404, 'notFound', 'Not found')
}
