// The Books tab: free books to explore, and what a customer may do with one. The catalogue is Noesis's own copy of
// Project Gutenberg's (tools/books.mjs: only books free to use in India and almost every country); it is searched
// off the page's thread (books.worker.js). The book itself is downloaded from Gutenberg, through the same path as
// any link, only when the customer chooses to listen to it or add it.
//
// Browsing is not adding (Tharun, 1 November 2026). Listen makes the book a document on this device marked `trial`:
// it plays, keeps its place, and is shown under "Listening to" in Books, but it is not in the library, not counted
// there and not synced (library.js inLibrary). Add to library makes it an ordinary document.
import { createStore } from './store.js'
import { library, addDocument, keepTrial, deleteDoc } from './library.js'
import { open as openPlayer, play } from './player.js'
import { go, toast } from './nav.js'

export const SOURCE = 'Project Gutenberg'
export const pageUrl = id => `https://www.gutenberg.org/ebooks/${id}`
// the text-only edition: Pride and Prejudice with its illustrations is 24.8 MB (29 s); without, 0.6 MB with its cover
const epubUrl = id => `https://www.gutenberg.org/ebooks/${id}.epub.noimages`
export const coverUrl = id => `https://www.gutenberg.org/cache/epub/${id}/pg${id}.cover.medium.jpg`
const srcOf = id => `gutenberg:${id}`

// { home: the shelves (books/home.json), error }
export const books = createStore({ home: null, error: null })
// Every book seen so far, by number: a book's page opens with what its cover already showed.
export const known = new Map()
const learn = list => { for (const b of list) known.set(b.id, b); return list }

let worker = null
let asked = 0
const waiting = new Map()
let homeLoading = null
export function loadHome() {
  homeLoading ??= fetch('/books/home.json', { cache: 'no-cache' }) // a new catalogue names a new index: never an old one
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
    .then(home => {
      learn(home.books)
      books.set({ home, error: null })
      worker = new Worker(new URL('./books.worker.js', import.meta.url), { type: 'module' })
      worker.onmessage = ({ data }) => { const p = waiting.get(data.id); waiting.delete(data.id); if (data.error) p.reject(new Error(data.error)); else p.resolve({ ...data, books: learn(data.books || []) }) }
      // a worker that cannot start answers nothing: every question waiting is told so, never left turning
      worker.onerror = () => { for (const p of waiting.values()) p.reject(new Error("The books couldn't be searched. Try again in a moment.")); waiting.clear() }
      worker.postMessage({ url: `/books/${home.index}` })
      return home
    })
    .catch(() => { homeLoading = null; books.set({ error: navigator.onLine === false ? "You're offline. The books are here when you're back online." : "The books didn't load. Try again in a moment." }) })
  return homeLoading
}

// → { books, total? }. The first question also fetches the whole index (about 0.8 MB, once).
export async function ask(question) {
  if (!(await loadHome())) throw new Error(books.get().error)
  return new Promise((resolve, reject) => { const id = ++asked; waiting.set(id, { resolve, reject }); worker.postMessage({ id, ...question }) })
}
// While the shelves are looked at, the index arrives, so the first search answers at once.
export const warm = () => ask({ ids: [] }).catch(() => {})

// What a book's page says about it: its subjects and categories (tools/books.mjs writes them in files of
// home.about books each, so a page loads a few kilobytes). Gutendex's summaries were tried: a book nobody had
// asked for lately took 63 seconds (1 November 2026). → { s: [subjects], c: [categories] }, or null.
const aboutFiles = new Map()
export async function aboutOf(id) {
  const home = await loadHome()
  if (!home) return null
  const n = Math.floor(id / home.about)
  if (!aboutFiles.has(n)) aboutFiles.set(n, fetch(`/books/about/${n}.json?v=${home.built}`).then(r => (r.ok ? r.json() : null)).catch(() => { aboutFiles.delete(n); return null }))
  return (await aboutFiles.get(n))?.[id] || null
}

// The document a catalogue book already is on this device, being tried or in the library.
export const docOfBook = (docs, id) => docs.find(d => d.src === srcOf(id) && !d.deleted) || null
// One document per book, however fast the taps: a second Listen (or Add) while the first is still being written
// waits for that one instead of making another.
const making = new Map()
const make = (book, trial) => {
  if (!making.has(book.id)) making.set(book.id, addDocument({ kind: 'link', name: book.t, title: book.t, url: epubUrl(book.id) }, { author: book.a, src: srcOf(book.id), ...(trial ? { trial: true } : {}) }).finally(() => making.delete(book.id)))
  return making.get(book.id)
}
const docId = async (book, trial) => docOfBook(library.get().docs, book.id)?.id || await make(book, trial)
const failed = e => { console.warn('A free book could not be opened:', e?.message || e); toast("That didn't work. Check that there's room on this device, then try again.") }

export async function listen(book) {
  try {
    const id = await docId(book, true)
    go('reader', id)
    await openPlayer(id, { autoplay: false })
    await play() // waits for the first sentences if they are still being made (player.js)
  } catch (e) { failed(e) }
}

export async function addToLibrary(book) {
  try {
    const id = await docId(book, false)
    if (library.get().docs.find(d => d.id === id)?.trial) keepTrial(id)
    toast(`${book.t} is in your library.`)
  } catch (e) { failed(e) }
}

// Stop trying a book: it goes from this device, with any versions in other languages made from it.
export async function remove(d) {
  for (const x of library.get().docs.filter(x => x.id === d.id || (x.from === d.id && x.trial))) await deleteDoc(x.id)
}
