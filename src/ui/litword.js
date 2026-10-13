// Which word of the sentence being spoken is being said right now. One clock for every place that shows it:
// the flowing text, Focus, the original page, the page beside the text.
import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../lib/store.js'
import { settings } from '../lib/settings.js'
import { activeEngine } from '../lib/engine.js'
import { player, audioClock } from '../lib/player.js'
import { wordWeights } from '../lib/words.js'

const LEAD = 0.06 // s the eye is given ahead of the ear
const SHORTEST = 0.2 // s: a sentence is never timed as shorter than this
const LOOK_MS = 200 // the longest the clock goes unread
const LOOK_MIN_MS = 10
const UNTIMED_MS = 200 // the device's own voice says where a word starts, not how long it lasts

// text, dur and tail are the sentence, its audio length and the silence at its end. `on` false turns it off.
// Returns the words, where each starts in the text, the index of the one being said (-1: none), how long
// saying it takes on the clock (`ms`, for a light that crosses it), and whether there is anything to show.
export function useLitWord(text, dur, tail, on = true) {
  const { ws, ends, says } = useMemo(() => wordWeights(text || ''), [text])
  const starts = useMemo(() => { let at = 0; return ws.map(x => { const s0 = at; at += x.length + 1; return s0 }) }, [ws])
  // The word is kept with the sentence it belongs to: a new sentence never shows the old one's count.
  const [at, setAt] = useState({ of: text, w: -1 })
  // Built-in voice: exact word positions reported by the speech engine.
  const sys = useStore(settings, s => activeEngine(s) === 'system')
  const spoken = useStore(player, s => s.word)
  const rate = useStore(player, s => s.rate) || 1
  const sysWord = sys ? Math.max(0, starts.findLastIndex(x => x <= spoken)) : -1
  const span = Math.max(SHORTEST, (dur || 0) - (tail || 0))
  useEffect(() => {
    if (sys || !on || !dur) return undefined
    // The clock is looked at when the word being said ends, not on every frame: a look on every frame made the
    // phone build a frame sixty times a second for something that changes three times a second, and every
    // running animation was worked out again on each of them (measured: twice the work while reading). It
    // is also looked at every LOOK_MS regardless, to notice a pause, a jump or a change of speed.
    let timer, last
    const tick = () => {
      const t = audioClock() - LEAD
      const w = t <= 0 ? 0 : ends.findIndex(e => e >= t / span)
      setAt(prev => (prev.of === text && prev.w === w ? prev : { of: text, w }))
      const left = w < 0 || t === last ? LOOK_MS : ((ends[w] * span - t) * 1000) / rate
      last = t
      timer = setTimeout(tick, Math.max(LOOK_MIN_MS, Math.min(LOOK_MS, left + 1)))
    }
    tick()
    return () => clearTimeout(timer)
  }, [sys, on, dur, span, ends, text, rate])
  const lit = sys ? sysWord : at.of === text ? at.w : -1
  const ms = sys || !dur || lit < 0 ? UNTIMED_MS : Math.max(60, Math.round((says[lit] * span * 1000) / rate))
  return { ws, starts, lit, ms, shown: !!on && (sys || !!dur) }
}
