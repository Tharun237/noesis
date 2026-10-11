// Sentence → position on the PDF page, found at show time by matching text.
//
// No geometry is stored when a document is added: the sentence being spoken is
// FOUND on the page when the page is shown, by matching its text against the
// page's own text layer. Scanned pages have no text layer and simply get no mark.
// Pure module: no DOM, no pdf.js, so node can test it directly.

const KEEP = /[\p{L}\p{N}]/u

// Whole-string normalisation, the same for page lines and spoken sentences:
// NFKC, then lower-case, keeping ONLY letters and digits. Dropping spaces,
// hyphens and punctuation is deliberate: a word broken across lines ("exam-" /
// "ple") and any difference in spacing or quotes then match without special cases.
export function normalizeText(t) {
  let out = ''
  for (const ch of String(t ?? '').normalize('NFKC').toLowerCase()) {
    if (KEEP.test(ch)) out += ch
  }
  return out
}

// Every line's text joined in order, normalised as above. lineOf[k] = index of
// the line that character k of norm came from; offOf[k] = that character's
// index inside the line's ORIGINAL text (UTF-16 offset, so rects() can turn it
// into a horizontal share via line.text.length).
export function indexLines(lines) {
  const chars = []
  const lo = []
  const oo = []
  lines.forEach((l, li) => {
    const text = l.text ?? ''
    let idx = 0
    for (const ch of text) {
      for (const mc of ch.normalize('NFKC').toLowerCase()) {
        if (KEEP.test(mc)) {
          chars.push(mc)
          lo.push(li)
          oo.push(idx)
        }
      }
      idx += ch.length
    }
  })
  return { norm: chars.join(''), lineOf: Uint32Array.from(lo), offOf: Uint32Array.from(oo) }
}

// { start, end } in norm (end exclusive), or null.
export function locate(index, sentence, from = 0) {
  const s = normalizeText(sentence)
  if (s.length < 4) return null
  const norm = index.norm
  let start = norm.indexOf(s, from)
  if (start === -1) start = norm.indexOf(s, 0)
  if (start !== -1) return { start, end: start + s.length }
  // Anchors: the listening text sometimes differs from the page in the middle
  // (a spoken number, a dropped citation), so match the two ends instead.
  if (s.length < 24) return null
  const a = s.slice(0, 16)
  const z = s.slice(-16)
  start = norm.indexOf(a, from)
  if (start === -1) start = norm.indexOf(a, 0)
  if (start === -1) return null
  const zi = norm.indexOf(z, start + a.length)
  if (zi !== -1 && zi + z.length - start <= s.length * 1.6) return { start, end: zi + z.length }
  return { start, end: Math.min(norm.length, start + s.length) }
}

// One rect per line touched, in line order. For each line the covered part runs
// from the first to the last covered character OF THAT LINE, turned into
// horizontal fractions of the line by character count.
export function rects(index, lines, start, end) {
  const out = []
  for (let li = 0; li < lines.length; li++) {
    let first = -1
    let last = -1
    for (let k = start; k < end; k++) {
      if (index.lineOf[k] === li) {
        const o = index.offOf[k]
        if (first === -1 || o < first) first = o
        if (last === -1 || o > last) last = o
      }
    }
    if (first === -1) continue
    const line = lines[li]
    const len = line.text.length || 1
    out.push({
      x: line.x + line.w * (first / len),
      y: line.y,
      w: line.w * ((last + 1 - first) / len),
      h: line.h,
    })
  }
  return out
}

// sentences = [{ i, t }] in reading order. One indexLines, then locate each
// with from = the previous found end (0 at first; unchanged when a sentence is
// not found), keeping only found ones.
export function locatePage(lines, sentences) {
  const index = indexLines(lines)
  const out = []
  let from = 0
  for (const s of sentences) {
    const r = locate(index, s.t, from)
    if (r) {
      out.push({ i: s.i, rects: rects(index, lines, r.start, r.end) })
      from = r.end
    }
  }
  return out
}

// The i whose rect contains the point (fractions); if none, the i of the rect
// nearest to the point (distance to the rect's edge, 0 inside); null when empty.
export function sentenceAt(located, px, py) {
  if (!located || located.length === 0) return null
  for (const e of located) {
    for (const r of e.rects) {
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return e.i
    }
  }
  let best = null
  let bd = Infinity
  for (const e of located) {
    for (const r of e.rects) {
      const dx = Math.max(r.x - px, 0, px - (r.x + r.w))
      const dy = Math.max(r.y - py, 0, py - (r.y + r.h))
      const d = Math.hypot(dx, dy)
      if (d < bd) {
        bd = d
        best = e.i
      }
    }
  }
  return best
}
