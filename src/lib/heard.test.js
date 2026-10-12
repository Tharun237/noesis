// The numbers behind the listening bars (heard.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dayKey, weekOf, docListening, docBar } from './heard.js'

const now = new Date(2026, 9, 12, 15) // Monday 12 October 2026
const day = n => dayKey(new Date(2026, 9, 12 - n))

test('the week is seven days, oldest first, today last, each split by document', () => {
  const log = { [day(0)]: { a: 600, b: 1200 }, [day(2)]: { a: 300 }, [day(9)]: { a: 9999 }, titles: {}, finished: [] }
  const week = weekOf(log, now)
  assert.equal(week.length, 7)
  assert.deepEqual(week.map(d => d.letter).join(''), 'TWTFSSM')
  assert.equal(week[6].today, true)
  assert.equal(week[6].seconds, 1800)
  assert.deepEqual(week[6].docs[0], ['b', 1200]) // most listened first
  assert.equal(week[4].seconds, 300)
  assert.equal(week.reduce((a, d) => a + d.seconds, 0), 2100) // nine days ago is not this week
})

test('a pace is the usual amount on a day of listening; a few seconds is not a day', () => {
  const log = { [day(0)]: { a: 1200 }, [day(1)]: { a: 20 }, [day(3)]: { a: 2400 } }
  const l = docListening(log, 'a', now)
  assert.equal(l.today, 1200)
  assert.equal(l.perDay, 1800)
  assert.equal(docListening(log, 'nobody', now).perDay, 0)
})

test('a bar: heard, today as its last stretch, left, and the days it takes at that pace', () => {
  // a 10 hour book, 25% through, at 1.25x; 30 minutes listened today, 30 minutes on a usual day
  const bar = docBar({ duration: 36000, share: 0.25, rate: 1.25 }, { today: 1800, perDay: 1800 })
  assert.equal(bar.heard, 0.25)
  assert.equal(bar.today, 1800 * 1.25 / 36000) // half an hour of listening at 1.25x covers 37.5 minutes of the book
  assert.equal(bar.leftSeconds, 27000)
  assert.equal(bar.days, 12) // 7.5 h of audio is 6 h of listening at 1.25x: twelve half hours
  assert.ok(Math.abs(bar.dayShare - 0.0625) < 1e-9)
})

test('nothing is promised without a pace, or when it is too far off', () => {
  assert.equal(docBar({ duration: 36000, share: 0.1 }, { today: 0, perDay: 0 }).days, null)
  assert.equal(docBar({ duration: 360000, share: 0 }, { today: 60, perDay: 60 }).days, null)
  assert.equal(docBar({ duration: 600, share: 1 }, { today: 600, perDay: 600 }).days, null) // finished
  assert.equal(docBar({ duration: 600, share: 0.2 }, { today: 99999, perDay: 600 }).today, 0.2) // today never exceeds heard
})
