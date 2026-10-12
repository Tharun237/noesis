import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { T } from '../theme.js'
import { useStore } from '../lib/store.js'
import { ui, go } from '../lib/nav.js'
import { library, kickVoice } from '../lib/library.js'
import { player } from '../lib/player.js'
import { settings } from '../lib/settings.js'
import { activeEngine } from '../lib/engine.js'
import { engine, loadEngine, voiceWait } from '../lib/tts.js'
import { waitWords } from '../lib/readiness-math.js'
import { Pulse } from './kit.jsx'

// One place, on every screen, that says what Noesis is doing in the background and how far along it is:
// downloading a voice, reading a document, preparing audio you asked to play — or what failed and how to retry.
// Routine background generation is not shown: it never blocks anything and would sit there for hours.

export const ACTIVITY_H = 52 // strip height + gap, for stacking toasts above it

const PREP = new Set(['queued', 'reading', 'narrating', 'syncing'])
const offlineVoice = e => !navigator.onLine || /failed to fetch|networkerror|load failed|offline|network request failed/i.test(e || '')

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    addEventListener('online', on)
    addEventListener('offline', off)
    return () => { removeEventListener('online', on); removeEventListener('offline', off) }
  }, [])
  return online
}

// → { key, text, detail?, progress? (0..1, omitted = unknown), error?, action?: { label, run }, open?: docId } | null
export function useActivity() {
  const eng = useStore(engine)
  const natural = useStore(settings, s => activeEngine(s) === 'natural')
  // The document actually being processed now: reading or narrating first; a queued one only if
  // nothing is being processed. Within a stage the oldest work runs first.
  const prep = useStore(library, s => {
    const docs = s.docs.filter(d => PREP.has(d.status))
    return docs.find(d => d.status === 'reading' || d.status === 'narrating')
      || docs.find(d => d.status === 'syncing')
      || docs.find(d => d.status === 'queued')
      || null
  })
  // A voice that starts downloading by itself looks random ("some voice is loading when I open the app"):
  // it is always FOR a document whose audio is still being made, so the island says which.
  const voiceFor = useStore(library, s => s.docs.find(d => d.status === 'voicing' && d.voice === eng.voice) || null)
  const gate = useStore(player, s => s.gate)
  const playId = useStore(player, s => s.id)
  const view = useStore(ui, s => s.view)
  const docId = useStore(ui, s => s.docId)
  const online = useOnline()
  const onReaderOf = id => view === 'reader' && docId === id // that page already shows this in full

  // (1) voice error: offline reads differently from other failures, and retry loads the voice that failed.
  if (natural && eng.status === 'error') {
    if (offlineVoice(eng.error)) {
      return { key: 'voice-error', error: true, text: "You're offline. The voice downloads when you're back online." }
    }
    return { key: 'voice-error', error: true, text: "The voice couldn't start.", action: { label: 'Retry', run: () => loadEngine(eng.voice).then(kickVoice).catch(() => {}) } }
  }
  // (2) the listener's own wait comes before everything else.
  if (gate != null && playId && !onReaderOf(playId)) {
    return { key: 'gate', text: 'Making the audio', detail: `Ready in ${waitWords(gate)}. Play starts by itself.`, open: playId }
  }
  // (3) a real voice download. A load from this device's storage (every launch) is routine: silent.
  // `total` is only set when the voice really comes from the network.
  const voice = natural ? voiceWait(eng) : null
  if (voice && (voice.download || gate != null) && !(voiceFor && onReaderOf(voiceFor.id))) {
    return { key: 'voice', text: voice.text, detail: [voice.download && `${voice.mb} MB, one time`, voiceFor && `for “${voiceFor.title}”`].filter(Boolean).join(' · ') || undefined, progress: voice.progress, open: voiceFor?.id }
  }
  // (4) the document actually being processed now.
  if (prep && !onReaderOf(prep.id)) {
    if (prep.status === 'syncing' && !prep.contentVer) {
      return { key: 'prep-' + prep.id, text: 'Waiting for your other device to finish preparing', detail: prep.title, open: prep.id }
    }
    return { key: 'prep-' + prep.id, text: prep.stage || 'Reading the document', detail: prep.title, progress: prep.prep >= 0.01 ? prep.prep : undefined, open: prep.id }
  }
  // (5) offline, only while an action that needs the network is actually pending.
  if (!online && (eng.status === 'loading' || (prep && (prep.status === 'narrating' || prep.status === 'syncing')))) {
    return { key: 'offline', text: "You're offline. This needs a connection." }
  }
  return null
}

// The live island: a small pill that sits above the player and says, in a few words, what is happening now.
// It widens into the full card when there is something to read or do (a tap, an error, a retry), and its
// text slides when the news changes. Size changes are done by layout animation: transforms only.
const ISLAND = { type: 'spring', stiffness: 520, damping: 38, mass: 0.9 }

export function ActivityStrip({ activity, bottom }) {
  const [open, setOpen] = useState(false)
  useEffect(() => { setOpen(false) }, [activity?.key]) // new work starts small
  const wide = !!activity && (open || !!activity.error || !!activity.action)
  const pct = activity?.progress != null ? `${Math.floor(activity.progress * 100)}%` : null
  // What decides the island's size. It is measured for a move only when this changes, not on every tick of
  // the percentage (each measure reads the page's layout: on a phone that was felt).
  const shape = `${wide}|${activity?.text}|${activity?.detail}|${pct?.length}|${!!activity?.error}`
  return (
    <div style={{ position: 'fixed', left: 8, right: 8, zIndex: 34, bottom: `calc(env(safe-area-inset-bottom) + ${bottom + 8}px)`, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <AnimatePresence>
        {activity && (
          <motion.div key="activity" layout layoutDependency={shape} role="status" aria-live="polite" aria-expanded={wide}
            initial={{ opacity: 0, y: 14, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 14, scale: 0.9 }} transition={ISLAND}
            onClick={() => setOpen(o => !o)}
            style={{
              pointerEvents: 'auto', position: 'relative', overflow: 'hidden', cursor: 'pointer',
              width: wide ? '100%' : 'auto', maxWidth: wide ? 460 : 'min(100%, 300px)', height: wide ? ACTIVITY_H - 8 : 34,
              borderRadius: wide ? T.r.md : 17, background: T.bg, border: `1px solid ${activity.error ? T.danger : T.borderHi}`,
              boxShadow: '0 12px 32px rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', gap: wide ? 10 : 8, padding: wide ? '0 8px 0 14px' : '0 14px 0 12px',
            }}>
            <motion.span layout="position" layoutDependency={shape} style={{ display: 'inline-flex', flexShrink: 0 }}><Pulse color={activity.error ? T.danger : T.lime} /></motion.span>
            <motion.div layout="position" layoutDependency={shape} style={{ flex: wide ? 1 : '0 1 auto', minWidth: 0, display: 'grid', gap: 1 }}>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div key={activity.text} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: T.dur.fast }}
                  style={{ fontSize: 13.5, fontWeight: 600, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{activity.text}</motion.div>
              </AnimatePresence>
              {wide && activity.detail && <div style={{ fontFamily: T.mono, fontSize: 11, color: T.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{activity.detail}</div>}
            </motion.div>
            {pct && <motion.div layout="position" layoutDependency={shape} style={{ fontFamily: T.mono, fontSize: 12, color: wide ? T.text : T.sub, paddingRight: wide ? 6 : 0, flexShrink: 0 }}>{pct}</motion.div>}
            {wide && activity.open && !activity.action && (
              <button type="button" onClick={e => { e.stopPropagation(); go('reader', activity.open) }}
                style={{ height: 30, padding: '0 14px', borderRadius: T.r.pill, border: `1px solid ${T.borderHi}`, background: 'transparent', color: T.text, fontFamily: T.font, fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                Open
              </button>
            )}
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
    </div>
  )
}
