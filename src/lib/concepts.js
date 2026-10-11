// Concept map across the library, computed on the device: the names and terms that documents share.
// No AI, no server, no network. Pure functions only (safe to import in Node tests).

// Words that look like names only because of their position or the calendar, plus generic headings.
// Words that are capitalised or long without being a name or a term. Seen on a real library: the first
// version filled the map with "In", "Why", "How", "Today", "something", "through", "getting".
const GENERIC = `a an and are as at be but by for from has have he her his how i if in into is it its no not of on
one or our she so than that their them then there these they those to too two up us was we were what when where
which who why will with you your about above after again against all also although always among another any
anyone anything around because become becomes before behind being below between both called cannot certain
could different does doing done during each either enough especially even every everyone everything example
first following further general getting given going however important including instead itself least likely
little making many might more most much must never nothing number often other others perhaps please possible
potential probably rather really second several should simply since some someone something sometimes still
such taking themselves therefore thing things think though three through throughout today together toward
towards under until using usually various whether while within without would years yourself don doesn didn
isn wasn aren couldn shouldn wouldn here just like make made many new now only out over own same see than
very well yet`.split(/\s+/)

const STOP = new Set([
  ...GENERIC,
  'the', 'this', 'however', 'chapter', 'figure', 'table', 'section', 'may',
  'january', 'february', 'march', 'april', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
])

const WORD = /\p{L}[\p{L}\p{M}]*/gu
const letters = w => (w.match(/\p{L}/gu) || []).length
// A capital-initial word that can be part of a name: at least two letters, not a stop word.
const isName = w => letters(w) >= 2 && /^\p{Lu}/u.test(w) && !STOP.has(w.toLowerCase())

// text → [{ key, label, count }]. key is lower-cased; label is the most common written form.
// (a) runs of 1 to 3 capital-initial words that are not the first word of a sentence (names, places, terms);
//     a longer run is skipped, it is more likely a heading than a name.
// (b) any other word of 7+ letters that occurs 3+ times.
export function candidates(text) {
  const found = new Map() // key → { count, forms: Map<written form, n>, run }
  const add = (key, form, run) => {
    let e = found.get(key)
    if (!e) found.set(key, (e = { count: 0, forms: new Map(), run: false }))
    e.count++
    e.forms.set(form, (e.forms.get(form) || 0) + 1)
    if (run) e.run = true
  }
  for (const sentence of String(text || '').normalize('NFKC').split(/[.!?…\n]+/u)) {
    const words = sentence.match(WORD) || []
    const used = new Array(words.length).fill(false)
    for (let i = 1; i < words.length;) {
      if (!isName(words[i])) { i++; continue }
      let j = i + 1
      while (j < words.length && isName(words[j])) j++
      if (j - i <= 3) {
        const run = words.slice(i, j)
        for (let k = i; k < j; k++) used[k] = true
        add(run.map(w => w.toLowerCase()).join(' '), run.join(' '), true)
      }
      i = j
    }
    for (let k = 0; k < words.length; k++) {
      const w = words[k].toLowerCase()
      if (!used[k] && letters(w) >= 7 && !STOP.has(w)) add(w, words[k], false)
    }
  }
  const out = []
  for (const [key, e] of found) {
    if (!e.run && e.count < 3) continue
    let label = ''
    let best = -1
    for (const [form, n] of e.forms) if (n > best) { best = n; label = form }
    out.push({ key, label, count: e.count })
  }
  return out.sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}

// docs = [{ id, title, text }] → { concepts: [{ key, label, docs: [{ id, count }], weight }], links: [{ a, b, shared }] }
// weight = total count × log(1 + N / documents containing it). Concepts in 2+ documents rank above single-document
// ones, then by weight. Links join every pair of documents that share at least one kept concept.
export function conceptMap(docs, { maxConcepts = 40 } = {}) {
  const N = docs.length
  const byKey = new Map() // key → { total, votes: Map<label, n>, docs: [{ id, count }] }
  for (const d of docs) {
    for (const c of candidates(d.text)) {
      let e = byKey.get(c.key)
      if (!e) byKey.set(c.key, (e = { total: 0, votes: new Map(), docs: [] }))
      e.total += c.count
      e.votes.set(c.label, (e.votes.get(c.label) || 0) + c.count)
      e.docs.push({ id: d.id, count: c.count })
    }
  }
  const all = []
  for (const [key, e] of byKey) {
    let label = ''
    let best = -1
    for (const [l, n] of e.votes) if (n > best) { best = n; label = l }
    all.push({ key, label, docs: e.docs, weight: e.total * Math.log(1 + N / e.docs.length) })
  }
  all.sort((a, b) => (b.docs.length > 1) - (a.docs.length > 1) || b.weight - a.weight || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  // The map is about how documents CONNECT: every shared concept first, then at most three of each
  // document's own, so one long book cannot fill the picture by itself.
  const own = new Map()
  const concepts = all.filter(c => {
    if (c.docs.length > 1) return true
    const id = c.docs[0].id
    own.set(id, (own.get(id) || 0) + 1)
    return own.get(id) <= 3
  }).slice(0, maxConcepts)

  const index = new Map(docs.map((d, i) => [d.id, i]))
  const shared = docs.map(() => new Array(N).fill(0))
  for (const c of concepts) {
    const at = c.docs.map(d => index.get(d.id)) // ascending: docs are visited in order
    for (let p = 0; p < at.length; p++) for (let q = p + 1; q < at.length; q++) shared[at[p]][at[q]]++
  }
  const links = []
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    if (shared[i][j]) links.push({ a: docs[i].id, b: docs[j].id, shared: shared[i][j] })
  }
  return { concepts, links }
}

// Documents evenly on a circle (first at the top), concepts at the mean of their documents pulled 25% to the
// centre, then pushed apart to at least 34 px (at most 40 deterministic passes), kept inside the box.
export function layout(concepts, docs, { width, height }) {
  const cx = width / 2
  const cy = height / 2
  const r = 0.38 * Math.min(width, height)
  const MIN = 34
  const at = new Map()
  const outDocs = docs.map((d, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / docs.length
    const p = { id: d.id, x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
    at.set(d.id, p)
    return p
  })
  const pts = concepts.map(c => {
    let x = 0
    let y = 0
    let n = 0
    for (const d of c.docs) {
      const p = at.get(d.id)
      if (!p) continue
      x += p.x
      y += p.y
      n++
    }
    const ax = n ? x / n : cx
    const ay = n ? y / n : cy
    return { key: c.key, x: ax + 0.25 * (cx - ax), y: ay + 0.25 * (cy - ay) }
  })
  for (let pass = 0; pass < 40; pass++) {
    let moved = false
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i]
      const b = pts[j]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const d = Math.hypot(dx, dy)
      if (d >= MIN) continue
      const ux = d ? dx / d : 1
      const uy = d ? dy / d : 0
      const push = (MIN - d) / 2
      a.x -= ux * push
      a.y -= uy * push
      b.x += ux * push
      b.y += uy * push
      moved = true
    }
    for (const p of pts) {
      p.x = Math.min(width - 52, Math.max(52, p.x)) // room for half a label, so none is cut by the edge
      p.y = Math.min(height - 14, Math.max(14, p.y))
    }
    if (!moved) break
  }
  return { docs: outDocs, concepts: pts }
}
