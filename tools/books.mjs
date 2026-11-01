// Noesis's own copy of the free-book catalogue: what the Books tab shows and searches. Project Gutenberg's live
// search (gutendex.com) took 40 seconds or more for one search (measured 1 November 2026), so the catalogue is
// read here, once, from Gutenberg's own published list, and written as small files served with the site: the
// tab opens at once, search runs on the device, and nothing depends on a third party staying fast. The book
// itself is still downloaded from Gutenberg, when the customer chooses it.
//
//   node tools/books.mjs        (writes public/books/; run it again to take in Gutenberg's newer books)
//
// Which books: text only, and only where EVERY named person (author, translator, editor, illustrator) died more
// than 70 years before this year. Gutenberg's books are free in the United States; most of the world (India's
// term is the author's life and 60 years) protects a work for the life and 70 years at most, so a book that
// passes this is free to use there too. A person with no known dates, or a name with no person behind it (a
// magazine's "Various", a government), keeps the book out: when in doubt, it is not offered.
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const CACHE = fileURLToPath(new URL('../.books-cache/', import.meta.url))
const OUT = fileURLToPath(new URL('../public/books/', import.meta.url))
const CATALOG = 'https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv'
const TOP = 'https://www.gutenberg.org/browse/scores/top'
const DAY = 86400000
const YEAR = new Date().getUTCFullYear()
const TERM = 70 // years after the last named person's death
const SHELF = 24 // books on a shelf of the home page
const LANG_SHELF = 2 // a language is offered with at least this many books
const HOME_SHELVES = 8 // the largest categories get a shelf on the home page; every category is in its list
export const ABOUT = 500 // books to a file of what a book's page says about it (books/about/<n>.json)

// Fresh once a day. Gutenberg down or slow: the copy from the last good day, so a release is never stopped by it;
// with no copy at all, the build stops and says why.
async function cached(url, name) {
  const file = CACHE + name
  if (existsSync(file) && Date.now() - statSync(file).mtimeMs < DAY) return readFileSync(file, 'utf8')
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) })
    if (!res.ok) throw new Error(String(res.status))
    const text = await res.text()
    mkdirSync(CACHE, { recursive: true })
    writeFileSync(file, text)
    return text
  } catch (e) {
    if (!existsSync(file)) throw new Error(`Project Gutenberg's list could not be read (${url}: ${e.message}), and there is no earlier copy.`)
    console.warn(`Project Gutenberg did not answer (${e.message}): using the copy of ${new Date(statSync(file).mtimeMs).toISOString().slice(0, 10)}.`)
    return readFileSync(file, 'utf8')
  }
}

// RFC 4180: quoted fields may hold commas, quotes ("") and line breaks
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows
}

// "Austen, Jane, 1775-1817" · "Homer, 751? BCE-651? BCE" · "Tolstoy, Leo, graf, 1828-1910 [Translator]"
// → { name: 'Jane Austen', role: '' | 'Translator' | …, died: 1817, life: '1775–1817' } (died: null when not known)
export function personOf(raw) {
  const role = (/\[([^\]]*)\]\s*$/.exec(raw) || [])[1] || ''
  const s = raw.replace(/\s*\[[^\]]*\]\s*$/, '').trim()
  const m = /,\s*(?:(\d{1,4})\??( BCE)?\s*)?-\s*(\d{1,4})\??( BCE)?\s*$/.exec(s)
  const died = m ? (m[4] ? -Number(m[3]) : Number(m[3])) : null
  const born = m && m[1] ? (m[2] ? -Number(m[1]) : Number(m[1])) : null
  const named = (m ? s.slice(0, m.index) : s).split(',').map(x => x.trim()).filter(Boolean)
  // "Last, First" → "First Last"; anything after the given name ("graf", "Sir") is dropped from the display; an
  // epithet stays after the name ("Pliny, the Elder" → "Pliny the Elder")
  const name = named.length >= 2 && !/\d/.test(named[1]) ? (/^[a-z]/.test(named[1]) ? `${named[0]} ${named[1]}` : `${named[1]} ${named[0]}`) : named[0] || s
  const year = y => (y < 0 ? `${-y} BCE` : String(y))
  return { name, role, died, life: died == null ? '' : born == null ? `died ${year(died)}` : `${year(born)}–${year(died)}` }
}

export const freeEverywhere = (people, year = YEAR) => people.length > 0 && people.every(p => p.died != null && p.died + TERM < year)

function topIds(html) {
  const part = html.split(/id="books-last30"/)[1] || html
  return [...new Set([...part.matchAll(/href="\/ebooks\/(\d+)"/g)].map(m => Number(m[1])))]
}

async function main() {
  const rows = parseCsv(await cached(CATALOG, 'pg_catalog.csv'))
  const head = rows.shift()
  const col = Object.fromEntries(head.map((h, i) => [h, i]))
  const books = []
  for (const r of rows) {
    if (r[col.Type] !== 'Text') continue
    const people = (r[col.Authors] || '').split(/;\s*/).filter(Boolean).map(personOf)
    if (!freeEverywhere(people)) continue
    const [title, ...sub] = (r[col.Title] || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean)
    if (!title) continue
    const author = people.find(p => !p.role) || people[0] // shown is who wrote it, not its translator or editor
    const shelves = (r[col.Bookshelves] || '').split(/;\s*/).filter(x => x.startsWith('Category: ')).map(x => x.slice(10))
    // what the book is about, in the library's own words ("Science fiction", "Monsters -- Fiction")
    const subjects = [...new Set((r[col.Subjects] || '').split(/;\s*/).map(x => x.replace(/\s*--\s*Fiction$/, '').replace(/\s*--\s*/g, ', ').trim()).filter(Boolean))]
    books.push({
      id: Number(r[col['Text#']]), t: title, s: sub.join(' ') || undefined,
      a: author.name, y: author.life, l: (r[col.Language] || 'en').split(/;\s*/)[0], c: shelves, about: subjects,
    })
  }
  const byId = new Map(books.map(b => [b.id, b]))
  const top = topIds(await cached(TOP, 'top.html')).filter(id => byId.has(id))

  // the home page: the most read, then a shelf for each of Gutenberg's categories (most read first), then each
  // language that has books. Only the books on it are written into it; the rest are in the index.
  const rank = new Map(top.map((id, i) => [id, i]))
  // Gutenberg says how often a book is read only for its 100 most read. After those, its own numbering: the
  // earliest books it published are largely the best-known classics, its newest the most obscure.
  const byRank = (a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9) || a.id - b.id
  books.sort(byRank) // the index is in the order a list of it is shown: most read, then best known
  const shelves = [{ name: 'Most read this month', ids: top.slice(0, SHELF) }]
  const count = new Map()
  for (const b of books) for (const c of b.c) count.set(c, (count.get(c) || 0) + 1)
  const categories = [...count].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, count: n }))
  const code = new Map(categories.map((c, i) => [c.name, i]))
  // each shelf shows books no shelf above it showed: the same three covers again and again is not a choice
  const onShelf = new Set(shelves[0].ids)
  for (const { name, count: n } of categories.slice(0, HOME_SHELVES)) {
    const ids = books.filter(b => b.c.includes(name) && !onShelf.has(b.id)).slice(0, SHELF).map(b => b.id)
    ids.forEach(id => onShelf.add(id))
    shelves.push({ name, count: n, ids })
  }
  const langs = new Map()
  for (const b of books) langs.set(b.l, (langs.get(b.l) || 0) + 1)
  const languages = [...langs].filter(([, n]) => n >= LANG_SHELF).sort((a, b) => b[1] - a[1]).map(([lang, n]) => ({ code: lang, count: n }))
  const shown = new Set(shelves.flatMap(s => s.ids))
  const built = new Date().toISOString().slice(0, 10)
  rmSync(OUT, { recursive: true, force: true }) // written whole each time: an older index is never left behind
  mkdirSync(OUT + 'about/', { recursive: true })
  // The index: one book a line, tab-separated (id, title, subtitle, author, life, language, category numbers),
  // the smallest form a phone can search without parsing a large JSON; plain text, so it is sent compressed.
  // Named by the day it was built, so a new one is never served from an old copy.
  const index = `index-${built}.txt`
  const clean = s => String(s || '').replace(/[\t\n\r]+/g, ' ')
  writeFileSync(OUT + index, books.map(b => [b.id, b.t, b.s, b.a, b.y, b.l, b.c.map(c => code.get(c)).join(',')].map(clean).join('\t')).join('\n'))
  writeFileSync(OUT + 'home.json', JSON.stringify({
    built, count: books.length, term: TERM, index,
    shelves, categories, languages, books: books.filter(b => shown.has(b.id)).map(({ c, about, ...b }) => b), about: ABOUT,
  }))
  // a book's page: its subjects and categories, from small files of ABOUT books each (a page loads one)
  const about = new Map()
  for (const b of books) {
    const n = Math.floor(b.id / ABOUT)
    if (!about.has(n)) about.set(n, {})
    about.get(n)[b.id] = { s: b.about.slice(0, 6), c: b.c }
  }
  for (const [n, part] of about) writeFileSync(`${OUT}about/${n}.json`, JSON.stringify(part))
  const kb = f => Math.round(statSync(OUT + f).size / 1024)
  console.log(`${books.length} books free everywhere (of ${rows.length} in Gutenberg's list) · ${shelves.length} shelves · ${languages.length} languages · home.json ${kb('home.json')} KB · ${index} ${kb(index)} KB · ${about.size} about files`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
