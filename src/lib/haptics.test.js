import { test } from 'node:test'
import assert from 'node:assert/strict'
import { haptic, hapticsSupported, pulseFor } from './haptics.js'

// Node has no Vibration API, so each test installs the navigator it needs and puts the real one back.
function withNavigator(stub, fn) {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'navigator', { value: stub, configurable: true, writable: true })
  try {
    fn()
  } finally {
    if (saved) Object.defineProperty(globalThis, 'navigator', saved)
    else delete globalThis.navigator
  }
}

test('a heading pulses long-short-long, even when it is also the last item of a paragraph', () => {
  assert.deepEqual(pulseFor({ kind: 'h', text: 'Chapter two', last: true }), [30, 40, 30])
})

test('a sentence ending in ! or ? gets the double pulse, ignoring trailing spaces', () => {
  assert.deepEqual(pulseFor({ kind: 'p', text: 'Stop!', last: false }), [20, 30, 20])
  assert.deepEqual(pulseFor({ kind: 'p', text: 'Why? ', last: true }), [20, 30, 20])
})

test('the last sentence of a paragraph gets a single 18 ms pulse', () => {
  assert.deepEqual(pulseFor({ kind: 'p', text: 'The tide turned.', last: true }), [18])
})

test('any other sentence gets a short 8 ms pulse', () => {
  assert.deepEqual(pulseFor({ kind: 'p', text: 'The tide turned.', last: false }), [8])
})

test('no vibration API means haptics are unsupported and haptic() is a silent no-op', () => {
  withNavigator({}, () => {
    assert.equal(hapticsSupported(), false)
    assert.doesNotThrow(() => haptic([8]))
  })
})

test('with a vibrate function, haptic() passes the pattern through', () => {
  const calls = []
  withNavigator({ vibrate: pattern => { calls.push(pattern); return true } }, () => {
    assert.equal(hapticsSupported(), true)
    haptic([30, 40, 30])
  })
  assert.deepEqual(calls, [[30, 40, 30]])
})

test('a refused vibration never throws out of haptic()', () => {
  withNavigator({ vibrate: () => { throw new Error('blocked by permissions policy') } }, () => {
    assert.doesNotThrow(() => haptic([18]))
  })
})
