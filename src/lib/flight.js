// What happened while listening, written down on this device, as it happens: the moments a promise broke, with what
// the player and the page were doing at that moment. Tharun's phone showed the lit word stopping while the voice
// went on, and the voice stopping when the app was put away (15 November 2026); a test on a computer could not make
// either happen (e2e/real-life.mjs). The phone itself is where it happens, so the phone notes it, and Settings →
// About → Diagnostics shows the notes to copy.
//
// Noted: the lit word not moving while sound comes out; sound stopping while the app is hidden although it was
// meant to go on; a refused play(); the app hidden and shown again while playing; the silk's drawing taken away by
// the phone. Kept: the last MAX notes, in this browser's storage.
import { player, audioState, stretchInfo } from './player.js'

const KEY = 'noesis.flight'
const MAX = 40
const LOOK_MS = 1000 // the lit word is looked at once a second, and only while sound should be coming out
const STUCK_MS = 3000 // a word is said in well under this

const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] } }
export const flightNotes = read

export function note(kind, detail = '') {
  const p = player.get(), a = audioState(), st = stretchInfo()
  const entry = {
    at: new Date().toISOString(), kind, detail, page: document.visibilityState,
    player: `i ${p.i}, playing ${p.playing}, waiting ${p.waiting}, gate ${p.gate ?? 'none'}`,
    audio: `paused ${a.paused}, ended ${a.ended}, ready ${a.readyState}, ${Number(a.currentTime).toFixed(1)}/${Number(a.duration).toFixed(1)}${st ? `, sentences ${st.from}-${st.to}` : ''}`,
  }
  try { localStorage.setItem(KEY, JSON.stringify([...read(), entry].slice(-MAX))) } catch { /* no storage: nothing kept */ }
}

if (typeof document !== 'undefined') {
  let word = null, since = 0, clock = -1, refused = null
  setInterval(() => {
    const p = player.get(), a = audioState()
    if (a.playError && a.playError !== refused) note('play refused', a.playError)
    refused = a.playError
    const sounding = p.playing && !p.waiting && !a.paused && a.currentTime !== clock
    clock = a.currentTime
    if (!sounding || document.visibilityState !== 'visible') { word = null; return }
    const lit = document.querySelector('[data-fill]')
    if (!lit) return // the reader is not on screen: nothing is lit to look at
    const now = `${p.i}:${lit.dataset.fill}`
    if (now !== word) { word = now; since = Date.now(); return }
    if (since && Date.now() - since > STUCK_MS) { note('word stuck', `"${lit.dataset.fill}" for ${Math.round((Date.now() - since) / 1000)} s`); since = 0 }
  }, LOOK_MS)

  // put away while playing, and what the sound did meanwhile
  let hiddenPlaying = false
  document.addEventListener('visibilitychange', () => {
    const p = player.get()
    if (document.visibilityState === 'hidden') { hiddenPlaying = p.playing; if (p.playing) note('app hidden while playing') }
    else if (hiddenPlaying) { note('app shown again', p.playing && !audioState().paused ? 'still playing' : 'sound had stopped'); hiddenPlaying = false }
  })
  player.sub(() => { if (document.visibilityState === 'hidden' && hiddenPlaying && (!player.get().playing || player.get().waiting)) { note('sound stopped while hidden', player.get().waiting ? 'waiting for the voice to make the next sentence' : 'paused'); hiddenPlaying = false } })
  addEventListener('noesis:flight', e => note(e.detail.kind, e.detail.detail))
}
