// A document read again comes out as different sentences (src/ingest/pdftext.js READER). The place being
// listened to, and each bookmark, is a sentence number: this finds the same words in the new text.
// Pure, so it is tested in Node (carry.test.js).

const letters = t => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
const OPENING = 48 // letters of a sentence that are compared
const SHORT = 12 // "Yes." and "No." are said a thousand times in a book: too short to find a place by
const AHEAD = 12 // if this sentence is not there any more, one of the next few will be

// was, now: the sentences before and after. → a function from an old sentence number to a new one.
export function carrier(was, now) {
  const text = now.map(letters)
  const opens = new Map() // the opening words of a sentence → every place they open one
  text.forEach((t, n) => { const k = t.slice(0, OPENING); if (k.length >= SHORT) (opens.get(k) ?? opens.set(k, []).get(k)).push(n) })
  return i => {
    if (!now.length) return 0
    const guess = Math.min(now.length - 1, Math.max(0, Math.round(i / Math.max(1, was.length) * now.length)))
    for (let step = 0; step < AHEAD && i + step < was.length; step++) {
      const k = letters(was[i + step]).slice(0, OPENING)
      if (k.length < SHORT) continue
      const hits = opens.get(k)
      if (hits) return Math.max(0, hits.reduce((a, b) => (Math.abs(b - guess) < Math.abs(a - guess) ? b : a)) - step)
      // The old reader broke some pages into pieces of sentences: a piece opens nothing, but it is inside one.
      for (let d = 0; d < now.length; d++) {
        for (const n of d ? [guess + d, guess - d] : [guess]) if (text[n]?.includes(k)) return Math.max(0, n - (step ? 1 : 0))
      }
    }
    return guess // nothing found (a page of pictures): as far through the book as before
  }
}
