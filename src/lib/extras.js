// Things that ride along with playback without the player knowing about them: the focus sound under the
// voice, and the haptic pulse at the end of each sentence.
import { player } from './player.js'
import { settings } from './settings.js'
import { loadDoc } from './library.js'
import { ambient } from './ambient.js'
import { haptic, pulseFor } from './haptics.js'

let started = false
export function startExtras() {
  if (started) return
  started = true
  let prev = { id: null, i: -1, sounding: false }
  const sounding = () => { const p = player.get(); return !!p.id && p.playing && !p.waiting }
  const applySound = () => {
    const s = settings.get()
    const mode = s.ambientMode || 'off'
    ambient.set({ mode, volume: s.ambientVolume ?? 0.5 })
    ambient.playing(mode !== 'off' && sounding())
  }
  player.sub(() => {
    const p = player.get()
    const now = sounding()
    if (now !== prev.sounding) applySound()
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
  settings.sub(() => {
    const s = settings.get()
    if (s.ambientMode === lastMode && s.ambientVolume === lastVol) return
    lastMode = s.ambientMode; lastVol = s.ambientVolume
    applySound()
  })
}
