// The player's progress line IS the book's emotional arc: it rises and warms (amber) where the writing is
// brighter, falls and cools (blue) where it is darker, with the space between the line and the middle
// filled in, so the book's weather can be seen ahead. The part already heard is lit, what is to come is dim,
// and the dot rides the line in the colour of the feeling it is passing through. (It was a thin grey and
// white line: "just a curving bar", Tharun, 2026-10-12. A feeling needs colour and body, not only height.) The mood of a book is a
// fact about its timeline, so it lives in the timeline, not on a screen of its own (design skill, question 5).
// A document too short for a shape, or not in English (the arc is counted from English words of feeling),
// gets a plain straight line: the same control, with nothing claimed.
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { T } from '../theme.js'
import { loadDoc } from '../lib/library.js'
import { toast } from '../lib/nav.js'

const H = 30 // px: the height the line has to move in
const MID = H / 2
const SWING = 11 // px above or below the middle at the brightest or darkest point
const VIEW_W = 1000 // the drawing's own width; it stretches to the bar
const SETTLE_MS = 700 // the arc reads the whole book once: after the player has arrived, not during
const TOLD_KEY = 'noesis.arc.told.colour'
const HINT = 'The line follows the mood of the writing: warm and high where it is brighter, blue and low where it is darker.'
const TOLD = "The line is the book's mood: warm is brighter, blue is darker." // the one-time note: short enough never to be cut off
const FEELS_AT = 0.3 // nearer the middle than this, the writing is neither: "even"

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
const BRIGHT = rgb(T.mood.bright), CALM = rgb(T.mood.calm), DARK = rgb(T.mood.dark)
// the colour of a feeling, from -1 (dark) to 1 (bright): it leaves white quickly, so a mild mood still shows
// (`alpha` for a light of that colour rather than a line of it: Focus)
export const moodColour = (v, alpha = 1) => { const to = v >= 0 ? BRIGHT : DARK, f = Math.min(1, Math.abs(v)) ** 0.6; return `rgb(${CALM.map((c, i) => Math.round(c + (to[i] - c) * f)).join(' ')} / ${alpha})` }
const moodWord = v => (v > FEELS_AT ? 'Brighter' : v < -FEELS_AT ? 'Darker' : 'Even')
const ARC_MIN_SENTENCES = 120
const ARC_POINTS_MIN = 16
const ARC_POINTS_MAX = 64
const PX_A_POINT = 20 // a rise or a fall needs this much room to read as a feeling; closer, it is a scribble

// The line with as many points as its width can carry: neighbours are averaged together. (On a phone the
// player's line is 220 px wide: 64 points there was a zigzag, not a mood.)
function fit(line, width) {
  const n = Math.max(6, Math.floor(width / PX_A_POINT))
  if (!line?.length || !width || line.length <= n) return line
  const few = Array.from({ length: n }, (_, k) => {
    const part = line.slice(Math.floor((k * line.length) / n), Math.floor(((k + 1) * line.length) / n))
    return { x: (k + 0.5) / n, y: part.reduce((a, q) => a + q.y, 0) / part.length }
  })
  // averaging flattens: give the line back the swing it had, so the narrow one feels as much as the wide one
  const swing = v => Math.max(...v.map(q => Math.abs(q.y)))
  const had = swing(line), has = swing(few)
  return has > 0 ? few.map(q => ({ x: q.x, y: (q.y / has) * had })) : few
}

const lines = new Map() // document -> its line, worked out once

export function useArc(d) {
  const english = (d.lang || 'en') === 'en' && !d.foreign
  const key = english ? `${d.id}:${d.contentVer || 0}:${d.total || 0}` : null
  const [line, setLine] = useState(() => (key && lines.get(key)) || null)
  useEffect(() => {
    if (!key) { setLine(null); return undefined }
    if (lines.has(key)) { setLine(lines.get(key)); return undefined }
    setLine(null)
    let live = true
    const timer = setTimeout(async () => {
      // the word lists behind the arc are large: fetched when a line is first drawn, not with the app
      const [c, { arcLine }] = await Promise.all([loadDoc(d.id), import('../lib/insights.js')])
      if (!c) return
      // A short document gets a plain line (a mood drawn from a few dozen sentences is noise); a long one
      // gets more points, up to a limit the eye can still read as one curve.
      const made = c.segs.length < ARC_MIN_SENTENCES ? [] : arcLine(c.segs.map(s => s.t), Math.max(ARC_POINTS_MIN, Math.min(ARC_POINTS_MAX, Math.round(c.segs.length / 12))))
      lines.set(key, made)
      if (!live) return
      setLine(made)
      // said once, the first time a line with a shape is shown: a wavy progress bar needs one sentence
      if (made.length && !localStorage.getItem(TOLD_KEY)) { localStorage.setItem(TOLD_KEY, '1'); toast(TOLD) }
    }, SETTLE_MS)
    return () => { live = false; clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return line
}

const yOf = v => MID - v * SWING
// a smooth curve through the points: each point is a control point, the curve passes through the midpoints
function pathOf(line) {
  if (!line?.length) return `M0 ${MID} L${VIEW_W} ${MID}`
  const p = line.map(q => [q.x * VIEW_W, yOf(q.y)])
  let d = `M0 ${p[0][1].toFixed(1)} L${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`
  for (let i = 1; i < p.length; i++) d += ` Q${p[i - 1][0].toFixed(1)} ${p[i - 1][1].toFixed(1)} ${((p[i - 1][0] + p[i][0]) / 2).toFixed(1)} ${((p[i - 1][1] + p[i][1]) / 2).toFixed(1)}`
  const last = p[p.length - 1]
  return `${d} L${last[0].toFixed(1)} ${last[1].toFixed(1)} L${VIEW_W} ${last[1].toFixed(1)}`
}
// the feeling (-1..1) at a share of the way through: where the dot sits and what colour it is
export function moodAt(line, share) {
  if (!line?.length) return 0
  const at = share * line.length - 0.5
  const i = Math.max(0, Math.min(line.length - 1, Math.floor(at)))
  const j = Math.min(line.length - 1, i + 1)
  const f = Math.max(0, Math.min(1, at - i))
  return line[i].y + (line[j].y - line[i].y) * f
}

// value and max are seconds. onChange while dragging, onCommit when the finger lifts or a key is released.
export function ArcScrubber({ d, value, max, disabled, onChange, onCommit }) {
  const whole = useArc(d)
  const box = useRef(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const seen = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)))
    seen.observe(box.current)
    return () => seen.disconnect()
  }, [])
  const line = useMemo(() => fit(whole, width), [whole, width])
  const id = useId().replace(/[^A-Za-z0-9_-]/g, '')
  const [held, setHeld] = useState(false) // a finger is on it: the dot grows and says what the writing feels like there
  const share = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  const path = useMemo(() => pathOf(line), [line])
  const felt = !!line?.length // a document with no shape gets a plain line: nothing is claimed
  const mood = moodAt(line, share)
  const colour = felt ? moodColour(mood) : T.text
  const paint = felt ? `url(#${id}-mood)` : null
  const stroke = { fill: 'none', strokeWidth: 2, vectorEffect: 'non-scaling-stroke', strokeLinecap: 'round', strokeLinejoin: 'round' }
  const body = `${path} L${VIEW_W} ${MID} L0 ${MID} Z` // between the line and the middle: hills of brightness, valleys of dark
  const commit = e => { setHeld(false); onCommit(+e.currentTarget.value) }
  return (
    <div ref={box} title={felt ? HINT : undefined} style={{ position: 'relative', flex: 1, minWidth: 0, height: H }}>
      <svg viewBox={`0 0 ${VIEW_W} ${H}`} preserveAspectRatio="none" width="100%" height={H} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          {felt && (
            <linearGradient id={`${id}-mood`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={VIEW_W} y2="0">
              {line.map(p => <stop key={p.x} offset={p.x} stopColor={moodColour(p.y)} />)}
            </linearGradient>
          )}
          <clipPath id={`${id}-heard`}><rect x="0" y={-H} width={share * VIEW_W} height={H * 3} /></clipPath>
        </defs>
        {/* what is to come: the whole book's weather, dim */}
        {felt && <path d={body} fill={paint} opacity="0.1" />}
        <path d={path} stroke={paint || T.faint} opacity={felt ? 0.4 : 1} {...stroke} />
        {/* what has been heard: lit */}
        <g clipPath={`url(#${id}-heard)`}>
          {felt && <path d={body} fill={paint} opacity="0.3" />}
          <path d={path} stroke={paint || T.text} {...stroke} strokeWidth={felt ? 2.5 : 2} />
        </g>
      </svg>
      <div aria-hidden="true" style={{
        position: 'absolute', left: `${share * 100}%`, top: yOf(mood), width: 12, height: 12, margin: '-6px 0 0 -6px', borderRadius: 12, background: colour,
        boxShadow: `0 0 0 3px ${T.bg}`, transform: held ? 'scale(1.35)' : 'none', transition: 'transform 160ms cubic-bezier(0.22,1,0.36,1)', pointerEvents: 'none',
      }} />
      {felt && held && (
        // beside the dot, on the side with room, and inside the line's own height: above it is the page
        <div aria-hidden="true" style={{
          position: 'absolute', top: MID - 9, height: 18, padding: '0 7px', borderRadius: 9, background: T.bg, display: 'flex', alignItems: 'center',
          ...(share > 0.5 ? { right: `calc(${(1 - share) * 100}% + 16px)` } : { left: `calc(${share * 100}% + 16px)` }),
          fontFamily: T.font, fontSize: 12.5, fontWeight: 600, color: colour, whiteSpace: 'nowrap', pointerEvents: 'none',
        }}>
          {moodWord(mood)}
        </div>
      )}
      {/* the real control: a slider nobody sees, so the keyboard, a finger and a screen reader all still work */}
      <input type="range" min={0} max={Math.max(1, Math.floor(max))} step={1} value={Math.floor(value)} aria-label="Position" disabled={disabled}
        aria-valuetext={felt ? `${moodWord(mood)} writing here` : undefined}
        onChange={e => { setHeld(true); onChange(+e.target.value) }}
        onPointerDown={() => setHeld(true)}
        onPointerUp={commit}
        onPointerCancel={() => setHeld(false)}
        onBlur={() => setHeld(false)}
        onKeyUp={commit}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', margin: 0, opacity: 0, cursor: 'pointer' }} />
    </div>
  )
}
