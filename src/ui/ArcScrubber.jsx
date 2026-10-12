// The player's progress line IS the book's emotional arc: it rises where the writing is brighter and falls
// where it is darker, the part already heard is white, and the dot rides the line. The mood of a book is a
// fact about its timeline, so it lives in the timeline, not on a screen of its own (design skill, question 5).
// A document too short for a shape, or not in English (the arc is counted from English words of feeling),
// gets a plain straight line: the same control, with nothing claimed.
import { useEffect, useId, useMemo, useState } from 'react'
import { T } from '../theme.js'
import { loadDoc } from '../lib/library.js'
import { toast } from '../lib/nav.js'

const H = 30 // px: the height the line has to move in
const MID = H / 2
const SWING = 11 // px above or below the middle at the brightest or darkest point
const VIEW_W = 1000 // the drawing's own width; it stretches to the bar
const SETTLE_MS = 700 // the arc reads the whole book once: after the player has arrived, not during
const TOLD_KEY = 'noesis.arc.told'
const HINT = 'The line follows the mood of the writing: up where it is brighter, down where it is darker.'
const TOLD = "The wavy line is the book's mood." // the one-time note: short enough never to be cut off
const ARC_MIN_SENTENCES = 120
const ARC_POINTS_MIN = 16
const ARC_POINTS_MAX = 64

const lines = new Map() // document -> its line, worked out once

function useArc(d) {
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
// the line's height at a share of the way through, for the dot
function heightAt(line, share) {
  if (!line?.length) return MID
  const at = share * line.length - 0.5
  const i = Math.max(0, Math.min(line.length - 1, Math.floor(at)))
  const j = Math.min(line.length - 1, i + 1)
  const f = Math.max(0, Math.min(1, at - i))
  return yOf(line[i].y + (line[j].y - line[i].y) * f)
}

// value and max are seconds. onChange while dragging, onCommit when the finger lifts or a key is released.
export function ArcScrubber({ d, value, max, disabled, onChange, onCommit }) {
  const line = useArc(d)
  const clip = useId().replace(/[^A-Za-z0-9_-]/g, '')
  const share = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  const path = useMemo(() => pathOf(line), [line])
  const stroke = { fill: 'none', strokeWidth: 2, vectorEffect: 'non-scaling-stroke', strokeLinecap: 'round', strokeLinejoin: 'round' }
  return (
    <div title={line?.length ? HINT : undefined} style={{ position: 'relative', flex: 1, minWidth: 0, height: H }}>
      <svg viewBox={`0 0 ${VIEW_W} ${H}`} preserveAspectRatio="none" width="100%" height={H} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
        <clipPath id={clip}><rect x="0" y={-H} width={share * VIEW_W} height={H * 3} /></clipPath>
        <path d={path} stroke={T.faint} {...stroke} />
        <path d={path} stroke={T.text} clipPath={`url(#${clip})`} {...stroke} />
      </svg>
      <div aria-hidden="true" style={{ position: 'absolute', left: `${share * 100}%`, top: heightAt(line, share), width: 12, height: 12, margin: '-6px 0 0 -6px', borderRadius: 12, background: T.text, boxShadow: `0 0 0 3px ${T.bg}`, pointerEvents: 'none' }} />
      {/* the real control: a slider nobody sees, so the keyboard, a finger and a screen reader all still work */}
      <input type="range" min={0} max={Math.max(1, Math.floor(max))} step={1} value={Math.floor(value)} aria-label="Position" disabled={disabled}
        onChange={e => onChange(+e.target.value)}
        onPointerUp={e => onCommit(+e.currentTarget.value)}
        onKeyUp={e => onCommit(+e.currentTarget.value)}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', margin: 0, opacity: 0, cursor: 'pointer' }} />
    </div>
  )
}
