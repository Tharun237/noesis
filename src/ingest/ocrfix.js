// On-device OCR repair for scanned books (no AI, no network beyond the cached dictionary).
// OCR engines fail in predictable ways: "rn"↔"m", "cl"↔"d", "1"↔"l"↔"I", "f"↔"t", "ii"↔"n"…
// For each word the dictionary doesn't know, try those substitutions; if exactly one known word
// comes out, use it. Lines that are mostly non-words (scan specks, stamps) are dropped.
// Pure: the spellchecker is injected, so this runs in Node tests and in the browser alike.

// Measured on real books: short words, names and line-break fragments ("pany", "tive", "Fralic") produce
// false "fixes" with loose rules. So: strong, shape-based confusions apply to words of 5+ letters;
// weak, letter-swap confusions only to lowercase words of 6+ letters. And repair only runs on detected scans.
const STRONG = [
  ['rn', 'm'], ['m', 'rn'], ['cl', 'd'], ['d', 'cl'], ['vv', 'w'], ['ii', 'n'], ['li', 'h'], ['ri', 'n'],
  ['tt', 'ff'], ['ti', 'fi'], ['fi', 'ti'], ['t', 'f'], ['f', 't'], ['1', 'l'], ['1', 'i'], ['0', 'o'], ['5', 's'],
]
const WEAK = [
  ['m', 'n'], ['n', 'm'], ['c', 'e'], ['e', 'c'], ['h', 'b'], ['b', 'h'], ['u', 'n'], ['n', 'u'],
  ['l', 'i'], ['i', 'l'], ['a', 'o'], ['o', 'a'], ['c', 'o'], ['o', 'c'], ['y', 'v'], ['v', 'y'],
]

// "1 didn't" → "I didn't": a lone 1 followed by a word that only follows the pronoun I.
const AFTER_I = /(^|[\s"“(])1(?=\s+(?:am|was|have|had|did|didn't|don't|do|think|thought|know|knew|said|says|will|would|could|can|can't|cannot|shall|should|must|went|got|felt|saw|told|asked|mean|meant|guess|suppose|hope|wish|want|wanted|like|liked|love|believe|remember|see|hear|heard|found|began|tried|wrote|read|'m|'ve|'ll|'d)\b)/g

const WORD = /[A-Za-z][A-Za-z'’]*[A-Za-z]|[A-Za-z]/g

const caseLike = (src, out) =>
  src === src.toUpperCase() && src.length > 1 ? out.toUpperCase()
    : src[0] === src[0].toUpperCase() ? out[0].toUpperCase() + out.slice(1)
    : out

export function createRepair(speller) {
  const known = w => speller.correct(w) || speller.correct(w.toLowerCase())
  const memo = new Map()

  function candidates(lower, rules) {
    const found = new Set()
    for (const [a, b] of rules) {
      for (let i = lower.indexOf(a); i >= 0; i = lower.indexOf(a, i + 1)) {
        const cand = lower.slice(0, i) + b + lower.slice(i + a.length)
        if (cand !== lower && known(cand)) found.add(cand)
      }
    }
    return found
  }

  function fixWord(w) {
    if (w.length < 5 || known(w)) return null
    if (memo.has(w)) return memo.get(w)
    const lower = w.toLowerCase()
    let found = candidates(lower, STRONG)
    if (!found.size && w === lower && w.length >= 6) found = candidates(lower, WEAK)
    const out = found.size === 1 ? caseLike(w, [...found][0]) : null // ambiguous → leave it, never guess
    memo.set(w, out)
    return out
  }

  const stats = { words: 0, unknown: 0, fixed: 0, dropped: 0 }

  // Fraction of words the dictionary doesn't know — the signal that a PDF is an OCR'd scan.
  function unknownRate(blocks, sample = 4000) {
    let n = 0, bad = 0
    for (const b of blocks) {
      for (const w of b.text.match(WORD) || []) {
        if (w.length < 3 || /^[A-Z]/.test(w)) continue // names are often unknown in clean text too
        n++
        if (!known(w)) bad++
        if (n >= sample) return bad / n
      }
    }
    return n ? bad / n : 0
  }

  function repairText(text) {
    let t = text.replace(AFTER_I, '$1I').replace(/\s[|\]}{]\s|\s[|\]}{](?=\s|$)|\|\]/g, ' ') // stray scan glyphs
    const words = t.match(WORD) || []
    let unknown = 0
    let real = 0 // known words of 3+ letters: genuine prose always has some ("I am." has none, but no unknowns either)
    t = t.replace(WORD, (w, at, all) => {
      stats.words++
      if (/[./@:]/.test(all[at - 1] || '') || /^[./@][A-Za-z]/.test(all.slice(at + w.length))) return w // Half.com’s, foo@bar, a/b
      const fix = fixWord(w)
      if (fix) { stats.fixed++; real++; return fix }
      if (w.length >= 3) known(w) ? real++ : (unknown++, stats.unknown++)
      return w
    })
    const junk = words.length <= 12 && unknown > 0 && (real === 0 || unknown / words.length >= 0.5)
    return { text: t.replace(/\s+/g, ' ').trim(), junk }
  }

  function repair(blocks) {
    const out = []
    for (const b of blocks) {
      const r = repairText(b.text)
      if (r.junk && b.k === 'p') { stats.dropped++; continue }
      out.push({ ...b, text: r.text })
    }
    return out
  }

  return { repair, repairText, unknownRate, fixWord, stats }
}

// Browser loader: dictionary files are self-hosted under /dict (copied from dictionary-en on install).
let ready = null
export function loadRepair() {
  ready ??= Promise.all([
    import('nspell'),
    fetch('/dict/en.aff').then(r => r.text()),
    fetch('/dict/en.dic').then(r => r.text()),
  ]).then(([{ default: nspell }, aff, dic]) => nspell(aff, dic))
  return ready.then(createRepair)
}
