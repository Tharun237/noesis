// Cross-device sync for signed-in users (Sign in with Google), last-writer-wins per record.
//
// Records: meta:<doc> · pos:<doc> · marks:<doc> · cols · doc:<doc>:<ver>:<part> (book text, uploaded once)
// Audio is never synced: each device voices the text itself, so sync stays small and free.
// Without an account Noesis works fully offline/local; signing in only adds sync.
import { createStore as idbStore, get, set, del } from 'idb-keyval'
import { createStore } from './store.js'

const store = idbStore('noesis-sync', 'sync')
export const account = createStore({ user: null, checked: false, google: false, dev: false, reachable: true })
export const syncState = createStore({ status: 'idle', last: 0, error: null })

const te = new TextEncoder()
const td = new TextDecoder()
const PART = 1_500_000
const POLL_MS = 90_000
const POS_THROTTLE_MS = 60_000 // while playing; pausing / leaving the app pushes immediately

let hooks = null // { snapshot(k), apply(k, value), content(id), allKeys() } — provided by library.js
let uid = null
let cursor = 0
let clock = {} // k → newest timestamp this device has seen or written
let dirty = {} // k → timestamp of a local change not yet pushed
let uploaded = {} // `${doc}:${ver}` → number of text parts already on the server
let flushTimer = null
let flushing = null
let lastPosPush = 0
let urgent = false // a pause arrived while a flush was in flight: push again right after
let early = {} // edits made before the account check finished (e.g. at boot); merged in when sync starts

const persist = () => uid && set('state', { uid, cursor, clock, dirty, uploaded }, store)
const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer())

export const configureSync = h => { hooks = h }

export function touch(k, at = Date.now()) {
  clock[k] = Math.max(clock[k] || 0, at)
  if (!uid) { early[k] = clock[k]; return }
  dirty[k] = clock[k]
  persist()
  const throttled = k.startsWith('pos:') && document.visibilityState === 'visible'
  schedule(throttled ? Math.max(1500, POS_THROTTLE_MS - (Date.now() - lastPosPush)) : 1500)
}

// Pause / stop: the moment you are most likely to switch devices, so skip the playback throttle.
export function flushNow() {
  if (!uid) return
  urgent = true
  clearTimeout(flushTimer)
  setTimeout(flush, 50) // after the position patch lands
}

function schedule(ms) {
  clearTimeout(flushTimer)
  flushTimer = setTimeout(flush, ms)
}

async function api(path, init) {
  const res = await fetch(path, init)
  if (res.status === 401) { signedOutHere(); throw new Error('Signed out') }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Sync failed (${res.status})`)
  return res
}

// Push local changes and pull remote ones in one round trip.
export async function flush() {
  if (!uid) return
  if (flushing) return flushing
  flushing = (async () => {
    urgent = false
    syncState.set({ status: 'syncing' })
    try {
      for (let more = true; more;) {
        const batch = Object.entries(dirty).slice(0, 150)
        const push = []
        for (const [k, at] of batch) {
          const v = await hooks.snapshot(k)
          if (v === undefined) continue
          if (k.startsWith('meta:') && v.contentVer && !v.deleted) v.parts = await uploadContent(k.slice(5), v.contentVer)
          push.push({ k, at, v })
        }
        const body = JSON.stringify({ cursor, push })
        const out = await (await api('/api/sync', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body,
          keepalive: document.visibilityState === 'hidden' && body.length < 60_000, // survives app switch / tab close
        })).json()
        for (const [k, at] of batch) if (dirty[k] === at) delete dirty[k]
        if (push.some(r => r.k.startsWith('pos:'))) lastPosPush = Date.now()
        for (const c of out.changes) await receive(c)
        cursor = out.cursor
        await persist()
        more = out.more || (batch.length === 150 && Object.keys(dirty).length > 0)
      }
      syncState.set({ status: 'idle', last: Date.now(), error: null })
    } catch (e) {
      if (!uid) return
      syncState.set({ status: navigator.onLine ? 'error' : 'offline', error: e.message })
      schedule(30_000) // queued changes are persisted; they land when the network does
    } finally {
      flushing = null
      // Changes made while this round trip was in flight would otherwise wait for the next poll.
      if (uid && (urgent || Object.keys(dirty).some(k => !k.startsWith('pos:')))) schedule(urgent ? 50 : 1500)
    }
  })()
  return flushing
}

async function receive({ k, at, v }) {
  if (v == null || at <= (clock[k] || 0)) return // text parts are fetched on demand; older than ours → ignore
  clock[k] = at
  if (dirty[k] && dirty[k] < at) delete dirty[k] // a newer edit from another device beats our queued one
  await hooks.apply(k, v)
}

// Book text: gzipped once, split into ≤1.5 MB parts, uploaded before the meta record that points to it.
async function uploadContent(id, ver) {
  const tag = `${id}:${ver}`
  if (uploaded[tag]) return uploaded[tag]
  const doc = await hooks.content(id)
  if (!doc) return 0
  const z = await pipe(te.encode(JSON.stringify(doc)), new CompressionStream('gzip'))
  const parts = Math.max(1, Math.ceil(z.length / PART))
  for (let n = 0; n < parts; n++) {
    await api(`/api/sync/blob?k=${encodeURIComponent(`doc:${id}:${ver}:${n}`)}&at=${ver}`, { method: 'PUT', body: z.subarray(n * PART, (n + 1) * PART) })
  }
  uploaded[tag] = parts
  await persist()
  return parts
}

export async function downloadContent(id, ver, parts) {
  const chunks = []
  for (let n = 0; n < parts; n++) {
    chunks.push(await (await api(`/api/sync/blob?k=${encodeURIComponent(`doc:${id}:${ver}:${n}`)}`)).arrayBuffer())
  }
  uploaded[`${id}:${ver}`] = parts // already on the server; never re-upload it from this device
  return JSON.parse(td.decode(await pipe(new Uint8Array(await new Blob(chunks).arrayBuffer()), new DecompressionStream('gzip'))))
}

// ── account & lifecycle ────────────────────────────────────────────────────────────
let wired = false
function wire() {
  if (wired) return
  wired = true
  document.addEventListener('visibilitychange', () => {
    if (!uid) return
    if (document.visibilityState === 'visible') flush()
    else if (Object.keys(dirty).length) { clearTimeout(flushTimer); flush() } // where you stopped, before you switch devices
  })
  addEventListener('online', () => uid && flush())
  addEventListener('focus', () => uid && Date.now() - syncState.get().last > 15_000 && flush())
  setInterval(() => uid && document.visibilityState === 'visible' && flush(), POLL_MS)
}

async function resetFor(user) {
  uid = user
  cursor = 0
  clock = {}
  dirty = {}
  uploaded = {}
  const now = Date.now()
  for (const k of await hooks.allKeys()) { clock[k] = now; dirty[k] = now } // first sync here = union of libraries
  await persist()
}

export async function startSync() {
  const [config, me] = await Promise.all([
    fetch('/api/auth/config').then(r => (r.ok ? r.json() : {})).catch(() => ({})),
    fetch('/api/auth/me').then(r => (r.ok ? r.json() : { user: null })).catch(() => null),
  ])
  account.set({ google: !!config.google, dev: !!config.dev })
  if (me === null) { // offline: keep syncing with the account we last knew about
    const saved = await get('state', store)
    if (saved?.uid) {
      ({ uid, cursor, clock, dirty, uploaded } = saved)
      for (const [k, at] of Object.entries(early)) { clock[k] = Math.max(clock[k] || 0, at); dirty[k] = clock[k] }
      early = {}
    }
    account.set({ checked: true, reachable: false })
    if (uid) { syncState.set({ status: 'offline' }); wire() }
    return
  }
  account.set({ user: me.user, checked: true, reachable: true })
  if (!me.user) return
  const saved = await get('state', store)
  if (saved?.uid === me.user.id) ({ uid, cursor, clock, dirty, uploaded } = { uploaded: {}, ...saved })
  else await resetFor(me.user.id)
  for (const [k, at] of Object.entries(early)) { clock[k] = Math.max(clock[k] || 0, at); dirty[k] = clock[k] }
  early = {}
  wire()
  await flush()
}

export const signInWithGoogle = () => location.assign('/api/auth/google')

export async function devSignIn(name) {
  const res = await fetch('/api/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Dev sign-in failed')
  await startSync()
}

function signedOutHere() {
  uid = null
  clearTimeout(flushTimer)
  account.set({ user: null })
  syncState.set({ status: 'idle', last: 0, error: null })
}

// Signing out keeps this device's library; it just stops syncing.
export async function signOut() {
  if (Object.keys(dirty).length) await flush().catch(() => {})
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
  signedOutHere()
  await del('state', store)
}

export const deviceName = () => {
  const ua = navigator.userAgent
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone' : /Mac OS/i.test(ua) ? 'Mac' : /Windows/i.test(ua) ? 'Windows' : /Linux/i.test(ua) ? 'Linux' : 'device'
  const phone = /Android|iPhone/i.test(ua) && /Mobile/i.test(ua)
  return os === 'Android' || os === 'iPhone' ? `${os} ${phone ? 'phone' : 'tablet'}` : `${os} computer`
}
