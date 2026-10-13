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

// A scan often loses the space after a short word: "ifwe", "ofa", "isa". Split only where both halves are words
// and one of them is one of these (so "today" or "into" can never be cut: they are known words to begin with).
const SMALL = new Set('a an the of to in on at by is it if as we he be or so no do my us up and for but not was are has had can its his her our you all'.split(' '))

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

  function unglue(w) {
    if (w.length < 3 || w.length > 14 || w !== w.toLowerCase()) return null
    let found = null
    for (let i = 1; i < w.length; i++) {
      const a = w.slice(0, i), b = w.slice(i)
      const ok = (SMALL.has(a) && (SMALL.has(b) || (b.length >= 3 && known(b)))) || (SMALL.has(b) && a.length >= 3 && known(a))
      if (!ok) continue
      if (found) return null // two ways to cut it: leave it
      found = a + ' ' + b
    }
    return found
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
      const fix = fixWord(w) || (known(w) ? null : unglue(w))
      if (fix) { stats.fixed++; real++; return fix }
      if (w.length >= 3) known(w) ? real++ : (unknown++, stats.unknown++)
      return w
    })
    // A picture, a dotted rule or a jacket set in fancy type comes out of a scan as letters that are not words:
    // "SPO CO TSO O ESTEE EHO". Names are not words either, so a capitalised unknown ("Rovelli") is not held against it.
    const tokens = words.filter(w => w.length >= 2)
    const noise = tokens.filter(w => !known(w) && !/^[A-Z][a-z]+$/.test(w)).length
    const junk = (words.length <= 12 && unknown > 0 && (real === 0 || unknown / words.length >= 0.5)) ||
      (tokens.length >= 5 && noise / tokens.length >= 0.5)
    return { text: t.replace(/\s+/g, ' ').trim(), junk }
  }

  function repair(blocks) {
    const out = []
    for (const b of blocks) {
      const r = repairText(b.text)
      if (r.junk && (b.k === 'p' || b.k === 'h')) { stats.dropped++; continue }
      out.push({ ...b, text: r.text })
    }
    return out
  }

  // The same, in slices: a whole book in one go held the screen still for a second on a phone.
  async function repairAsync(blocks, rest, slice = 150) {
    const out = []
    for (let i = 0; i < blocks.length; i += slice) { out.push(...repair(blocks.slice(i, i + slice))); await rest() }
    return out
  }

  return { repair, repairAsync, repairText, unknownRate, fixWord, stats }
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
