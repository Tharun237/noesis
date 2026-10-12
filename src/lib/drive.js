// The customer's own Google Drive, as the place their library is kept between their devices.
//
// Drive gives every app a hidden folder of its own in each customer's Drive ("appDataFolder"): the customer
// does not see it among their files, no other app can open it, and Noesis can open nothing else in their
// Drive. It is their storage and their account: Noesis keeps no copy and pays for none, whether there are
// ten customers or a million. (developers.google.com/workspace/drive/api/guides/appdata, read 2026-10-12;
// the permission, drive.appdata, is in Google's "non-sensitive" class.)
//
// The browser talks to Drive directly. The only thing asked of Noesis's server is a pass, good for about an
// hour (POST /api/auth/token): renewing one needs the app's Google key, which no browser may hold.
//
// Each synced record is one small file, named by its key, with the time it was written in the file's
// appProperties, so that a list of what changed says which records are newer without opening any of them.
const GOOGLE = 'https://www.googleapis.com'
const SPACE = 'appDataFolder'
const EARLY_S = 60 // a pass is replaced a minute before it runs out
const PAGE = 1000
const FILE = 'id,name,appProperties'

let pass = null // { value, until, api }

async function getPass() {
  if (pass && Date.now() < pass.until) return pass
  const res = await fetch('/api/auth/token', { method: 'POST' })
  if (res.status === 401) throw Object.assign(new Error('Signed out'), { signedOut: true })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Could not renew sign-in (${res.status})`)
  const got = await res.json()
  pass = { value: got.access_token, until: Date.now() + (got.expires_in - EARLY_S) * 1000, api: got.api || GOOGLE }
  return pass
}
export const forgetPass = () => { pass = null }

// What Drive says went wrong, in words a customer can act on.
async function why(res) {
  const e = (await res.json().catch(() => ({}))).error || {}
  const reason = e.errors?.[0]?.reason
  if (reason === 'storageQuotaExceeded') return 'Your Google Drive is full, so your library cannot be saved to it.'
  if (reason === 'accessNotConfigured') return 'Google Drive is not switched on for Noesis yet.'
  if (res.status === 403 && /scope|permission/i.test(e.message || '')) return 'Noesis was not given permission to keep your library in your Google Drive. Sign out and sign in again to give it.'
  return `Google Drive: ${e.message || res.status}`
}

async function call(path, init = {}, again = true) {
  const p = await getPass()
  const res = await fetch(p.api + path, { ...init, headers: { ...init.headers, authorization: `Bearer ${p.value}` } })
  if (res.status === 401 && again) { forgetPass(); return call(path, init, false) } // the pass ran out early: one fresh one
  if (!res.ok) throw new Error(await why(res))
  return res
}
const query = o => new URLSearchParams(Object.entries(o).filter(([, v]) => v != null)).toString()

// Where "what changed since" starts from. Asked for BEFORE the first full list, so nothing written in between is missed.
export const startToken = async () => (await (await call('/drive/v3/changes/startPageToken')).json()).startPageToken

// Everything in the folder: [{ id, name, appProperties }]. Once per device, the first time.
export async function listAll() {
  const files = []
  for (let pageToken; ;) {
    const out = await (await call(`/drive/v3/files?${query({ spaces: SPACE, pageSize: PAGE, fields: `nextPageToken,files(${FILE})`, pageToken })}`)).json()
    files.push(...(out.files || []))
    if (!(pageToken = out.nextPageToken)) return files
  }
}

// What changed since `from`: { changes: [{ fileId, removed, file }], cursor }. One small request when nothing has.
export async function changesSince(from) {
  const changes = []
  for (let pageToken = from; ;) {
    const out = await (await call(`/drive/v3/changes?${query({ spaces: SPACE, pageSize: PAGE, includeRemoved: true, pageToken, fields: `nextPageToken,newStartPageToken,changes(fileId,removed,file(${FILE}))` })}`)).json()
    changes.push(...(out.changes || []))
    if (out.newStartPageToken) return { changes, cursor: out.newStartPageToken }
    pageToken = out.nextPageToken
  }
}

export const read = id => call(`/drive/v3/files/${id}?alt=media`)
export const remove = id => call(`/drive/v3/files/${id}`, { method: 'DELETE' })

// Write a record: a new file, or over the one it already has. `body` is text or bytes (5 MB at most; the
// largest thing written is a 1.5 MB part of a book's text). `quick`: the page is being left, so the request
// is handed to the browser to finish by itself. Returns the file's id.
export async function write(name, at, body, id, quick = false) {
  const boundary = `noesis${crypto.randomUUID().replace(/-/g, '')}`
  const details = { appProperties: { at: String(at) }, ...(id ? {} : { name, parents: [SPACE] }) }
  const data = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(details)}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
    body,
    `\r\n--${boundary}--`,
  ])
  const res = await call(`/upload/drive/v3/files${id ? `/${id}` : ''}?${query({ uploadType: 'multipart', fields: 'id' })}`, {
    method: id ? 'PATCH' : 'POST', headers: { 'content-type': `multipart/related; boundary=${boundary}` }, body: data, keepalive: quick,
  })
  return (await res.json()).id
}
