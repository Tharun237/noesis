// The readiness gate's math, checked against a step-by-step simulation of generating while playing.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { waitSeconds as wait } from './readiness-math.js'

// Wait w seconds, then play: does playback ever catch up with generation?
function stalls(ahead, rest, r, w) {
  let gen = ahead + Math.min(rest, r * w), left = rest - Math.min(rest, r * w), played = 0
  for (let t = 0; left > 0 || played < gen; t += 0.5) {
    const g = Math.min(left, r * 0.5); gen += g; left -= g
    played += 0.5
    if (played > gen + 1e-9 && left > 0) return true
    if (left <= 0) break
  }
  return false
}

test('desktop faster than real time starts almost immediately', () => assert.ok(wait(5, 25200, 1.06) < 5))
test('phone at 0.25x, 1-hour book: about 3 hours to prepare', () => assert.ok(Math.abs(wait(0, 3600, 0.25) / 3600 - 3) < 0.05))
for (const [ahead, rest, r] of [[0, 3600, 0.25], [120, 1800, 0.5], [30, 600, 0.9], [0, 300, 1.2]]) {
  test(`waiting the computed time never stalls (ahead ${ahead}s, rest ${rest}s, ${r}x)`, () => {
    const w = wait(ahead, rest, r)
    assert.equal(stalls(ahead, rest, r, w), false)
    if (r < 1) assert.equal(stalls(ahead, rest, r, w * 0.8), true, 'waiting less than computed should stall')
  })
}
