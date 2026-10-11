import { useEffect, useRef, useState } from 'react'
import { T } from '../theme.js'
import { IconButton } from './kit.jsx'
import { createListener } from '../lib/voicecmd.js'

// icons.jsx has no 'mic' glyph (it has 'voice'), so the spec's fallback 'sparkle' is used.
const ICON = 'voice' // the microphone glyph in icons.jsx

export function VoiceControl({ onCommand, onState, onHeard }) {
  const [state, setState] = useState('off')
  const listener = useRef(null)
  const handlers = useRef({ onCommand, onState, onHeard })

  // The listener outlives renders, so it always calls the latest callbacks through this ref.
  useEffect(() => { handlers.current = { onCommand, onState, onHeard } })
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
