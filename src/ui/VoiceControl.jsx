import { motion, AnimatePresence } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { T } from '../theme.js'
import { IconButton } from './kit.jsx'
import { createListener } from '../lib/voicecmd.js'

// icons.jsx has no 'mic' glyph (it has 'voice'), so the spec's fallback 'sparkle' is used.
const ICON = 'voice' // the microphone glyph in icons.jsx

export function VoiceControl({ onCommand, onState, onHeard, onInterim }) {
  const [state, setState] = useState('off')
  const listener = useRef(null)
  const handlers = useRef({ onCommand, onState, onHeard, onInterim })

  // The listener outlives renders, so it always calls the latest callbacks through this ref.
  useEffect(() => { handlers.current = { onCommand, onState, onHeard, onInterim } })
  useEffect(() => () => { if (listener.current) listener.current.stop() }, [])

  const emit = s => {
    setState(s)
    handlers.current.onState?.(s)
  }

  const toggle = () => {
    const was = state
    if (listener.current) { listener.current.stop(); listener.current = null }
    if (was === 'listening') return
    const l = createListener({
      onCommand: c => handlers.current.onCommand?.(c),
      onHeard: t => handlers.current.onHeard?.(t),
      onInterim: t => handlers.current.onInterim?.(t),
      onState: emit,
    })
    listener.current = l
    l.start()
  }

  return <IconButton icon={ICON} label="Voice commands" onClick={toggle} active={state === 'listening'} />
}

const LISTEN_HINT = 'Listening. Say: play, pause, back, bookmark, explain, recap.'
const PRIVACY = 'Your browser sends what it hears to its own speech service to recognise the words.'
const MESSAGES = {
  denied: "The microphone is blocked for this site. Allow it in the browser's site settings.",
  unsupported: 'Voice commands need Chrome on Android or a computer.',
  error: 'Voice commands stopped. Tap the microphone to try again.',
}
const lineStyle = { fontSize: 12.5, color: T.sub, lineHeight: 1.5 }

export function VoiceStatus({ state, heard }) {
  if (state === 'listening') {
    return (
      <div role="status" aria-live="polite" style={{ display: 'grid', gap: 4 }}>
        <div style={lineStyle}>{LISTEN_HINT}</div>
        {heard && <div style={lineStyle}>{`Heard: "${heard}"`}</div>}
        <div style={lineStyle}>{PRIVACY}</div>
      </div>
    )
  }
  if (!MESSAGES[state]) return null
  return <div role="status" aria-live="polite" style={lineStyle}>{MESSAGES[state]}</div>
}

// What the customer sees while voice commands are on: that it is listening, the words as they are heard,
// and what was done with them. It floats above the player so it is in view wherever the page is scrolled.
const HUD_NOTES = {
  denied: "The microphone is blocked for this site. Allow it in the browser's site settings.",
  unsupported: 'Voice commands need Chrome on Android or a computer.',
  error: 'Voice commands stopped. Tap the microphone to try again.',
}
export function VoiceHud({ state, words, done, bottom, playing }) {
  const show = state !== 'off'
  return (
    <AnimatePresence>
      {show && (
        <motion.div key="voice" role="status" aria-live="polite"
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 14, transition: { duration: 0.12, ease: 'easeIn' } }}
          transition={{ duration: 0.2, ease: T.ease }}
          style={{ position: 'fixed', left: 8, right: 8, bottom: `calc(env(safe-area-inset-bottom) + ${bottom + 10}px)`, zIndex: 36, margin: '0 auto', maxWidth: 460, padding: '14px 16px', borderRadius: T.r.lg, background: T.bg, border: `1px solid ${T.borderHi}`, boxShadow: '0 16px 40px rgba(0,0,0,0.85)', display: 'grid', gap: 8 }}>
          {state === 'listening' ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <motion.span animate={{ scale: [1, 1.35, 1], opacity: [1, 0.5, 1] }} transition={{ duration: 1.3, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ width: 10, height: 10, borderRadius: 10, background: T.lime, flexShrink: 0 }} />
                <span style={{ fontFamily: T.mono, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: T.sub }}>Listening</span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.35, color: words ? T.text : T.faint, minHeight: 25, wordBreak: 'break-word' }}>
                {words ? `“${words}”` : 'Say a command'}
              </div>
              <AnimatePresence mode="wait" initial={false}>
                {done && (
                  <motion.div key={done.at} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}
                    style={{ fontSize: 14, fontWeight: 600, color: done.ok ? T.lime : T.sub }}>
                    {done.ok ? '→ ' : ''}{done.text}
                  </motion.div>
                )}
              </AnimatePresence>
              <div style={{ fontSize: 12, lineHeight: 1.5, color: T.sub }}>
                {playing ? 'The book is playing, so start with its name: “Noesis, pause”.' : 'Try: play, back, next, bookmark, explain, recap, or “ask” and a question.'}
              </div>
              <div style={{ fontSize: 11.5, lineHeight: 1.45, color: T.faint }}>Your browser sends what it hears to its own speech service to recognise the words.</div>
            </>
          ) : (
            <div style={{ fontSize: 14, lineHeight: 1.5, color: T.text }}>{HUD_NOTES[state]}</div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
