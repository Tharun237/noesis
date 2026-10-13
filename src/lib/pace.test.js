// One unit for every length of a document shown (pace.js): the listener's own time, at the speed it is heard at.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { paceFor, atPace } from './pace.js'
import { docBar, shelfOf } from './heard.js'

test('the document in the player is heard at the player\'s speed, every other at the default', () => {
  const playing = { id: 'a', rate: 1.5 }
  const defaults = { speed: 1.25 }
  assert.equal(paceFor('a', playing, defaults), 1.5)
  assert.equal(paceFor('b', playing, defaults), 1.25)
  assert.equal(paceFor('a', { id: null, rate: 1.5 }, defaults), 1.25) // nothing in the player: the default
})

test('a speed of nothing is one, so no length is ever infinite', () => {
  assert.equal(paceFor('a', { id: 'a', rate: 0 }, { speed: 1 }), 1)
  assert.equal(paceFor('b', { id: 'a', rate: 2 }, { speed: 0 }), 1)
})

test('seconds of audio become the time they take at that speed', () => {
  assert.equal(atPace(3600, 1.5), 2400)
  assert.equal(atPace(3600, 1), 3600)
})

test('on one screen, done + left is the length shown (a document, and a shelf of them)', () => {
  const audio = 36000 // a 10 hour book at 1x
  for (const rate of [1, 1.25, 1.5, 2.5]) {
    const length = atPace(audio, rate)
    const bar = docBar({ duration: audio, share: 0.37, rate })
    assert.ok(Math.abs(bar.heardSeconds + bar.leftSeconds - length) < 1e-6, `at ${rate}x`)
  }
  const docs = [{ id: 'a', chars: 1, total: 10, pos: 5 }, { id: 'b', chars: 1, total: 10, pos: 0 }, { id: 'c', chars: 1, finished: true }]
  const speed = { a: 2, b: 1, c: 1.5 } // 'a' is the one in the player
  const shelf = shelfOf(docs, d => atPace(7200, speed[d.id]))
  assert.equal(shelf.all, 3600 + 7200 + 4800)
  assert.ok(Math.abs(shelf.heard + shelf.left - shelf.all) < 1e-6)
})
