import { motion, AnimatePresence } from 'motion/react'
import { T } from '../theme.js'
import { useStore } from '../lib/store.js'
import { ui, go } from '../lib/nav.js'
import { library, kickVoice } from '../lib/library.js'
import { player } from '../lib/player.js'
import { settings } from '../lib/settings.js'
import { activeEngine } from '../lib/engine.js'
import { engine, loadEngine } from '../lib/tts.js'
import { voiceName } from '../lib/voices.js'
import { Pulse } from './kit.jsx'

// One place, on every screen, that says what Noesis is doing in the background and how far along it is:
// downloading a voice, reading a document, preparing audio you asked to play — or what failed and how to retry.
// Routine background generation is not shown: it never blocks anything and would sit there for hours.

export const ACTIVITY_H = 52 // strip height + gap, for stacking toasts above it

const PREP = new Set(['queued', 'reading', 'narrating', 'syncing'])
const mb = n => Math.round(n / 1048576)
const wait = s => (s < 90 ? 'under 2 minutes' : s < 3600 ? `about ${Math.round(s / 60)} minutes` : `about ${(s / 3600).toFixed(1)} hours`)

// → { key, text, detail?, progress? (0..1, omitted = unknown), error?, action?: { label, run }, open?: docId } | null
export function useActivity() {
  const eng = useStore(engine)
  const natural = useStore(settings, s => activeEngine(s) === 'natural')
  // The first document still being prepared (reading, AI narration, downloading from another device).
  const prep = useStore(library, s => s.docs.find(d => PREP.has(d.status)))
  const gate = useStore(player, s => s.gate)
  const playId = useStore(player, s => s.id)
  const view = useStore(ui, s => s.view)
  const docId = useStore(ui, s => s.docId)
  const onReaderOf = id => view === 'reader' && docId === id // that page already shows this in full

  if (natural && eng.status === 'error') {
    return { key: 'voice-error', error: true, text: 'The voice could not be downloaded', detail: 'Check your connection', action: { label: 'Retry', run: () => loadEngine().then(kickVoice).catch(() => {}) } }
  }
  if (natural && eng.status === 'loading') {
    if (eng.opening) return { key: 'voice', text: `Setting up the ${voiceName(eng.voice)} voice`, detail: 'A few seconds' }
    return eng.total
      ? { key: 'voice', text: `Downloading the ${voiceName(eng.voice)} voice`, detail: `${mb(eng.loaded)} of ${mb(eng.total)} MB`, progress: eng.loaded / eng.total }
      : { key: 'voice', text: `Downloading the ${voiceName(eng.voice)} voice`, detail: 'One time only' }
  }
  if (prep && !onReaderOf(prep.id)) {
    return { key: 'prep-' + prep.id, text: prep.stage || 'Preparing', detail: prep.title, progress: prep.prep > 0 ? prep.prep : undefined, open: prep.id }
  }
  if (gate != null && playId && !onReaderOf(playId)) {
    return { key: 'gate', text: 'Preparing audio', detail: `Ready in ${wait(gate)}. Play starts by itself.`, open: playId }
  }
  return null
}

export function ActivityStrip({ activity, bottom }) {
  return (
    <AnimatePresence>
      {activity && (
        <motion.div key="activity" role="status" aria-live="polite"
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} transition={T.spring}
          onClick={activity.open ? () => go('reader', activity.open) : undefined}
          style={{
            position: 'fixed', left: 8, right: 8, margin: '0 auto', maxWidth: 460, zIndex: 34,
            bottom: `calc(env(safe-area-inset-bottom) + ${bottom + 8}px)`, height: ACTIVITY_H - 8,
            borderRadius: T.r.md, background: T.bg, border: `1px solid ${activity.error ? T.danger : T.borderHi}`, overflow: 'hidden',
            boxShadow: '0 12px 32px rgba(0,0,0,0.85)', cursor: activity.open ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px 0 14px',
          }}>
          <Pulse color={activity.error ? T.danger : T.lime} />
          <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{activity.text}</div>
            {activity.detail && <div style={{ fontFamily: T.mono, fontSize: 11, color: T.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{activity.detail}</div>}
          </div>
          {activity.progress != null && <div style={{ fontFamily: T.mono, fontSize: 12, color: T.text, paddingRight: 6 }}>{Math.floor(activity.progress * 100)}%</div>}
          {activity.action && (
            <button type="button" onClick={e => { e.stopPropagation(); activity.action.run() }}
              style={{ height: 30, padding: '0 14px', borderRadius: T.r.pill, border: 'none', background: T.text, color: T.bg, fontFamily: T.font, fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
              {activity.action.label}
            </button>
          )}
          {/* Progress line: known → fills; unknown → a soft sweep. Transform only. */}
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, background: T.surfaceHi, overflow: 'hidden' }}>
            {activity.progress != null
              ? <motion.div initial={false} animate={{ scaleX: Math.max(0.02, Math.min(1, activity.progress)) }} transition={{ duration: T.dur.base, ease: T.ease }}
                  style={{ height: '100%', background: T.text, transformOrigin: '0 50%' }} />
              : !activity.error && <motion.div animate={{ x: ['-100%', '300%'] }} transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ height: '100%', width: '34%', background: T.text }} />}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
