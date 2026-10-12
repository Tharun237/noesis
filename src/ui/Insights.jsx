// Hard words: the long, uncommon words of a document (not names), where they crowd, and a tap to have one
// explained. (The emotional arc used to be here too, as a chart of its own: it is now the player's progress
// line, where it belongs. See ArcScrubber.jsx.)
import { useMemo } from 'react'
import { motion } from 'motion/react'
import { T, label } from '../theme.js'
import { splitSections, hardWords, wordHeat } from '../lib/insights.js'
import { rowIn } from './kit.jsx'

const note = { fontSize: 13, color: T.sub, lineHeight: 1.5 }
const row = {
  display: 'flex', alignItems: 'baseline', gap: 12, width: '100%', minWidth: 0, minHeight: 44, padding: '10px 12px',
  border: 'none', borderRadius: T.r.sm, background: 'transparent', color: T.text, fontFamily: T.font,
  fontSize: 14, textAlign: 'left', cursor: 'pointer',
}
// One column that can never be wider than the sheet: a long word must be cut with an ellipsis, not push the
// sheet sideways (it did, on a wide screen: Tharun's screenshot of 2026-10-12).
const column = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)' }

const docText = blocks => (blocks || []).map(b => (b.s || []).join(' ')).join(' ')

const HEAT_H = 14
const HEAT_MIN_SECTIONS = 4 // two or three blocks compare nothing: they were just two loud bars
const HEAT_MIN = 0.12 // a section with no hard words is still a faint block, so the strip keeps its shape

export function Insights({ doc, title, onSeek, onAsk }) {
  const words = useMemo(() => hardWords(docText(doc.blocks)), [doc])
  const heat = useMemo(() => wordHeat(splitSections(doc.blocks, doc.starts), words), [doc, words])
  const hottest = Math.max(0, ...heat.map(h => h.density))

  return (
    <div style={{ ...column, padding: '18px 20px 24px', gap: 16 }}>
      <div style={{ ...column, gap: 4 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: T.text }}>Hard words</div>
        {title && <div style={{ ...note, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>}
      </div>
      {words.length === 0 ? (
        <div style={note}>No long, uncommon words were found in this document.</div>
      ) : (
        <>
          {heat.length >= HEAT_MIN_SECTIONS && hottest > 0 && (
            <div style={{ ...column, gap: 8 }}>
              <div style={label}>Where they are</div>
              {/* The heatmap: one block per section, brighter where the hard words crowd. A tap goes there. */}
              <div style={{ display: 'flex', gap: 3, height: HEAT_H }}>
                {heat.map((h, i) => (
                  <motion.button key={i} type="button" aria-label={`${h.title}: ${h.density.toFixed(1)} hard words in every hundred`} title={h.title} onClick={() => onSeek(h.start)}
                    initial={{ opacity: 0 }} animate={{ opacity: HEAT_MIN + (1 - HEAT_MIN) * (h.density / hottest), transition: { duration: 0.3, delay: Math.min(i, 30) * 0.015 } }}
                    style={{ flex: 1, minWidth: 0, border: 'none', padding: 0, borderRadius: 3, background: T.lime, cursor: 'pointer' }} />
                ))}
              </div>
              <div style={note}>One block for each section, from the start to the end. Brighter means more hard words. Tap a block to go there.</div>
            </div>
          )}
          <div style={{ ...column, gap: 8 }}>
            <div style={label}>The words</div>
            <div style={note}>Long words used here that are not names. Tap one to have it explained.</div>
            <div style={{ ...column, gap: 2 }}>
              {words.map((w, i) => (
                <button key={w.word} type="button" onClick={() => onAsk(w.word)} data-press="" {...rowIn(i)} style={{ ...row, '--press': T.tap.row }}>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.word}</span>
                  <span style={{ fontFamily: T.mono, fontSize: 12, color: T.sub, flexShrink: 0 }}>{w.count}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
