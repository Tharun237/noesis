import { test } from 'node:test'
import assert from 'node:assert/strict'
import { indexLines, locate, rects, locatePage, sentenceAt, partOf } from './locate.js'

const line = (text, x = 0.1, y = 0.2, w = 0.8, h = 0.05) => ({ text, x, y, w, h })
const approx = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} !== ${b}`)

test('exact match on one line gives one rect covering the right character share', () => {
  const lines = [line('The quick brown fox jumps.')]
  const index = indexLines(lines)
  const r = locate(index, 'quick brown fox')
  assert.ok(r)
  const rs = rects(index, lines, r.start, r.end)
  assert.equal(rs.length, 1)
  // 'quick brown fox' runs from original offset 4 ('q') to 18 ('x'); text length 26.
  approx(rs[0].x, 0.1 + 0.8 * (4 / 26), 'x')
  approx(rs[0].w, 0.8 * (15 / 26), 'w')
  assert.equal(rs[0].y, 0.2)
  assert.equal(rs[0].h, 0.05)
})

test('a sentence across two lines with a hyphenated break gives two rects', () => {
  const lines = [line('Read the exam-', 0.1, 0.1, 0.8, 0.05), line('ple shows the result', 0.1, 0.2, 0.8, 0.05)]
  const index = indexLines(lines)
  const r = locate(index, 'Read the example shows the result')
  assert.ok(r)
  const rs = rects(index, lines, r.start, r.end)
  assert.equal(rs.length, 2)
  assert.ok(rs[0].y < rs[1].y)
})

test('the same phrase twice on a page with `from` picks the second', () => {
  const lines = [line('The cat sat. The cat sat.')]
  const index = indexLines(lines)
  const first = locate(index, 'the cat sat')
  assert.ok(first)
  assert.equal(first.start, 0)
  const second = locate(index, 'the cat sat', first.end)
  assert.ok(second)
  assert.ok(second.start > first.start)
  // Wrapping: past the end falls back to the first occurrence.
  const wrapped = locate(index, 'the cat sat', index.norm.length + 10)
  assert.deepEqual(wrapped, first)
})

test('a sentence whose middle differs is found by anchors with a sane end', () => {
  const lines = [line('The analysts noted that the value grew by 3.5 percent last year.')]
  const index = indexLines(lines)
  const spoken = 'The analysts noted that the value grew by three point five percent last year.'
  const r = locate(index, spoken)
  assert.ok(r, 'anchors should find the sentence')
  const sLen = spoken.toLowerCase().replace(/[^a-z0-9]/g, '').length
  assert.ok(r.end - r.start <= sLen * 1.6, `span ${r.end - r.start} within 1.6x spoken ${sLen}`)
  assert.ok(r.end <= index.norm.length)
})

test('a sentence not on the page returns null, as does a too-short one', () => {
  const lines = [line('The quick brown fox jumps.')]
  const index = indexLines(lines)
  assert.equal(locate(index, 'zebras dancing at midnight'), null)
  assert.equal(locate(index, 'a b'), null)
})

test('locatePage skips a missing sentence and still finds the next', () => {
  const lines = [line('The quick brown fox jumps.', 0.1, 0.1, 0.8, 0.05), line('Over the lazy dog it leapt.', 0.1, 0.3, 0.8, 0.05)]
  const out = locatePage(lines, [
    { i: 7, t: 'zebras dancing at midnight' },
    { i: 8, t: 'quick brown fox' },
    { i: 9, t: 'lazy dog' },
  ])
  assert.deepEqual(out.map(e => e.i), [8, 9])
  assert.ok(out[0].rects.length >= 1 && out[1].rects.length >= 1)
})

test('locatePage advances `from` so repeated sentences land in order', () => {
  const lines = [line('Red fish. Blue fish. Red fish. Blue fish.')]
  const out = locatePage(lines, [
    { i: 0, t: 'red fish' },
    { i: 1, t: 'blue fish' },
    { i: 2, t: 'red fish' },
  ])
  assert.deepEqual(out.map(e => e.i), [0, 1, 2])
  assert.ok(out[0].rects[0].x < out[2].rects[0].x, 'second "red fish" is further right')
})

test('sentenceAt finds the rect under the point and the nearest from the margin', () => {
  const lines = [line('The quick brown fox jumps.', 0.1, 0.1, 0.8, 0.05), line('Over the lazy dog it leapt.', 0.1, 0.5, 0.8, 0.05)]
  const located = locatePage(lines, [
    { i: 3, t: 'quick brown fox' },
    { i: 4, t: 'lazy dog' },
  ])
  assert.equal(located.length, 2)
  const r0 = located[0].rects[0]
  // Inside the first rect.
  assert.equal(sentenceAt(located, r0.x + r0.w / 2, r0.y + r0.h / 2), 3)
  // In the left margin beside it: no rect contains the point, nearest wins.
  assert.equal(sentenceAt(located, 0.01, r0.y + r0.h / 2), 3)
  // Empty page: null.
  assert.equal(sentenceAt([], 0.5, 0.5), null)
})

test('partOf cuts a share of a marked sentence, across a line end when it has to', () => {
  const rects = [{ x: 0.1, y: 0.2, w: 0.6, h: 0.02 }, { x: 0.1, y: 0.23, w: 0.2, h: 0.02 }]
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} is not ${b}`)
  const first = partOf(rects, 0, 0.25)
  assert.equal(first.length, 1); near(first[0].x, 0.1); near(first[0].w, 0.2)
  const across = partOf(rects, 0.5, 1)
  assert.equal(across.length, 2); near(across[0].x, 0.5); near(across[0].w, 0.2); near(across[1].x, 0.1); near(across[1].w, 0.2)
  assert.deepEqual(partOf([], 0, 1), [])
})
