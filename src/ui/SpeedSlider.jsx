import { useEffect, useRef, useState } from 'react'
import { T } from '../theme.js'
import { haptic } from '../lib/haptics.js'
import { SPEED_MARKS, SPEED_MIN, SPEED_MAX, SPEED_STEP, speedToPlace, placeToSpeed, speedLabel } from '../lib/speed.js'

// The listening speed as one thing to drag: a bar that fills, like the brightness of a phone. It was a list
// of eight fixed speeds and two "a little slower / faster" rows.
//   the bar     as tall as a finger, filled to where the speed is; a touch anywhere on it puts the speed there
//   the names   a few speeds named under it, each under its own place (the bar is not even: lib/speed.js)
// Under the drawing is the browser's own range control, unseen: it brings the keyboard, the screen reader and
// the touch handling with it.
//
// How it moves (the first one jumped from step to step: "did you forget about frame motion and smoothness to
// the bar", Tharun, 14 October 2026):
//   under the finger   the fill is exactly where the finger is, between the steps too: the speed goes in steps
//                      of 0.05, the bar does not
//   touched elsewhere  the fill glides to the finger
//   let go             it settles on the step it stands for; held, the bar swells a little, and lets go with it
//   by a key           it glides one step
// All of it is one transform on the fill and one on the bar, which the browser runs by itself: nothing here is
// started again while the finger moves (motion skill: an animation started several times a second is worked
// out by the page's own thread).
const STEPS = 1000 // the range control's own count along the bar
const BAR = 44
const EASE = `cubic-bezier(${T.ease.join(',')})`
const GLIDE = `transform 220ms ${EASE}` // to the finger, to the step, by a key
const SWELL = `transform 180ms ${EASE}`
const HELD = 'scale(1.015, 1.09)'

// value: the speed. onChange: while it is dragged. onSettle: when the finger or the key is let go.
export function SpeedSlider({ value, onChange, onSettle }) {
  const last = useRef(value)
  last.current = value // the speed may be set from elsewhere (Settings, another device): what is shown is what is compared
  // finger: where the finger is along the bar (0..1) while it is down, else null. follows: it has moved since
  // it came down, so the fill is under it and no longer gliding to it.
  const [touch, setTouch] = useState({ finger: null, follows: false })
  const place = speedToPlace(value)
  const set = speed => {
    if (speed === last.current) return
    if (speed === 1) haptic(8) // the voice's own pace: felt as it is passed
    last.current = speed
    onChange(speed)
  }
  const move = e => set(placeToSpeed(+e.target.value / STEPS))
  // A key moves it by one speed, not by one of the control's own thousand steps (a step that small is no
  // change of speed at all, and the keys did nothing).
  const KEYS = { ArrowLeft: -SPEED_STEP, ArrowDown: -SPEED_STEP, ArrowRight: SPEED_STEP, ArrowUp: SPEED_STEP, PageDown: -SPEED_STEP * 5, PageUp: SPEED_STEP * 5 }
  const key = e => {
    const to = e.key === 'Home' ? SPEED_MIN : e.key === 'End' ? SPEED_MAX : e.key in KEYS ? last.current + KEYS[e.key] : null
    if (to == null) return
    e.preventDefault()
    set(placeToSpeed(speedToPlace(to)))
  }
  const settle = () => onSettle?.(last.current)
  // Taken away while it is being moved (its popover closed by a key): what it stood at is still told.
  const leave = useRef(settle)
  leave.current = settle
  useEffect(() => () => leave.current(), [])
  const along = e => { const r = e.currentTarget.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) }
  const down = e => setTouch({ finger: along(e), follows: false })
  const drag = e => { if (touch.finger != null) setTouch({ finger: along(e), follows: true }) }
  const up = () => { setTouch({ finger: null, follows: false }); settle() }
  const held = touch.finger != null
  return (
    <div style={{ display: 'grid', gap: 8, fontFamily: T.font }}>
      <div style={{ position: 'relative', height: BAR, borderRadius: T.r.md, background: T.surfaceTop, overflow: 'hidden', transform: held ? HELD : 'none', transition: SWELL, willChange: 'transform' }}>
        <div aria-hidden="true" data-testid="speed-fill" style={{
          position: 'absolute', inset: 0, background: T.text, transformOrigin: 'left center', willChange: 'transform',
          transform: `scaleX(${held ? touch.finger : place})`, transition: held && touch.follows ? 'none' : GLIDE,
        }} />
        <input type="range" min={0} max={STEPS} step={1} value={Math.round(place * STEPS)} aria-label="Listening speed" aria-valuetext={speedLabel(value)}
          onChange={move} onKeyDown={key} onKeyUp={settle} onBlur={settle}
          onPointerDown={down} onPointerMove={drag} onPointerUp={up} onPointerCancel={up}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', margin: 0, opacity: 0, cursor: 'pointer', touchAction: 'none' }} />
      </div>
      <div aria-hidden="true" style={{ position: 'relative', height: 14, fontSize: 11.5, color: T.faint, fontVariantNumeric: 'tabular-nums' }}>
        {SPEED_MARKS.map((s, k) => {
          const at = speedToPlace(s)
          // the first and the last sit inside the bar's ends; the others are centred under their place
          const edge = k === 0 ? { left: 0 } : k === SPEED_MARKS.length - 1 ? { right: 0 } : { left: `${at * 100}%`, transform: 'translateX(-50%)' }
          return <span key={s} style={{ position: 'absolute', top: 0, ...edge, color: s === value ? T.text : T.faint, transition: 'color 160ms linear' }}>{speedLabel(s)}</span>
        })}
      </div>
    </div>
  )
}
