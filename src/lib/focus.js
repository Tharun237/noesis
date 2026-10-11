// M15 Focus view helpers (pure, tested in focus.test.js).
// pivot: which letter the eye rests on; wordDelay: RSVP timing;
// emphatic: words shown larger; splitWords; wordIndexAt: spoken word from audio time.

function letterIndices(word) {
  const out = []
  const s = String(word ?? '')
  for (let i = 0; i < s.length;) {
    const cp = s.codePointAt(i)
    const ch = String.fromCodePoint(cp)
    if (/[\p{L}\p{N}]/u.test(ch)) out.push(i)
    i += ch.length
  }
  return out
}

export function countLetters(word) {
  return letterIndices(word).length
}

// Index in the original string of the pivot letter: 0 for 1 letter, 1 for 2-5,
// 2 for 6-9, 3 for 10-13, 4 beyond. Counted on letters/digits only; leading
// quotes or brackets are skipped by mapping back to the original index.
export function pivot(word) {
  const s = String(word ?? '')
  if (!s.length) return 0
  const idx = letterIndices(s)
  const n = idx.length
  if (!n) return 0
  const k = n <= 1 ? 0 : n <= 5 ? 1 : n <= 9 ? 2 : n <= 13 ? 3 : 4
  return idx[Math.min(k, n - 1)]
}

const CLOSER_RE = /["'”’‘`)\]}»›]+$/u

function strippedEnd(word) {
  return String(word ?? '').replace(CLOSER_RE, '')
}

export function wordDelay(word, wpm) {
  const rate = Number(wpm) > 0 ? Number(wpm) : 300
  const base = 60000 / rate
  const long = countLetters(word) > 8 ? 1.3 : 1
  const last = strippedEnd(word).slice(-1)
  const comma = last === ',' || last === ';' || last === ':' ? 1.5 : 1
  const end = last === '.' || last === '!' || last === '?' || last === '…' || last === '।' ? 2.2 : 1
  return base * long * comma * end
}

export function emphatic(word) {
  const s = String(word ?? '')
  const core = s.replace(CLOSER_RE, '')
  if (core.endsWith('!') || core.endsWith('?')) return true
  const letters = [...s].filter(c => /\p{L}/u.test(c))
  if (letters.length < 2) return false
  let upper = 0
  for (const c of letters) {
    if (c.toLowerCase() === c.toUpperCase()) continue // uncased script: cannot be capitals
    if (c !== c.toUpperCase()) return false
    upper++
  }
  return upper >= 2
}

export function splitWords(sentence) {
  return String(sentence ?? '').split(/\s+/).filter(Boolean)
}

// Which word a fraction (0-1) of the spoken length falls in, given the
// wordWeights() result ({ ws, ends }) or an ends array. Same rule as
// ActiveSentence in Reader.jsx: first cumulative end >= fraction.
export function wordIndexAt(weights, fraction) {
  const ends = Array.isArray(weights) ? weights : weights?.ends ?? []
  if (!ends.length) return 0
  if (!(fraction > 0)) return 0
  const i = ends.findIndex(e => e >= fraction)
  return i === -1 ? ends.length - 1 : i
}
