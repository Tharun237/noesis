import test from 'node:test'
import assert from 'node:assert/strict'
import { carrier } from './carry.js'

const book = n => Array.from({ length: n }, (_, i) => `This is sentence number ${i} of the book, and it says so.`)

test('the same sentence is found where it now is', () => {
  const was = book(100)
  const now = [...book(40), 'A line the old reader had thrown away as noise.', 'And one more that it had lost.', ...book(100).slice(40)]
  const to = carrier(was, now)
  assert.equal(to(10), 10)
  assert.equal(to(70), 72)
})

test('a sentence that is gone lands just before the next one that is still there', () => {
  const was = [...book(50), 'viii THREE ROADS TO QUANTUM GRAVITY', ...book(100).slice(50)]
  const now = book(100)
  assert.equal(carrier(was, now)(50), 49) // the running header: the place is the sentence after it, less one
})

test('words said many times are found nearest to where they were', () => {
  const said = 'He looked at her for a long while before answering.'
  const was = [...book(30), said, ...book(60).slice(30), said, ...book(90).slice(60)]
  const to = carrier(was, was)
  assert.equal(to(30), 30)
  assert.equal(to(61), 61)
})

test('nothing in common: as far through as before, and never outside the text', () => {
  const to = carrier(book(100), ['Entirely', 'other', 'words', 'here'])
  assert.equal(to(50), 2)
  assert.equal(to(99), 3)
  assert.equal(carrier(book(10), [])(5), 0)
})

test('a piece of a sentence (the old reader broke crooked pages into pieces) is found inside the whole one', () => {
  const whole = 'In 1965 a young man called Stephen was studying for a PhD in Cambridge. He had read the paper twice.'
  const was = [...book(40), 'was studying for a PhD in Cambridge. He', 'had read the paper twice.', ...book(80).slice(40)]
  const now = [...book(20), 'A paragraph the old reader lost.', 'And another.', 'And a third one that it lost.', ...book(40).slice(20), whole, ...book(80).slice(40)]
  assert.equal(carrier(was, now)(40), 43)
})
