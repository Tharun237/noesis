// Pure parts of the listening log (src/lib/history.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'

// history.js statically imports the player store, which touches browser-only
// globals at load time. Stub the ones it reads while loading; this file runs in
// its own process, so nothing leaks into other tests. (Static imports above load
// first; the history module itself is loaded dynamically below, after the stubs.)
if (typeof globalThis.document === 'undefined') {
  globalThis.document = { addEventListener: () => {}, visibilityState: 'visible' }
}
if (typeof globalThis.addEventListener === 'undefined') {
  globalThis.addEventListener = () => {}
}
if (typeof globalThis.navigator === 'undefined') {
  globalThis.navigator = {}
}
if (typeof globalThis.location === 'undefined') {
  globalThis.location = { href: '' }
}
if (typeof globalThis.history === 'undefined') {
  globalThis.history = { state: {}, replaceState: () => {}, pushState: () => {} }
}
if (typeof globalThis.matchMedia === 'undefined') {
  globalThis.matchMedia = () => ({ matches: false })
}
if (typeof globalThis.Audio === 'undefined') {
  globalThis.Audio = class {
    constructor() { this.paused = true }
    addEventListener() {}
  }
}

const { dayKey, addSeconds, markFinished, summarise, retrospectivePrompt, emptyLog } = await import('./history.js')

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h)

test('dayKey gives the local date as YYYY-MM-DD', () => {
  assert.equal(dayKey(at(2026, 10, 11)), '2026-10-11')
  assert.equal(dayKey(at(2026, 1, 5)), '2026-01-05')
})

test('seconds land on the right day and document, with the title kept', () => {
  let log = emptyLog()
  log = addSeconds(log, '2026-10-11', 'a', 5, 'Alpha')
  log = addSeconds(log, '2026-10-11', 'a', 5, 'Alpha')
  log = addSeconds(log, '2026-10-10', 'b', 5, 'Beta')
  assert.equal(log['2026-10-11'].a, 10)
  assert.equal(log['2026-10-10'].b, 5)
  assert.equal(log['2026-10-11'].b, undefined)
  assert.equal(log.titles.a, 'Alpha')
  assert.equal(log.titles.b, 'Beta')
})

test('addSeconds returns a new log and leaves the input alone', () => {
  const before = emptyLog()
  const after = addSeconds(before, '2026-10-11', 'a', 5, 'Alpha')
  assert.equal(before['2026-10-11'], undefined)
  assert.equal(after['2026-10-11'].a, 5)
})

test('markFinished records once per document per day', () => {
  let log = emptyLog()
  log = markFinished(log, '2026-10-11', 'a')
  log = markFinished(log, '2026-10-11', 'a')
  log = markFinished(log, '2026-10-10', 'a')
  assert.equal(log.finished.length, 2)
  assert.deepEqual(log.finished, [{ id: 'a', day: '2026-10-11' }, { id: 'a', day: '2026-10-10' }])
})

test('week is the last 7 calendar days including today; month is the calendar month', () => {
  const now = at(2026, 10, 11)
  let log = emptyLog()
  log = addSeconds(log, '2026-10-11', 'a', 100, 'Alpha')
  log = addSeconds(log, '2026-10-05', 'a', 100, 'Alpha') // 6 days back: in the week
  log = addSeconds(log, '2026-10-04', 'a', 100, 'Alpha') // 7 days back: outside the week
  log = addSeconds(log, '2026-09-30', 'a', 100, 'Alpha') // last month
  const s = summarise(log, now)
  assert.equal(s.today, 100)
  assert.equal(s.week, 200)
  assert.equal(s.month, 300)
  assert.equal(s.total, 400)
})

test('streak counts back from today and stops at the first day under 60 s', () => {
  const now = at(2026, 10, 11)
  let log = emptyLog()
  log = addSeconds(log, '2026-10-11', 'a', 60, 'Alpha')
  log = addSeconds(log, '2026-10-10', 'a', 120, 'Alpha')
  log = addSeconds(log, '2026-10-09', 'a', 60, 'Alpha')
  log = addSeconds(log, '2026-10-08', 'a', 30, 'Alpha')
  log = addSeconds(log, '2026-10-07', 'a', 600, 'Alpha')
  assert.equal(summarise(log, now).streak, 3)
})

test('streak counts from yesterday when today has under 60 s', () => {
  const now = at(2026, 10, 11)
  let log = emptyLog()
  log = addSeconds(log, '2026-10-11', 'a', 30, 'Alpha')
  log = addSeconds(log, '2026-10-10', 'a', 60, 'Alpha')
  log = addSeconds(log, '2026-10-09', 'a', 60, 'Alpha')
  assert.equal(summarise(log, now).streak, 2)
  const thin = addSeconds(emptyLog(), '2026-10-11', 'a', 30, 'Alpha')
  assert.equal(summarise(thin, now).streak, 0)
})

test('top five this month are in order; finished counts this month; since is the first day', () => {
  const now = at(2026, 10, 11)
  let log = emptyLog()
  const secs = { a: 600, b: 500, c: 400, d: 300, e: 200, f: 100 }
  for (const [id, s] of Object.entries(secs)) log = addSeconds(log, '2026-10-11', id, s, 'Doc ' + id.toUpperCase())
  log = addSeconds(log, '2026-09-01', 'z', 9999, 'Old')
  log = markFinished(log, '2026-10-11', 'a')
  log = markFinished(log, '2026-10-05', 'b')
  log = markFinished(log, '2026-09-20', 'c')
  const s = summarise(log, now)
  assert.deepEqual(s.top.map(t => t.id), ['a', 'b', 'c', 'd', 'e'])
  assert.equal(s.top[0].title, 'Doc A')
  assert.equal(s.top[0].seconds, 600)
  assert.equal(s.finishedThisMonth, 2)
  assert.equal(s.since, '2026-09-01')
})

test('an empty log gives zeros and since null', () => {
  const s = summarise(emptyLog(), at(2026, 10, 11))
  assert.deepEqual(s, { today: 0, week: 0, month: 0, total: 0, finishedThisMonth: 0, streak: 0, top: [], since: null })
})

test('retrospectivePrompt carries the numbers and every title, and asks for plain prose', () => {
  const summary = {
    today: 123, week: 456, month: 789, total: 1011, finishedThisMonth: 2, streak: 3,
    top: [{ id: 'a', title: 'Alpha', seconds: 600 }, { id: 'b', title: 'Beta', seconds: 300 }],
  }
  const p = retrospectivePrompt(summary, 'October 2026')
  for (const n of ['123', '456', '789', '1011', '2', '3']) assert.ok(p.includes(n), `missing number ${n}`)
  for (const t of ['Alpha', 'Beta']) assert.ok(p.includes(t), `missing title ${t}`)
  assert.match(p, /150 words/)
  assert.match(p, /no lists/i)
  assert.match(p, /English/)
})
