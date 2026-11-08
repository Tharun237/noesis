// The room the text is read in, moving with the voice. Light behind the text in the colour of the writing's mood
// at the sentence being read, the same count as the player's line and Focus's light (ArcScrubber): amber where the
// writing is brighter than the book's usual, blue where darker, almost nothing where it is even. ("The background
// is a complete black. I want motion and colours according to the mood", then "it has no motion according to the
// words: flowing waves, higher tones, ripples", Tharun, 8 November 2026.) What each movement says:
//   the light    the mood of the passage; it drifts slowly while the voice reads and rests when it stops
//   the waves    the voice flowing: two bands at the foot of the screen, moving on while it reads
//   the swell    each word as it is said lifts the waves, higher for a heavier word (long, stressed, a ! or ?)
//   the ripple   a new sentence, or a word said with force, spreading out from the line being read
// Cost (the motion skill's rules): the drift and the flow are keyframe animations started once and paused when
// nothing is read (press.js); a swell and a ripple are the browser's own animations on ONE element each, never a
// new element per word; colours are repainted only when the mood moves a whole step. For someone who asked for
// less motion, the swells and ripples are not played at all.
import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { T } from '../theme.js'
import { useArc, moodAt, moodColour } from './ArcScrubber.jsx'
import { useLitWord } from './litword.js'

const STEPS = 8 // the mood in eighths: finer, the light would be repainted at nearly every sentence for nothing
const EVEN = 0.06 // the light's strength at its centre where the writing is even (barely there)...
const FELT = 0.22 // ...and how much stronger at its brightest or darkest; it lies at the edges, the text column stays dark
const CHANGE_S = 1.8 // one mood fading into the next: slower than reading, so it is felt rather than seen
const WAVE_H = '24vh' // the waves' band at the foot of the screen (above the player), under the line being read
const WAVE_ALPHA = 0.3 // the waves' strongest colour: white text over them keeps more than 10:1 contrast
const LIFT = 0.55 // how much the heaviest word lifts the waves (a share of their height)
const RIPPLE_MS = 1800 // a sentence's ripple spreading out; a forceful word's is two thirds of it
const LINE_AT = 38 // percent down the screen: where the line being read is kept (PageView FOLLOW_AT)
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches

// How heavy a word is when said, 0 to 1: its length, and a stress the text marks (capitals, ! or ?, a pause after it).
export function weightOf(w = '') {
  const letters = w.replace(/[^\p{L}\p{N}]/gu, '')
  const caps = letters.length > 1 && letters === letters.toUpperCase() && /\p{Lu}/u.test(letters)
  return Math.min(1, Math.min(letters.length, 10) / 14 + (/[!?]/.test(w) ? 0.45 : 0) + (caps ? 0.4 : 0) + (/[,;:.…—]["”')]?$/.test(w) ? 0.12 : 0))
}
export const forceful = w => /[!?]/.test(w) || weightOf(w) >= 0.8

// one band of waves: a tile that repeats seamlessly (four half-waves), filled with the mood's colour
const wave = (v, alpha, height) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 200' preserveAspectRatio='none'><defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${moodColour(v, alpha)}'/><stop offset='1' stop-color='${moodColour(v, alpha * 0.25)}'/></linearGradient></defs><path d='M0 ${200 - height} Q150 ${200 - height * 1.6} 300 ${200 - height} T600 ${200 - height} T900 ${200 - height} T1200 ${200 - height} V200 H0 Z' fill='url(#g)'/></svg>`)}")`

function ripple(el, ms) {
  if (!el) return
  el.getAnimations().forEach(a => a.cancel())
  el.animate([{ transform: 'scale(0.25)', opacity: 0.6 }, { transform: 'scale(1.7)', opacity: 0 }], { duration: ms, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' })
}

export function MoodLight({ d, doc, active, reading, spoken }) {
  const line = useArc(d)
  const swell = useRef(null)
  const ring = useRef(null)
  const { ws, lit, ms } = useLitWord(spoken?.text, spoken?.dur, spoken?.tail, !!reading && !!spoken)
  // a word said: the waves rise with it and settle; a forceful one also sends out a ripple
  useEffect(() => {
    if (!reading || lit < 0 || !swell.current || still()) return
    const w = ws[lit]
    swell.current.getAnimations().forEach(a => a.cancel())
    swell.current.animate([{ transform: 'scaleY(1)' }, { transform: `scaleY(${1 + LIFT * weightOf(w)})`, offset: 0.3 }, { transform: 'scaleY(1)' }], { duration: Math.max(320, ms * 1.8), easing: 'ease-out' })
    if (lit > 0 && forceful(w)) ripple(ring.current, RIPPLE_MS * 0.66)
  }, [lit, spoken?.text]) // eslint-disable-line react-hooks/exhaustive-deps
  // a new sentence: a ripple from the line being read
  useEffect(() => { if (reading && spoken?.text && !still()) ripple(ring.current, RIPPLE_MS) }, [spoken?.text]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!line || !doc?.segs?.length) return null // the mood is counted for English writing long enough to have one
  const at = active >= 0 ? active : d.pos || 0
  const mood = Math.round(moodAt(line, doc.segs.length > 1 ? at / (doc.segs.length - 1) : 0) * STEPS) / STEPS
  const felt = Math.min(1, Math.abs(mood)) ** 0.6
  const glow = EVEN + FELT * felt
  const run = { animationPlayState: reading ? 'running' : 'paused' }
  const light = (alpha, place) => ({ position: 'absolute', ...place, borderRadius: '50%', background: `radial-gradient(closest-side, ${moodColour(mood, alpha)}, ${moodColour(mood, alpha / 3)} 55%, ${moodColour(mood, 0)})`, ...run })
  const band = (alpha, height) => ({ position: 'absolute', left: 0, bottom: 0, width: '200%', height: '100%', backgroundImage: wave(mood, alpha, height), backgroundSize: '50% 100%', backgroundRepeat: 'repeat-x', ...run })
  return (
    <motion.div aria-hidden initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: CHANGE_S, ease: T.ease }}
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      <AnimatePresence initial={false}>
        <motion.div key={mood} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: CHANGE_S, ease: 'easeInOut' }} style={{ position: 'absolute', inset: 0 }}>
          <div data-drift="" style={light(glow, { left: '-25%', top: '-20%', width: '95%', height: '85%' })} />
          <div data-drift="slow" style={light(glow * 0.7, { right: '-30%', bottom: '-25%', width: '100%', height: '90%' })} />
        </motion.div>
      </AnimatePresence>
      {/* the waves keep one element through every mood, so a word's swell is never cut off by a change of colour */}
      <div ref={swell} style={{ position: 'absolute', left: 0, right: 0, bottom: 'var(--dock, 0px)', height: WAVE_H, transformOrigin: '50% 100%', opacity: 0.55 + 0.45 * felt }}>
        <div data-flow="" style={band(WAVE_ALPHA, 46)} />
        <div data-flow="back" style={band(WAVE_ALPHA * 0.7, 70)} />
      </div>
      <div ref={ring} style={{ position: 'absolute', left: '50%', top: `${LINE_AT}%`, width: '70vmin', height: '70vmin', margin: '-35vmin 0 0 -35vmin', borderRadius: '50%', border: `2px solid ${moodColour(mood, 0.6)}`, background: `radial-gradient(closest-side, transparent 55%, ${moodColour(mood, 0.16)})`, opacity: 0 }} />
    </motion.div>
  )
}
