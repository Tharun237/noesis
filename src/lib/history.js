// Your listening: time actually listened, counted on this device only.
//
// The log lives only on this device, in IndexedDB, as days:
//   { 'YYYY-MM-DD': { [docId]: seconds } }
// plus `titles: { [docId]: title }` (kept so a deleted document still has a
// name) and `finished: [{ id, day }]`. It is not synced in this task.
// Time is wall-clock time while sound is actually playing, not audio duration
// and not multiplied by speed. It is measured, not sampled: from the moment sound starts to the moment it
// stops, to the second, under the calendar day (this device's own date) it was heard on. The hour is not kept:
// nothing in Noesis shows it, and a record nobody reads is not kept. Each document also keeps `lastPlayed`,
// the moment it was last heard (library.js).
import { createStore, useStore } from './store.js'
import { db } from './db.js'
import { player, audioState } from './player.js'
import { activeEngine } from './engine.js'
import { library, getDoc, addDocument } from './library.js'
import { aiText } from './ai.js'
import { dayKey, listenedBetween } from './heard.js'

export const emptyLog = () => ({ titles: {}, finished: [] })

export { dayKey }

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

// Count wall-clock time while sound is really playing. Loads the log once, then looks at the player every
// LOOK_MS and at every moment sound starts, stops or moves to another document, and adds the time that
// really passed since the last look (heard.js listenedBetween). (It added a flat 5 seconds whenever a
// 5-second timer found sound playing: 27 seconds of listening was written down as 30, and a browser that
// slows a hidden page's timers would have written a minute down as 5 seconds.)
const LOOK_MS = 5000
export function startHistory() {
  if (started) return
  started = true
  // Nothing is counted or saved until the stored log has been read: a tick that ran first would write a
  // nearly empty log over the real one.
  let loaded = false
  db.getHistory().then(saved => {
    if (saved) historyStore.set({ log: saved })
    loaded = true
  }, () => { /* no storage in this browser (db.js): nothing is counted, nothing is saved */ })
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
  // the document sound is coming out for right now, or null
  const sounding = () => {
    const p = player.get()
    return p.playing && !p.waiting && p.id && (audioState().paused === false || (activeEngine() === 'system' && globalThis.speechSynthesis?.speaking)) ? p.id : null
  }
  let last = { at: Date.now(), id: null, carry: 0 }
  const look = () => {
    const now = Date.now()
    const { seconds, carry } = listenedBetween(last, now)
    const id = last.id
    last = { at: now, id: sounding(), carry }
    if (!loaded || !seconds) return
    const titles = historyStore.get().log.titles || {}
    const log = addSeconds(historyStore.get().log, dayKey(new Date(now)), id, seconds, getDoc(id)?.title || titles[id] || 'Untitled')
    historyStore.set({ log })
    // written down every 20 seconds while sound plays, and at once when it stops: closing the app straight
    // after a pause loses nothing (it lost up to 20 seconds)
    if (now - lastSave >= 20000 || !last.id) {
      lastSave = now
      void db.putHistory(log)
    }
  }
  setInterval(look, LOOK_MS)
  player.sub(() => { if (sounding() !== last.id) look() }) // sound started, stopped or changed document: the stretch ends here
  const leaving = () => {
    if (!loaded) return
    look()
    lastSave = Date.now()
    void db.putHistory(historyStore.get().log)
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') leaving() })
  addEventListener('pagehide', leaving)
}
