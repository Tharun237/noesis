// What the listening record says, worked out for the "Your listening" page. Pure: a record and a date in,
// numbers out. The record is history.js's ({ 'YYYY-MM-DD': { docId: seconds }, titles, finished, hours }),
// already all of the customer's devices added together. Nothing here is estimated: every number is a sum or a
// count of what was recorded.
import { dayKey } from './heard.js'

const isDay = k => /^\d{4}-\d{2}-\d{2}$/.test(k)
const back = (now, days) => { const d = new Date(now); d.setDate(d.getDate() - days); return d }
const dateOf = key => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d) }
const sum = m => { let s = 0; for (const v of Object.values(m || {})) s += v || 0; return s }
const A_DAY_OF_LISTENING_S = 60 // less than a minute on a day is not a day of listening (the streak's rule)
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

export const KINDS = [{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }, { value: 'all', label: 'All' }]
const WEEK = 7, MONTH = 30, YEAR_MONTHS = 12

const firstDay = log => { let first = null; for (const k of Object.keys(log || {})) if (isDay(k) && sum(log[k]) > 0 && (!first || k < first)) first = k; return first }
const daysBack = (now, from, to) => Array.from({ length: to - from }, (_, i) => dayKey(back(now, to - 1 - i))) // oldest first
const monthsBack = (now, n) => Array.from({ length: n }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })

// One bar of the chart: a day, or a month. → its seconds, split by document (most listened first).
function bar(log, days, extra) {
  const per = new Map()
  for (const k of days) for (const [id, s] of Object.entries(log?.[k] || {})) if (s > 0) per.set(id, (per.get(id) || 0) + s)
  const docs = [...per.entries()].sort((a, b) => b[1] - a[1])
  return { ...extra, days, seconds: docs.reduce((a, [, s]) => a + s, 0), docs }
}

// A stretch of time as the page shows it.
//   kind: 'week' (the last 7 days) · 'month' (the last 30) · 'year' (the last 12 calendar months) · 'all'
// → bars (oldest first; each { key, label, name, days, seconds, docs, now }), the days it covers and the days
//   of the stretch before it (null for 'all': there is nothing before everything).
export function stretch(log, kind, now) {
  const today = dayKey(now)
  if (kind === 'week' || kind === 'month') {
    const n = kind === 'week' ? WEEK : MONTH
    const days = daysBack(now, 0, n)
    const bars = days.map(k => {
      const d = dateOf(k)
      return bar(log, [k], { key: k, label: kind === 'week' ? DAY_LETTERS[d.getDay()] : (d.getDate() === 1 || k === today || k === days[0] ? String(d.getDate()) : ''), name: d.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long' }), now: k === today })
    })
    return { bars, days, before: daysBack(now, n, n * 2), span: n }
  }
  const all = Object.keys(log || {}).filter(isDay)
  const first = firstDay(log)
  const sinceFirst = first ? Math.round((dateOf(today) - dateOf(first)) / 86400000) + 1 : 0
  const monthsSinceFirst = first ? (now.getFullYear() - +first.slice(0, 4)) * 12 + now.getMonth() - (+first.slice(5, 7) - 1) + 1 : 1
  const months = monthsBack(now, kind === 'year' ? YEAR_MONTHS : Math.max(1, monthsSinceFirst))
  const inMonth = new Map(months.map(m => [m, []]))
  for (const k of all) inMonth.get(k.slice(0, 7))?.push(k)
  const bars = months.map(m => {
    const d = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1, 1)
    return bar(log, inMonth.get(m).sort(), { key: m, label: MONTH_LETTERS[d.getMonth()], name: d.toLocaleDateString('en', { month: 'long', year: 'numeric' }), now: m === today.slice(0, 7) })
  })
  const days = bars.flatMap(b => b.days)
  if (kind === 'all') return { bars, days, before: null, span: sinceFirst }
  const start = new Date(now.getFullYear(), now.getMonth() - (YEAR_MONTHS - 1), 1)
  const earlier = new Set(monthsBack(new Date(start.getFullYear(), start.getMonth() - 1, 1), YEAR_MONTHS))
  return { bars, days, before: all.filter(k => earlier.has(k.slice(0, 7))), span: Math.round((dateOf(today) - start) / 86400000) + 1 }
}

// What a set of days adds up to.
//   total · docs: [{ id, title, seconds, share }] most listened first · listened: days with any real listening
//   best: the day with the most ({ key, seconds }) · finished: [{ id, title, day }] finished in those days
export function summary(log, days) {
  const set = new Set(days)
  const per = new Map()
  let total = 0, listened = 0, best = null
  for (const k of days) {
    const s = sum(log?.[k])
    if (!s) continue
    total += s
    if (s >= A_DAY_OF_LISTENING_S) listened++
    if (!best || s > best.seconds) best = { key: k, seconds: s }
    for (const [id, v] of Object.entries(log[k])) if (v > 0) per.set(id, (per.get(id) || 0) + v)
  }
  const titles = log?.titles || {}
  const docs = [...per.entries()].sort((a, b) => b[1] - a[1]).map(([id, seconds]) => ({ id, title: titles[id] || 'Untitled', seconds, share: total ? seconds / total : 0 }))
  // each document once: a book finished twice in these days is one finished book
  const once = new Set()
  const finished = (log?.finished || []).filter(f => set.has(f.day) && !once.has(f.id) && once.add(f.id)).map(f => ({ ...f, title: titles[f.id] || 'Untitled' }))
  return { total, docs, listened, best, finished }
}

// Days in a row with real listening: the run that is still going (today need not have happened yet), and the
// longest there has ever been, with the day it ended.
// `least`: the seconds that make a day count. With the daily goal it is the ring's streak (days it closed).
export function streaks(log, now, least = A_DAY_OF_LISTENING_S) {
  const on = k => sum(log?.[k]) >= least
  let current = 0
  for (let i = on(dayKey(now)) ? 0 : 1; on(dayKey(back(now, i))); i++) current++
  let longest = 0, run = 0, prev = null, ended = null
  for (const k of Object.keys(log || {}).filter(k => isDay(k) && on(k)).sort()) {
    run = prev && Math.round((dateOf(k) - dateOf(prev)) / 86400000) === 1 ? run + 1 : 1
    if (run > longest) { longest = run; ended = k }
    prev = k
  }
  return { current, longest, ended }
}

// The last `weeks` weeks as a calendar: columns are weeks (oldest first), rows Sunday to Saturday.
// → [[{ key, seconds, ahead }]]: `ahead` marks the days of this week that have not come yet.
export function calendar(log, now, weeks) {
  const end = back(now, now.getDay() - 6) // this week's Saturday
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => {
    const date = back(end, (weeks - 1 - w) * 7 + (6 - d))
    return { key: dayKey(date), seconds: sum(log?.[dayKey(date)]), ahead: date > now }
  }))
}

// The hour of the day listening happens in: 24 totals (every year together), and the hour with the most.
export function hours(log) {
  const by = Array(24).fill(0)
  for (const row of Object.values(log?.hours || {})) for (let h = 0; h < 24; h++) by[h] += row?.[h] || 0
  const total = by.reduce((a, b) => a + b, 0)
  return { by, total, peak: total ? by.indexOf(Math.max(...by)) : null }
}
export const hourName = h => `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`

// The daily ring (Apple Watch's Move ring, for listening): today's listening against the customer's goal.
// The goal is the same for every day it is asked about (settings.listenGoal): a goal changed today also
// re-reads the days before it. ponytail: a goal kept per day, when a changed goal must not rewrite past streaks.
export const GOAL_USUAL_MIN = 20
export const GOAL_MINUTES = [10, 15, 20, 30, 45, 60]
export function ringOf(log, now, goalMin) {
  const goal = goalMin * 60, today = sum(log?.[dayKey(now)])
  return { today, goal, share: Math.min(1, today / goal), closed: today >= goal, left: Math.max(0, goal - today) }
}
