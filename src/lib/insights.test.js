import { test } from 'node:test'
import assert from 'node:assert/strict'
import { POSITIVE, NEGATIVE, tone, arc, splitSections, hardWords } from './insights.js'

test('POSITIVE and NEGATIVE are about 120 lower-case words each, with no word in both', () => {
  for (const set of [POSITIVE, NEGATIVE]) {
    assert.ok(set.size >= 100 && set.size <= 140, `size ${set.size}`)
    for (const w of set) assert.equal(w, w.toLowerCase())
  }
  for (const w of POSITIVE) assert.equal(NEGATIVE.has(w), false, `${w} is in both sets`)
})

test('tone: a clearly positive sentence is 1', () => {
  assert.equal(tone('The children filled the park with joy, hope and love, and laughter echoed everywhere.'), 1)
})

test('tone: a clearly negative sentence is -1', () => {
  assert.equal(tone('The war brought fear, death and loss to every village, and the pain lasted for years.'), -1)
})

test('tone: a neutral sentence is 0', () => {
  assert.equal(tone('The train left the station at nine and reached the platform on time.'), 0)
})

test('tone: not, no and never flip the word right after them', () => {
  assert.equal(tone('It was not good.'), -1)
  assert.equal(tone('There was no fear.'), 1)
  assert.equal(tone('They never lost hope.'), 1)
})

test('splitSections: headings start sections and text before the first heading is "Beginning"', () => {
  const blocks = [
    { k: 'p', s: ['Intro one.', 'Intro two.'] },
    { k: 'h', s: ['Chapter One'] },
    { k: 'p', s: ['a', 'b'] },
    { k: 'h', s: ['Chapter Two'] },
    { k: 'p', s: ['c'] },
  ]
  const got = splitSections(blocks, [0, 2, 3, 5, 6])
  assert.deepEqual(got.map(s => [s.title, s.start]), [['Beginning', 0], ['Chapter One', 2], ['Chapter Two', 5]])
  assert.equal(got[0].text, 'Intro one. Intro two.')
  assert.equal(got[2].text, 'Chapter Two c')
})

test('splitSections: a document with no headings is cut into parts of about 60 sentences', () => {
  const blocks = Array.from({ length: 13 }, () => ({ k: 'p', s: Array.from({ length: 10 }, () => 'A sentence.') }))
  const starts = blocks.map((_, b) => b * 10)
  const got = splitSections(blocks, starts)
  assert.deepEqual(got.map(s => [s.title, s.start]), [['Part 1', 0], ['Part 2', 60], ['Part 3', 120]])
})

test('arc skips sections under 40 words and keeps the rest with their tone', () => {
  const sections = [
    { title: 'Short', start: 0, text: 'joy joy joy' },
    { title: 'Just under', start: 3, text: 'joy '.repeat(39).trim() },
    { title: 'Long', start: 9, text: 'joy '.repeat(40).trim() },
  ]
  assert.deepEqual(arc(sections), [{ title: 'Long', start: 9, tone: 1, words: 40 }])
})

test('hardWords ignores names and ranks a long repeated word above a long word used once', () => {
  const text = 'Christopherson arrived early. The extraordinary harvest was extraordinary. '
    + 'Later, Christopherson spoke about the extraordinary season and an incomprehensible plan. Christopherson smiled.'
  const got = hardWords(text)
  assert.deepEqual(got.map(w => w.word), ['extraordinary', 'incomprehensible'])
  assert.deepEqual(got[0], { word: 'extraordinary', count: 3 })
})

test('hardWords keeps only words of 9+ letters and honours max', () => {
  const text = 'The village harvest was plenty. Gardeners celebrated every extraordinary morning.'
  assert.deepEqual(hardWords(text).map(w => w.word), ['extraordinary', 'celebrated', 'gardeners'])
  assert.equal(hardWords(text, { max: 1 }).length, 1)
})
