import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { T, label } from '../theme.js'
import { useStore } from '../lib/store.js'
import { settings, DEFAULTS } from '../lib/settings.js'
import { toggleMark, setMarkNote } from '../lib/library.js'
import { Icon } from './icons.jsx'
import { Button, IconButton, Segmented, Toggle, fmtTime } from './kit.jsx'

// ── contents (desktop sidebar + mobile sheet) ───────────────────────────────────────
export function Toc({ headings, offs, rate, active, onSeek, onClose }) {
  const current = headings.reduce((cur, h) => (active >= h.i ? h.i : cur), -1)
  const ref = useRef(null)
  useEffect(() => { ref.current?.querySelector('[data-current]')?.scrollIntoView({ block: 'nearest' }) }, [current])
  return (
    <div ref={ref} style={{ display: 'grid', gap: 1 }}>
      {headings.map(h => {
        const on = h.i === current
        return (
          <button key={h.i} type="button" data-current={on || undefined} onClick={() => { onSeek(h.i); onClose?.() }}
            style={{
              display: 'flex', alignItems: 'baseline', gap: 12, width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', borderRadius: T.r.sm,
              background: on ? T.surfaceHi : 'transparent', color: on ? T.text : T.sub, fontFamily: T.font, fontSize: 13.5, lineHeight: 1.4, cursor: 'pointer',
            }}>
            <span style={{ flex: 1, minWidth: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{h.text}</span>
            {offs && <span style={{ fontFamily: T.mono, fontSize: 11, color: on ? T.lime : T.faint, flexShrink: 0 }}>{fmtTime(offs[h.i] / rate)}</span>}
          </button>
        )
      })}
    </div>
  )
}

// ── reading settings ───────────────────────────────────────────────────────────────
function Stepper({ title, value, display, onDec, onInc }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{title}</div>
      <IconButton icon="minus" label={`Decrease ${title}`} onClick={onDec} size={36} iconSize={16} style={{ border: `1px solid ${T.border}` }} />
      <div style={{ minWidth: 56, textAlign: 'center', fontFamily: T.mono, fontSize: 13 }}>{display ?? value}</div>
      <IconButton icon="plus" label={`Increase ${title}`} onClick={onInc} size={36} iconSize={16} style={{ border: `1px solid ${T.border}` }} />
    </div>
  )
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))

export function ReadingSettings({ wide }) {
  const s = useStore(settings)
  return (
    <div style={{ padding: wide ? 28 : '18px 20px 26px', display: 'grid', gap: 20 }}>
      <div style={{ fontSize: 20, fontWeight: 700 }}>Reading</div>
      <Segmented value={s.readFont} onChange={v => settings.set({ readFont: v })}
        options={[{ value: 'serif', label: <span style={{ fontFamily: T.serif }}>Literata</span> }, { value: 'sans', label: 'DM Sans' }]} />
      <Stepper title="Text size" value={s.readSize} onDec={() => settings.set({ readSize: clamp(s.readSize - 1, 14, 30) })} onInc={() => settings.set({ readSize: clamp(s.readSize + 1, 14, 30) })} />
      <Stepper title="Line spacing" value={s.readLeading} display={s.readLeading.toFixed(2)}
        onDec={() => settings.set({ readLeading: clamp(Math.round((s.readLeading - 0.1) * 100) / 100, 1.3, 2.3) })}
        onInc={() => settings.set({ readLeading: clamp(Math.round((s.readLeading + 0.1) * 100) / 100, 1.3, 2.3) })} />
      {wide && <Stepper title="Column width" value={s.readWidth} display={`${s.readWidth}px`}
        onDec={() => settings.set({ readWidth: clamp(s.readWidth - 40, 520, 1000) })} onInc={() => settings.set({ readWidth: clamp(s.readWidth + 40, 520, 1000) })} />}
      <Toggle checked={s.wordHighlight} onChange={v => settings.set({ wordHighlight: v })} labelText="Follow each word" hint="Highlights the word being spoken, not just the sentence." />
      <Toggle checked={s.justify} onChange={v => settings.set({ justify: v })} labelText="Justify text" />
      <Button onClick={() => settings.set({ readFont: DEFAULTS.readFont, readSize: DEFAULTS.readSize, readLeading: DEFAULTS.readLeading, readWidth: DEFAULTS.readWidth, justify: DEFAULTS.justify, wordHighlight: DEFAULTS.wordHighlight })}>
        Reset to defaults
      </Button>
    </div>
  )
}

// ── bookmarks & notes ──────────────────────────────────────────────────────────────
export function Marks({ d, doc, offs, rate, onSeek, onClose }) {
  const marks = d.marks || []
  return (
    <div style={{ padding: '20px 16px 26px', display: 'grid', gap: 12 }}>
      <div style={{ fontSize: 20, fontWeight: 700, padding: '0 4px' }}>Bookmarks & notes</div>
      {marks.length === 0 && (
        <div style={{ fontSize: 14, color: T.sub, lineHeight: 1.55, padding: '0 4px' }}>
          Tap <Icon name="bookmark" size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> in the player to save the sentence you are hearing. Add a note to remember why.
        </div>
      )}
      {marks.map(m => (
        <div key={m.i} style={{ padding: 14, borderRadius: T.r.md, border: `1px solid ${T.border}`, background: T.surface, display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <button type="button" onClick={() => { onSeek(m.i); onClose?.() }}
              style={{ flex: 1, textAlign: 'left', border: 'none', background: 'transparent', color: T.text, padding: 0, cursor: 'pointer', fontFamily: T.serif, fontSize: 15, lineHeight: 1.5 }}>
              {doc?.segs[m.i]?.t || '…'}
            </button>
            <IconButton icon="trash" label="Delete bookmark" size={32} iconSize={15} onClick={() => toggleMark(d.id, m.i)} style={{ color: T.faint }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {offs && <span style={{ fontFamily: T.mono, fontSize: 11, color: T.accent }}>{fmtTime(offs[m.i] / rate)}</span>}
            <input defaultValue={m.note} placeholder="Add a note" onBlur={e => e.target.value !== m.note && setMarkNote(d.id, m.i, e.target.value)}
              style={{ flex: 1, height: 34, padding: '0 10px', borderRadius: T.r.sm, border: `1px solid ${T.border}`, background: 'transparent', color: T.text, fontFamily: T.font, fontSize: 13.5, outline: 'none' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── find in document ───────────────────────────────────────────────────────────────
export function SearchBar({ doc, onHit, onClose }) {
  const [q, setQ] = useState('')
  const [k, setK] = useState(0)
  const hits = q.trim().length < 2 || !doc ? [] : doc.segs.reduce((a, s, i) => (a.length < 999 && s.t.toLowerCase().includes(q.trim().toLowerCase()) ? (a.push(i), a) : a), [])
  const cur = hits.length ? Math.min(k, hits.length - 1) : -1
  useEffect(() => { onHit(cur >= 0 ? hits[cur] : -1) }, [q, cur]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onHit(-1), []) // eslint-disable-line react-hooks/exhaustive-deps
  const step = dir => hits.length && setK((cur + dir + hits.length) % hits.length)
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: T.dur.fast }}
      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: `1px solid ${T.border}`, background: T.bg }}>
      <Icon name="search" size={16} style={{ color: T.faint, marginLeft: 4 }} />
      <input autoFocus value={q} onChange={e => { setQ(e.target.value); setK(0) }} placeholder="Find in document" aria-label="Find in document"
        onKeyDown={e => { if (e.key === 'Enter') step(e.shiftKey ? -1 : 1); if (e.key === 'Escape') onClose() }}
        style={{ flex: 1, minWidth: 0, height: 36, border: 'none', background: 'transparent', color: T.text, fontFamily: T.font, fontSize: 15, outline: 'none' }} />
      <span style={{ fontFamily: T.mono, fontSize: 11.5, color: T.faint, whiteSpace: 'nowrap' }}>{q.trim().length >= 2 ? `${hits.length ? cur + 1 : 0}/${hits.length}${hits.length === 999 ? '+' : ''}` : ''}</span>
      <IconButton icon="up" label="Previous match" size={34} iconSize={16} onClick={() => step(-1)} />
      <IconButton icon="down" label="Next match" size={34} iconSize={16} onClick={() => step(1)} />
      <IconButton icon="close" label="Close search" size={34} iconSize={16} onClick={onClose} />
    </motion.div>
  )
}

// ── "back to what's playing" ───────────────────────────────────────────────────────
export function JumpToNow({ active, bottom, onJump }) {
  const [away, setAway] = useState(false)
  useEffect(() => {
    if (active < 0) return setAway(false)
    const el = document.querySelector(`[data-i="${active}"]`)
    if (!el) return
    const io = new IntersectionObserver(([e]) => setAway(!e.isIntersecting), { rootMargin: '-60px 0px -140px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [active])
  return (
    <AnimatePresence>
      {away && (
        <motion.button type="button" onClick={onJump} aria-label="Scroll to what is playing"
          initial={{ opacity: 0, y: 12, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: 12, x: '-50%' }} transition={T.spring}
          style={{
            position: 'fixed', left: '50%', bottom: bottom + 14, zIndex: 25, height: 38, padding: '0 16px', borderRadius: T.r.pill, border: `1px solid ${T.borderHi}`,
            background: T.bg, color: T.text, fontFamily: T.font, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
            boxShadow: '0 10px 30px rgba(0,0,0,0.7)',
          }}>
          <Icon name="waves" size={15} style={{ color: T.lime }} /> Back to now
        </motion.button>
      )}
    </AnimatePresence>
  )
}
