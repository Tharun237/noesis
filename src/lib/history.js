// Your listening: time actually listened, counted on this device only.
//
// The log lives only on this device, in IndexedDB, as days:
//   { 'YYYY-MM-DD': { [docId]: seconds } }
// plus `titles: { [docId]: title }` (kept so a deleted document still has a
// name) and `finished: [{ id, day }]`. It is not synced in this task.
// Time is wall-clock time while sound is actually playing, not audio duration
// and not multiplied by speed.
import { createStore, useStore } from './store.js'
import { db } from './db.js'
import { player, audioState } from './player.js'
import { activeEngine } from './engine.js'
import { library, getDoc, addDocument } from './library.js'
import { aiText } from './ai.js'

export const emptyLog = () => ({ titles: {}, finished: [] })

// Local calendar date → 'YYYY-MM-DD'.
export function dayKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const isDay = k => /^\d{4}-\d{2}-\d{2}$/.test(k)

// Add seconds for one document on one day. → a new log; the input is untouched.
export function addSeconds(log, day, docId, seconds, title) {
  const base = log || emptyLog()
  const prev = base[day] || {}
  const dayMap = { ...prev, [docId]: (prev[docId] || 0) + seconds }
  const titles = { ...(base.titles || {}) }
  if (title) titles[docId] = title
  return { ...base, [day]: dayMap, titles, finished: base.finished ? [...base.finished] : [] }
}

// Record a document becoming finished on a day. Once per document per day.
export function markFinished(log, day, docId) {
  const base = log || emptyLog()
  const finished = base.finished ? [...base.finished] : []
  if (!finished.some(f => f.id === docId && f.day === day)) finished.push({ id: docId, day })
  return { ...base, titles: { ...(base.titles || {}) }, finished }
}

const dayTotal = (log, key) => {
  const m = log?.[key]
  if (!m) return 0
  let s = 0
  for (const k of Object.keys(m)) s += m[k] || 0
  return s
}

// Summarise the log around `now`: today, the last 7 calendar days including
// today, the calendar month, the all-time total, documents finished this
// month, the streak of days with at least 1 minute, the five most-listened
// documents this month, and the date of the first entry (null when empty).
export function summarise(log, now) {
  const base = log || emptyLog()
  const todayKey = dayKey(now)
  const monthPrefix = todayKey.slice(0, 7)
  const today = dayTotal(base, todayKey)
  let week = 0
  for (let i = 0; i < 7; i++) {
    const d = new Date(now)
    d.setDate(now.getDate() - i)
    week += dayTotal(base, dayKey(d))
  }
  const yearPrefix = todayKey.slice(0, 4)
  let month = 0
  let year = 0
  let total = 0
  let since = null
  const perDoc = new Map()
  const perDocYear = new Map()
  for (const k of Object.keys(base)) {
    if (!isDay(k)) continue
    const m = base[k]
    let ks = 0
    for (const [id, sec] of Object.entries(m)) {
      ks += sec || 0
      total += sec || 0
      if (k.slice(0, 7) === monthPrefix) {
        month += sec || 0
        perDoc.set(id, (perDoc.get(id) || 0) + (sec || 0))
      }
      if (k.slice(0, 4) === yearPrefix) {
        year += sec || 0
        perDocYear.set(id, (perDocYear.get(id) || 0) + (sec || 0))
      }
    }
    if (ks > 0 && (since === null || k < since)) since = k
  }
  const finishedThisMonth = (base.finished || []).filter(f => f.day && f.day.slice(0, 7) === monthPrefix).length
  const finishedThisYear = (base.finished || []).filter(f => f.day && f.day.slice(0, 4) === yearPrefix).length
  let streak = 0
  const cursor = new Date(now)
  if (dayTotal(base, dayKey(cursor)) < 60) cursor.setDate(cursor.getDate() - 1)
  for (;;) {
    if (dayTotal(base, dayKey(cursor)) >= 60) { streak++; cursor.setDate(cursor.getDate() - 1) }
    else break
  }
  const titles = base.titles || {}
  const most = per => [...per.entries()]
    .map(([id, seconds]) => ({ id, title: titles[id] || id, seconds }))
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 5)
  return { today, week, month, year, total, finishedThisMonth, finishedThisYear, streak, top: most(perDoc), topYear: most(perDocYear), since }
}

// True once anything has been counted (any day with time, or any finish).
export function hasEntries(log) {
  if (!log) return false
  for (const k of Object.keys(log)) {
    if (!isDay(k)) continue
    for (const v of Object.values(log[k] || {})) if ((v || 0) > 0) return true
  }
  return (log.finished || []).length > 0
}

export const historyStore = createStore({ log: emptyLog() })

// React view of the current log. The selector returns the same object
// reference until the log changes; derive lists with useMemo after it.
export function useHistory() {
  return useStore(historyStore, s => s.log)
}

// A short spoken retrospective of the month, from the numbers and titles only.
// Never document text.
export function retrospectivePrompt(summary, monthName, period = 'month') {
  if (period === 'year') return yearPrompt(summary, monthName)
  const lines = summary.top.map(t => `"${t.title}": ${t.seconds} seconds (about ${Math.max(1, Math.round(t.seconds / 60))} minutes)`).join('\n')
  return `You are making a short spoken retrospective of someone's listening in ${monthName}, for them to hear, not read.\n` +
    `Their listening: ${summary.today} seconds today, ${summary.week} seconds in the last 7 days, ${summary.month} seconds this month, ${summary.total} seconds in total. ` +
    `They finished ${summary.finishedThisMonth} documents this month. Their current streak is ${summary.streak} days in a row with at least a minute.\n` +
    `Most listened this month:\n${lines || 'Nothing yet.'}\n` +
    `\nWrite about 150 words of plain flowing prose, warm and specific, naming the documents by their titles and what the numbers say about the month. ` +
    `No lists, no headings, no bold. In English. Write for listening: clear sentences that sound good read aloud.`
}

// Build the retrospective as a new ordinary document. → the new document's id.
// The same for a whole year: `yearName` is the year, e.g. "2026".
function yearPrompt(summary, yearName) {
  const lines = summary.topYear.map(t => `"${t.title}": ${t.seconds} seconds (about ${Math.max(1, Math.round(t.seconds / 60))} minutes)`).join('\n')
  return `You are making a short spoken retrospective of someone's listening in ${yearName}, for them to hear, not read.\n` +
    `Their listening: ${summary.year} seconds this year, of which ${summary.month} seconds this month and ${summary.week} seconds in the last 7 days. ` +
    `They finished ${summary.finishedThisYear} documents this year. Their current streak is ${summary.streak} days in a row with at least a minute.\n` +
    `Most listened this year:\n${lines || 'Nothing yet.'}\n` +
    `\nWrite about 200 words of plain flowing prose, warm and specific, naming the documents by their titles and what the numbers say about the year. ` +
    `No lists, no headings, no bold. In English. Write for listening: clear sentences that sound good read aloud.`
}

export async function makeRetrospective({ signal, period = 'month' } = {}) {
  const now = new Date()
  const summary = summarise(historyStore.get().log, now)
  const monthName = period === 'year' ? String(now.getFullYear()) : now.toLocaleString('en', { month: 'long', year: 'numeric' })
  const text = await aiText({ prompt: retrospectivePrompt(summary, monthName, period), signal })
  const name = `Your listening in ${monthName}`
  const kind = /^\s{0,3}#{1,6}\s/m.test(text) ? 'md' : 'text'
  return addDocument({ kind, name, title: name, text }, { title: name, renamed: true, mode: 'full' })
}

let started = false

// Count wall-clock time while sound is really playing. Loads the log once,
// then every 5 seconds adds 5 seconds for the current document when playing.
export function startHistory() {
  if (started) return
  started = true
  // Nothing is counted or saved until the stored log has been read: a tick that ran first would write a
  // nearly empty log over the real one.
  let loaded = false
  db.getHistory().then(saved => {
    if (saved) historyStore.set({ log: saved })
    loaded = true
  })
  // Documents finished before this feature existed are the baseline, never
  // back-filled: only a document that was unfinished here and becomes
  // finished is recorded.
  let prev = new Map()
  let firstSync = true
  let lastSave = 0
  library.sub(() => {
    const docs = library.get().docs || []
    if (firstSync) {
      firstSync = false
      prev = new Map(docs.map(d => [d.id, !!d.finished]))
      return
    }
    const day = dayKey(new Date())
    let log = historyStore.get().log
    let changed = false
    for (const d of docs) {
      const was = prev.get(d.id)
      if (was === undefined) { prev.set(d.id, !!d.finished); continue }
      if (!was && d.finished) {
        log = markFinished(log, day, d.id)
        changed = true
      }
      prev.set(d.id, !!d.finished)
    }
    for (const id of [...prev.keys()]) {
      if (!docs.some(d => d.id === id)) prev.delete(id)
    }
    if (changed) {
      historyStore.set({ log })
      if (loaded) { lastSave = Date.now(); void db.putHistory(log) }
    }
  })
  const tick = () => {
    if (!loaded) return
    const p = player.get()
    if (p.playing && !p.waiting && p.id && (audioState().paused === false || (activeEngine() === 'system' && globalThis.speechSynthesis?.speaking))) {
      const d = getDoc(p.id)
      const titles = historyStore.get().log.titles || {}
      const day = dayKey(new Date())
      const log = addSeconds(historyStore.get().log, day, p.id, 5, d?.title || titles[p.id] || 'Untitled')
      historyStore.set({ log })
      if (Date.now() - lastSave >= 20000) {
        lastSave = Date.now()
        void db.putHistory(log)
      }
    }
  }
  setInterval(tick, 5000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && loaded) {
      lastSave = Date.now()
      void db.putHistory(historyStore.get().log)
    }
  })
}
