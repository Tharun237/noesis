import { createStore } from './store.js'

// View state lives in history entries, so Android's back gesture closes sheets and leaves the reader.
export const ui = createStore({
  view: 'library', // library | reader | settings
  docId: null,
  sheet: null, // add | null
  filter: 'queue', // queue | all | archived | <collection id>
  query: '',
  sort: 'recent',
  prefill: null, // { tab, url, text } from share target / file handler
  installEvt: null,
  installed: matchMedia('(display-mode: standalone)').matches,
  toast: null,
})

history.replaceState({ view: 'library' }, '')

export function go(view, docId = null) {
  const s = ui.get()
  if (s.view === view && s.docId === docId) return
  history.pushState({ view, docId }, '')
  ui.set({ view, docId, sheet: null })
}

export function openSheet(sheet, extra = {}) {
  history.pushState({ ...history.state, sheet }, '')
  ui.set({ sheet, ...extra })
}

export const closeSheet = () => { if (ui.get().sheet) history.back() }

addEventListener('popstate', e => {
  const s = e.state || {}
  ui.set({ view: s.view || 'library', docId: s.docId || null, sheet: s.sheet || null })
})

let toastTimer = null
// action: optional { label, run } — e.g. "Jump there" when another device is further along.
export function toast(msg, action = null) {
  clearTimeout(toastTimer)
  ui.set({ toast: msg, toastAction: action })
  toastTimer = setTimeout(() => ui.set({ toast: null, toastAction: null }), action ? 9000 : 3200)
}
