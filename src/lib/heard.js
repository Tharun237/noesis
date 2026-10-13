// What has been listened to, as numbers a bar can draw. Pure. The log is history.js's:
//   { 'YYYY-MM-DD': { [docId]: seconds of sound really played }, titles, finished }

// Local calendar date → 'YYYY-MM-DD'.
export function dayKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// How much listening lies between two looks at the player. `id` is the document that was sounding at the
// first look (null: nothing was); every change of that is itself a look, so it held for the whole stretch.
// A stretch longer than ASLEEP_MS means the page was not running (the phone slept, the tab was frozen):
// what happened in it is not known, so it is not counted. A clock that went backwards counts nothing.
// → whole seconds to add, and the milliseconds left over to carry into the next stretch.
export const ASLEEP_MS = 90000
export function listenedBetween({ at, id, carry = 0 }, now) {
  const ms = now - at
  if (!id || !(ms > 0) || ms > ASLEEP_MS) return { seconds: 0, carry: id ? carry : 0 }
  const all = carry + ms
  return { seconds: Math.floor(all / 1000), carry: all % 1000 }
}

// Listening on several devices. Each device writes down only its OWN listening, and what is shown is all of
// them added together: so two devices listening at the same hour never overwrite each other, and nothing is
// counted twice (a device's record is never added into another's).
const isDay = k => /^\d{4}-\d{2}-\d{2}$/.test(k)
const yearOfDay = day => String(day).slice(0, 4)

// The hour of the day listening happens in: 24 totals for each year ({ hours: { '2026': [24 numbers] } }).
// That is all "when do I listen" needs, and it is 24 numbers a year however much is listened to.
export function addHour(log, year, hour, seconds) {
  const row = [...(log?.hours?.[year] || Array(24).fill(0))]
  row[hour] = (row[hour] || 0) + seconds
  return { ...log, hours: { ...(log?.hours || {}), [year]: row } }
}
const eachHour = (a, b, f) => Array.from({ length: 24 }, (_, h) => f(a?.[h] || 0, b?.[h] || 0))

// Records as one: seconds add up; a title or a finish known to any of them is known. Later records win a
// title, so this device's own goes last.
export function mergeLogs(logs) {
  const out = { titles: {}, finished: [], hours: {} }
  const seen = new Set()
  for (const log of logs) {
    if (!log) continue
    for (const [y, row] of Object.entries(log.hours || {})) out.hours[y] = eachHour(out.hours[y], row, (a, b) => a + b)
    for (const k of Object.keys(log)) {
      if (!isDay(k)) continue
      const day = (out[k] ||= {})
      for (const [id, s] of Object.entries(log[k] || {})) day[id] = (day[id] || 0) + (s || 0)
    }
    Object.assign(out.titles, log.titles)
    for (const f of log.finished || []) {
      const key = `${f.id} ${f.day}`
      if (!seen.has(key)) { seen.add(key); out.finished.push(f) }
    }
  }
  return out
}

// One year of a record, with the titles it needs: what is sent (a year is a small file that stops growing
// when the year ends, however many years someone listens for).
export function yearOf(log, year) {
  const out = { titles: {}, finished: (log?.finished || []).filter(f => yearOfDay(f.day) === year), hours: log?.hours?.[year] ? { [year]: log.hours[year] } : {} }
  const ids = new Set(out.finished.map(f => f.id))
  for (const k of Object.keys(log || {})) {
    if (!isDay(k) || yearOfDay(k) !== year) continue
    out[k] = log[k]
    for (const id of Object.keys(log[k] || {})) ids.add(id)
  }
  for (const id of ids) if (log?.titles?.[id]) out.titles[id] = log.titles[id]
  return out
}
export const yearsIn = log => [...new Set([...Object.keys(log || {}).filter(isDay), ...(log?.finished || []).map(f => f.day)].map(yearOfDay))].sort()

// Two copies of the SAME device's record (this one, and the one it sent before its storage was cleared): a
// count only ever grows, so the larger of each is the true one.
export function newest(a, b) {
  const out = mergeLogs([b, a])
  for (const k of Object.keys(out)) {
    if (!isDay(k)) continue
    for (const id of Object.keys(out[k])) out[k][id] = Math.max(a?.[k]?.[id] || 0, b?.[k]?.[id] || 0)
  }
  for (const y of Object.keys(out.hours)) out.hours[y] = eachHour(a?.hours?.[y], b?.hours?.[y], Math.max)
  return out
}

// How far through a document the listener is (0..1): a finished one is all of it, otherwise where the place is.
export const shareOf = d => (d.finished ? 1 : d.total ? Math.min(1, d.pos / d.total) : 0)

// The documents "done" and "left" are added up over: every one that is not archived and has text, whatever the
// library is filtered to. The strip above the library and the listening page it opens both read this, so
// they cannot say two things about the same shelf.
//   lengthOf(d): how long the document takes the listener (the caller puts it at the speed it is heard at)
// → { shelf: [{ d, seconds, share }], all, heard, left }, in those seconds.
export function shelfOf(docs, lengthOf) {
  const shelf = docs.filter(d => d.chars && !d.archived).map(d => ({ d, seconds: lengthOf(d), share: shareOf(d) }))
  const all = shelf.reduce((a, s) => a + s.seconds, 0)
  const heard = shelf.reduce((a, s) => a + s.seconds * s.share, 0)
  return { shelf, all, heard, left: all - heard }
}

// Did the player stop this document in the same synchronous turn that something else is now looking at?
// The player stops (playing: false) and only then marks a finished document finished, in one run of code
// (player.js finish); a finish that arrives from another device comes in a turn of its own. So "stopped in this
// turn" tells a document that ended HERE from one that was told it had ended. `seen` is called with the
// player's state on every change of it.
export function justStopped(later = queueMicrotask) {
  let playing = null
  let stopped = null
  return {
    seen(p) {
      if (playing && !p.playing) { stopped = playing; later(() => { stopped = null }) }
      playing = p.playing ? p.id : null
    },
    is: id => stopped === id,
  }
}

const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const back = (now, days) => { const d = new Date(now); d.setDate(now.getDate() - days); return d }

// The last seven days, oldest first and today last:
//   [{ key, letter, today, seconds, docs: [[docId, seconds], ...most listened first] }]
export function weekOf(log, now) {
  return Array.from({ length: 7 }, (_, i) => {
    const date = back(now, 6 - i)
    const docs = Object.entries(log?.[dayKey(date)] || {}).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1])
    return { key: dayKey(date), letter: LETTERS[date.getDay()], today: i === 6, seconds: docs.reduce((a, [, s]) => a + s, 0), docs }
  })
}

// One document: seconds listened today, and the usual amount on a day it is listened to at all (over the
// last PACE_DAYS days). A day with a few seconds on it is not a day of listening.
export const PACE_DAYS = 14
const A_SITTING_S = 60
export function docListening(log, id, now) {
  const today = log?.[dayKey(now)]?.[id] || 0
  const days = []
  for (let i = 0; i < PACE_DAYS; i++) { const s = log?.[dayKey(back(now, i))]?.[id] || 0; if (s >= A_SITTING_S) days.push(s) }
  return { today, perDay: days.length ? days.reduce((a, b) => a + b, 0) / days.length : 0 }
}

// How a document's timeline divides, for its bar.
//   duration: seconds of audio at 1x · share: how far through it the listener is (0..1) · rate: the speed it
//   is heard at (pace.js)
// → { heard, today, left } as shares of the bar (today is the last stretch of heard), the seconds it takes the
//   listener to have heard and to have left (at that speed: the unit of every length shown, pace.js), and
//   `days`: how many more days of listening it takes at the usual pace (null when there is no pace to speak
//   of, or it is too far off to promise).
const TOO_FAR_DAYS = 90
export function docBar({ duration, share, rate = 1 }, { today = 0, perDay = 0 } = {}) {
  const heard = Math.max(0, Math.min(1, share || 0))
  const speed = rate > 0 ? rate : 1
  const todayShare = duration > 0 ? Math.min(heard, (today * speed) / duration) : 0
  const leftSeconds = Math.max(0, duration * (1 - heard)) / speed
  const dayShare = duration > 0 ? (perDay * speed) / duration : 0
  const days = perDay >= A_SITTING_S && leftSeconds > 0 ? Math.ceil(leftSeconds / perDay) : null
  return {
    heard, today: todayShare, left: 1 - heard, heardSeconds: (duration * heard) / speed, leftSeconds,
    days: days != null && days <= TOO_FAR_DAYS ? days : null,
    dayShare: days != null && days <= TOO_FAR_DAYS ? dayShare : 0,
  }
}
