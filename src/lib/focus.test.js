// M15 Focus helpers: pivot, delays, emphasis, splitting, spoken-word index.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { pivot, wordDelay, emphatic, splitWords, wordIndexAt } from './focus.js'
import { wordWeights } from './words.js'

test('pivot marks short and long words', () => {
  assert.equal(pivot('a'), 0)
  assert.equal(pivot('ab'), 1)
  assert.equal(pivot('Hello'), 1)
  assert.equal(pivot('abcdef'), 2) // 6 letters
  assert.equal(pivot('abcdefghi'), 2) // 9 letters
  assert.equal(pivot('abcdefghij'), 3) // 10 letters
  assert.equal(pivot('abcdefghijklmn'), 4) // 14 letters
})

test('pivot skips a leading bracket and returns the original index', () => {
  assert.equal(pivot('(Hello'), 2) // H at 1, pivot e at 2
})

test('pivot does not count combining marks as letters', () => {
  // KA + vowel sign II: one real letter, so the pivot is index 0.
  assert.equal(pivot('కీ'), 0)
})

test('delays at 300 wpm', () => {
  assert.equal(wordDelay('cat', 300), 200)
  assert.equal(wordDelay('extraordinary', 300), 200 * 1.3)
  assert.equal(wordDelay('word,', 300), 200 * 1.5)
  assert.equal(wordDelay('word.', 300), 200 * 2.2)
  assert.equal(wordDelay('word!"', 300), 200 * 2.2)
})

test('emphatic cases', () => {
  assert.equal(emphatic('HELLO'), true)
  assert.equal(emphatic('HELLO,'), true)
  assert.equal(emphatic('Hello'), false)
  assert.equal(emphatic('I'), false)
  assert.equal(emphatic('Hello!'), true)
  assert.equal(emphatic('word?'), true)
  assert.equal(emphatic('word'), false)
})

test('splitWords splits on whitespace and is never empty', () => {
  assert.deepEqual(splitWords('a  b\nc'), ['a', 'b', 'c'])
  assert.deepEqual(splitWords(''), [])
  assert.deepEqual(splitWords('   '), [])
  assert.deepEqual(splitWords('  hello  '), ['hello'])
})

test('wordIndexAt follows cumulative ends like the reader', () => {
  const w = wordWeights('a bb ccc')
  assert.equal(wordIndexAt(w, 0), 0)
  assert.equal(wordIndexAt(w, 1), 2)
  assert.equal(wordIndexAt(w, w.ends[0]), 0)
  assert.equal(wordIndexAt(w, w.ends[0] + 0.01), 1)
  assert.equal(wordIndexAt(w, 2), 2)
  assert.equal(wordIndexAt({ ends: [] }, 0.5), 0)
})
