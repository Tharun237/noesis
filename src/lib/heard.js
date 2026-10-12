// What has been listened to, as numbers a bar can draw. Pure. The log is history.js's:
//   { 'YYYY-MM-DD': { [docId]: seconds of sound really played }, titles, finished }

// Local calendar date → 'YYYY-MM-DD'.
export function dayKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
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
//   duration: seconds of audio at 1x · share: how far through it the listener is (0..1) · rate: playback speed
// → { heard, today, left } as shares of the bar (today is the last stretch of heard), the seconds of audio
//   heard and left, and `days`: how many more days of listening it takes at the usual pace (null when
//   there is no pace to speak of, or it is too far off to promise).
const TOO_FAR_DAYS = 90
export function docBar({ duration, share, rate = 1 }, { today = 0, perDay = 0 } = {}) {
  const heard = Math.max(0, Math.min(1, share || 0))
  const speed = rate > 0 ? rate : 1
  const todayShare = duration > 0 ? Math.min(heard, (today * speed) / duration) : 0
  const leftSeconds = Math.max(0, duration * (1 - heard))
  const dayShare = duration > 0 ? (perDay * speed) / duration : 0
  const days = perDay >= A_SITTING_S && leftSeconds > 0 ? Math.ceil(leftSeconds / speed / perDay) : null
  return {
    heard, today: todayShare, left: 1 - heard, heardSeconds: duration * heard, leftSeconds,
    days: days != null && days <= TOO_FAR_DAYS ? days : null,
    dayShare: days != null && days <= TOO_FAR_DAYS ? dayShare : 0,
  }
}
