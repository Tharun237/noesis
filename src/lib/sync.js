// Cross-device sync for signed-in users (Sign in with Google), last-writer-wins per record.
//
// The library is kept in the customer's OWN Google Drive, in the hidden folder Drive gives each app
// (./drive.js). Noesis stores nothing and pays for nothing as customers grow: their storage, their account.
//
// Records, one small file each, named by its key:
//   meta:<doc> · pos:<doc> · marks:<doc> · cols · doc:<doc>:<ver>:<part> (book text, gzipped, uploaded once)
//   heard:<device>:<year>  how long was listened to each document on each day, ON THAT DEVICE. A device only
//   ever writes its own, so the newer-wins rule can never lose listening; what is shown is all of them added
//   (history.js).
// Audio is never synced: each device voices the text itself, so sync stays small.
// Without an account Noesis works fully offline/local; signing in only adds sync.
//
// How two devices agree: every record carries the time it was last changed ON THE DEVICE THAT CHANGED IT,
// and the newer one wins. A round is "see what changed in the folder, take what is newer than ours, then
// send what of ours is newer". If two devices write the same record in the same moment, whichever write
// landed second is what the folder holds; the device whose copy is newer notices on its next round that the
// folder is behind and sends its copy again. So they end on the newest, whatever the order.
import { get, set } from 'idb-keyval'
import { openStore, canStore } from './db.js'
import { createStore } from './store.js'
import * as drive from './drive.js'
import { takeShelf, leaveShelf } from './shelf.js'

const store = openStore('noesis-sync', 'sync')
export const account = createStore({ user: null, checked: false, google: false, dev: false, reachable: true })
// taking: { done, of } while a round is reading many records from the folder (a device new to the library), else null
export const syncState = createStore({ status: 'idle', last: 0, error: null, taking: null })

const te = new TextEncoder()
const td = new TextDecoder()
const PART = 1_500_000
const POLL_MS = 90_000
const POS_THROTTLE_MS = 60_000 // while playing; pausing / leaving the app pushes immediately
const QUICK_MAX = 60_000 // bytes the browser will finish sending by itself after the page is left
// Records are read from the folder several at a time. One after another, each took about a second (measured on
// Tharun's own folder, 13 October 2026: 30 records in 35 s), so a phone new to a library of 21 books showed 7
// of them and no sign that more were coming: "pure chaos". The documents themselves are read first.
const TAKE_AT_ONCE = 6
const SAY_FROM = 8 // fewer records than this are taken without saying so: it is over before it could be read
const FIRST = ['meta', 'cols', 'heard', 'marks', 'pos'] // a library is its documents; places and bookmarks follow
const TEXT = 'doc:' // the prefix of a book-text part: fetched when a document is opened, never on a round

let hooks = null // { snapshot(k), apply(k, value), content(id), allKeys() } — provided by library.js
let uid = null
let cursor = null // where "what changed in the folder since" starts from; null = this device has not listed it yet
let clock = {} // k → newest timestamp this device has seen or written
let dirty = {} // k → timestamp of a local change not yet pushed
let ids = {} // k → { id, at }: the Drive file that holds each record, and how new it is
let flushTimer = null
let flushing = null
let lastPosPush = 0
let urgent = false // a pause arrived while a flush was in flight: push again right after
let early = {} // edits made before the account check finished (e.g. at boot); merged in when sync starts

const persist = () => uid && set('state', { uid, cursor, clock, dirty, ids }, store)
const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer())

export const configureSync = h => { hooks = h }

export function touch(k, at = drive.clockNow()) {
  clock[k] = Math.max(clock[k] || 0, at)
  if (!uid) { early[k] = clock[k]; return }
  dirty[k] = clock[k]
  persist()
  const throttled = k.startsWith('pos:') && document.visibilityState === 'visible'
  schedule(throttled ? Math.max(1500, POS_THROTTLE_MS - (Date.now() - lastPosPush)) : 1500)
}

// A change the MACHINE worked out from a record (a place carried to a text that was read again, a title mended
// from a file's name) is not something the customer just did, so it must not be stamped "now": that made this
// device's copy the newest, over anything done since on another device. It is stamped one tick after the
// record it was worked out from: it replaces that record everywhere, and anything a customer did later, on
// any device, still wins.
const earlyAfter = new Set() // worked out before the account check finished (at boot)
export function touchAfter(k) {
  if (!uid) { earlyAfter.add(k); return }
  clock[k] = (clock[k] || 0) + 1
  dirty[k] = clock[k]
  persist()
  schedule(1500)
}
const mergeEarly = () => {
  for (const [k, at] of Object.entries(early)) { clock[k] = Math.max(clock[k] || 0, at); dirty[k] = clock[k] }
  for (const k of earlyAfter) if (!(k in early)) { clock[k] = (clock[k] || 0) + 1; dirty[k] = clock[k] }
  early = {}
  earlyAfter.clear()
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

// See what changed in the folder and take what is newer than ours.
async function pull() {
  let changed
  const from = cursor // where this round started looking: gone back to if anything could not be taken
  let missed = null
  if (cursor) {
    try { ({ changes: changed, cursor } = await drive.changesSince(cursor)) } catch (e) {
      if (!GONE.has(e.status)) throw e
      cursor = null // Drive no longer knows the place this device remembered: look at the whole folder again
    }
  }
  if (!cursor) {
    const from = await drive.startToken() // before the list, so nothing written during it is missed
    changed = (await drive.listAll()).map(file => ({ fileId: file.id, file }))
    cursor = from
    // What the folder holds is what the list says, not what this device remembered. Anything of ours it does
    // not hold (the customer emptied the folder, or it was never sent) is sent again.
    const there = new Set(changed.map(c => c.file.name))
    ids = {}
    for (const k of Object.keys(clock)) if (!k.startsWith(TEXT) && !there.has(k)) dirty[k] = clock[k]
  }
  const want = new Map() // k → the file to read: what the folder holds that is newer than ours
  for (const c of changed) {
    if (c.removed || !c.file) {
      for (const [k, f] of Object.entries(ids)) {
        if (f.id !== c.fileId) continue
        delete ids[k]
        if (!k.startsWith(TEXT) && clock[k]) dirty[k] = clock[k] // a record is never removed on purpose (a deleted document is a record that says so): the folder was emptied, so it is sent again
      }
      continue
    }
    const k = c.file.name
    const seen = { id: c.file.id, at: +c.file.appProperties?.at || 0 }
    const had = ids[k]
    if (had && had.id !== seen.id) {
      // Two devices made the same record in the same moment, so the folder has it twice. The newer stays.
      const newer = seen.at > had.at || (seen.at === had.at && seen.id < had.id)
      drive.remove((newer ? had : seen).id).catch(() => {})
      if (!newer) continue
    }
    ids[k] = seen
    if (k.startsWith(TEXT)) continue
    if (seen.at > (clock[k] || 0)) want.set(k, seen) // a record changed twice since the last look is read once
    else if (seen.at < (clock[k] || 0) && !dirty[k]) dirty[k] = clock[k] // the folder is behind us: send ours again
  }
  const rank = k => { const at = FIRST.indexOf(k.split(':')[0]); return at < 0 ? FIRST.length : at }
  const list = [...want].sort((a, b) => rank(a[0]) - rank(b[0]))
  const say = list.length >= SAY_FROM
  let next = 0, done = 0, stop = null
  if (say) syncState.set({ taking: { done: 0, of: list.length } })
  const take = async () => {
    while (next < list.length && !stop) {
      const [k, seen] = list[next++]
      // One record that cannot be read or taken in must not stop the rest (it stopped everything after it,
      // every round, for as long as it stayed bad). It is left as not taken, and looked at again next round.
      try {
        const res = await drive.read(seen.id).catch(e => { if (!GONE.has(e.status)) throw e; delete ids[k]; return null }) // gone between the list and the reading
        if (res) await receive(k, seen.at, await res.json())
      } catch (e) {
        if (e.signedOut || !navigator.onLine) { stop = e; return } // nothing more can be read: the round ends
        console.warn('Sync: could not take', k, e)
        missed = e
      }
      done++
      if (say) syncState.set({ taking: { done, of: list.length } })
    }
  }
  try { await Promise.all(Array.from({ length: Math.min(TAKE_AT_ONCE, list.length) }, take)) } finally { if (say) syncState.set({ taking: null }) }
  if (stop) { cursor = from; throw stop }
  if (missed) { cursor = from; throw missed } // after everything else was taken: the round says it failed and comes back
}

async function receive(k, at, v) {
  if (v == null || at <= (clock[k] || 0)) return
  await hooks.apply(k, v) // first: if this fails the record is still "not seen", and is taken again next round
  clock[k] = at
  if (dirty[k] && dirty[k] < at) delete dirty[k] // a newer edit from another device beats our queued one
}

// Write a record over the file it already has, or as a new file. If the file it had is gone (the folder was
// emptied since this device last looked), it is written as a new one: a round must heal itself, not fail.
const GONE = new Set([404, 410])
async function put(k, at, body, quick) {
  if (ids[k]) {
    try { return await drive.write(k, at, body, ids[k].id, quick) } catch (e) {
      if (!GONE.has(e.status)) throw e
      delete ids[k]
    }
  }
  return drive.write(k, at, body, undefined, quick)
}

// Send what of ours is newer than what the folder holds.
async function push(quick) {
  let failed = null
  for (const [k, at] of Object.entries(dirty)) {
    if (!uid) return
    // One record that cannot be sent must not stop the ones after it: it stays queued and is sent next round.
    try {
      if (!(ids[k]?.at >= at)) {
        const v = await hooks.snapshot(k)
        if (v !== undefined) {
          if (k.startsWith('meta:') && v.contentVer && !v.deleted) {
            // The text goes first, and the record says how many parts it is in. A device that does not HAVE
            // the text (it is still downloading it) keeps the count it was given: it used to write 0, after
            // which no device could ever fetch the document.
            const parts = await uploadContent(k.slice(5), v.contentVer)
            if (parts) v.parts = parts
          }
          const body = JSON.stringify(v)
          ids[k] = { id: await put(k, at, body, quick && body.length < QUICK_MAX), at }
          if (k.startsWith('meta:') && v.deleted) await dropText(k.slice(5)) // a deleted document leaves nothing behind in their Drive
          if (k.startsWith('pos:')) lastPosPush = Date.now()
        }
      }
      if (dirty[k] === at) delete dirty[k]
    } catch (e) {
      if (e.signedOut || !navigator.onLine) throw e
      console.warn('Sync: could not send', k, e)
      failed = e
    }
    await persist()
  }
  if (failed) throw failed // after everything else was sent
}

// One round. Leaving the app (the page is hidden) sends first and does not wait to look: it may be frozen
// at any moment, and what matters then is that where the customer stopped gets out.
export async function flush() {
  if (!uid) return
  if (flushing) return flushing
  flushing = (async () => {
    urgent = false
    syncState.set({ status: 'syncing' })
    try {
      const leaving = document.visibilityState === 'hidden'
      if (!leaving) await pull()
      await push(leaving)
      await persist()
      syncState.set({ status: 'idle', last: Date.now(), error: null })
    } catch (e) {
      if (e.signedOut) return signedOutHere()
      if (!uid) return
      syncState.set({ status: navigator.onLine ? 'error' : 'offline', error: e.message })
      schedule(30_000) // queued changes are persisted; they land when the network does
    } finally {
      flushing = null
      // Changes made while this round was in flight would otherwise wait for the next poll.
      if (uid && (urgent || Object.keys(dirty).some(k => !k.startsWith('pos:')))) schedule(urgent ? 50 : 1500)
    }
  })()
  return flushing
}

// Book text: gzipped once, split into ≤1.5 MB parts, written before the meta record that points to it.
const partName = (id, ver, n) => `${TEXT}${id}:${ver}:${n}`
async function uploadContent(id, ver) {
  const doc = await hooks.content(id)
  if (!doc) return 0
  const z = await pipe(te.encode(JSON.stringify(doc)), new CompressionStream('gzip'))
  const parts = Math.max(1, Math.ceil(z.length / PART))
  for (let n = 0; n < parts; n++) {
    const k = partName(id, ver, n)
    if (ids[k]) continue // already in the folder (from this device or another)
    ids[k] = { id: await drive.write(k, ver, z.subarray(n * PART, (n + 1) * PART)), at: ver }
    await persist()
  }
  await dropText(id, ver) // an earlier version of this document's text is no longer pointed to by anything
  return parts
}

// Take a document's text out of the folder: all of it, or all but one version.
async function dropText(id, keep) {
  const mine = `${TEXT}${id}:`
  for (const k of Object.keys(ids)) {
    if (!k.startsWith(mine) || (keep != null && k.startsWith(`${mine}${keep}:`))) continue
    await drive.remove(ids[k].id).catch(() => {}) // gone already is as good as removed
    delete ids[k]
  }
  await persist()
}

export async function downloadContent(id, ver, parts) {
  const names = Array.from({ length: parts }, (_, n) => partName(id, ver, n))
  if (names.some(k => !ids[k])) await pull() // written by another device since this one last looked
  const missing = names.find(k => !ids[k])
  if (missing) throw new Error('The text of this document has not reached your Google Drive yet. Open it on the device it was added on.')
  const chunks = []
  for (const k of names) {
    chunks.push(await (await drive.read(ids[k].id).catch(e => {
      if (GONE.has(e.status)) { delete ids[k]; throw new Error('The text of this document is no longer in your Google Drive. Open it on the device it was added on.') }
      throw e
    })).arrayBuffer())
  }
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
  cursor = null
  clock = {}
  dirty = {}
  ids = {}
  const now = drive.clockNow()
  for (const k of await hooks.allKeys()) { clock[k] = now; dirty[k] = now } // first sync here = union of libraries
  await persist()
}

export async function startSync() {
  if (!canStore) return account.set({ checked: true }) // nothing can be kept here, so there is nothing to keep in step
  const [config, me] = await Promise.all([
    fetch('/api/auth/config').then(r => (r.ok ? r.json() : {})).catch(() => ({})),
    fetch('/api/auth/me').then(r => (r.ok ? r.json() : { user: null })).catch(() => null),
  ])
  account.set({ google: !!config.google, dev: !!config.dev })
  const saved = await get('state', store)
  const mine = id => saved?.uid === id && saved.ids // state from before the library moved to Drive has no ids: start again
  if (me === null) { // offline: keep syncing with the account we last knew about
    if (saved?.uid && saved.ids) {
      ({ uid, cursor, clock, dirty, ids } = saved)
      mergeEarly()
    }
    account.set({ checked: true, reachable: false })
    if (uid) { syncState.set({ status: 'offline' }); wire() }
    return
  }
  // Each account has its own shelf on this device (shelf.js). If this account's is not the one that is open,
  // open it: the page starts again on it, and nothing of the other library is shown or uploaded meanwhile.
  if (me.user && takeShelf(me.user.id)) { location.reload(); return new Promise(() => {}) }
  account.set({ user: me.user, checked: true, reachable: true })
  if (!me.user) return
  if (mine(me.user.id)) ({ uid, cursor, clock, dirty, ids } = saved)
  else await resetFor(me.user.id)
  // Every time the app is opened it looks at the WHOLE folder, not only at what changed since its mark. The
  // mark is a convenience for the rounds in between; it is not to be believed across a launch. A version of
  // this app moved the mark past records it then failed to take, and that device never saw them again:
  // Tharun's phone, 13 October 2026, 7 of 21 books however often it synced. Looking at everything is one
  // request, and only what is newer than ours is then read.
  cursor = null
  mergeEarly()
  wire()
  await flush()
}

// "Sync now": the customer is saying something is not right. Look at the whole folder, not at the changes.
export function syncAll() {
  cursor = null
  return flush()
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
  drive.forgetPass()
  account.set({ user: null })
  syncState.set({ status: 'idle', last: 0, error: null })
}

// Signing out puts this account's library away and opens a fresh, empty Noesis (shelf.js). The library is
// kept on the device, with its audio and what it knows about the Drive folder, so signing in again shows
// it at once and only fetches what changed. It needs the server (the session is a cookie only the server
// can end): offline, it says so and nothing changes, rather than seeming to sign out and coming back.
export async function signOut() {
  if (Object.keys(dirty).length) await flush().catch(() => {})
  const res = await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null)
  if (!res?.ok) throw new Error("You're offline. Signing out needs a connection.")
  const was = uid
  await persist()
  signedOutHere()
  leaveShelf(was)
  // The page starts again at the library, not on the Settings page it was asked from (a reload keeps the
  // history entry's own state, and that state says "settings").
  history.replaceState({ view: 'library', docId: null, depth: history.state?.depth || 0 }, '', '/')
  location.reload()
  return new Promise(() => {}) // the page is starting again: whoever waits on this shows "working" until it does
}

export const deviceName = () => {
  const ua = navigator.userAgent
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone' : /Mac OS/i.test(ua) ? 'Mac' : /Windows/i.test(ua) ? 'Windows' : /Linux/i.test(ua) ? 'Linux' : 'device'
  const phone = /Android|iPhone/i.test(ua) && /Mobile/i.test(ua)
  return os === 'Android' || os === 'iPhone' ? `${os} ${phone ? 'phone' : 'tablet'}` : `${os} computer`
}
