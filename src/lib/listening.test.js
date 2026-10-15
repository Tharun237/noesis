// What the "Your listening" page says (listening.js): every number a sum or a count of the record.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stretch, summary, streaks, calendar, hours, hourName, ringOf, GOAL_USUAL_MIN, goalOf, goalLabel, GOAL } from './listening.js'
import { dayKey } from './heard.js'

const now = new Date(2026, 9, 13, 21, 30) // Tuesday 13 October 2026, in the evening
const day = n => { const d = new Date(now); d.setDate(d.getDate() - n); return dayKey(d) }
const log = {
  [day(0)]: { a: 1200, b: 600 }, [day(1)]: { a: 900 }, [day(2)]: { a: 30 }, [day(3)]: { b: 2400 },
  [day(9)]: { a: 300 }, [day(40)]: { c: 3600 }, [day(400)]: { c: 7200 },
  titles: { a: 'Alpha', b: 'Beta', c: 'Gamma' },
  finished: [{ id: 'b', day: day(3) }, { id: 'c', day: day(40) }],
  hours: { 2026: Object.assign(Array(24).fill(0), { 21: 5000, 7: 1000 }), 2025: Object.assign(Array(24).fill(0), { 21: 200 }) },
}

test('a week is the last seven days, a bar a day, split by document', () => {
  const w = stretch(log, 'week', now)
  assert.equal(w.bars.length, 7)
  assert.equal(w.bars[6].key, day(0))
  assert.ok(w.bars[6].now)
  assert.equal(w.bars[6].seconds, 1800)
  assert.deepEqual(w.bars[6].docs, [['a', 1200], ['b', 600]])
  assert.deepEqual(w.bars.map(b => b.label).join(''), 'WTFSSMT')
  assert.deepEqual(w.before, [13, 12, 11, 10, 9, 8, 7].map(day))
  const s = summary(log, w.days)
  assert.equal(s.total, 1200 + 600 + 900 + 30 + 2400)
  assert.equal(s.listened, 3) // 30 seconds on a day is not a day of listening
  assert.deepEqual(s.best, { key: day(3), seconds: 2400 })
  assert.deepEqual(s.docs.map(d => [d.title, d.seconds]), [['Beta', 3000], ['Alpha', 2130]])
  assert.ok(Math.abs(s.docs[0].share + s.docs[1].share - 1) < 1e-9)
  assert.deepEqual(s.finished.map(f => f.title), ['Beta'])
  assert.equal(summary(log, w.before).total, 300) // the week before, to compare with
})

test('finished is each document once, however many times it was finished in the days', () => {
  const twice = { ...log, finished: [{ id: 'b', day: day(3) }, { id: 'b', day: day(1) }, { id: 'a', day: day(0) }, { id: 'c', day: day(40) }] }
  const s = summary(twice, stretch(twice, 'week', now).days)
  assert.deepEqual(s.finished.map(f => f.title), ['Beta', 'Alpha'])
})

test('a year is twelve calendar months; all of it starts at the first listening', () => {
  const y = stretch(log, 'year', now)
  assert.equal(y.bars.length, 12)
  assert.equal(y.bars[11].key, '2026-10')
  assert.equal(y.bars[11].label, 'O')
  assert.equal(summary(log, y.days).total, 1200 + 600 + 900 + 30 + 2400 + 300 + 3600)
  assert.equal(summary(log, y.before).total, 7200) // 400 days ago is in the twelve months before
  const all = stretch(log, 'all', now)
  assert.equal(all.before, null)
  assert.equal(all.bars[0].key, day(400).slice(0, 7))
  assert.equal(all.span, 401)
  assert.equal(summary(log, all.days).total, summary(log, y.days).total + 7200)
  // an empty record is one empty month, not a crash
  assert.equal(stretch({}, 'all', now).bars.length, 1)
  assert.equal(summary({}, stretch({}, 'week', now).days).total, 0)
})

test('streaks: the run still going, and the longest ever', () => {
  assert.deepEqual(streaks(log, now), { current: 2, longest: 2, ended: day(0) }) // day 2 had only 30 seconds
  const run = Object.fromEntries([20, 19, 18, 17, 16].map(n => [day(n), { a: 600 }]))
  assert.equal(streaks({ ...log, ...run }, now).longest, 5)
  assert.equal(streaks({ ...log, ...run }, now).ended, day(16))
  assert.equal(streaks({ [day(1)]: { a: 600 } }, now).current, 1) // today has not happened yet: yesterday's run still stands
  assert.deepEqual(streaks({}, now), { current: 0, longest: 0, ended: null })
})

test('the calendar is whole weeks ending this week; days not yet come are marked', () => {
  const cal = calendar(log, now, 4)
  assert.equal(cal.length, 4)
  assert.ok(cal.every(w => w.length === 7))
  const today = cal[3].find(c => c.key === day(0))
  assert.equal(today.seconds, 1800)
  assert.equal(cal[3].indexOf(today), 2) // Tuesday is the third row
  assert.deepEqual(cal[3].map(c => c.ahead), [false, false, false, true, true, true, true])
})

test('the hour of the day, every year together', () => {
  const h = hours(log)
  assert.equal(h.by[21], 5200)
  assert.equal(h.peak, 21)
  assert.equal(hourName(21), '9 pm')
  assert.equal(hourName(0), '12 am')
  assert.equal(hours({}).peak, null)
})

test('the ring: today against the goal, and the streak of days it closed', () => {
  // today 1800 s (30 min), yesterday 900 s (15 min), the day before 30 s, then 2400 s three days ago
  assert.deepEqual(ringOf(log, now, 20), { today: 1800, goal: 1200, share: 1, closed: true, left: 0 })
  assert.deepEqual(ringOf(log, now, 60), { today: 1800, goal: 3600, share: 0.5, closed: false, left: 1800 })
  assert.equal(ringOf({}, now, GOAL_USUAL_MIN).share, 0)
  // closed on a day = listened at least the goal that day; today not closed yet does not break the run
  assert.equal(streaks(log, now, 15 * 60).current, 2) // today and yesterday both reached 15 min
  assert.equal(streaks(log, now, 20 * 60).current, 1) // yesterday's 15 min did not reach 20
  assert.equal(streaks(log, now, 40 * 60).current, 0) // today (30 min) not closed yet, yesterday not either
})

test('the daily goal: hours, chosen freely in quarter hours, never below an hour', () => {
  assert.equal(GOAL_USUAL_MIN, 60)
  assert.equal(goalOf({ listenGoal: 20 }), 60) // the old minute goals (and an old device's) become an hour
  assert.equal(goalOf({ listenGoal: 600 }), 480)
  assert.equal(goalOf({}), 60)
  assert.equal(goalOf({ listenGoal: 150 }), 150)
  assert.deepEqual([60, 90, 135, 480].map(goalLabel), ['1h', '1h 30m', '2h 15m', '8h'])
  assert.equal(GOAL.fromPlace(0), 60)
  assert.equal(GOAL.fromPlace(1), 480)
  assert.equal(GOAL.fromPlace(GOAL.toPlace(97)), 90) // to the quarter hour
})
