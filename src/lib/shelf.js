// A shelf is one person's Noesis on this device: their library and its audio, their collections, and their
// settings (their own AI key among them). Signing out puts the shelf away and opens an empty one, so whoever
// uses the device next meets a fresh app; signing in again takes the shelf back out, audio and all, with
// nothing downloaded or made twice. Tharun, 2026-10-12: "Sign in/out doesn't change or show a fresh or
// landing page": until then signing out only stopped syncing, and the library stayed on screen.
//
// The shelf in use is a short suffix on the name of everything personal kept here ('' is the first shelf, so
// a library from before shelves existed is simply shelf ''). It is read once, when the page starts: changing
// shelves is always followed by a reload. Downloaded voices are not on a shelf: they are nobody's secret and
// 60 MB each, so every shelf shares them.
const NOW = 'noesis.shelf'
const ALL = 'noesis.shelves' // { [account id]: suffix, [GUEST]: suffix }
const GUEST = '(signed out)'
const DATABASES = ['noesis-meta', 'noesis-content', 'noesis-audio', 'noesis-sync']
const KEYS = ['noesis.settings.v1', 'noesis.collections.v1', 'noesis.had-docs']

const load = () => { try { return JSON.parse(localStorage.getItem(ALL)) || {} } catch { return {} } }
const save = (all, now) => { localStorage.setItem(ALL, JSON.stringify(all)); localStorage.setItem(NOW, now) }
const fresh = () => Math.random().toString(36).slice(2, 8)
const named = (name, s) => (s ? `${name}-${s}` : name)

export const shelf = (() => { try { return localStorage.getItem(NOW) || '' } catch { return '' } })()
export const onShelf = name => named(name, shelf)

// Which shelf opens for this account → the suffix to use. Pure, so the rules are tested (shelf.test.js).
//   their own shelf, if they have one here · else the shelf in use, if it is nobody else's (what a person
//   added before signing in becomes theirs) · else a new, empty one.
export function shelfFor(all, uid, now) {
  if (all[uid] != null) return all[uid]
  const someoneElses = Object.entries(all).some(([who, s]) => who !== GUEST && s === now)
  return someoneElses ? fresh() : now
}

// The signed-in account takes its shelf. → true when that is not the shelf in use: the caller reloads the page.
export function takeShelf(uid) {
  const all = load()
  const mine = shelfFor(all, uid, shelf)
  all[uid] = mine
  if (all[GUEST] === mine) delete all[GUEST]
  save(all, mine)
  return mine !== shelf
}

// Signing out: the account's shelf is put away, and the signed-out one is opened (the caller reloads).
export function leaveShelf(uid) {
  const all = load()
  all[uid] = shelf
  all[GUEST] ??= fresh()
  save(all, all[GUEST])
}

// Libraries of accounts that are signed out, still kept on this device: they take room nobody can see, so
// Settings → Storage says they are there and can remove them.
export const shelvesAway = () => [...new Set(Object.entries(load()).filter(([who, s]) => who !== GUEST && s !== shelf).map(([, s]) => s))]
export async function removeShelvesAway() {
  const away = shelvesAway()
  const all = load()
  for (const [who, s] of Object.entries(all)) if (away.includes(s)) delete all[who]
  save(all, shelf)
  for (const s of away) {
    for (const key of KEYS) localStorage.removeItem(named(key, s))
    await Promise.all(DATABASES.map(name => new Promise(done => { const r = indexedDB.deleteDatabase(named(name, s)); r.onsuccess = r.onerror = r.onblocked = done })))
  }
}
