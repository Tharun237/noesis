// Things that ride along with playback without the player knowing about them: the focus sound under the
// voice, the haptic pulse at the end of each sentence, and aware listening (the microphone measures the room
// while a document plays: the voice slows in noise, the book pauses when the listener speaks).
import { player, pause, setEase, setClarity } from './player.js'
import { startAwareness, awareSupported } from './aware.js'
import { toast } from './nav.js'
import { activeEngine } from './engine.js'
import { settings } from './settings.js'
import { loadDoc } from './library.js'
import { ambient } from './ambient.js'
import { haptic, pulseFor } from './haptics.js'

const NOISE_EASE = 0.9 // in noise the voice runs at nine tenths of the listener's speed

// Asked when a switch is turned on, so the browser's microphone question appears where the choice is made.
export async function askAware() {
  try { (await startAwareness()).stop(); return true } catch (err) { toast(err.message); return false }
}

let started = false
export function startExtras() {
  if (started) return
  started = true
  let prev = { id: null, i: -1, sounding: false }
  // "Sounding" means the customer pressed play and has not paused. The short waits between stretches of
  // audio, or while the next sentence is still being made, are part of listening: the focus sound must not
  // dip and swell with them (it did, in the first version).
  const sounding = () => { const p = player.get(); return !!p.id && p.playing }
  let stopTimer = 0
  let previewTimer = 0
  const applySound = () => {
    const s = settings.get()
    const mode = s.ambientMode || 'off'
    ambient.set({ mode, volume: s.ambientVolume ?? 0.5 })
    clearTimeout(stopTimer)
    if (mode !== 'off' && sounding()) { clearTimeout(previewTimer); ambient.playing(true) }
    else stopTimer = setTimeout(() => { if (!(settings.get().ambientMode !== 'off' && sounding())) ambient.playing(false) }, 1200)
  }
  // Aware listening: the microphone is open only while a document is sounding, and closed the moment it is not.
  let aware = null
  let opening = false
  const wanted = () => { const s = settings.get(); return (s.awareSlow || s.awarePause || s.awareClear) && sounding() && awareSupported() }
  const onRoom = async e => {
    const s = settings.get()
    // The device's own voice is spoken by the device, not played by Noesis: it cannot be made clearer here.
    const clear = s.awareClear && activeEngine(s) !== 'system'
    if (e.type === 'noisy') {
      if (s.awareSlow) setEase(NOISE_EASE)
      // said only if it was done: the browser may not let the sound be reshaped (it used to say so regardless)
      const clearer = clear && await setClarity(true).catch(() => false)
      if (s.awareSlow || clearer) toast(s.awareSlow && clearer ? 'Slower and clearer for the noise around you.' : s.awareSlow ? 'Slowed a little for the noise around you.' : 'Made clearer for the noise around you.')
    }
    if (e.type === 'quiet') {
      setEase(1)
      setClarity(false)
      if (s.awareSlow || clear) toast(s.awareSlow ? 'Quiet again: back to your speed.' : 'Quiet again: back to the usual sound.')
    }
    if (e.type === 'speech' && s.awarePause) { pause(); toast('Paused because you spoke.') }
  }
  const applyAware = async () => {
    if (!wanted()) { if (aware) { aware.stop(); aware = null } setEase(1); setClarity(false); return }
    if (aware || opening) return
    opening = true
    try {
      const a = await startAwareness({ onEvent: onRoom })
      if (wanted()) aware = a; else a.stop()
    } catch (err) {
      settings.set({ awareSlow: false, awarePause: false, awareClear: false }) // refused: do not keep asking on every play
      toast(err.message)
    }
    opening = false
  }
  player.sub(() => {
    const p = player.get()
    const now = sounding()
    if (now !== prev.sounding) { applySound(); applyAware() }
    // The sentence that was being read has just ended: its pulse.
    if (now && settings.get().haptics && p.id === prev.id && p.i === prev.i + 1) {
      const ended = prev.i
      loadDoc(p.id).then(c => {
        const seg = c?.segs[ended]
        if (!seg) return
        const block = c.blocks[seg.b]
        const last = ended === c.starts[seg.b] + block.s.length - 1
        haptic(pulseFor({ kind: seg.k, text: seg.t, last }))
      })
    }
    prev = { id: p.id, i: p.i, sounding: now }
  })
  let lastMode = settings.get().ambientMode, lastVol = settings.get().ambientVolume
  let lastAware = `${!!settings.get().awareSlow}${!!settings.get().awarePause}${!!settings.get().awareClear}`
  settings.sub(() => {
    const s = settings.get()
    const nowAware = `${!!s.awareSlow}${!!s.awarePause}${!!s.awareClear}`
    if (nowAware !== lastAware) { lastAware = nowAware; applyAware() }
    if (s.ambientMode === lastMode && s.ambientVolume === lastVol) return
    lastMode = s.ambientMode; lastVol = s.ambientVolume
    applySound()
    // Chosen while nothing is playing: let it be heard for a few seconds, or the choice is made blind.
    if (!sounding() && (s.ambientMode || 'off') !== 'off') {
      clearTimeout(stopTimer); clearTimeout(previewTimer)
      ambient.playing(true)
      previewTimer = setTimeout(() => { if (!sounding()) ambient.playing(false) }, 4000)
    }
  })
}
