import { test } from 'node:test'
import assert from 'node:assert/strict'
import { padTail, trailingSeconds } from './pause.js'

const RATE = 22050

function toneWithTail(toneMs, tailMs, freq = 440) {
  const toneN = Math.round((toneMs * RATE) / 1000)
  const tailN = Math.round((tailMs * RATE) / 1000)
  const out = new Float32Array(toneN + tailN)
  for (let i = 0; i < toneN; i++) out[i] = 0.5 * Math.sin((2 * Math.PI * freq * i) / RATE)
  return out
}

test('tone with 50 ms trailing silence padded to 260 ms ends with 260 ms of silence', () => {
  const pcm = toneWithTail(500, 50)
  const out = padTail(pcm, RATE, 260)
  const tail = trailingSeconds(out, RATE) * 1000
  assert.ok(Math.abs(tail - 260) <= 5, `tail ${tail} ms, expected 260 ± 5 ms`)
})

test('one that already has 400 ms is returned unchanged', () => {
  const pcm = toneWithTail(500, 400)
  const out = padTail(pcm, RATE, 260)
  assert.equal(out, pcm)
})

test('an all-silent input is returned unchanged', () => {
  const pcm = new Float32Array(2205)
  assert.equal(padTail(pcm, RATE, 260), pcm)
})
