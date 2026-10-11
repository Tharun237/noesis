import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyTone } from './tone.js'

const RATE = 22050

function mix(durS = 1) {
  const n = Math.round(durS * RATE)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    out[i] = 0.4 * Math.sin((2 * Math.PI * 150 * i) / RATE) + 0.4 * Math.sin((2 * Math.PI * 5000 * i) / RATE)
  }
  return out
}

// Amplitude of one frequency via correlation against sine/cosine.
function amplitude(pcm, freq) {
  let s = 0, c = 0
  for (let i = 0; i < pcm.length; i++) {
    const ph = (2 * Math.PI * freq * i) / RATE
    s += pcm[i] * Math.sin(ph)
    c += pcm[i] * Math.cos(ph)
  }
  return (2 * Math.hypot(s, c)) / pcm.length
}

const ratio = pcm => amplitude(pcm, 5000) / amplitude(pcm, 150)

test("'natural' returns the input unchanged", () => {
  const pcm = mix(0.2)
  assert.equal(applyTone(pcm, RATE, 'natural'), pcm)
})

test("'bright' raises the 5 kHz component relative to 150 Hz and 'warm' lowers it", () => {
  const base = ratio(mix())
  const bright = ratio(applyTone(mix(), RATE, 'bright'))
  const warm = ratio(applyTone(mix(), RATE, 'warm'))
  assert.ok(bright > base * 1.2, `bright ratio ${bright} not above base ${base}`)
  assert.ok(warm < base * 0.8, `warm ratio ${warm} not below base ${base}`)
})

test('no output sample exceeds 1', () => {
  for (const tone of ['clear', 'warm', 'bright']) {
    const out = applyTone(mix(0.5), RATE, tone)
    for (let i = 0; i < out.length; i += 7) assert.ok(Math.abs(out[i]) <= 1, `${tone}[${i}] = ${out[i]}`)
  }
  const loud = new Float32Array(2205).fill(0.99)
  const out = applyTone(loud, RATE, 'bright')
  for (let i = 0; i < out.length; i++) assert.ok(Math.abs(out[i]) <= 1, `loud[${i}] = ${out[i]}`)
})
