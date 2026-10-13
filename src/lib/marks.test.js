import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeMarks, sameMarks, carryMarks } from './marks.js'

const mark = (i, at, note = '') => ({ i, note, at })

test('a bookmark made on each of two devices in the same minute: both are kept', () => {
  const phone = { marks: [mark(10, 1000)], gone: {} }
  const laptop = { marks: [mark(40, 1001)], gone: {} }
  assert.deepEqual(mergeMarks(phone, laptop).marks.map(m => m.i), [10, 40])
  assert.deepEqual(mergeMarks(laptop, phone).marks.map(m => m.i), [10, 40]) // whichever way round
})

test('taken away on one device after it was made: it is gone on both, and stays gone', () => {
  const had = { marks: [mark(10, 1000), mark(20, 1000)], gone: {} }
  const tookAway = { marks: [mark(20, 1000)], gone: { 10: 2000 } }
  assert.deepEqual(mergeMarks(had, tookAway).marks.map(m => m.i), [20])
  assert.deepEqual(mergeMarks(mergeMarks(had, tookAway), had).marks.map(m => m.i), [20]) // the old set arriving again does not bring it back
})

test('made again after it was taken away: it is there', () => {
  const tookAway = { marks: [], gone: { 10: 2000 } }
  const again = { marks: [mark(10, 3000)], gone: {} }
  const out = mergeMarks(tookAway, again)
  assert.deepEqual(out.marks.map(m => m.i), [10])
  assert.deepEqual(out.gone, {})
})

test('a note written later wins over the bookmark as it was', () => {
  const out = mergeMarks({ marks: [mark(10, 1000)] }, { marks: [mark(10, 5000, 'come back to this')] })
  assert.equal(out.marks[0].note, 'come back to this')
})

test('a record from before bookmarks said when they were taken away (no `gone`) still puts together', () => {
  assert.deepEqual(mergeMarks({ marks: [mark(1, 5)] }, { marks: [mark(2, 6)] }).marks.map(m => m.i), [1, 2])
  assert.deepEqual(mergeMarks(undefined, { marks: [mark(2, 6)] }).marks.map(m => m.i), [2])
})

test('sameMarks tells whether putting together changed anything', () => {
  const a = { marks: [mark(1, 5, 'x')], gone: { 3: 9 } }
  assert.ok(sameMarks(a, { marks: [mark(1, 5, 'x')], gone: { 3: 9 } }))
  assert.ok(!sameMarks(a, { marks: [mark(1, 5, 'y')], gone: { 3: 9 } }))
  assert.ok(!sameMarks(a, { marks: [mark(1, 5, 'x')], gone: {} }))
})

test('carried to a text read again: each to its new sentence, two that land on one are one', () => {
  const to = i => (i < 50 ? i + 3 : 60)
  const out = carryMarks({ marks: [mark(10, 1), mark(55, 2), mark(58, 3)], gone: { 20: 7 } }, to)
  assert.deepEqual(out.marks.map(m => m.i), [13, 60])
  assert.deepEqual(out.gone, { 23: 7 })
})
