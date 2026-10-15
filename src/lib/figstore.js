// What the customer's AI said each figure, chart, diagram and table shows, kept per document beside its text
// (content store, 'figs:<id>'), never inside it. Written into the text, every description would have moved every
// sentence after it: the audio, the place and the bookmarks are all counted in sentences. Kept apart, it is
// joined to its caption's last sentence when the document is opened (library.js loadDoc): only that one sentence
// is spoken again, and a text read again (reread) cannot lose it. It also goes to the account's other devices
// (sync record 'figs:<id>'), so each figure is described once, on one device, with the customer's own key.
import { openStore } from './db.js'
import { get, set, getMany, del } from 'idb-keyval'
import { createStore } from './store.js'

// What the reader shows while it happens: the figure being described now (work: '<doc id>|<figure key>'), and a
// count of descriptions that have arrived, so a page already open draws them without being opened again.
export const figureNews = createStore({ work: '', seen: 0 })

const content = openStore('noesis-content', 'content')
const store = new Map() // id → { [figure key]: description }

// A figure is known by its page and the start of its caption: the same after the text is read again.
export const figKey = b => `${b.p ?? ''}|${(b.s || []).join(' ').slice(0, 48)}`
export const isFigure = b => (b.k === 'fig' || b.k === 'table') && typeof b.p === 'number'

export const described = (id, b) => store.get(id)?.[figKey(b)] || null
export const allOf = id => store.get(id) || {}
export const hasAny = id => Object.keys(store.get(id) || {}).length > 0

// at launch, before any document is opened: one read for the whole library
export async function loadFigures(ids) {
  if (!ids.length) return
  const vals = await getMany(ids.map(id => 'figs:' + id), content).catch(() => [])
  ids.forEach((id, k) => { if (vals[k] && typeof vals[k] === 'object') store.set(id, vals[k]) })
}

// → the keys that are new here (a description already kept is not replaced: its audio is made)
export async function addFigures(id, figs) {
  const had = store.get(id) || {}
  const fresh = Object.entries(figs || {}).filter(([k, v]) => typeof v === 'string' && v.trim() && !had[k])
  if (!fresh.length) return []
  const now = { ...had, ...Object.fromEntries(fresh) }
  store.set(id, now)
  await set('figs:' + id, now, content)
  return fresh.map(([k]) => k)
}

export async function dropFigures(id) {
  store.delete(id)
  await del('figs:' + id, content).catch(() => {})
}
export const keepAt = async id => get('figs:' + id, content) // for a test
