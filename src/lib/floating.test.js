// M18 floating reader: pure helpers only (no React components, no DOM).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { floatingSupported, floatingSize, baseCss } from './floating.js'
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
