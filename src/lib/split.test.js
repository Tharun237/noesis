// A run spoken as one, cut back into its sentences (split.js): at the voice's own pauses, or not at all.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sentenceCuts } from './split.js'

const RATE = 22050
// speech-like noise for `s` seconds, then quiet for `q` seconds; a faint floor like a neural voice's silence
function run(parts) {
  let seed = 7
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1
  const out = []
  for (const [s, q] of parts) {
    for (let i = 0; i < s * RATE; i++) out.push(0.3 * rnd())
    for (let i = 0; i < q * RATE; i++) out.push(0.0002 * rnd())
  }
  return Float32Array.from(out)
}
const near = (got, sec, what) => assert.ok(Math.abs(got / RATE - sec) < 0.06, `${what}: cut at ${(got / RATE).toFixed(2)} s, wanted about ${sec} s`)

test('three sentences: cut in the two long pauses, not at the comma', () => {
  // sentence 1 (2 s, with a comma pause of 0.15 s inside) · pause 0.4 · sentence 2 (1.5 s) · pause 0.35 · sentence 3 (1 s)
  const pcm = run([[1, 0.15], [1, 0.4], [1.5, 0.35], [1, 0.05]])
  const cuts = sentenceCuts(pcm, RATE, [40, 30, 20])
  assert.ok(cuts, 'cut')
  assert.equal(cuts.length, 4)
  assert.equal(cuts[0], 0)
  assert.equal(cuts[3], pcm.length)
  near(cuts[1], 2.15 + 0.4 - 0.04, 'first cut keeps the pause with the sentence it ends, 40 ms for the next')
  near(cuts[2], 2.55 + 1.5 + 0.35 - 0.04, 'second cut')
})

test('no pause where a sentence should end: not cut (made one by one instead)', () => {
  const pcm = run([[4, 0.05]]) // one long breathless stretch
  assert.equal(sentenceCuts(pcm, RATE, [30, 30]), null)
})

test('a piece far longer or shorter than its text: not trusted', () => {
  // the only pause is at 10% of the speech, the text says 50%
  const pcm = run([[0.4, 0.4], [3.6, 0.05]])
  assert.equal(sentenceCuts(pcm, RATE, [30, 30]), null)
})

test('one sentence is its whole run', () => {
  const pcm = run([[1, 0.1]])
  assert.deepEqual(sentenceCuts(pcm, RATE, [12]), [0, pcm.length])
})
