import { createContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, useDragControls, useMotionValue, useSpring, useTransform } from 'motion/react'
import { T, label } from '../theme.js'
import { Icon } from './icons.jsx'
import { reducedMotion } from '../lib/motion.js'
import { during } from '../lib/nav.js'
import { menuRow } from './press.js' // the style sheet behind data-press, data-ico, data-rise, Swap

// Shared primitives. Motion is transform/opacity only (GPU-composited); no layout properties animate.

// Text that changes in place (Play to Stop, a status, a count) slides to its new value instead of blinking.
// Nothing moves the first time it is shown; only a change does (the style sheet in press.js).
export function Swap({ children }) {
  const last = useRef(children)
  const turn = useRef(0)
  if (last.current !== children) { last.current = children; turn.current++ }
  return (
    <span style={{ display: 'inline-grid', overflow: 'hidden', verticalAlign: 'bottom' }}>
      <span key={turn.current} data-swap={turn.current ? '' : undefined}>{children}</span>
    </span>
  )
}

// A drawing (a chart, a map) is uncovered from left to right when it appears: a cover the colour of the
// sheet slides off it. Only for drawings that sit on the plain black of a page or sheet.
export function Reveal({ children, style }) {
  return (
    <div style={{ position: 'relative', overflow: 'hidden', ...style }}>
      {children}
      <motion.span aria-hidden="true" initial={{ x: 0 }} animate={{ x: '102%' }} transition={{ duration: 0.8, ease: T.ease, delay: 0.12 }}
        style={{ position: 'absolute', inset: 0, background: T.bg, pointerEvents: 'none' }} />
    </div>
  )
}

// A tap is answered at once. If what a button does takes time (its handler hands back a promise), the button
// itself shows that it is working, from the moment that becomes worth saying until the work is over, and it
// cannot be pressed again meanwhile. No screen has to remember to do this: Tharun pressed "preview" on a
// voice, saw nothing for twenty seconds, and could not tell a working app from a dead one (2026-10-12).
// What the work IS (a download, how far along) is still for the screen to say, in words, beside it.
const BUSY_AFTER_MS = 140 // quicker than this needs no sign: a flash of one would be noise
export function useBusy(onClick) {
  const [busy, setBusy] = useState(false)
  const here = useRef(true)
  useEffect(() => { here.current = true; return () => { here.current = false } }, [])
  const run = e => {
    if (busy) return
    const work = onClick?.(e)
    if (!work || typeof work.then !== 'function') return
    const sign = setTimeout(() => here.current && setBusy(true), BUSY_AFTER_MS)
    const over = () => { clearTimeout(sign); if (here.current) setBusy(false) }
    work.then(over, err => { over(); throw err }) // a failure is still a failure for whoever is watching for one
  }
  return [busy, run]
}
// The sign itself: a ring that turns, in the colour of the text around it.
export function Working({ size = 16 }) {
  return <span data-spin aria-hidden style={{ width: size, height: size, boxSizing: 'border-box', borderRadius: T.r.pill, border: '2px solid currentColor', borderTopColor: 'transparent', opacity: 0.85, flexShrink: 0 }} />
}

export function Button({ children, onClick, kind = 'ghost', icon, disabled, full, type = 'button', style, title, busy: told }) {
  const [own, run] = useBusy(onClick)
  const busy = told || own
  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 40, padding: '0 16px',
    borderRadius: T.r.pill, border: `1px solid ${T.border}`, background: T.surface, color: T.text,
    fontFamily: T.font, fontSize: 14, fontWeight: 600, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1,
    width: full ? '100%' : undefined, whiteSpace: 'nowrap', flexShrink: 0,
  }
  const kinds = {
    primary: { background: T.text, color: T.bg, border: `1px solid ${T.text}` },
    accent: { background: T.lime, color: T.accentInk, border: `1px solid ${T.lime}` }, // the one decisive action on a screen
    danger: { color: T.danger, border: `1px solid ${T.border}` },
    ghost: {},
  }
  return (
    <button type={type} title={title} onClick={run} disabled={disabled} aria-busy={busy || undefined} data-press="" style={{ ...base, ...kinds[kind], ...style, ...(busy ? { pointerEvents: 'none' } : {}) }}>
      {busy ? <Working size={15} /> : icon && <Icon name={icon} size={17} />}
      {typeof children === 'string' ? <Swap>{children}</Swap> : children}
    </button>
  )
}

export function IconButton({ icon, onClick, label: aria, size = 40, iconSize = 20, active, style, fill, busy: told }) {
  const [own, run] = useBusy(onClick)
  const busy = told || own
  return (
    <button type="button" aria-label={aria} title={aria} onClick={run} aria-busy={busy || undefined} data-press=""
      style={{
        '--press': T.tap.icon,
        width: size, height: size, borderRadius: T.r.pill, border: 'none', display: 'grid', placeItems: 'center', cursor: 'pointer',
        background: active ? T.accentSoft : 'transparent', color: active ? T.accent : T.text, flexShrink: 0, padding: 0, ...style,
      }}>
      {busy ? <Working size={Math.round(iconSize * 0.8)} /> : <Icon name={icon} size={iconSize} fill={fill} />}
    </button>
  )
}

const SEG_GAP = 4 // px between the segments, and between them and the rim

export function Segmented({ options, value, onChange, disabled = [], size = 'md' }) {
  const n = options.length
  const at = options.findIndex(o => o.value === value)
  return (
    <div role="tablist" style={{ position: 'relative', display: 'flex', gap: SEG_GAP, padding: SEG_GAP, borderRadius: T.r.pill, background: T.surface, border: `1px solid ${T.border}` }}>
      {/* The white pill is one object. Every segment is the same width, so where it sits is arithmetic: its
          own width plus a gap, times the place of the choice (press.js, data-slide). */}
      {at >= 0 && (
        <span aria-hidden data-slide="" style={{
          position: 'absolute', top: SEG_GAP, bottom: SEG_GAP, left: SEG_GAP, width: `calc((100% - ${SEG_GAP * (n + 1)}px) / ${n})`,
          borderRadius: T.r.pill, background: T.text, transform: `translateX(calc(${at} * (100% + ${SEG_GAP}px)))`,
        }} />
      )}
      {options.map(o => {
        const on = o.value === value
        const off = disabled.includes(o.value)
        return (
          <button key={o.value} role="tab" aria-selected={on} disabled={off} onClick={() => onChange(o.value)} type="button" data-slide-ink=""
            style={{
              position: 'relative', flex: 1, minWidth: 0, height: size === 'sm' ? 30 : 36, border: 'none', borderRadius: T.r.pill, background: 'transparent',
              color: on ? T.bg : off ? T.faint : T.sub, fontFamily: T.font, fontSize: 13, fontWeight: 600, cursor: off ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '0 4px', whiteSpace: 'nowrap',
            }}>
            {o.icon && <Icon name={o.icon} size={15} />}{o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Toggle({ checked, onChange, labelText, hint, disabled }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 14, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{labelText}</div>
        {hint && <div style={{ fontSize: 12.5, color: T.sub, marginTop: 3, lineHeight: 1.45 }}>{hint}</div>}
      </div>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)}
        style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }} />
      <span aria-hidden style={{ width: 44, height: 26, borderRadius: T.r.pill, background: checked ? T.accent : T.surfaceTop, position: 'relative', flexShrink: 0 }}>
        <motion.span animate={{ x: checked ? 18 : 0 }} transition={T.spring}
          style={{ position: 'absolute', top: 3, left: 3, width: 20, height: 20, borderRadius: T.r.pill, background: checked ? T.accentInk : T.text }} />
      </span>
    </label>
  )
}

export function Field({ title, children, hint }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {title && <div style={label}>{title}</div>}
      {children}
      {hint && <div style={{ fontSize: 12.5, color: T.sub, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  )
}

export const inputStyle = {
  width: '100%', height: 46, padding: '0 14px', borderRadius: T.r.md, border: `1px solid ${T.border}`, background: T.surface,
  color: T.text, fontFamily: T.font, fontSize: 15, outline: 'none',
}

// `unknown`: the work has no known length, so the bar sweeps instead of showing a made-up amount.
export function Progress({ value, height = 3, color = T.accent, track = T.surfaceHi, unknown }) {
  return (
    <div style={{ height, borderRadius: height, background: track, overflow: 'hidden' }}>
      {unknown
        ? <motion.div key="sweep" animate={{ x: ['-100%', '300%'] }} transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }} style={{ height: '100%', width: '34%', background: color }} />
        : <motion.div key="fill" initial={false} animate={{ scaleX: Math.max(0, Math.min(1, value || 0)) }} transition={{ duration: T.dur.base, ease: T.ease }}
        style={{ height: '100%', background: color, transformOrigin: '0 50%' }} />}
    </div>
  )
}

// Anything that arrives after the screen is already showing (an answer, an error, a status line) rises in:
// the eye is told something new is here, instead of the layout just jumping.
export function Appear({ as: Tag = 'div', children, style }) {
  return <Tag data-rise="0" style={style}>{children}</Tag>
}

// Rows of a list that has just appeared come in one after another, and only the first few are held back
// (T.enter): a long list must never make anyone wait. Spread onto any element: <button {...rowIn(i)}>.
// It is one attribute; the style sheet in press.js does the moving.
export const rowIn = i => ({ 'data-rise': String(Math.min(i, T.enter.held)) })

// A number that counts up to its value when it appears and glides when it changes, so a total reads as
// something that was added up. Written straight to the page (no renders).
export function Count({ value, format = Math.round }) {
  const n = useSpring(0, { visualDuration: 0.7, bounce: 0 })
  const text = useTransform(n, v => format(v))
  useEffect(() => { reducedMotion() ? n.jump(value) : n.set(value) }, [n, value])
  return <motion.span>{text}</motion.span>
}

// The dot beside something that is still working. It pulses for as long as it is on screen, so it is the
// style sheet's job (press.js), not a script's on every frame.
export function Pulse({ color = T.lime }) {
  return <span data-pulse="" style={{ width: 6, height: 6, borderRadius: 6, background: color, display: 'inline-block', flexShrink: 0 }} />
}

// Bottom sheet on phones, centred dialog on wide screens. Escape and backdrop close it.
//
// How it arrives is ONE `transform` on its holder, which the browser's compositor runs by itself: the sheet
// keeps moving smoothly while what is inside it is still being built. (It was `y`, animated by script on the
// thread that was busy building the contents: on a phone the sheet came up in jerks. Pages were mended the
// same way, App.jsx.) The pull-down on a phone is a second, inner element with its own `y`, so dragging and
// arriving never fight over one value. At rest the holder's transform is taken off.
//
// SheetLanded tells what is inside when the sheet has come to rest: a long page builds what is further down
// then, not while the sheet is moving.
export const SheetLanded = createContext(true)
const SHEET_IN = { duration: 0.42, ease: T.enter.ease }
const SHEET_OUT = { duration: 0.24, ease: 'easeIn' }

export function Sheet({ open, onClose, children, wide, width = 560, title }) {
  // On a phone the sheet is pulled down by its handle to close, like every native sheet. Only the handle
  // starts the drag, so scrolling the sheet's contents is never mistaken for it.
  const pull = useDragControls()
  // The dark behind the sheet lightens as the sheet is pulled away: the page underneath is coming back.
  const y = useMotionValue(0)
  const dim = useTransform(y, v => (typeof v === 'number' ? 1 - Math.min(0.6, Math.max(0, v) / 420) : 1))
  const [landed, setLanded] = useState(false)
  useEffect(() => {
    if (!open) { setLanded(false); return }
    y.set(0) // a sheet closed by pulling it down opens again where a sheet rests
    const k = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open, onClose, y])
  return (
    <AnimatePresence>
      {open && (
        <motion.div key="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1, pointerEvents: 'auto' }} exit={{ opacity: 0, pointerEvents: 'none' }} transition={{ duration: T.dur.fast }} // a sheet that is closing takes no more taps
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: wide ? 'center' : 'flex-end', justifyContent: 'center', padding: wide ? 24 : 0 }}>
          <motion.div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: T.scrim, opacity: wide ? 1 : dim }} />
          <motion.div onClick={e => e.stopPropagation()}
            initial={wide ? { opacity: 0, transform: 'translateY(16px) scale(0.98)' } : { transform: 'translateY(100%) scale(1)' }}
            animate={{ ...(wide ? { opacity: 1 } : {}), transform: 'translateY(0px) scale(1)', transition: SHEET_IN, transitionEnd: { transform: 'none' } }}
            exit={{ ...(wide ? { opacity: 0, transform: ['translateY(0px) scale(1)', 'translateY(12px) scale(0.98)'] } : { transform: ['translateY(0%) scale(1)', 'translateY(100%) scale(1)'] }), transition: SHEET_OUT }}
            onAnimationComplete={() => setLanded(true)}
            style={{ position: 'relative', width: wide ? width : '100%', maxWidth: '100%', willChange: 'transform' }}>
            <motion.div role="dialog" aria-modal="true" aria-label={title}
              drag={wide ? false : 'y'} dragControls={pull} dragListener={false} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.7 }}
              onDragEnd={(e, info) => { if (info.offset.y > 110 || info.velocity.y > 600) onClose() }}
              style={{
                y, position: 'relative',
                maxHeight: wide ? 'calc(100dvh - 48px)' : '92dvh', overflowY: 'auto', overflowX: 'hidden',
                background: T.bg, border: `1px solid ${T.borderHi}`, borderRadius: wide ? T.r.xl : `${T.r.xl}px ${T.r.xl}px 0 0`,
                borderBottom: wide ? undefined : 'none', paddingBottom: wide ? 0 : 'env(safe-area-inset-bottom)',
                boxShadow: '0 30px 80px rgba(0,0,0,0.8)',
              }}>
              {!wide && (
                <div onPointerDown={e => pull.start(e)} aria-hidden="true" style={{ padding: '10px 0 12px', margin: '0 auto -12px', width: 120, cursor: 'grab', touchAction: 'none' }}>
                  <div style={{ width: 40, height: 4, borderRadius: 4, background: T.surfaceTop, margin: '0 auto' }} />
                </div>
              )}
              {/* What is inside settles a moment after the sheet itself: the sheet arrives, then its content. */}
              <SheetLanded.Provider value={landed}><div data-rise="sheet" style={{ minWidth: 0, maxWidth: '100%' }}>{children}</div></SheetLanded.Provider>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Popover menu anchored to its trigger.
const MENU_W = 260
const EDGE = 8
const MENU_Z = 55 // over a sheet (50), whose buttons can open one; under the toast (60)

// Popover menu anchored to its trigger. On open it measures the room around the trigger and
// opens toward whichever side fits, so it never spills off-screen (e.g. the speed menu at the right edge).
export function Menu({ trigger, items, align = 'right', up = false }) {
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState({ side: align, up, maxH: 480, x: 0, y: 0 })
  const ref = useRef(null)
  const menu = useRef(null)
  const toggle = () => {
    if (!open && ref.current) {
      const r = ref.current.getBoundingClientRect()
      const fitsLeft = r.left + MENU_W <= innerWidth - EDGE // menu's left edge on the trigger's left
      const fitsRight = r.right - MENU_W >= EDGE
      const side = align === 'left' ? (fitsLeft || !fitsRight ? 'left' : 'right') : (fitsRight || !fitsLeft ? 'right' : 'left')
      const below = innerHeight - r.bottom - EDGE - 8
      const above = r.top - EDGE - 8
      const goUp = up ? above >= 200 || above > below : below < 200 && above > below
      // where it hangs, from the edges of the window: x from the side it is tied to, y from the top or the bottom
      setPlace({ side, up: goUp, maxH: Math.max(160, goUp ? above : below), x: side === 'left' ? r.left : innerWidth - r.right, y: (goUp ? innerHeight - r.top : r.bottom) + 8 })
    }
    setOpen(o => !o)
  }
  useEffect(() => {
    if (!open) return
    const close = e => { if (!ref.current?.contains(e.target) && !menu.current?.contains(e.target)) setOpen(false) }
    const key = e => e.key === 'Escape' && setOpen(false)
    // It is tied to where its button was: if the button moves (its page is scrolled, the window changes) the
    // menu goes. A button that stays put keeps its menu: the reader scrolls by itself under the player's.
    const was = ref.current.getBoundingClientRect()
    const moved = () => { const r = ref.current?.getBoundingClientRect(); if (!r || Math.abs(r.top - was.top) > 1 || Math.abs(r.left - was.left) > 1) setOpen(false) }
    document.addEventListener('pointerdown', close)
    window.addEventListener('keydown', key)
    window.addEventListener('scroll', moved, true)
    window.addEventListener('resize', moved)
    return () => { document.removeEventListener('pointerdown', close); window.removeEventListener('keydown', key); window.removeEventListener('scroll', moved, true); window.removeEventListener('resize', moved) }
  }, [open])
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {trigger(toggle, open)}
      {createPortal(<AnimatePresence>
        {open && (
          <motion.div ref={menu} role="menu" initial={{ opacity: 0, y: place.up ? 12 : -12, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1, transition: T.spring }}
            exit={{ opacity: 0, y: place.up ? 8 : -8, scale: 0.94, transition: { duration: 0.12, ease: 'easeIn' } }}
            style={{
              position: 'fixed', [place.side]: place.x, [place.up ? 'bottom' : 'top']: place.y, minWidth: 230, maxWidth: `min(${MENU_W + 60}px, calc(100vw - ${EDGE * 2}px))`,
              maxHeight: place.maxH, overflowY: 'auto', zIndex: MENU_Z,
              background: T.bg, border: `1px solid ${T.borderHi}`, borderRadius: T.r.lg, padding: 6,
              boxShadow: '0 24px 60px rgba(0,0,0,0.85)', transformOrigin: `${place.side} ${place.up ? 'bottom' : 'top'}`,
            }}>
            {items.filter(Boolean).map((it, i) => it === '-' ? <div key={i} style={{ height: 1, background: T.border, margin: '6px 4px' }} /> : it.heading ? (
              <div key={i} style={{ padding: '8px 12px 4px', fontFamily: T.font, fontSize: 12.5, fontWeight: 600, color: T.faint }}>{it.heading}</div>
            ) : (
              <button key={i} role="menuitem" type="button" disabled={it.disabled} data-press="" data-rise={menuRow(i)}
                onClick={() => { setOpen(false); const work = it.onClick(); if (typeof work?.then === 'function') during(it.doing || `${it.label}…`, work) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 12px', border: 'none', borderRadius: T.r.sm,
                  background: 'transparent', color: it.danger ? T.danger : T.text, fontFamily: T.font, fontSize: 14,
                  '--press': T.tap.row, opacity: it.disabled ? 0.4 : 1,
                  cursor: it.disabled ? 'default' : 'pointer', textAlign: 'left',
                }}
                onPointerEnter={e => { e.currentTarget.style.background = T.surfaceHi }}
                onPointerLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                {it.icon && <Icon name={it.icon} size={17} />}
                <span style={{ flex: 1 }}>{it.label}</span>
                {it.right && <span style={{ fontFamily: T.mono, fontSize: 12, color: T.sub, whiteSpace: 'nowrap', flexShrink: 0 }}>{it.right}</span>}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>, document.body)}
    </div>
  )
}

export const fmtTime = s => {
  if (!isFinite(s) || s < 0) s = 0
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60)
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}
// A length of time, to the minute. Under half a minute is said as that ("<1m"), never rounded up to a minute
// it was not (five seconds into a document read "1m heard"), and nothing at all is "0m".
export const fmtDur = s => {
  const mins = Math.round(s / 60)
  if (mins < 1) return s >= 1 ? '<1m' : '0m'
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`
}
