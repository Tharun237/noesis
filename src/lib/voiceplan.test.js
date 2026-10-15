// How each voice is asked (voiceplan.js): learnt from the voice, kept, and given up when it stops holding.
import { test } from 'node:test'
import assert from 'node:assert/strict'
// settings are kept in the browser's storage: here, a stand-in in memory (Node has none that writes)
const kept = new Map()
globalThis.localStorage = { getItem: k => (kept.has(k) ? kept.get(k) : null), setItem: (k, v) => kept.set(k, String(v)), removeItem: k => kept.delete(k) }
const { settings } = await import('./settings.js')
const { judge, runsFor, learnRuns, runResult, runChars, gapOf, paced, tooLong, ceilingOf } = await import('./voiceplan.js')

test('a voice whose cuts match its sentences spoken alone passes; one that cut at a comma does not', () => {
  // measured on 16 October 2026: Mia cut cleanly, Alba cut in the middle of a sentence
  assert.equal(judge([2.54, 3.67, 2.61, 2.92], [2.38, 3.70, 2.97, 2.91]), true)
  assert.equal(judge([2.79, 4.04, 3.00, 3.04], [3.13, 4.35, 1.69, 3.14]), false)
  assert.equal(judge([2, 2], null), false, 'no cut at all')
})

test('the verdict is kept, looked at again after a month, and taken away after three bad runs in a row', () => {
  settings.set({ voicePlans: {} })
  const now = Date.now()
  assert.equal(runsFor('v', now), null, 'never tried')
  learnRuns('v', true, now)
  assert.equal(runsFor('v', now), true)
  assert.equal(runsFor('v', now + 31 * 86400000), null, 'a month on: tried again')
  runResult('v', false); runResult('v', true); runResult('v', false); runResult('v', false)
  assert.equal(runsFor('v'), true, 'a good run in between: no three in a row')
  runResult('v', false)
  assert.equal(runsFor('v'), false, 'three in a row: one sentence at a time')
})

test('runs are short while the listener is close behind, long when the voice is well ahead, never past what the service takes', () => {
  assert.equal(runChars(0), 160)
  assert.equal(runChars(Infinity), 700)
  assert.ok(runChars(150) > 160 && runChars(150) < 700)
  settings.set({ servicePlans: {} })
  tooLong('svc', 500)
  assert.equal(ceilingOf('svc'), 350)
  assert.equal(runChars(Infinity, ceilingOf('svc')), 350)
})

test('the pace backs off when the service says too many, follows its Retry-After, and comes back slowly', () => {
  settings.set({ servicePlans: {} })
  const start = gapOf('s2')
  const after = paced('s2', 'limited')
  assert.ok(after > start)
  assert.ok(paced('s2', 'limited', 20_000) >= 20_000, 'the service said when')
  let g = gapOf('s2')
  for (let k = 0; k < 10; k++) g = paced('s2', 'ok')
  assert.ok(g < 20_000 && g > 400, `slowly back: ${g}`)
})
