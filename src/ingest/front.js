// Where a book proper begins. A book opens with pages nobody listens to: the copyright page, the cataloguing
// data, the ISBNs, the table of contents, the dedication. Read aloud from the top, the first minutes are
// "Library of Congress Cataloging-in-Publication Data" and a list of chapter titles. An audiobook opens at
// the first words of the book, and so does Noesis: the pages before stay in the text, above, and a tap on
// any sentence of them still reads it.
//
// The answer must be safe to be wrong about only in one direction: starting at the top when unsure costs a
// few boring minutes; starting late would hide part of the book. So it answers 0 unless the front of the
// document says plainly that it is front matter, and it never looks past the first part of the document.
const MARK = /©|\ball rights reserved\b|\bisbn\b|\blibrary of congress\b|\bcataloging.in.publication\b|\bcopyright\b|\bfirst (published|edition)\b|\bpublished by\b|\bprinted in\b|\bcover design\b|\bimprint of\b|\balso by\b|\bpraise for\b/i
const CONTENTS = /^(table of )?contents$/i
const MARK_MAX_WORDS = 80 // a longer paragraph that happens to say "copyright" is writing, not a copyright page
const FRONT_SHARE = 0.1 // front matter is looked for in this much of the document...
const FRONT_MAX = 120 // ...and never past this many blocks
const LOOK_SHARE = 0.25 // the book proper must begin within this much of it, or nothing is skipped
const PROSE_WORDS = 35 // a paragraph this long is writing
const RUN = 3 // this many of them...
const WINDOW = 6 // ...within this many blocks is the book having begun
const BOOK_BLOCKS = 80 // shorter than this is an article: it starts where it starts

const text = b => (b.s || []).join(' ')
const words = b => text(b).split(/\s+/).filter(Boolean).length
const isMark = b => (CONTENTS.test(text(b).trim()) || (MARK.test(text(b)) && words(b) <= MARK_MAX_WORDS))

// The index of the block the voice should begin at; 0 when there is no front matter to step over.
export function bookStart(blocks) {
  if (!Array.isArray(blocks) || blocks.length < BOOK_BLOCKS) return 0
  const frontEnd = Math.min(FRONT_MAX, Math.ceil(blocks.length * FRONT_SHARE))
  let last = -1
  for (let i = 0; i < frontEnd; i++) if (isMark(blocks[i])) last = i
  if (last < 0) return 0
  const limit = Math.floor(blocks.length * LOOK_SHARE)
  for (let i = last + 1; i < limit; i++) {
    if (blocks[i].k === 'h' || words(blocks[i]) < PROSE_WORDS) continue
    let prose = 0
    for (let j = i; j < i + WINDOW && j < blocks.length; j++) if (blocks[j].k !== 'h' && words(blocks[j]) >= PROSE_WORDS) prose++
    if (prose < RUN) continue
    let start = i
    while (start > last + 1 && blocks[start - 1].k === 'h') start-- // its own heading ("Prologue", "1") is heard too
    return start
  }
  return 0
}
