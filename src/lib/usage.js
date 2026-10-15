// How much this device asks of the customer's NVIDIA key, and how often NVIDIA asks it to slow down: counted a day
// at a time, so "is the free key enough for four hours a day?" is answered from what happened, not guessed
// (Tharun, 16 October 2026). Kept on this device only, never sent anywhere; the last two weeks.
//   voice: a request to an NVIDIA voice (one sentence, or a run of a paragraph's sentences) · text: an AI request
//   made · said (sentences, for voices) · limited (NVIDIA said 429: too many, wait) · failed (NVIDIA was busy: 5xx)
//   · waitedMs · peak (most requests in a minute: what NVIDIA's limit is about)
import { onShelf } from './shelf.js'
import { createStore } from './store.js'

const KEY = onShelf('noesis.nvidia-use')
const DAYS = 14
const SAVE_MS = 5000 // a sentence every second or two: written down in batches, and when the page is left
const dayOf = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const load = () => { try { return JSON.parse(localStorage.getItem(KEY))?.days || {} } catch { return {} } }

export const nvidiaUse = createStore({ days: load() })
let timer = null
const save = () => { clearTimeout(timer); timer = null; try { localStorage.setItem(KEY, JSON.stringify({ days: nvidiaUse.get().days })) } catch { /* no storage: counted for this visit only */ } }
if (typeof addEventListener === 'function') addEventListener('pagehide', () => timer && save())

let minute = { at: '', n: {} } // this minute's count per kind, for the busiest minute
export function countUse(kind, what, { waited: waitedMs = 0, n = 1, now = Date.now() } = {}) {
  const d = dayOf(now)
  const days = { ...nvidiaUse.get().days }
  const today = { ...(days[d] || {}) }
  today[`${kind}_${what}`] = (today[`${kind}_${what}`] || 0) + n
  if (waitedMs) today[`${kind}_waitedMs`] = (today[`${kind}_waitedMs`] || 0) + waitedMs
  if (what === 'made') {
    const m = `${d}:${Math.floor(now / 60000)}`
    if (minute.at !== m) minute = { at: m, n: {} }
    minute.n[kind] = (minute.n[kind] || 0) + 1
    today[`${kind}_peak`] = Math.max(today[`${kind}_peak`] || 0, minute.n[kind])
  }
  days[d] = today
  for (const old of Object.keys(days).sort().slice(0, -DAYS)) delete days[old]
  nvidiaUse.set({ days })
  timer ??= setTimeout(save, SAVE_MS)
}

// The last `n` days (today included) added up: { voice: { made, said, limited, failed, waitedMs, peak }, text: {…}, days }
export function useOver(days, n = 7, now = Date.now()) {
  const want = new Set(Array.from({ length: n }, (_, k) => dayOf(now - k * 86400000)))
  const sum = { voice: { made: 0, said: 0, limited: 0, failed: 0, waitedMs: 0, peak: 0 }, text: { made: 0, said: 0, limited: 0, failed: 0, waitedMs: 0, peak: 0 }, days: 0 }
  for (const [d, v] of Object.entries(days)) {
    if (!want.has(d)) continue
    sum.days++
    for (const kind of ['voice', 'text']) {
      for (const f of ['made', 'said', 'limited', 'failed', 'waitedMs']) sum[kind][f] += v[`${kind}_${f}`] || 0
      sum[kind].peak = Math.max(sum[kind].peak, v[`${kind}_peak`] || 0)
    }
  }
  return sum
}
