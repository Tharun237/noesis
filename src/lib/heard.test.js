// The numbers behind the listening bars (heard.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dayKey, weekOf, docListening, docBar, listenedBetween, ASLEEP_MS, mergeLogs, yearOf, yearsIn, newest } from './heard.js'

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

test('listening is the time that really passed while sound played, to the second', () => {
  // 27.4 s of sound: 27 whole seconds now, the rest carried into the next stretch
  assert.deepEqual(listenedBetween({ at: 1000, id: 'a', carry: 0 }, 28400), { seconds: 27, carry: 400 })
  assert.deepEqual(listenedBetween({ at: 28400, id: 'a', carry: 400 }, 29000), { seconds: 1, carry: 0 })
  // nothing was sounding: nothing is counted, and no fraction is kept from before
  assert.deepEqual(listenedBetween({ at: 1000, id: null, carry: 700 }, 60000), { seconds: 0, carry: 0 })
  // a slowed timer: a whole minute between two looks is still a minute of listening
  assert.equal(listenedBetween({ at: 0, id: 'a' }, 60000).seconds, 60)
  // the page was asleep, or the clock went backwards: not known, so not counted
  assert.equal(listenedBetween({ at: 0, id: 'a' }, ASLEEP_MS + 1).seconds, 0)
  assert.equal(listenedBetween({ at: 5000, id: 'a' }, 1000).seconds, 0)
})

test('listening on several devices is added together, and nothing is counted twice', () => {
  const phone = { '2026-10-13': { a: 600, b: 60 }, '2025-12-31': { a: 30 }, titles: { a: 'Alpha', b: 'Beta' }, finished: [{ id: 'a', day: '2026-10-13' }] }
  const laptop = { '2026-10-13': { a: 300 }, '2026-10-12': { c: 120 }, titles: { a: 'Alpha (renamed)', c: 'Gamma' }, finished: [{ id: 'a', day: '2026-10-13' }] }
  const all = mergeLogs([phone, laptop])
  assert.deepEqual(all['2026-10-13'], { a: 900, b: 60 })
  assert.deepEqual(all['2026-10-12'], { c: 120 })
  assert.equal(all.finished.length, 1) // the same finish, known to both, is one finish
  assert.equal(all.titles.a, 'Alpha (renamed)') // the later record names it
  assert.deepEqual(phone['2026-10-13'], { a: 600, b: 60 }) // the records themselves are untouched
  // merging what a device sent with what it already shows of ITSELF must never happen by adding: newest()
  const sentBefore = { '2026-10-13': { a: 500 }, titles: { a: 'Alpha' }, finished: [] }
  assert.deepEqual(newest(phone, sentBefore)['2026-10-13'], { a: 600, b: 60 })
})

test('a record is sent a year at a time, with only what that year needs', () => {
  const log = { '2026-10-13': { a: 600 }, '2025-12-31': { b: 30 }, titles: { a: 'Alpha', b: 'Beta', z: 'Never heard' }, finished: [{ id: 'b', day: '2025-12-31' }] }
  assert.deepEqual(yearsIn(log), ['2025', '2026'])
  assert.deepEqual(yearOf(log, '2025'), { '2025-12-31': { b: 30 }, titles: { b: 'Beta' }, finished: [{ id: 'b', day: '2025-12-31' }] })
  // the years put back together are the record
  const back = mergeLogs(yearsIn(log).map(y => yearOf(log, y)))
  assert.deepEqual(back['2026-10-13'], { a: 600 })
  assert.deepEqual(back['2025-12-31'], { b: 30 })
})
