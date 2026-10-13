import { useRef } from 'react'
import { T } from '../theme.js'
import { haptic } from '../lib/haptics.js'
import { SPEED_MARKS, SPEED_MIN, SPEED_MAX, SPEED_STEP, speedToPlace, placeToSpeed, speedLabel } from '../lib/speed.js'

// The listening speed as one thing to drag: a bar that fills, like the brightness of a phone. It was a list
// of eight fixed speeds and two "a little slower / faster" rows.
//   the bar     as tall as a finger, filled to where the speed is; a touch anywhere on it puts the speed there
//   the names   a few speeds named under it, each under its own place (the bar is not even: lib/speed.js)
// Under the drawing is the browser's own range control, unseen: it brings the keyboard, the screen reader and
// the touch handling with it. What moves is one transform (the fill), so dragging costs the page nothing.
const STEPS = 1000 // the range control's own count along the bar
const BAR = 44

// value: the speed. onChange: while it is dragged. onSettle: when the finger or the key is let go.
export function SpeedSlider({ value, onChange, onSettle }) {
  const last = useRef(value)
  last.current = value // the speed may be set from elsewhere (Settings, another device): what is shown is what is compared
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
  return (
    <div style={{ display: 'grid', gap: 8, fontFamily: T.font }}>
      <div style={{ position: 'relative', height: BAR, borderRadius: T.r.md, background: T.surfaceTop, overflow: 'hidden' }}>
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: T.text, transformOrigin: 'left center', transform: `scaleX(${place})`, willChange: 'transform' }} />
        <input type="range" min={0} max={STEPS} step={1} value={Math.round(place * STEPS)} aria-label="Listening speed" aria-valuetext={speedLabel(value)}
          onChange={move} onKeyDown={key} onPointerUp={settle} onKeyUp={settle} onBlur={settle}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', margin: 0, opacity: 0, cursor: 'pointer', touchAction: 'none' }} />
      </div>
      <div aria-hidden="true" style={{ position: 'relative', height: 14, fontSize: 11.5, color: T.faint, fontVariantNumeric: 'tabular-nums' }}>
        {SPEED_MARKS.map((s, k) => {
          const at = speedToPlace(s)
          // the first and the last sit inside the bar's ends; the others are centred under their place
          const edge = k === 0 ? { left: 0 } : k === SPEED_MARKS.length - 1 ? { right: 0 } : { left: `${at * 100}%`, transform: 'translateX(-50%)' }
          return <span key={s} style={{ position: 'absolute', top: 0, ...edge, color: s === value ? T.text : undefined }}>{speedLabel(s)}</span>
        })}
      </div>
    </div>
  )
}
