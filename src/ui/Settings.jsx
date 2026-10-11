import { useEffect, useState } from 'react'
import { T, label, eyebrow } from '../theme.js'
import { useStore } from '../lib/store.js'
import { ui, toast, goBack } from '../lib/nav.js'
import { settings, hasKey } from '../lib/settings.js'
import { deleteAllAudio } from '../lib/library.js'
import { Button, IconButton, Toggle, Field, inputStyle } from './kit.jsx'
import { AccountCard } from './AccountCard.jsx'
import { VoiceCard } from './VoiceCard.jsx'
import { DiagnosticsCard } from './Diagnostics.jsx'


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
        <Card title="Listening">
          <Field title={`Default speed · ${s.speed}x`}>
            <input type="range" min={0.5} max={3} step={0.05} value={s.speed} onChange={e => settings.set({ speed: +e.target.value })} style={{ accentColor: T.accent, width: '100%' }} />
          </Field>
          <Toggle checked={s.skipVisuals} onChange={v => settings.set({ skipVisuals: v })} labelText="Skip figure, table, equation and code descriptions"
            hint="They stay in the transcript; playback jumps over them." />
          <Toggle checked={s.autoplayNext} onChange={v => settings.set({ autoplayNext: v })} labelText="Play the next document automatically"
            hint="When a document ends, the next unfinished one in your queue starts, in the library's sort order." />
          <Toggle checked={s.archiveFinished} onChange={v => settings.set({ archiveFinished: v })} labelText="Archive documents when finished"
            hint="Keeps your queue to what you haven't heard yet." />
        </Card>
        <GeminiCard />
        <StorageCard />
        <DiagnosticsCard Card={Card} />
        <AppCard />
      </div>
    </div>
  )
}

function Card({ title, children, right }) {
  return (
    <section style={{ padding: 20, borderRadius: T.r.lg, border: `1px solid ${T.border}`, background: T.surface, display: 'grid', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}><div style={{ ...label, flex: 1 }}>{title}</div>{right}</div>
      {children}
    </section>
  )
}

function GeminiCard() {
  const key = useStore(settings, s => s.geminiKey)
  const model = useStore(settings, s => s.geminiModel)
  const ai = useStore(settings, s => s.aiNarration)
  const [draft, setDraft] = useState(key)
  const [show, setShow] = useState(false)
  const [models, setModels] = useState(null)
  const [state, setState] = useState(null)

  async function test(k = draft.trim()) {
    setState('testing')
    try {
      const { listModels } = await import('../lib/gemini.js')
      const list = await listModels(k)
      setModels(list)
      settings.set({ geminiKey: k })
      setState('ok')
    } catch (e) {
      setState(e.message)
    }
  }
  useEffect(() => { if (key && !models) test(key) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card title="AI features · optional" right={hasKey() && state === 'ok' ? <span style={{ fontFamily: T.mono, fontSize: 11.5, color: T.ok }}>connected</span> : null}>
      <div style={{ fontSize: 13.5, color: T.sub, lineHeight: 1.55 }}>
        Add your own free Google Gemini key to unlock <span style={{ color: T.text }}>summaries</span>, <span style={{ color: T.text }}>figure and table descriptions</span>, spoken math, and reading <span style={{ color: T.text }}>scanned PDFs</span>.
        The key is stored only on this device and sent only to Google. Get one free at{' '}
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" style={{ color: T.accent }}>aistudio.google.com/apikey</a>.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={draft} onChange={e => setDraft(e.target.value)} type={show ? 'text' : 'password'} placeholder="Paste your Gemini API key" autoComplete="off" spellCheck={false}
          style={{ ...inputStyle, flex: 1, fontFamily: T.mono, fontSize: 13 }} />
        <IconButton icon="eye" active={show} label={show ? 'Hide key' : 'Show key'} onClick={() => setShow(!show)} size={46} />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button kind="primary" onClick={() => test()} disabled={draft.trim().length < 20 || state === 'testing'}>{state === 'testing' ? 'Checking…' : 'Save & test'}</Button>
        {key && <Button kind="danger" onClick={() => { settings.set({ geminiKey: '' }); setDraft(''); setModels(null); setState(null) }}>Remove key</Button>}
        {state && state !== 'ok' && state !== 'testing' && <span style={{ fontSize: 12.5, color: T.danger }}>{state}</span>}
      </div>
      {models && (
        <Field title="Model" hint="gemini-flash-latest always points to Google's newest Flash model.">
          <select value={model} onChange={e => settings.set({ geminiModel: e.target.value })} style={{ ...inputStyle, appearance: 'auto' }}>
            {[{ id: 'gemini-flash-latest', label: 'Gemini Flash (latest)' }, ...models.filter(m => m.id !== 'gemini-flash-latest')].map(m => (
              <option key={m.id} value={m.id} style={{ background: T.bg }}>{m.label} · {m.id}</option>
            ))}
          </select>
        </Field>
      )}
      <Toggle checked={ai} onChange={v => settings.set({ aiNarration: v })} disabled={!hasKey()} labelText="AI narration for PDFs by default"
        hint="Better for papers and textbooks. Uses more of your free quota; long books take a few minutes to prepare." />
    </Card>
  )
}

// Where the voice worker caches downloaded voices (tts.worker.js): separate from the library database.
const MODEL_CACHE = 'noesis-voices'

function StorageCard() {
  const [est, setEst] = useState(null)
  const [persisted, setPersisted] = useState(null)
  const [hasModel, setHasModel] = useState(false)
  const refresh = () => {
    navigator.storage?.estimate?.().then(setEst)
    navigator.storage?.persisted?.().then(setPersisted)
    globalThis.caches?.has(MODEL_CACHE).then(setHasModel)
  }
  useEffect(refresh, [])
  const gb = n => (n > 1073741824 ? `${(n / 1073741824).toFixed(1)} GB` : `${Math.round(n / 1048576)} MB`)
  return (
    <Card title="Storage">
      <div style={{ fontSize: 14, color: T.sub, lineHeight: 1.55 }}>
        {est ? <>Using <span style={{ color: T.text, fontFamily: T.mono }}>{gb(est.usage)}</span> of {gb(est.quota)} available. </> : null}
        {persisted === true ? 'Storage is persistent, so your browser will not clear it.' : persisted === false ? 'Storage may be cleared by the browser when space runs low. Installing Noesis makes it persistent.' : ''}
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
      <div style={{ fontFamily: T.mono, fontSize: 11.5, color: T.faint }}>Noesis {__APP_VERSION__} · build {__APP_BUILD__.slice(0, 16).replace('T', ' ')} · free & open source (MIT) · voices by Piper (rhasspy/piper-voices; public domain, CC0 and CC BY voices only)</div>
    </Card>
  )
}
