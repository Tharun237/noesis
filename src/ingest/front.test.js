// Where a book proper begins: front matter is stepped over, and nothing else ever is.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { bookStart } from './front.js'

const p = t => ({ k: 'p', s: [t] })
const h = t => ({ k: 'h', s: [t] })
const prose = n => p(Array.from({ length: 45 }, (_, i) => `word${n}x${i}`).join(' ') + '.')
const chapters = n => Array.from({ length: n }, (_, i) => prose(i))

const FRONT = [
  h('Destroyer of Worlds'),
  p('Copyright © 2025 by Frank Close'),
  p('The publisher supports the right to free expression and the value of copyright. The purpose of copyright is to encourage writers and artists to produce the creative works that enrich our culture, and scanning or sharing this book without permission is a theft of the author’s work.'),
  p('Library of Congress Cataloging-in-Publication Data'),
  p('ISBNs: 9781541605893 (hardcover), 9781541605916 (ebook)'),
  h('Contents'),
  p('Prelude 1'), p('Part I 15'), p('The Nucleus Revealed 17'), p('Unearthly Visions 41'),
  p('For my family'),
]

test('a book begins after its copyright page and contents, at its first heading', () => {
  const blocks = [...FRONT, h('Prelude'), ...chapters(200)]
  assert.equal(bookStart(blocks), FRONT.length) // the "Prelude" heading
  assert.equal(blocks[bookStart(blocks)].s[0], 'Prelude')
})

test('an article, or a book with no front matter, starts where it starts', () => {
  assert.equal(bookStart([h('A paper'), p('Abstract'), ...chapters(30)]), 0) // short
  assert.equal(bookStart([h('A novel'), h('Chapter 1'), ...chapters(300)]), 0) // nothing says front matter
  assert.equal(bookStart([]), 0)
  assert.equal(bookStart(undefined), 0)
})

test('the word "copyright" in the writing itself is not a copyright page', () => {
  const talk = p(`${Array.from({ length: 90 }, (_, i) => `w${i}`).join(' ')} and the copyright law of the time was not yet written.`)
  assert.equal(bookStart([h('A history'), talk, ...chapters(300)]), 0)
})

test('it never starts deep inside the book', () => {
  // front-matter marks, but no run of prose until far too late: unsure, so nothing is skipped
  const blocks = [...FRONT, ...Array.from({ length: 400 }, (_, i) => p(`Line ${i}`)), ...chapters(100)]
  assert.equal(bookStart(blocks), 0)
})
