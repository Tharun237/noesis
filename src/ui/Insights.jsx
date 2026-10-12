import { useId, useMemo } from 'react'
import { motion } from 'motion/react'
import { T, label } from '../theme.js'
import { arc, splitSections, hardWords, wordHeat } from '../lib/insights.js'
import { Reveal } from './kit.jsx'

// Chart box in viewBox units; the SVG stretches to 100% width (preserveAspectRatio none).
const CHART_W = 100
const CHART_H = 140
const CHART_PAD = 10

const note = { fontSize: 13, color: T.sub, lineHeight: 1.5 }
const row = {
  display: 'flex', alignItems: 'baseline', gap: 12, width: '100%', minHeight: 44, padding: '10px 12px',
  border: 'none', borderRadius: T.r.sm, background: 'transparent', color: T.text, fontFamily: T.font,
  fontSize: 14, textAlign: 'left', cursor: 'pointer',
}

const toneWord = t => (t > 0.15 ? 'bright' : t < -0.15 ? 'dark' : 'even')

const docText = blocks => (blocks || []).map(b => (b.s || []).join(' ')).join(' ')

// Points run left to right; tone +1 is the top of the box, -1 the bottom, 0 the middle line.
function ArcChart({ points }) {
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, '')
  const upId = `${uid}-up`
  const downId = `${uid}-down`
  const mid = CHART_H / 2
  const xOf = i => (points.length <= 1 ? CHART_W / 2 : 4 + (i / (points.length - 1)) * (CHART_W - 8))
  const yOf = t => mid - t * (mid - CHART_PAD)
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${xOf(i)} ${yOf(p.tone)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} width="100%" height={CHART_H} preserveAspectRatio="none"
      role="img" aria-label="Emotional arc of this document" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <clipPath id={upId}><rect x="0" y="0" width={CHART_W} height={mid} /></clipPath>
        <clipPath id={downId}><rect x="0" y={mid} width={CHART_W} height={mid} /></clipPath>
      </defs>
      <line x1="0" x2={CHART_W} y1={mid} y2={mid} stroke={T.faint} strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <path d={d} fill="none" stroke={T.lime} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
        vectorEffect="non-scaling-stroke" clipPath={`url(#${upId})`} />
      <path d={d} fill="none" stroke={T.text} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
        vectorEffect="non-scaling-stroke" clipPath={`url(#${downId})`} />
    </svg>
  )
}

const HEAT_H = 28
const HEAT_MIN = 0.12 // a section with no hard words is still a faint block, so the strip keeps its shape

export function Insights({ doc, title, onSeek, onAsk }) {
  const sections = useMemo(() => arc(splitSections(doc.blocks, doc.starts)), [doc])
  const words = useMemo(() => hardWords(docText(doc.blocks)), [doc])
  const heat = useMemo(() => wordHeat(splitSections(doc.blocks, doc.starts), words), [doc, words])
  const hottest = Math.max(0, ...heat.map(h => h.density))

  return (
    <div style={{ padding: '18px 20px 24px', display: 'grid', gap: 22 }}>
      {title && <div style={{ fontSize: 20, fontWeight: 700, color: T.text }}>{title}</div>}

      <section style={{ display: 'grid', gap: 12 }}>
        <div style={label}>Emotional arc</div>
        {sections.length === 0 ? (
          <div style={note}>This document is too short for an arc.</div>
        ) : (
          <>
            <Reveal><ArcChart points={sections} /></Reveal>
            <div style={note}>Counted from ordinary English words of feeling. It does not understand irony, and it works for English text only.</div>
            <div style={{ display: 'grid', gap: 2 }}>
              {sections.map((s, i) => (
                <motion.button key={i} type="button" onClick={() => onSeek(s.start)} whileTap={{ scale: 0.98 }} transition={T.spring} style={row}>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
                  <span style={{ fontFamily: T.mono, fontSize: 12, color: T.sub, flexShrink: 0 }}>{toneWord(s.tone)}</span>
                </motion.button>
              ))}
            </div>
          </>
        )}
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        <div style={label}>Hard words</div>
        <div style={note}>Long words used here that are not names. Tap one to have it explained.</div>
        {heat.length > 1 && hottest > 0 && (
          <div style={{ display: 'grid', gap: 8 }}>
            {/* The heatmap: one cell per section, brighter where the hard words crowd. A tap goes there. */}
            <div style={{ display: 'flex', gap: 3, height: HEAT_H }}>
              {heat.map((h, i) => (
                <motion.button key={i} type="button" aria-label={`${h.title}: ${h.density.toFixed(1)} hard words in every hundred`} title={h.title} onClick={() => onSeek(h.start)}
                  initial={{ opacity: 0 }} animate={{ opacity: HEAT_MIN + (1 - HEAT_MIN) * (h.density / hottest), transition: { duration: 0.3, delay: Math.min(i, 30) * 0.015 } }} whileTap={{ scaleY: 0.8 }} transition={T.press}
                  style={{ flex: 1, minWidth: 0, border: 'none', padding: 0, borderRadius: 3, background: T.lime, cursor: 'pointer' }} />
              ))}
            </div>
            <div style={note}>Where they are: one block for each section, from the start to the end. Brighter means more hard words. Tap a block to go there.</div>
          </div>
        )}
        <div style={{ display: 'grid', gap: 2 }}>
          {words.map(w => (
            <motion.button key={w.word} type="button" onClick={() => onAsk(w.word)} whileTap={{ scale: 0.98 }} transition={T.spring} style={row}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.word}</span>
              <span style={{ fontFamily: T.mono, fontSize: 12, color: T.sub, flexShrink: 0 }}>{w.count}</span>
            </motion.button>
          ))}
        </div>
      </section>
    </div>
  )
}
