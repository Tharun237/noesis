// What part of a document to translate, and how long that will take. Pure.
//
// A whole book takes minutes to translate on a phone (measured: about 12 on a slow one for a 1,000-page
// collection), and nobody listens to a whole book at once. So the customer chooses: all of it, from where they
// are, or the chapter they are in; and is told beforehand roughly how long each takes on this device.
//
// A part is a run of the ORIGINAL document's blocks: { from, to } (to is one past the last; null means "to
// the end"), with `label`, the few words that name it in the translated version's title.

const textOf = b => (b.s ? b.s.join(' ') : b.text || '')
const charsIn = (blocks, from, to) => { let n = 0; for (let i = from; i < to; i++) n += textOf(blocks[i]).length; return n }
const short = (t, max = 28) => (t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t)

// blocks: the document's blocks ({ k, s, p }); at: the index of the block being read.
// → [{ key: 'all' | 'here' | 'chapter', name, part: null | { from, to, label }, chars, pages }]
//   'here' is left out at the very start (it would be the whole document again); 'chapter' needs headings
//   and is left out when the chapter is the whole document.
export function partsOf(blocks, at = 0) {
  const n = blocks.length
  const cur = Math.max(0, Math.min(n - 1, at))
  const pageOf = i => blocks[i]?.p
  const pagesIn = (from, to) => { const a = pageOf(from), b = pageOf(Math.max(from, to - 1)); return typeof a === 'number' && typeof b === 'number' ? b - a + 1 : null }
  const out = [{ key: 'all', name: 'All of it', part: null, chars: charsIn(blocks, 0, n), pages: pagesIn(0, n) }]
  let from = -1
  for (let i = cur; i >= 0; i--) if (blocks[i].k === 'h') { from = i; break }
  let to = n
  for (let i = cur + 1; i < n; i++) if (blocks[i].k === 'h') { to = i; break }
  if (from >= 0 && !(from === 0 && to === n)) {
    const title = short(textOf(blocks[from]).trim())
    out.push({ key: 'chapter', name: 'This chapter', part: { from, to: to === n ? null : to, label: title }, chars: charsIn(blocks, from, to), pages: pagesIn(from, to) })
  }
  if (cur > 0) {
    const p = pageOf(cur)
    out.push({ key: 'here', name: 'From here', part: { from: cur, to: null, label: typeof p === 'number' ? `from page ${p}` : 'from where you were' }, chars: charsIn(blocks, cur, n), pages: pagesIn(cur, n) })
  }
  return out
}

export const samePart = (a, b) => (a?.from ?? 0) === (b?.from ?? 0) && (a?.to ?? null) === (b?.to ?? null)

// How fast this device translates, in characters of the original a second. Unknown until it has translated
// something: then the guess is a slow phone's speed, so an estimate is beaten more often than it is missed.
export const SLOW_PHONE_CPS = 900
export const secondsFor = (chars, cps) => Math.ceil(chars / (cps > 0 ? cps : SLOW_PHONE_CPS))

// Where a translation has got to, for the customer: the page it is on (when the document has pages) and how
// long is left, from how long the part done so far took.
export function progressOf({ done, total, startedAt, now, page, pages }) {
  const f = total > 0 ? Math.min(1, done / total) : 0
  const spent = (now - startedAt) / 1000
  const left = f >= 0.03 && spent >= 3 ? Math.round((spent * (1 - f)) / f) : null
  return { f, left, where: typeof page === 'number' && pages > 1 ? `page ${page} of ${pages}` : null, cps: spent > 0 ? done / spent : 0 }
}
