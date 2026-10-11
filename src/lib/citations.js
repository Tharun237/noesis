// Citations: the marks in a text ([12], (Smith et al., 2020)) and the reference list they point to.
// What is listened to has the marks removed (src/lib/text.js) and the list is never read aloud; both are
// kept as data, so a citation can be looked at and heard when the listener asks. Everything here is pure
// and tested except lookupPaper, which asks a public index of papers for one paper by its exact id.

const MAX_RANGE = 20 // [3-40] is more likely a page range than thirty-eight citations
const MAX_REFS = 500
const HEADING = /^(?:\d+\.?\s*|[ivx]+\.\s*)?(?:references|bibliography|works cited|literature cited)$/i
const NUMBERED = /\[(\d{1,3}(?:\s*[-–—,]\s*\d{1,3})*)\]/g
const IN_PARENS = /\(((?:see\s|e\.g\.,?\s)?[^()]*?\b(?:1[5-9]|20)\d{2}[a-z]?)\)/g
const NARRATIVE = /([A-Z][\p{L}'-]+)(?:\s+et al\.?|\s+(?:and|&)\s+[A-Z][\p{L}'-]+)?\s+\(((?:1[5-9]|20)\d{2})[a-z]?\)/gu
const AUTHOR_YEAR = /([A-Z][\p{L}'-]+)[^;]*?\b((?:1[5-9]|20)\d{2})[a-z]?\s*$/u

// The citations in a text, in order, each once: numbers as '12', author and year as 'smith2020'.
export function citesIn(text) {
  const out = []
  const add = k => { if (!out.includes(k)) out.push(k) }
  for (const m of text.matchAll(NUMBERED)) {
    for (const part of m[1].split(',')) {
      const [a, b] = part.split(/[-–—]/).map(x => parseInt(x, 10))
      if (b > a && b - a <= MAX_RANGE) for (let n = a; n <= b; n++) add(String(n))
      else { add(String(a)); if (b) add(String(b)) }
    }
  }
  for (const m of text.matchAll(IN_PARENS)) {
    for (const piece of m[1].split(';')) {
      const hit = AUTHOR_YEAR.exec(piece.trim().replace(/^(?:see|e\.g\.,?)\s+/i, ''))
      if (hit) add(hit[1].toLowerCase() + hit[2])
    }
  }
  for (const m of text.matchAll(NARRATIVE)) add(m[1].toLowerCase() + m[2])
  return out
}

const join = (a, b) => (/[a-z]-$/.test(a) && /^[a-z]/.test(b) ? a.slice(0, -1) + b : a + ' ' + b)
const ENTRY_START = /^\s*(?:\[(\d{1,3})\]|(\d{1,3})\.)\s+(.*)$/

// Reference entries from the lines or paragraphs of a reference list. A numbered list ("[12] ..." or
// "12. ...") is cut at each number. An unnumbered one (author, year) starts a new entry at a line that begins
// with a surname, once the entry before it has a year and has ended.
export function splitRefs(lines) {
  const numbered = lines.filter(l => ENTRY_START.test(l)).length >= 2
  const entries = []
  let cur = null
  for (const raw of lines) {
    const line = String(raw).trim()
    if (!line) continue
    const m = ENTRY_START.exec(line)
    if (numbered) {
      if (m) { cur = { n: +(m[1] || m[2]), text: m[3] }; entries.push(cur) }
      else if (cur) cur.text = join(cur.text, line)
    } else if (!cur || (/[.\])]$/.test(cur.text) && /\b(?:1[5-9]|20)\d{2}/.test(cur.text) && /^[A-Z][\p{L}'-]+,?\s/u.test(line))) {
      cur = { text: line }
      entries.push(cur)
    } else cur.text = join(cur.text, line)
  }
  return entries.filter(e => e.text.length > 20).slice(0, MAX_REFS)
}

// A document's blocks without its reference list, and the list as entries. The list is the last section
// headed "References" (or Bibliography, Works cited), up to the next heading.
export function takeRefs(blocks) {
  let at = -1
  blocks.forEach((b, i) => { if (b.k === 'h' && HEADING.test((b.text || '').trim())) at = i })
  if (at < 0) return { blocks, refs: [] }
  let end = at + 1
  while (end < blocks.length && blocks[end].k !== 'h') end++
  const refs = splitRefs(blocks.slice(at + 1, end).map(b => b.text || ''))
  if (!refs.length) return { blocks, refs: [] }
  return { blocks: [...blocks.slice(0, at), ...blocks.slice(end)], refs }
}

// The entry a citation points to, or null. A number finds the entry with that number, or, in an unnumbered
// list, the entry in that place. An author and year finds the entry that starts with the surname and has the year.
export function findRef(refs, key) {
  if (!refs?.length) return null
  if (/^\d+$/.test(key)) {
    const n = +key
    return refs.find(r => r.n === n) || (refs.some(r => r.n != null) ? null : refs[n - 1] || null)
  }
  const m = /^(.*?)(\d{4})$/.exec(key)
  if (!m) return null
  const has = r => r.text.includes(m[2])
  return refs.find(r => has(r) && r.text.toLowerCase().startsWith(m[1])) || refs.find(r => has(r) && r.text.toLowerCase().includes(m[1])) || null
}

// The exact id of the paper an entry names, as a DOI, or null. An arXiv number has a DOI of its own.
export function paperId(text) {
  const doi = /\b(10\.\d{4,9}\/[^\s"<>]+)/.exec(text)
  if (doi) return doi[1].replace(/[.,;)\]]+$/, '')
  const arxiv = /arxiv[:\s/]*(\d{4}\.\d{4,5})/i.exec(text)
  return arxiv ? `10.48550/arXiv.${arxiv[1]}` : null
}

// Where to read the paper: its own page when the entry names it exactly, otherwise a search for the entry.
export const paperUrl = text => {
  const id = paperId(text)
  return id ? `https://doi.org/${id}` : `https://scholar.google.com/scholar?q=${encodeURIComponent(text.slice(0, 200))}`
}

// The index stores a summary as word -> positions. Back to text, cut to the first sentences.
export function summaryOf(inverted, sentences = 2) {
  if (!inverted) return ''
  const words = []
  for (const [word, places] of Object.entries(inverted)) for (const p of places) words[p] = word
  const text = words.filter(Boolean).join(' ')
  const cut = text.match(/[^.!?]+[.!?]+(?=\s|$)/g)
  return (cut ? cut.slice(0, sentences).map(x => x.trim()).join(' ') : text).trim()
}

// One paper from OpenAlex (a free public index of research papers) by its exact DOI: its title, first
// authors and the start of its summary. null when the index does not have it. The index's year is not used:
// for an arXiv paper it gave 2025 for a 2017 paper (measured 2026-10-12); the entry itself states the year.
export async function lookupPaper(doi, { signal } = {}) {
  const res = await fetch(`https://api.openalex.org/works/doi:${doi}?select=display_name,authorships,abstract_inverted_index`, { signal })
  if (res.status === 404) return null
  if (!res.ok) throw new Error('The paper index did not answer. Try again later.')
  const w = await res.json()
  return {
    title: w.display_name || '',
    authors: (w.authorships || []).slice(0, 3).map(a => a.author?.display_name).filter(Boolean),
    summary: summaryOf(w.abstract_inverted_index),
  }
}
