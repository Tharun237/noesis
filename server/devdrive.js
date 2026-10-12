// A stand-in for Google Drive's app folder, for local development and the end-to-end tests ONLY (it answers
// nowhere but localhost with DEV_LOGIN=1). It speaks the few Drive calls src/lib/drive.js makes, in Drive's
// own shapes, so the app runs exactly the code it runs against Google; and it keeps everything in this
// process's memory, per signed-in development name, until the dev server stops.
//
//   GET    /drive/v3/changes/startPageToken
//   GET    /drive/v3/changes?pageToken=
//   GET    /drive/v3/files                       (list)
//   GET    /drive/v3/files/<id>?alt=media
//   DELETE /drive/v3/files/<id>
//   POST   /upload/drive/v3/files?uploadType=multipart
//   PATCH  /upload/drive/v3/files/<id>?uploadType=multipart
const drives = new Map() // development name → { seq, files: Map<id, { id, name, appProperties, bytes, seq }>, removed: [{ id, seq }] }
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

export async function handleDevDrive(request, env) {
  if (env.DEV_LOGIN !== '1' || !isLocal(request.url)) return refuse(404, 'notFound', 'Not found')
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
  if (path.startsWith('/upload/drive/v3/files')) {
    const { meta, body } = parts(new Uint8Array(await request.arrayBuffer()), request.headers.get('content-type'))
    const f = id ? d.files.get(id) : { id: crypto.randomUUID(), name: meta.name }
    if (!f) return refuse(404, 'notFound', 'File not found')
    Object.assign(f, { appProperties: { ...f.appProperties, ...meta.appProperties }, bytes: body, seq: ++d.seq })
    d.files.set(f.id, f)
    return json(shown(f))
  }
  if (id) {
    const f = d.files.get(id)
    if (!f) return refuse(404, 'notFound', 'File not found')
    if (request.method === 'DELETE') {
      d.files.delete(id)
      d.removed.push({ id, seq: ++d.seq })
      return new Response(null, { status: 204 })
    }
    return new Response(f.bytes, { headers: { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' } })
  }
  return refuse(404, 'notFound', 'Not found')
}
