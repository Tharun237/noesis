import { createStore as idbStore, get, set, del, delMany, keys, values, getMany } from 'idb-keyval'
import { onShelf } from './shelf.js'

// Three IndexedDB stores, split by access pattern:
//   meta    — small per-document records, all loaded at boot for the library
//   content — source file + listening text per document, loaded on open
//   audio   — one compact Opus record per sentence, loaded on play
// Each is on the shelf of whoever is using the device (shelf.js): signing out opens an empty library.
// A few browsers give a page no storage at all (some crawlers, some locked-down in-app browsers). Opening a
// store there throws while the app is still loading, and the customer (or the search engine) got a black
// page. So a store is only opened where there is somewhere to open it; without one, every read and write
// comes back as a failure (never thrown while the app is loading), and the library says so (library.js
// boot) instead of the app not starting.
export const canStore = typeof indexedDB !== 'undefined' && !!indexedDB
const noStore = () => Promise.reject(new Error('This browser gives Noesis no storage'))
export const openStore = (name, table) => (canStore ? idbStore(onShelf(name), table) : noStore)
const meta = openStore('noesis-meta', 'meta')
const content = openStore('noesis-content', 'content')
const audio = openStore('noesis-audio', 'audio')

export const db = {
  allMeta: () => values(meta),
  putMeta: m => set(m.id, m, meta),
  delMeta: id => del(id, meta),

  getSource: id => get('src:' + id, content),
  putSource: (id, src) => set('src:' + id, src, content),
  getDoc: id => get('doc:' + id, content),
  putDoc: (id, doc) => set('doc:' + id, doc, content),
  getDurs: id => get('durs:' + id, content),
  putDurs: (id, d) => set('durs:' + id, d, content),
  getChat: id => get('chat:' + id, content),
  putChat: (id, msgs) => set('chat:' + id, msgs, content),
  getHistory: () => get('history', content),
  putHistory: log => set('history', log, content),
  // listening on the customer's other devices, as received: { '<device>:<year>': log } (history.js)
  getHeardElsewhere: () => get('history-elsewhere', content),
  putHeardElsewhere: all => set('history-elsewhere', all, content),
  delContent: id => delMany(['src:' + id, 'doc:' + id, 'durs:' + id, 'chat:' + id, 'tr:' + id], content),

  // Finished translation chunks (Map chunkIndex → strings) so a restarted run
  // continues where it left off instead of translating twice.
  getTranslation: id => get('tr:' + id, content),
  putTranslation: (id, map) => set('tr:' + id, map, content),
  delTranslation: id => del('tr:' + id, content),

  akey: (id, i) => id + ':' + i,
  getAudio: (id, i) => get(id + ':' + i, audio),
  getAudios: (id, from, to) => getMany(Array.from({ length: to - from }, (_, k) => id + ':' + (from + k)), audio),
  putAudio: (id, i, rec) => set(id + ':' + i, rec, audio),
  audioKeys: () => keys(audio),
  async delAudio(id) {
    const ks = (await keys(audio)).filter(k => k.startsWith(id + ':'))
    await delMany(ks, audio)
  },
}

export async function persistStorage() {
  if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist()
}
