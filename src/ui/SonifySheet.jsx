// "Hear this as sound": the numbers in a passage, drawn as bars and played as a line of tones.
// The parent passes the passage text; everything here is derived from it, no AI.
import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { T } from '../theme.js'
import { Button } from './kit.jsx'
import { numbersIn, toTones, describe, playTones } from '../lib/sonify.js'

const MIN_NUMBERS = 3
const BAR_AREA = 120 // px: the height the tallest bar fills
const BAR_STEP = 0.012 // s between one bar rising and the next: forty bars are all up in half a second
const BAR_FLOOR = 0.06 // the lowest bar is a sliver, so every tone still has a visible bar

const para = { fontSize: 13, lineHeight: 1.55, color: T.sub, margin: 0 }
const sentence = { fontSize: 16, lineHeight: 1.5, color: T.body, margin: 0 }
const bars = { display: 'flex', alignItems: 'flex-end', gap: 3, height: BAR_AREA }
// Only transform moves: the bar is drawn full height and scaled from its bottom edge.
const bar = { flex: 1, minWidth: 0, height: '100%', transformOrigin: 'bottom' }

export function SonifySheet({ text, values: given, from = 'passage' }) {
  const values = useMemo(() => given || numbersIn(text), [given, text])
  const tones = useMemo(() => toTones(values), [values])
  const summary = useMemo(() => describe(values), [values])
  const lo = useMemo(() => values.reduce((a, v) => Math.min(a, v), Infinity), [values])
  const hi = useMemo(() => values.reduce((a, v) => Math.max(a, v), -Infinity), [values])
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(-1)
  const run = useRef(null)

  // Changing the passage, or leaving the sheet, stops the sound.
  useEffect(() => () => { if (run.current) run.current.abort() }, [tones])

  if (values.length < MIN_NUMBERS) return <p style={para}>There are not enough numbers in this passage to play.</p>

  const play = () => {
    const controller = new AbortController()
    run.current = controller
    setPlaying(true)
    playTones(tones, { onTone: setCurrent, signal: controller.signal }).finally(() => {
      if (run.current !== controller) return
      run.current = null
      setPlaying(false)
      setCurrent(-1)
    })
  }
  const stop = () => { if (run.current) run.current.abort() }
  const heightOf = v => BAR_FLOOR + (1 - BAR_FLOOR) * (hi === lo ? 0.5 : (v - lo) / (hi - lo))

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <p style={sentence}>{summary}</p>
      <div aria-hidden="true" style={bars}>
        {tones.map((tone, i) => (
          <motion.div key={i} initial={{ scaleY: 0 }} animate={{ scaleY: heightOf(tone.value) }} transition={{ duration: 0.32, ease: T.ease, delay: i * BAR_STEP }}
            style={{ ...bar, background: i === current ? T.lime : T.sub }} />
        ))}
      </div>
      <div>
        <Button kind="primary" onClick={playing ? stop : play}>{playing ? 'Stop' : 'Play'}</Button>
      </div>
      <p style={para}>Higher pitch means a larger number. Made from the numbers in this {from}.</p>
    </div>
  )
}
