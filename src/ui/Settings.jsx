import { useEffect, useState } from 'react'
import { T, label, eyebrow } from '../theme.js'
import { useStore } from '../lib/store.js'
import { ui, toast, goBack, openSheet } from '../lib/nav.js'
import { settings, hasKey } from '../lib/settings.js'
import { AiCard } from './AiCard.jsx'
import { deleteAllAudio } from '../lib/library.js'
import { Button, IconButton, Segmented, Toggle, Field, inputStyle } from './kit.jsx'
import { AccountCard } from './AccountCard.jsx'
import { VoiceCard } from './VoiceCard.jsx'
import { DiagnosticsCard } from './Diagnostics.jsx'
import { CreditsCard } from './Credits.jsx'
import { AmbientCard } from './AmbientCard.jsx'
import { AwarenessCard } from './AwarenessCard.jsx'
import { askAware } from '../lib/extras.js'
import { REDUCE, phoneAsksForLess } from '../lib/motion.js'


export function Settings({ wide }) {
  const s = useStore(settings)
  return (
    <div style={{ minHeight: '100%' }}>
      {wide && (
        <header style={{ position: 'sticky', top: 0, zIndex: 20, background: T.bg, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 20px', borderBottom: `1px solid ${T.border}` }}>
          <IconButton icon="back" label="Back" onClick={goBack} />
        </header>
      )}
      <div style={{ maxWidth: 680, margin: '0 auto', padding: wide ? '28px 24px 140px' : 'calc(env(safe-area-inset-top) + 28px) 16px 40px', display: 'grid', gap: 18 }}>
        <div style={{ padding: '0 4px 6px' }}>
          <div style={eyebrow}>Noesis · v{__APP_VERSION__}</div>
          <h1 style={{ margin: '10px 0 0', fontSize: wide ? 44 : 34, fontWeight: 800, letterSpacing: '-0.045em', lineHeight: 1, color: T.text }}>Settings</h1>
        </div>
        <AccountCard Card={Card} />
        <VoiceCard Card={Card} />
        <AmbientCard Card={Card} mode={s.ambientMode || 'off'} volume={s.ambientVolume ?? 0.5} haptics={!!s.haptics}
          onChange={c => settings.set({ ...('mode' in c ? { ambientMode: c.mode } : {}), ...('volume' in c ? { ambientVolume: c.volume } : {}), ...('haptics' in c ? { haptics: c.haptics } : {}) })} />
        <MotionCard choice={s.motion || 'system'} />
        {/* A switch turned on asks for the microphone there and then; it stays off if the answer is no. */}
        <AwarenessCard Card={Card} slow={!!s.awareSlow} clear={!!s.awareClear} pauseOnSpeech={!!s.awarePause}
          onChange={async c => {
            const next = 'slow' in c ? { awareSlow: c.slow } : 'clear' in c ? { awareClear: c.clear } : { awarePause: c.pauseOnSpeech }
            if (Object.values(next)[0] && !(await askAware())) return
            settings.set(next)
          }} />
        <Card title="Listening">
          <Field title={`Default speed · ${s.speed}x`}>
            <input type="range" min={0.5} max={3} step={0.05} value={s.speed} onChange={e => settings.set({ speed: +e.target.value })} style={{ accentColor: T.accent, width: '100%' }} />
          </Field>
          <Toggle checked={s.skipVisuals} onChange={v => settings.set({ skipVisuals: v })} labelText="Skip figure, table, equation and code descriptions"
            hint="They stay in the transcript; playback jumps over them." />
          <Toggle checked={s.lockScreenWords} onChange={v => settings.set({ lockScreenWords: v })} labelText="Show the words being read on the lock screen"
            hint="The notification follows the speech, a few words at a time." />
          {/Android/i.test(navigator.userAgent) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>Lock-screen controls</div>
              </div>
              <Button onClick={() => openSheet('lockscreen')}>Show me how</Button>
            </div>
          )}
          <Toggle checked={s.autoplayNext} onChange={v => settings.set({ autoplayNext: v })} labelText="Play the next document automatically"
            hint="When a document ends, the next unfinished one in your queue starts, in the library's sort order." />
          <Toggle checked={s.archiveFinished} onChange={v => settings.set({ archiveFinished: v })} labelText="Archive documents when finished"
            hint="Keeps your queue to what you haven't heard yet." />
        </Card>
        <AiCard Card={Card} />
        <StorageCard />
        <DiagnosticsCard Card={Card} />
        <CreditsCard Card={Card} />
        <AppCard />
      </div>
    </div>
  )
}

// Motion: the phone's own setting is followed unless the customer says otherwise, and the card says plainly
// what is happening. (A phone in battery saver asks every app for less motion: Noesis then looked dead, and
// nothing told the owner why.)
const MOTION_OPTIONS = [{ value: 'system', label: 'Follow my phone' }, { value: 'full', label: 'Full' }, { value: 'less', label: 'Less' }]
function MotionCard({ choice }) {
  const [asks, setAsks] = useState(phoneAsksForLess)
  useEffect(() => {
    const q = matchMedia(REDUCE)
    const on = () => setAsks(q.matches)
    q.addEventListener('change', on)
    return () => q.removeEventListener('change', on)
  }, [])
  const line = choice === 'full' ? 'Noesis moves in full, whatever your phone is set to.'
    : choice === 'less' ? 'Noesis keeps to gentle fades.'
    : asks ? 'Your phone is asking apps for less motion right now (battery saver and "Remove animations" both do this), so Noesis is keeping almost still. Choose Full to have its motion anyway.'
    : 'Your phone allows motion, and Noesis moves in full.'
  return (
    <Card title="Motion">
      <Segmented options={MOTION_OPTIONS} value={choice} onChange={v => settings.set({ motion: v })} />
      <p style={{ fontSize: 13, lineHeight: 1.55, color: asks && choice === 'system' ? T.text : T.sub, margin: 0 }}>{line}</p>
    </Card>
  )
}

function Card({ title, children, right }) {
  return (
    <section data-rise="0"
      style={{ padding: 20, borderRadius: T.r.lg, border: `1px solid ${T.border}`, background: T.surface, display: 'grid', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}><div style={{ ...label, flex: 1 }}>{title}</div>{right}</div>
      {children}
    </section>
  )
}

// Where the voice worker caches downloaded voices (tts.worker.js): separate from the library database.
const MODEL_CACHE = 'noesis-voices'

function StorageCard() {
  const [est, setEst] = useState(null)
  const [hasModel, setHasModel] = useState(false)
  const refresh = () => {
    navigator.storage?.estimate?.().then(setEst)
    globalThis.caches?.has(MODEL_CACHE).then(setHasModel)
  }
  useEffect(refresh, [])
  const gb = n => (n > 1073741824 ? `${(n / 1073741824).toFixed(1)} GB` : `${Math.round(n / 1048576)} MB`)
  return (
    <Card title="Storage">
      <div style={{ fontSize: 14, color: T.sub, lineHeight: 1.55 }}>
        {est ? <>Using <span style={{ color: T.text, fontFamily: T.mono }}>{gb(est.usage)}</span> of {gb(est.quota)} available. </> : null}
        Noesis asked your browser to keep this storage. You can still clear it in browser settings.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button kind="danger" icon="trash" onClick={async () => {
          if (!confirm('Delete all generated audio? Your documents stay; audio regenerates when you play them.')) return
          await deleteAllAudio(); refresh(); toast('Audio deleted')
        }}>Delete generated audio</Button>
        {hasModel && (
          <Button kind="danger" icon="trash" onClick={async () => {
            if (!confirm('Remove the downloaded natural voices? Your documents and audio stay. A voice downloads again the next time it is needed.')) return
            await caches.delete(MODEL_CACHE); toast('Downloaded voices removed'); setTimeout(() => location.reload(), 900) // also frees it from memory
          }}>Remove downloaded voices</Button>
        )}
      </div>
    </Card>
  )
}

function AppCard() {
  const evt = useStore(ui, s => s.installEvt)
  const installed = useStore(ui, s => s.installed)
  const ios = /iPhone|iPad/.test(navigator.userAgent)
  return (
    <Card title="App">
      <div style={{ fontSize: 14, color: T.sub, lineHeight: 1.55 }}>
        {installed ? 'Noesis is installed on this device.'
          : evt ? 'Install Noesis for a full-screen app with its own icon, offline use and lock-screen controls. No app store needed.'
          : ios ? 'To install: tap Share, then "Add to Home Screen".'
          : 'Open your browser menu and choose "Install app" or "Add to Home screen".'}
      </div>
      {evt && !installed && (
        <Button kind="primary" icon="install" onClick={async () => { evt.prompt(); const r = await evt.userChoice; if (r.outcome === 'accepted') ui.set({ installEvt: null }) }}>Install Noesis</Button>
      )}
      <div style={{ fontFamily: T.mono, fontSize: 11.5, color: T.faint }}>Noesis {__APP_VERSION__} · build {__APP_BUILD__.slice(0, 16).replace('T', ' ')} · free to use · voices by Piper (rhasspy/piper-voices; public domain, CC0 and CC BY voices only)</div>
    </Card>
  )
}
