// Which word of the sentence being spoken is being said right now. One clock for every place that shows it:
// the flowing text, the original page, the page beside the text.
import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../lib/store.js'
import { settings } from '../lib/settings.js'
import { activeEngine } from '../lib/engine.js'
import { player, audioClock } from '../lib/player.js'
import { wordWeights } from '../lib/words.js'

const LEAD = 0.06 // s the eye is given ahead of the ear
const SHORTEST = 0.2 // s: a sentence is never timed as shorter than this

// text, dur and tail are the sentence, its audio length and the silence at its end. `on` false turns it off.
// Returns the words, where each starts in the text, the index of the one being said (-1: none), and whether
// there is anything to show.
export function useLitWord(text, dur, tail, on = true) {
  const { ws, ends } = useMemo(() => wordWeights(text || ''), [text])
  const starts = useMemo(() => { let at = 0; return ws.map(x => { const s0 = at; at += x.length + 1; return s0 }) }, [ws])
  const [w, setW] = useState(-1)
  // Built-in voice: exact word positions reported by the speech engine.
  const sys = useStore(settings, s => activeEngine(s) === 'system')
  const spoken = useStore(player, s => s.word)
  const sysWord = sys ? Math.max(0, starts.findLastIndex(x => x <= spoken)) : -1
  useEffect(() => {
    if (sys || !on || !dur) return undefined
    let raf
    const tick = () => {
      const f = (audioClock() - LEAD) / Math.max(SHORTEST, dur - (tail || 0))
      setW(f <= 0 ? 0 : ends.findIndex(e => e >= f))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [sys, on, dur, tail, ends])
  return { ws, starts, lit: sys ? sysWord : w, shown: !!on && (sys || !!dur) }
}
