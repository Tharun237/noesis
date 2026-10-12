import { createStore } from './store.js'

// A reload (live update, manual refresh, Android restoring the app) keeps you where you were.
const restored = ['library', 'reader', 'settings'].includes(history.state?.view) ? history.state : { view: 'library' }

// The landing page's own address. An empty library shows the landing page anyway; this is how someone who
// HAS a library sees it (and the address to give to someone who has never been here).
const WELCOME = '/welcome'
const atWelcome = () => location.pathname === WELCOME

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
  welcome: atWelcome(), // the landing page was asked for by its address
})

history.replaceState({ view: restored.view, docId: restored.docId || null, depth: restored.depth || 0 }, '')

export function go(view, docId = null) {
  closeWelcome()
  const s = ui.get()
  if (s.view === view && s.docId === docId && !s.sheet) return
  // Leaving from inside a sheet (Add to library, a passage in Ask your library, another language): the new
  // page takes the sheet's place in history instead of stacking on it. Otherwise Back from the new page
  // lands on the old page with the sheet open again.
  if (history.state?.sheet || history.state?.panel || history.state?.searching) history.replaceState({ view, docId, depth: depth() }, '')
  else history.pushState({ view, docId, depth: depth() + 1 }, '')
  ui.set({ view, docId, sheet: null })
}

// Phone tab bar: switching tabs replaces the entry instead of stacking pages, like a native tab bar.
export function tab(view) {
  // A section open inside a tab (Settings, then Voice) is an entry on top of the tab's own. It is closed
  // first, so a tab never leaves one behind it, and tapping the tab you are on returns to its first page.
  if (history.state?.panel) { addEventListener('popstate', () => tab(view), { once: true }); return backOnce() }
  closeWelcome()
  const s = ui.get()
  if (s.view === view && !s.sheet && !s.searching) return
  history.replaceState({ view, docId: null, depth: depth() }, '')
  ui.set({ view, docId: null, sheet: null, searching: false, query: '' })
}

// Leaving the landing page for the app: the address goes back to the app's, so a reload does not return there.
export function closeWelcome() {
  if (!ui.get().welcome) return
  history.replaceState(history.state, '', '/')
  ui.set({ welcome: false })
}
// And the way to it from inside the app (Settings, About): a page like any other, so Back leaves it.
export function showWelcome() {
  history.pushState({ view: 'library', docId: null, depth: depth() + 1 }, '', WELCOME)
  ui.set({ view: 'library', docId: null, sheet: null, welcome: true })
}

export function openSheet(sheet, extra = {}) {
  history.pushState({ ...history.state, sheet, depth: depth() + 1 }, '')
  ui.set({ sheet, ...extra })
}

export const closeSheet = () => { if (ui.get().sheet) backOnce() }

// The phone's library search is a history entry too: Back closes the search instead of leaving the app.
export function openSearch() {
  if (ui.get().searching) return
  history.pushState({ ...history.state, searching: true, depth: depth() + 1 }, '')
  ui.set({ searching: true })
}
export function closeSearch() {
  if (history.state?.searching) backOnce()
  else ui.set({ searching: false, query: '' })
}

// A panel inside a page (the reader's contents, reading settings, bookmarks, Ask): the page keeps its own
// state for which panel is open; these keep history in step so Back closes the panel, not the page.
export function pushPanel(name) {
  const entry = { ...history.state, panel: name }
  if (history.state?.panel) history.replaceState(entry, '')
  else history.pushState({ ...entry, depth: depth() + 1 }, '')
}
export const popPanel = () => { if (history.state?.panel) backOnce() }

// One Back for one thing to close. Going back takes the browser a moment, and until it has happened the
// sheet (or page) being closed is still on screen and still says it is open: a second quick tap on it used to
// go back a SECOND time, out of the document the sheet was on, or out of the app (found by the random
// customer). So a Back that is on its way is not asked for again.
let leaving = false
const BACK_GIVE_UP_MS = 600 // if the browser never reports the move (it had nowhere to go), allow the next one
function backOnce() {
  if (leaving) return
  leaving = true
  setTimeout(() => { leaving = false }, BACK_GIVE_UP_MS)
  history.back()
}
addEventListener('popstate', () => { leaving = false })

// How many in-app pages sit behind this one. Back must never depend on browser history the app didn't
// create (opened straight into a book, restored after an update, arrived from a share or a link).
const depth = () => history.state?.depth || 0
export function goBack() {
  if (depth() > 0) return backOnce()
  history.replaceState({ view: 'library', docId: null, depth: 0 }, '')
  ui.set({ view: 'library', docId: null, sheet: null })
}

addEventListener('popstate', e => {
  const s = e.state || {}
  const searching = !!s.searching
  ui.set({ view: s.view || 'library', docId: s.docId || null, sheet: s.sheet || null, searching, welcome: atWelcome(), ...(searching ? {} : { query: '' }) })
})

let toastTimer = null
// action: optional { label, run } — e.g. "Jump there" when another device is further along.
export function toast(msg, action = null) {
  clearTimeout(toastTimer)
  ui.set({ toast: msg, toastAction: action })
  toastTimer = setTimeout(() => ui.set({ toast: null, toastAction: null }), action ? 9000 : 3200)
}
