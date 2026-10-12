import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useDragControls, useMotionValue, useSpring, useTransform } from 'motion/react'
import { T, label } from '../theme.js'
import { Icon } from './icons.jsx'
import { reducedMotion } from '../lib/motion.js'

// Shared primitives. Motion is transform/opacity only (GPU-composited); no layout properties animate.

// A press is named ("tap", and "hover" on a computer) so that what is inside the button hears it too: the
// icon makes its own small movement (icons.jsx) while the button gives way.
const PRESS = { tap: { scale: T.tap.control } }
const PRESS_ICON = { tap: { scale: T.tap.icon } }
const PRESS_ROW = { tap: { scale: T.tap.row } }

// Text that changes in place (Play to Stop, a status, a count) slides to its new value instead of blinking.
// The old and the new share one cell, so nothing around them moves while they change.
export function Swap({ children }) {
  return (
    <span style={{ display: 'inline-grid', overflow: 'hidden', verticalAlign: 'bottom' }}>
      <AnimatePresence initial={false}>
        <motion.span key={String(children)} initial={{ y: '70%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '-70%', opacity: 0, transition: { duration: 0.12, ease: 'easeIn' } }}
          transition={{ duration: 0.2, ease: T.ease }} style={{ gridArea: '1 / 1' }}>{children}</motion.span>
      </AnimatePresence>
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

export function Button({ children, onClick, kind = 'ghost', icon, disabled, full, type = 'button', style, title }) {
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
    <motion.button type={type} title={title} onClick={onClick} disabled={disabled} variants={PRESS} whileTap={disabled ? undefined : 'tap'} whileHover={disabled ? undefined : 'hover'}
      transition={T.press} style={{ ...base, ...kinds[kind], ...style }}>
      {icon && <Icon name={icon} size={17} />}
      {typeof children === 'string' ? <Swap>{children}</Swap> : children}
    </motion.button>
  )
}

export function IconButton({ icon, onClick, label: aria, size = 40, iconSize = 20, active, style, fill }) {
  return (
    <motion.button type="button" aria-label={aria} title={aria} onClick={onClick} variants={PRESS_ICON} whileTap="tap" whileHover="hover" transition={T.press}
      style={{
        width: size, height: size, borderRadius: T.r.pill, border: 'none', display: 'grid', placeItems: 'center', cursor: 'pointer',
        background: active ? T.accentSoft : 'transparent', color: active ? T.accent : T.text, flexShrink: 0, padding: 0, ...style,
      }}>
      <Icon name={icon} size={iconSize} fill={fill} />
    </motion.button>
  )
}

export function Segmented({ options, value, onChange, disabled = [], size = 'md' }) {
  return (
    <div role="tablist" style={{ display: 'flex', gap: 4, padding: 4, borderRadius: T.r.pill, background: T.surface, border: `1px solid ${T.border}` }}>
      {options.map(o => {
        const on = o.value === value
        const off = disabled.includes(o.value)
        return (
          <button key={o.value} role="tab" aria-selected={on} disabled={off} onClick={() => onChange(o.value)} type="button"
            style={{
              position: 'relative', flex: 1, height: size === 'sm' ? 30 : 36, border: 'none', borderRadius: T.r.pill, background: 'transparent',
              color: on ? T.bg : off ? T.faint : T.sub, fontFamily: T.font, fontSize: 13, fontWeight: 600, cursor: off ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '0 10px', whiteSpace: 'nowrap',
            }}>
            {on && <motion.span layoutId={'seg-' + options.map(x => x.value).join()} transition={T.spring}
              style={{ position: 'absolute', inset: 0, borderRadius: T.r.pill, background: T.text }} />}
            <span style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}>
              {o.icon && <Icon name={o.icon} size={15} />}{o.label}
            </span>
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

export function Progress({ value, height = 3, color = T.accent, track = T.surfaceHi }) {
  return (
    <div style={{ height, borderRadius: height, background: track, overflow: 'hidden' }}>
      <motion.div initial={false} animate={{ scaleX: Math.max(0, Math.min(1, value || 0)) }} transition={{ duration: T.dur.base, ease: T.ease }}
        style={{ height: '100%', background: color, transformOrigin: '0 50%' }} />
    </div>
  )
}

// Anything that arrives after the screen is already showing (an answer, an error, a status line) eases in:
// the eye is told something new is here, instead of the layout just jumping.
export function Appear({ as = 'div', children, style }) {
  const M = motion[as]
  return <M initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: T.ease }} style={style}>{children}</M>
}

// Rows of a list that has just appeared come in one after another, quickly, and only the first ten are held
// back: a long list must never make anyone wait. Spread onto a motion element: <motion.button {...rowIn(i)}>.
const ROW_STEP = 0.028
const ROWS_HELD = 10
// The delay belongs to the entrance alone, so a press on the row still answers at once.
export const rowIn = i => ({ initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: T.ease, delay: 0.06 + Math.min(i, ROWS_HELD) * ROW_STEP } }, transition: T.press })

// A number that counts up to its value when it appears and glides when it changes, so a total reads as
// something that was added up. Written straight to the page (no renders).
export function Count({ value, format = Math.round }) {
  const n = useSpring(0, { visualDuration: 0.7, bounce: 0 })
  const text = useTransform(n, v => format(v))
  useEffect(() => { reducedMotion() ? n.jump(value) : n.set(value) }, [n, value])
  return <motion.span>{text}</motion.span>
}

export function Pulse({ color = T.lime }) {
  return (
    <motion.span animate={{ opacity: [1, 0.25, 1] }} transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
      style={{ width: 6, height: 6, borderRadius: 6, background: color, display: 'inline-block', flexShrink: 0 }} />
  )
}

// Bottom sheet on phones, centred dialog on wide screens. Escape and backdrop close it.
export function Sheet({ open, onClose, children, wide, width = 560, title }) {
  // On a phone the sheet is pulled down by its handle to close, like every native sheet. Only the handle
  // starts the drag, so scrolling the sheet's contents is never mistaken for it.
  const pull = useDragControls()
  // The dark behind the sheet lightens as the sheet is pulled away: the page underneath is coming back.
  // (While the sheet is arriving its position is a percentage, not pixels: the dark stays full.)
  const y = useMotionValue(0)
  const dim = useTransform(y, v => (typeof v === 'number' ? 1 - Math.min(0.6, Math.max(0, v) / 420) : 1))
  useEffect(() => {
    if (!open) return
    const k = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div key="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: T.dur.fast }}
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: wide ? 'center' : 'flex-end', justifyContent: 'center', padding: wide ? 24 : 0 }}>
          <motion.div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: T.scrim, opacity: wide ? 1 : dim }} />
          <motion.div role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}
            initial={wide ? { opacity: 0, y: 16, scale: 0.98 } : { y: '100%' }}
            animate={wide ? { opacity: 1, y: 0, scale: 1 } : { y: 0 }}
            exit={wide ? { opacity: 0, y: 12, scale: 0.98 } : { y: '100%' }}
            transition={T.spring}
            drag={wide ? false : 'y'} dragControls={pull} dragListener={false} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.7 }}
            onDragEnd={(e, info) => { if (info.offset.y > 110 || info.velocity.y > 600) onClose() }}
            style={{
              y, position: 'relative',
              width: wide ? width : '100%', maxWidth: '100%', maxHeight: wide ? 'calc(100dvh - 48px)' : '92dvh', overflowY: 'auto',
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
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: T.ease, delay: 0.05 }}>{children}</motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Popover menu anchored to its trigger.
const MENU_W = 260
const MENU_ROW_STEP = 0.018 // the rows of a menu follow one another, the first eight only
const MENU_ROWS_HELD = 8
const EDGE = 8

// Popover menu anchored to its trigger. On open it measures the room around the trigger and
// opens toward whichever side fits, so it never spills off-screen (e.g. the speed menu at the right edge).
export function Menu({ trigger, items, align = 'right', up = false }) {
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState({ side: align, up, maxH: 480 })
  const ref = useRef(null)
  const toggle = () => {
    if (!open && ref.current) {
      const r = ref.current.getBoundingClientRect()
      const fitsLeft = r.left + MENU_W <= innerWidth - EDGE // menu's left edge on the trigger's left
      const fitsRight = r.right - MENU_W >= EDGE
      const side = align === 'left' ? (fitsLeft || !fitsRight ? 'left' : 'right') : (fitsRight || !fitsLeft ? 'right' : 'left')
      const below = innerHeight - r.bottom - EDGE - 8
      const above = r.top - EDGE - 8
      const goUp = up ? above >= 200 || above > below : below < 200 && above > below
      setPlace({ side, up: goUp, maxH: Math.max(160, goUp ? above : below) })
    }
    setOpen(o => !o)
  }
  useEffect(() => {
    if (!open) return
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const key = e => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', close)
    window.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', close); window.removeEventListener('keydown', key) }
  }, [open])
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {trigger(toggle, open)}
      <AnimatePresence>
        {open && (
          <motion.div role="menu" initial={{ opacity: 0, y: place.up ? 6 : -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: place.up ? 6 : -6, scale: 0.97 }} transition={{ duration: T.dur.fast, ease: T.ease }}
            style={{
              position: 'absolute', [place.side]: 0, [place.up ? 'bottom' : 'top']: 'calc(100% + 8px)', minWidth: 230, maxWidth: `min(${MENU_W + 60}px, calc(100vw - ${EDGE * 2}px))`,
              maxHeight: place.maxH, overflowY: 'auto', zIndex: 40,
              background: T.bg, border: `1px solid ${T.borderHi}`, borderRadius: T.r.lg, padding: 6,
              boxShadow: '0 24px 60px rgba(0,0,0,0.85)', transformOrigin: `${place.side} ${place.up ? 'bottom' : 'top'}`,
            }}>
            {items.filter(Boolean).map((it, i) => it === '-' ? <div key={i} style={{ height: 1, background: T.border, margin: '6px 4px' }} /> : it.heading ? (
              <div key={i} style={{ padding: '8px 12px 4px', fontFamily: T.mono, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.faint }}>{it.heading}</div>
            ) : (
              <motion.button key={i} role="menuitem" type="button" disabled={it.disabled} variants={PRESS_ROW} whileTap={it.disabled ? undefined : 'tap'} whileHover={it.disabled ? undefined : 'hover'} transition={T.press}
                initial={{ opacity: 0, y: place.up ? 4 : -4 }} animate={{ opacity: it.disabled ? 0.4 : 1, y: 0, transition: { duration: 0.16, ease: T.ease, delay: Math.min(i, MENU_ROWS_HELD) * MENU_ROW_STEP } }}
                onClick={() => { setOpen(false); it.onClick() }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 12px', border: 'none', borderRadius: T.r.sm,
                  background: 'transparent', color: it.danger ? T.danger : T.text, fontFamily: T.font, fontSize: 14,
                  cursor: it.disabled ? 'default' : 'pointer', textAlign: 'left',
                }}
                onPointerEnter={e => { e.currentTarget.style.background = T.surfaceHi }}
                onPointerLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                {it.icon && <Icon name={it.icon} size={17} />}
                <span style={{ flex: 1 }}>{it.label}</span>
                {it.right && <span style={{ fontFamily: T.mono, fontSize: 12, color: T.sub }}>{it.right}</span>}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export const fmtTime = s => {
  if (!isFinite(s) || s < 0) s = 0
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60)
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}
export const fmtDur = s => {
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60)
  return h ? `${h}h ${m}m` : `${Math.max(1, m)}m`
}
