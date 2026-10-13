// M18 floating reader: pure helpers only (no React components, no DOM).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { floatingSupported, floatingSize, baseCss, floatingLayout, captionGroups } from './floating.js'
import { T } from '../theme.js'

test('floatingSize is 420 wide on a wide screen, 190 high', () => {
  assert.deepEqual(floatingSize(1920), { width: 420, height: 190 })
  assert.deepEqual(floatingSize(461), { width: 420, height: 190 })
})

test('floatingSize narrows to the screen width minus 40', () => {
  assert.equal(floatingSize(440).width, 400)
  assert.equal(floatingSize(460).width, 420)
})

test('floatingSize never goes under 260 wide', () => {
  assert.equal(floatingSize(300).width, 260)
  assert.equal(floatingSize(100).width, 260)
  assert.equal(floatingSize(0).width, 260)
})

test('baseCss writes the page colours and font from the tokens', () => {
  const css = baseCss(T)
  assert.ok(css.includes(`html, body { margin: 0; height: 100%; background: ${T.bg}; color: ${T.text}; font-family: ${T.font}; }`))
  assert.ok(css.includes('* { box-sizing: border-box; }'))
})

test('baseCss uses the tokens it is given, not fixed values', () => {
  const css = baseCss({ bg: '#111111', text: '#EEEEEE', font: 'serif' })
  assert.match(css, /background: #111111;/)
  assert.match(css, /color: #EEEEEE;/)
  assert.match(css, /font-family: serif;/)
})

test('floatingSupported is false in Node, where there is no window', () => {
  assert.equal(floatingSupported(), false)
})

test('floatingSupported is true only when documentPictureInPicture exists', () => {
  globalThis.window = { documentPictureInPicture: {} }
  try {
    assert.equal(floatingSupported(), true)
  } finally {
    delete globalThis.window
  }
  globalThis.window = {}
  try {
    assert.equal(floatingSupported(), false)
  } finally {
    delete globalThis.window
  }
})

test('floatingLayout: everything fits the window, and the word has the most of it', () => {
  for (const [w, h] of [[420, 190], [260, 190], [300, 150], [800, 420], [1200, 300]]) {
    const L = floatingLayout(w, h)
    assert.ok(L.pad * 2 + L.stageH + L.capH + L.controls <= Math.max(h, L.pad * 2 + 36 + L.capH + L.controls), `${w}x${h} overflows`)
    assert.ok(L.word <= L.stageH, `${w}x${h}: the word is taller than its stage`)
    assert.ok(L.word > L.capFont, `${w}x${h}: the word is not the largest thing`)
  }
  assert.ok(floatingLayout(800, 420).word > floatingLayout(420, 190).word) // a larger window, a larger word
})

test('captionGroups: whole words, in order, none lost, each piece within the room', () => {
  const words = 'Fotini Markopoulou-Kalamara is responsible for changing my views on several important aspects of quantum gravity over the last several years'.split(' ')
  const groups = captionGroups(words, 60)
  assert.ok(groups.length > 1)
  assert.deepEqual(groups.flatMap(([a, b]) => words.slice(a, b)), words)
  for (const [a, b] of groups) assert.ok(words.slice(a, b).join(' ').length <= 60)
  assert.deepEqual(captionGroups(['Yes.'], 60), [[0, 1]])
  assert.deepEqual(captionGroups([], 60), [])
  assert.deepEqual(captionGroups(['Pneumonoultramicroscopicsilicovolcanoconiosis', 'is'], 10), [[0, 1], [1, 2]]) // a word longer than the room still gets its piece
})

test('captionGroups: the pieces of a long sentence are evened out, not filled to the brim', () => {
  const words = 'The ancient Greeks had a word for the moment understanding arrives all at once: noesis.'.split(' ')
  const groups = captionGroups(words, 62)
  assert.equal(groups.length, 2)
  const sizes = groups.map(([a, b]) => words.slice(a, b).join(' ').length)
  assert.ok(Math.min(...sizes) >= 30, `pieces of ${sizes}`) // was 73 and 13: "once: noesis." alone
})
