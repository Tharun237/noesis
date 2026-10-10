import { createStore } from './store.js'

// A reload (live update, manual refresh, Android restoring the app) keeps you where you were.
const restored = ['library', 'reader', 'settings'].includes(history.state?.view) ? history.state : { view: 'library' }

// View state lives in history entries, so Android's back gesture closes sheets and leaves the reader.
export const ui = createStore({
  view: restored.view, // library | reader | settings
  docId: restored.docId || null,
  sheet: null, // add | null
  filter: 'queue', // queue | all | archived | <collection id>
  query: '',
  searching: false, // phone: search box open in the library header
  kind: null, // file-type filter (KIND label) | null
  progress: null, // new | started | done | null
  prefill: null, // { tab, url, text } from share target / file handler
  installEvt: null,
  installed: matchMedia('(display-mode: standalone)').matches,
  toast: null,
})

history.replaceState({ view: restored.view, docId: restored.docId || null, depth: restored.depth || 0 }, '')

export function go(view, docId = null) {
  const s = ui.get()
  if (s.view === view && s.docId === docId) return
  history.pushState({ view, docId, depth: depth() + 1 }, '')
  ui.set({ view, docId, sheet: null })
}

// Phone tab bar: switching tabs replaces the entry instead of stacking pages, like a native tab bar.
export function tab(view) {
  const s = ui.get()
  if (s.view === view && !s.sheet) return
  history.replaceState({ view, docId: null, depth: depth() }, '')
  ui.set({ view, docId: null, sheet: null })
}

export function openSheet(sheet, extra = {}) {
  history.pushState({ ...history.state, sheet, depth: depth() + 1 }, '')
  ui.set({ sheet, ...extra })
}

export const closeSheet = () => { if (ui.get().sheet) history.back() }

// How many in-app pages sit behind this one. Back must never depend on browser history the app didn't
// create (opened straight into a book, restored after an update, arrived from a share or a link).
const depth = () => history.state?.depth || 0
export function goBack() {
  if (depth() > 0) return history.back()
  history.replaceState({ view: 'library', docId: null, depth: 0 }, '')
  ui.set({ view: 'library', docId: null, sheet: null })
}

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
