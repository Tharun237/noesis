// The room the text is read in: light behind it in the colour of the writing's mood at the sentence being read,
// the same count as the player's line and Focus's light (ArcScrubber). Amber where the writing is brighter than
// the book's usual, blue where darker, almost nothing where it is even: the text stays the subject. ("The
// background behind the text is a complete black. I want it to have motion and colours according to the mood we
// already have at the line", Tharun, 8 November 2026.)
//
// Cost: one layer fixed to the screen. Its two lights drift by transform only, one keyframe animation each,
// started once and paused when nothing is read (press.js, [data-drift]). Its colour is repainted only when the
// mood moves a whole step, once a sentence at most, and a new colour arrives as a slow fade over the old.
import { AnimatePresence, motion } from 'motion/react'
import { T } from '../theme.js'
import { useArc, moodAt, moodColour } from './ArcScrubber.jsx'

const STEPS = 8 // the mood in eighths: finer, the light would be repainted at nearly every sentence for nothing
const EVEN = 0.06 // the light's strength at its centre where the writing is even (barely there)...
const FELT = 0.22 // ...and how much stronger at its brightest or darkest; it lies at the edges, the text column stays dark
const CHANGE_S = 1.8 // one mood fading into the next: slower than reading, so it is felt rather than seen

export function MoodLight({ d, doc, active, reading }) {
  const line = useArc(d)
  if (!line || !doc?.segs?.length) return null // the mood is counted for English writing long enough to have one
  const at = active >= 0 ? active : d.pos || 0
  const mood = Math.round(moodAt(line, doc.segs.length > 1 ? at / (doc.segs.length - 1) : 0) * STEPS) / STEPS
  const glow = EVEN + FELT * Math.min(1, Math.abs(mood)) ** 0.6
  const light = (alpha, place) => ({ position: 'absolute', ...place, borderRadius: '50%', background: `radial-gradient(closest-side, ${moodColour(mood, alpha)}, ${moodColour(mood, alpha / 3)} 55%, ${moodColour(mood, 0)})`, animationPlayState: reading ? 'running' : 'paused' })
  return (
    <motion.div aria-hidden initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: CHANGE_S, ease: T.ease }}
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      <AnimatePresence initial={false}>
        <motion.div key={mood} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: CHANGE_S, ease: 'easeInOut' }} style={{ position: 'absolute', inset: 0 }}>
          <div data-drift="" style={light(glow, { left: '-25%', top: '-20%', width: '95%', height: '85%' })} />
          <div data-drift="slow" style={light(glow * 0.7, { right: '-30%', bottom: '-25%', width: '100%', height: '90%' })} />
        </motion.div>
      </AnimatePresence>
    </motion.div>
  )
}
