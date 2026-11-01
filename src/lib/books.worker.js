// The free-book index (tools/books.mjs), held and searched off the page's thread: 32,723 lines a slow phone can
// read and search without the screen stopping. Lines are in most-read order, so every answer is too.
//   { id, url }                       → nothing until asked; the index is fetched on the first question
//   { id, find: 'query', limit }      → books whose title or author has every word of the query
//   { id, category: n, limit, from }  → books in category n
//   { id, language: 'fr', limit, from }
//   { id, ids: [1342, …] }            → those books
let url = null
let rows = null // [{ id, t, s, a, y, l, c: [n] }]
let hay = null // what a search looks in: title, subtitle and author, lower case, without accents
let loading = null

const fold = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase() // 'Brontë' is found by 'bronte'

function load() {
  loading ??= fetch(url).then(r => { if (!r.ok) throw new Error(`The book list did not load (${r.status}).`); return r.text() }).then(text => {
    // a server with no such file answers with the app's own page, status 200: that is not a list of books
    if (text.trimStart().startsWith('<')) throw new Error('The book list has changed. Close Noesis and open it again.')
    rows = text.split('\n').map(line => {
      const [id, t, s, a, y, l, c] = line.split('\t')
      return { id: Number(id), t, s: s || undefined, a, y, l, c: c ? c.split(',').map(Number) : [] }
    })
    hay = rows.map(b => fold(`${b.t} ${b.s || ''} ${b.a}`))
  }).catch(e => { loading = null; throw e })
  return loading
}

function find(q, limit) {
  const words = fold(q).split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const first = [] // a title that starts with the query
  const rest = []
  const start = words.join(' ')
  for (let i = 0; i < rows.length && first.length < limit; i++) {
    if (!words.every(w => hay[i].includes(w))) continue
    ;(hay[i].startsWith(start) ? first : rest).push(rows[i])
  }
  return [...first, ...rest].slice(0, limit)
}

const page = (test, from = 0, limit = 60) => {
  const all = rows.filter(test)
  return { books: all.slice(from, from + limit), total: all.length }
}

onmessage = async ({ data: m }) => {
  if (m.url) { url = m.url; return }
  try {
    await load()
    let out
    if (m.find != null) out = { books: find(m.find, m.limit || 60) }
    else if (m.category != null) out = page(b => b.c.includes(m.category), m.from, m.limit)
    else if (m.language != null) out = page(b => b.l === m.language, m.from, m.limit)
    else if (m.ids) { const want = new Set(m.ids); out = { books: rows.filter(b => want.has(b.id)) } }
    postMessage({ id: m.id, ...out })
  } catch (e) {
    postMessage({ id: m.id, error: String(e.message || e) })
  }
}
