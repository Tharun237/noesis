import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ambient, beatFrequencies, brownNoise, gainFor } from './ambient.js'

const RATE = 44100
const ms = a => a.reduce((s, v) => s + v * v, 0) / a.length
const firstDifference = a => Float32Array.from({ length: a.length - 1 }, (_, i) => a[i + 1] - a[i])

test('focus and calm are binaural pairs; off, brown and unknown modes have no beat', () => {
  assert.deepEqual(beatFrequencies('focus'), { left: 200, right: 214 })
  assert.deepEqual(beatFrequencies('calm'), { left: 200, right: 208 })
  assert.equal(beatFrequencies('off'), null)
  assert.equal(beatFrequencies('brown'), null)
  assert.equal(beatFrequencies('toString'), null)
})

test('brown noise has the requested length, stays in [-1, 1] and reaches the peak', () => {
  const x = brownNoise(RATE, 7)
  assert.ok(x instanceof Float32Array)
  assert.equal(x.length, RATE)
  let peak = 0
  for (const v of x) {
    assert.ok(v >= -1 && v <= 1, `sample ${v} out of range`)
    peak = Math.max(peak, Math.abs(v))
  }
  assert.equal(peak, 1)
})

test('brown noise is deterministic for a seed and differs between seeds', () => {
  assert.deepEqual(brownNoise(4096, 7), brownNoise(4096, 7))
  assert.notDeepEqual(brownNoise(4096, 7), brownNoise(4096, 99))
})

test('brown noise carries far more energy at low frequencies than white noise (ratio ~25 here; white is ~0.5)', () => {
  const x = brownNoise(RATE * 4, 7)
  // A signal dominated by slow movement has a much smaller first difference than its own level.
  const ratio = ms(x) / ms(firstDifference(x))
  assert.ok(ratio > 10, `low/high energy ratio ${ratio} too small for brown noise`)
})

test('the 4 s loop joins without a step larger than the buffer already contains', () => {
  const x = brownNoise(RATE * 4, 7)
  const d = firstDifference(x)
  const maxStep = d.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
  const seam = Math.abs(x[0] - x[x.length - 1])
  assert.ok(seam <= maxStep, `loop seam ${seam} is a click (largest ordinary step ${maxStep})`)
})

test('gainFor is silent at 0, at most 0.25 at 1, monotonic, and silent for junk input', () => {
  assert.equal(gainFor(0), 0)
  assert.equal(gainFor(1), 0.25)
  assert.equal(gainFor(2), 0.25)
  assert.equal(gainFor(-1), 0)
  assert.equal(gainFor(NaN), 0)
  let prev = -1
  for (let v = 0; v <= 1.0001; v += 0.05) {
    const g = gainFor(v)
    assert.ok(g >= prev, `gain fell at volume ${v}`)
    assert.ok(g <= 0.25)
    prev = g
  }
})

test('ambient rejects an unknown mode and does nothing without an audio context (Node has none)', () => {
  assert.throws(() => ambient.set({ mode: 'drone' }), /unknown mode "drone"/)
  assert.doesNotThrow(() => ambient.set({ volume: 0.4 }))
  assert.doesNotThrow(() => ambient.playing(false))
  assert.doesNotThrow(() => ambient.playing(true))
})
