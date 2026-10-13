// Bookmarks made on two devices are put together, not one set kept and the other thrown away.
// A book's bookmarks travel as one record, and the newer record used to replace the older whole: a bookmark
// added on the phone and another on the laptop in the same minute left only one. Now each bookmark is its own
// fact: when it was last made or written on (`at`), and, for one that was taken away, when (`gone`). Putting
// two sets together keeps, for each sentence, whichever of those happened last. Pure: tested in marks.test.js.

// mine, theirs: { marks: [{ i, note, at }], gone: { [i]: when } } → the two put together, same shape.
export function mergeMarks(mine, theirs) {
  const by = new Map()
  for (const m of [...(mine?.marks || []), ...(theirs?.marks || [])]) {
    const had = by.get(m.i)
    if (!had || (m.at || 0) > (had.at || 0)) by.set(m.i, m)
  }
  const gone = { ...(mine?.gone || {}) }
  for (const [i, when] of Object.entries(theirs?.gone || {})) if (when > (gone[i] || 0)) gone[i] = when
  const marks = [...by.values()].filter(m => (m.at || 0) > (gone[m.i] || 0)).sort((a, b) => a.i - b.i)
  for (const m of marks) delete gone[m.i] // made again after it was taken away: the taking away is history
  return { marks, gone }
}

// Are two sets the same bookmarks, notes and all? (Whether putting them together changed anything worth sending.)
export const sameMarks = (a, b) => {
  const flat = x => JSON.stringify([(x?.marks || []).map(m => [m.i, m.note || '', m.at || 0]), Object.entries(x?.gone || {}).sort()])
  return flat(a) === flat(b)
}

// A text read again: every bookmark, and every taking away, is carried to the same words (carry.js `to`).
export function carryMarks(set, to) {
  const seen = new Set()
  const marks = (set?.marks || []).map(m => ({ ...m, i: to(m.i) })).filter(m => !seen.has(m.i) && seen.add(m.i))
  const gone = {}
  for (const [i, when] of Object.entries(set?.gone || {})) { const n = to(+i); if (when > (gone[n] || 0)) gone[n] = when }
  return { marks, gone }
}
