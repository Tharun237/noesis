import test from 'node:test'
import assert from 'node:assert/strict'
import { SPEED_MIN, SPEED_MAX, SPEED_STEP, SPEED_USUAL, speedToPlace, placeToSpeed, speedLabel } from './speed.js'

test('the ends of the slider are the slowest and the fastest', () => {
  assert.equal(placeToSpeed(0), SPEED_MIN)
  assert.equal(placeToSpeed(1), SPEED_MAX)
  assert.equal(placeToSpeed(-3), SPEED_MIN)
  assert.equal(placeToSpeed(7), SPEED_MAX)
})

test('every speed a step apart can be reached, and comes back as itself', () => {
  for (let s = SPEED_MIN; s <= SPEED_MAX + 1e-9; s += SPEED_STEP) {
    const speed = Math.round(s * 100) / 100
    assert.equal(placeToSpeed(speedToPlace(speed)), speed, `${speed}x`)
  }
})

test('the speeds people use have room: 1x is well in from the left, and a step near it is not a hair', () => {
  assert.ok(speedToPlace(1) > 0.35 && speedToPlace(1) < 0.45)
  assert.ok(speedToPlace(1) - speedToPlace(0.95) > 0.02) // 7 px of a 340 px slider
  assert.ok(speedToPlace(SPEED_USUAL) < speedToPlace(1))
})

test('the speed is said without noise', () => {
  assert.equal(speedLabel(0.9), '0.9x')
  assert.equal(speedLabel(1), '1x')
  assert.equal(speedLabel(1.25), '1.25x')
  assert.equal(speedLabel(1.2000000000000002), '1.2x')
})
