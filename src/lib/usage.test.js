// What Settings says about the NVIDIA key (usage.js): every number a count of what happened on this device.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { countUse, useOver, nvidiaUse } from './usage.js'

const at = (day, h, m) => new Date(2026, 9, day, h, m).getTime() // October 2026

test('sentences, slow-downs and the busiest minute are counted, a day at a time', () => {
  nvidiaUse.set({ days: {} })
  for (let k = 0; k < 5; k++) countUse('voice', 'made', { now: at(16, 9, 0) })       // five in one minute
  for (let k = 0; k < 3; k++) countUse('voice', 'made', { now: at(16, 9, 1) })       // three in the next
  countUse('voice', 'limited', { waited: 4000, now: at(16, 9, 1) })
  countUse('voice', 'limited', { waited: 8000, now: at(16, 9, 2) })
  countUse('voice', 'said', { n: 20, now: at(16, 9, 2) })                       // the sentences those requests carried
  countUse('voice', 'failed', { now: at(16, 9, 3) })
  countUse('text', 'made', { now: at(15, 20, 0) })                                   // yesterday
  const week = useOver(nvidiaUse.get().days, 7, at(16, 23, 0))
  assert.deepEqual(week.voice, { made: 8, said: 20, limited: 2, failed: 1, waitedMs: 12000, peak: 5 })
  assert.equal(week.text.made, 1)
  assert.equal(week.days, 2)
  assert.equal(useOver(nvidiaUse.get().days, 1, at(16, 23, 0)).text.made, 0, 'today only: yesterday is not in it')
})

test('two weeks are kept, older days are let go', () => {
  nvidiaUse.set({ days: {} })
  for (let d = 1; d <= 20; d++) countUse('voice', 'made', { now: at(d, 12, 0) })
  const days = Object.keys(nvidiaUse.get().days).sort()
  assert.equal(days.length, 14)
  assert.equal(days[0], '2026-10-07')
  assert.equal(days.at(-1), '2026-10-20')
})
