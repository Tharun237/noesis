// How each voice is best asked for its audio, learnt from the voice itself rather than written down by hand
// ("Noesis needs to hand these jobs to voice models smartly, according to the model or service. You can't hardcode
// everything: it should be adaptive and dynamic", Tharun, 16 October 2026). Kept per device (settings.voicePlans).
//
// Runs. A voice given a paragraph's sentences together carries its feeling across each full stop; the audio is then
// cut back into sentences (split.js). Some voices pause at every full stop and are cut exactly; others run straight
// on and pause at a comma instead, and a cut there would light one sentence while another is heard. So each voice is
// TRIED: the first time it would make a run, the run is made both ways (together, and one sentence at a time, from
// the book's own text in its own language), and each cut piece must speak for about as long as its sentence did
// alone. Then it is remembered, looked at again after RECHECK_MS, and taken away if its runs keep failing their cuts.
//
// Pace. An online service says when it is asked too often (429). The gap between requests grows when it does, and
// shrinks again slowly while it does not; a "Retry-After" it sends is followed. Per service, not per voice.
//
// Size. A run is short while the listener is close behind the voice (the next sentence is wanted soon) and longer
// when the voice is well ahead; a service that refuses a long text teaches the longest it takes.
import { settings } from './settings.js'

const RECHECK_MS = 30 * 86400000 // a voice's verdict is tried again after this long (models and services change)
export const FIT = [0.75, 1.3] // a cut piece speaks for this share of its sentence spoken alone (Mia 0.94-1.14; Alba's bad cut 0.56)
const STRIKES = 3 // runs in a row whose cuts could not be trusted: the voice goes back to one sentence at a time

// → true (cut cleanly), false, or null (not tried, or too long ago)
export function runsFor(voice, now = Date.now()) {
  const p = settings.get().voicePlans?.[voice]
  if (p?.runs == null || now - (p.at || 0) > RECHECK_MS) return null
  return p.runs
}
function setPlan(voice, change) {
  const all = { ...(settings.get().voicePlans || {}) }
  all[voice] = { ...(all[voice] || {}), ...change }
  settings.set({ voicePlans: all })
}

// The verdict from one paragraph made both ways: seconds of speech of each sentence alone, and of each cut piece.
export function judge(alone, pieces) {
  if (!pieces || pieces.length !== alone.length || alone.length < 2) return false
  return pieces.every((s, k) => alone[k] > 0 && s / alone[k] >= FIT[0] && s / alone[k] <= FIT[1])
}
export const learnRuns = (voice, ok, now = Date.now()) => setPlan(voice, { runs: !!ok, at: now, strikes: 0 })

// A run of a voice that had passed, whose cuts could not be trusted this time (null from split.js), or that was cut.
export function runResult(voice, cut) {
  const p = settings.get().voicePlans?.[voice]
  if (!p?.runs) return
  if (cut) { if (p.strikes) setPlan(voice, { strikes: 0 }); return }
  const strikes = (p.strikes || 0) + 1
  setPlan(voice, strikes >= STRIKES ? { runs: false, at: Date.now(), strikes: 0 } : { strikes })
}

// ── size ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const RUN_LEAST = 160 // characters: about two sentences, made quickly when the listener is close behind
const RUN_MOST = 700 // characters: when the voice is well ahead (a service's own limit may be lower, and is learnt)
const AHEAD_FAR_S = 300 // seconds of audio ready ahead of the listener at which runs are as long as they go
// → the most characters for the next run, from how far ahead of the listener the voice is (seconds; Infinity when
// no one is listening to this book) and the longest text this service took.
export function runChars(ahead, ceiling = RUN_MOST) {
  const share = Math.max(0, Math.min(1, (Number.isFinite(ahead) ? ahead : AHEAD_FAR_S) / AHEAD_FAR_S))
  return Math.round(Math.min(ceiling, RUN_LEAST + share * (RUN_MOST - RUN_LEAST)))
}
// A service that refused a text as too long (400/413): the longest it takes is under that.
export function tooLong(service, chars) {
  const all = { ...(settings.get().servicePlans || {}) }
  all[service] = { ...(all[service] || {}), ceiling: Math.max(RUN_LEAST, Math.floor(chars * 0.7)) }
  settings.set({ servicePlans: all })
}
export const ceilingOf = service => settings.get().servicePlans?.[service]?.ceiling || RUN_MOST

// ── pace ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// The gap between two requests to a service: grows by half (and a second) at each "too many", and shrinks by a
// twentieth after each answer, never under GAP_LEAST. Kept in memory, starting from what was learnt last time.
const GAP_LEAST = 400
const GAP_MOST = 30_000
const GAP_START = 1600
const gaps = new Map()
export function gapOf(service) {
  if (!gaps.has(service)) gaps.set(service, settings.get().servicePlans?.[service]?.gap || GAP_START)
  return gaps.get(service)
}
export function paced(service, answer, retryAfterMs = 0) {
  let g = gapOf(service)
  if (answer === 'limited') g = Math.max(Math.min(GAP_MOST, g * 1.5 + 1000), retryAfterMs || 0)
  else if (answer === 'ok') g = Math.max(GAP_LEAST, g * 0.95)
  gaps.set(service, Math.round(g))
  if (answer === 'limited' || Math.random() < 0.05) { // written down now and then: where to start next time
    const all = { ...(settings.get().servicePlans || {}) }
    all[service] = { ...(all[service] || {}), gap: Math.round(g) }
    settings.set({ servicePlans: all })
  }
  return g
}
