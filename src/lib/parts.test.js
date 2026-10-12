// Which part of a document can be translated, and how far a translation has got (parts.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { partsOf, samePart, secondsFor, progressOf, SLOW_PHONE_CPS } from './parts.js'

const book = [
  { k: 'h', s: ['One'], p: 1 }, { k: 'p', s: ['aaaa aaaa.'], p: 1 }, { k: 'p', s: ['bbbb.'], p: 2 },
  { k: 'h', s: ['Two: a much longer chapter title than fits'], p: 3 }, { k: 'p', s: ['cccc cccc cccc.'], p: 3 }, { k: 'p', s: ['dddd.'], p: 4 },
  { k: 'h', s: ['Three'], p: 5 }, { k: 'p', s: ['eeee.'], p: 6 },
]

test('in the middle of a book: all of it, this chapter, or from here', () => {
  const parts = partsOf(book, 4)
  assert.deepEqual(parts.map(p => p.key), ['all', 'chapter', 'here'])
  const [all, chapter, here] = parts
  assert.equal(all.part, null)
  assert.equal(all.pages, 6)
  assert.deepEqual({ from: chapter.part.from, to: chapter.part.to }, { from: 3, to: 6 })
  assert.equal(chapter.pages, 2)
  assert.ok(chapter.part.label.length <= 28 && chapter.part.label.endsWith('…'))
  assert.deepEqual({ from: here.part.from, to: here.part.to, label: here.part.label }, { from: 4, to: null, label: 'from page 3' })
  assert.ok(chapter.chars < all.chars && here.chars < all.chars)
})

test('at the very start "from here" is the whole document, so it is not offered; the last chapter runs to the end', () => {
  assert.deepEqual(partsOf(book, 0).map(p => p.key), ['all', 'chapter'])
  assert.equal(partsOf(book, 7).find(p => p.key === 'chapter').part.to, null)
})

test('no headings, no pages: only the whole, or from here', () => {
  const plain = [{ k: 'p', s: ['one.'] }, { k: 'p', s: ['two.'] }, { k: 'p', s: ['three.'] }]
  assert.deepEqual(partsOf(plain, 1).map(p => p.key), ['all', 'here'])
  assert.equal(partsOf(plain, 1)[1].part.label, 'from where you were')
  assert.equal(partsOf(plain, 1)[0].pages, null)
})

test('a part is the same part whether "to the end" is written as null or left out', () => {
  assert.ok(samePart(null, undefined))
  assert.ok(samePart({ from: 3, to: null }, { from: 3 }))
  assert.ok(!samePart({ from: 3, to: 6 }, { from: 3, to: null }))
  assert.ok(!samePart(null, { from: 2, to: null }))
})

test('an estimate uses this device\'s speed once it is known, a slow phone\'s until then', () => {
  assert.equal(secondsFor(9000), 9000 / SLOW_PHONE_CPS)
  assert.equal(secondsFor(9000, 3000), 3)
})

test('time left comes from the time the part done so far took; nothing is promised in the first moments', () => {
  const at = (done, ms) => progressOf({ done, total: 1000, startedAt: 0, now: ms, page: 12, pages: 240 })
  assert.equal(at(10, 1000).left, null)
  assert.equal(at(250, 10000).left, 30)
  assert.equal(at(250, 10000).where, 'page 12 of 240')
  assert.equal(progressOf({ done: 500, total: 1000, startedAt: 0, now: 10000 }).where, null)
})
