import { useEffect, useState } from 'react'
import { motion, stagger } from 'motion/react'
import { T } from '../theme.js'
import { useStore } from '../lib/store.js'
import { settings } from '../lib/settings.js'
import { hasAiKey } from '../lib/ai.js'
import { explainEquation } from '../lib/equation.js'
import { Button, Pulse } from './kit.jsx'
import { Icon } from './icons.jsx'

const note = { fontSize: 14, color: T.sub, lineHeight: 1.55 }
const equationBox = {
  padding: '14px 16px', border: `1px solid ${T.border}`, borderRadius: T.r.md, background: T.surface,
  color: T.text, fontFamily: T.code, fontSize: 16, lineHeight: 1.6, overflowWrap: 'anywhere',
}
const partButton = {
  display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 14px', border: 'none', borderRadius: T.r.sm,
  background: 'transparent', color: T.body, fontFamily: T.font, textAlign: 'left', cursor: 'pointer',
}

// The rows come in one after another: the list starts its children 40 ms apart.
const listIn = { hidden: {}, show: { transition: { delayChildren: stagger(0.04) } } }
const rowIn = { hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0, transition: { duration: T.dur.base, ease: T.ease } } }

// The content of the equation sheet. Explains the equation once on mount (and again on "Try again").
export function EquationSheet({ equation, context, onSpeak }) {
  useStore(settings)
  const keyed = hasAiKey()
  const [state, setState] = useState({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!keyed) return undefined
    const ac = new AbortController()
    setState({ status: 'loading' })
    explainEquation(equation, context, { signal: ac.signal })
      .then(data => setState({ status: 'ready', data }))
      .catch(err => { if (err.name !== 'AbortError') setState({ status: 'error', message: err.message }) })
    return () => ac.abort()
  }, [equation, context, attempt, keyed])

  if (!keyed) {
    return (
      <div style={{ padding: '18px 20px 24px' }}>
        <div style={note}>Taking an equation apart needs an AI key. Add one in Settings.</div>
      </div>
    )
  }

  return (
    <div style={{ padding: '18px 20px 24px', display: 'grid', gap: 18 }}>
      <div style={equationBox}>{equation}</div>

      {state.status === 'loading' && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: T.sub }}>
          <Pulse /> Taking the equation apart
        </div>
      )}

      {state.status === 'error' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 14, color: T.danger, lineHeight: 1.55 }}>{state.message}</div>
          <div><Button onClick={() => setAttempt(a => a + 1)}>Try again</Button></div>
        </div>
      )}

      {state.status === 'ready' && (
        <Explanation data={state.data} onSpeak={onSpeak} />
      )}
    </div>
  )
}

// The explained equation: its purpose, each part as a tappable row, then the whole equation in words.
function Explanation({ data, onSpeak }) {
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {data.purpose && <p style={{ margin: 0, fontSize: 16, color: T.body, lineHeight: 1.6 }}>{data.purpose}</p>}

      <motion.div variants={listIn} initial="hidden" animate="show" style={{ display: 'grid', gap: 2 }}>
        {data.parts.map((p, i) => (
          <motion.button key={i} type="button" variants={rowIn} whileTap={{ scale: 0.96 }} transition={T.press}
            onClick={() => onSpeak(p.term + ': ' + p.meaning)} style={partButton}>
            <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 4 }}>
              <span style={{ fontFamily: T.code, fontSize: 15, color: T.lime }}>{p.term}</span>
              <span style={{ fontSize: 14, color: T.sub, lineHeight: 1.5 }}>{p.meaning}</span>
            </span>
            <Icon name="speaker" size={16} style={{ color: T.faint, flexShrink: 0 }} />
          </motion.button>
        ))}
      </motion.div>

      {data.inWords && <Button full icon="speaker" onClick={() => onSpeak(data.inWords)}>Hear it in words</Button>}
    </div>
  )
}
