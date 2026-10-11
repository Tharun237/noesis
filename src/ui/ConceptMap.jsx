import { useEffect, useMemo, useState } from 'react'
import { T } from '../theme.js'
import { useWidth } from '../lib/store.js'
import { library } from '../lib/library.js'
import { db } from '../lib/db.js'
import { pause } from '../lib/text.js'
import { go, closeSheet } from '../lib/nav.js'
import { conceptMap, layout } from '../lib/concepts.js'
import { IconButton, Pulse, Appear } from './kit.jsx'

const H = 420
const SIZE_MIN = 11
const SIZE_MAX = 18
const TITLE_MAX = 22

// One line per block, so headings and paragraphs break the sentence scan the same way the reader does.
const textOf = doc => (doc ? doc.blocks.map(b => b.s.join(' ')).join('\n') : '')
const clip = t => (t.length > TITLE_MAX ? t.slice(0, TITLE_MAX - 1) + '…' : t)
const caption = { fontFamily: T.mono, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }
const note = { fontSize: 14, color: T.sub, lineHeight: 1.55 }

export function ConceptMap({ wide }) {
  const width = useWidth()
  const W = Math.max(280, Math.min(width - (wide ? 120 : 40), 560))
  const [total, setTotal] = useState(0)
  const [done, setDone] = useState(0)
  const [result, setResult] = useState(null) // { docs: [{ id, title, text }], concepts }
  const [error, setError] = useState(null)
  const [picked, setPicked] = useState(null)

  // Built once on mount from the documents that are ready to listen to (voicing or ready).
  useEffect(() => {
    let alive = true
    const list = library.get().docs.filter(d => d.status === 'voicing' || d.status === 'ready')
    setTotal(list.length)
    ;(async () => {
      try {
        const docs = []
        for (let i = 0; i < list.length; i++) {
          const doc = await db.getDoc(list[i].id)
          if (!alive) return
          const text = textOf(doc)
          if (text.trim()) docs.push({ id: list[i].id, title: list[i].title, text })
          setDone(i + 1)
          await pause()
          if (!alive) return
        }
        const concepts = docs.length >= 2 ? conceptMap(docs).concepts : []
        if (alive) setResult({ docs, concepts })
      } catch (e) {
        if (alive) setError(e.message || "Couldn't read your library. Try again.")
      }
    })()
    return () => { alive = false }
  }, [])

  const docs = result ? result.docs : []
  const concepts = result ? result.concepts : []
  const titles = useMemo(() => new Map(docs.map(d => [d.id, d.title])), [result])
  const docIndex = useMemo(() => new Map(docs.map((d, i) => [d.id, i])), [result])
  const pos = useMemo(() => (result ? layout(result.concepts, result.docs, { width: W, height: H }) : null), [result, W])

  const weights = concepts.map(c => c.weight)
  const lo = weights.length ? Math.min(...weights) : 0
  const hi = weights.length ? Math.max(...weights) : 0
  const sizeOf = c => (hi > lo ? SIZE_MIN + ((c.weight - lo) / (hi - lo)) * (SIZE_MAX - SIZE_MIN) : (SIZE_MIN + SIZE_MAX) / 2)

  const sel = concepts.find(c => c.key === picked) || null
  const mapped = result && docs.length >= 2 && pos

  return (
    <div style={{ padding: wide ? '28px 28px 30px' : '18px 20px 24px', display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, fontSize: 20, fontWeight: 700, color: T.text }}>Concept map</div>
        <IconButton icon="close" label="Close" onClick={closeSheet} />
      </div>
      {!result && !error && (
        <Appear style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: T.sub }}><Pulse /> Reading your library: {done} of {total}</Appear>
      )}
      {error && <Appear style={{ fontSize: 14, color: T.danger, lineHeight: 1.55 }}>{error}</Appear>}
      {result && docs.length < 2 && <Appear style={note}>Add at least two documents to see how they connect.</Appear>}
      {mapped && (
        <Appear><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Concept map of your library"
          style={{ width: '100%', height: H, display: 'block' }}>
          {concepts.map((c, i) => c.docs.map(d => {
            const a = pos.concepts[i]
            const b = pos.docs[docIndex.get(d.id)]
            return <line key={c.key + '|' + d.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={T.borderHi} strokeWidth={1} />
          }))}
          {pos.docs.map((p, i) => {
            const left = p.x > W / 2
            return (
              <g key={docs[i].id}>
                <circle cx={p.x} cy={p.y} r={4.5} fill={T.text} />
                <text x={p.x + (left ? -10 : 10)} y={p.y} textAnchor={left ? 'end' : 'start'} dominantBaseline="middle"
                  fill={T.body} fontSize={11} fontFamily={T.font}>{clip(docs[i].title)}</text>
              </g>
            )
          })}
          {concepts.map((c, i) => {
            const p = pos.concepts[i]
            return (
              <text key={c.key} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fill={T.lime}
                fontSize={sizeOf(c)} fontFamily={T.font} fontWeight={c.key === picked ? 700 : 500}
                style={{ cursor: 'pointer' }} onClick={() => setPicked(c.key === picked ? null : c.key)}>{c.label}</text>
            )
          })}
        </svg></Appear>
      )}
      {mapped && !concepts.some(c => c.docs.length > 1) && (
        <Appear style={note}>These documents do not share any names or terms yet.</Appear>
      )}
      {sel && (
        <Appear key={sel.key} style={{ display: 'grid', gap: 8 }}>
          <div style={{ ...caption, color: T.lime }}>{sel.label}</div>
          {sel.docs.map(d => (
            <button key={d.id} type="button" onClick={() => go('reader', d.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', padding: '11px 14px', borderRadius: T.r.md, border: `1px solid ${T.border}`, background: T.surface, cursor: 'pointer', fontFamily: T.font }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: T.text }}>{titles.get(d.id)}</span>
              <span style={{ fontFamily: T.mono, fontSize: 12.5, color: T.sub }}>{d.count}</span>
            </button>
          ))}
        </Appear>
      )}
    </div>
  )
}
