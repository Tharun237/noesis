import { useEffect, useState } from 'react'
import { T, label } from '../theme.js'
import { useStore } from '../lib/store.js'
import { ui, toast } from '../lib/nav.js'
import { settings, hasKey } from '../lib/settings.js'
import { engine, loadEngine } from '../lib/tts.js'
import { deleteAllAudio, kickVoice } from '../lib/library.js'
import { VOICES } from '../lib/voices.js'
import { Button, IconButton, Segmented, Toggle, Field, Progress, inputStyle } from './kit.jsx'
import { AccountCard } from './AccountCard.jsx'

const DEVICE = { webgpu: 'WebGPU (graphics chip)', wasm: 'WebAssembly (processor)' }

export function Settings({ wide }) {
  const s = useStore(settings)
  return (
    <div style={{ minHeight: '100%' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 20, background: T.bg, display: 'flex', alignItems: 'center', gap: 8, padding: `calc(env(safe-area-inset-top) + 8px) ${wide ? 20 : 8}px 8px`, borderBottom: `1px solid ${T.border}` }}>
        <IconButton icon="back" label="Back" onClick={() => history.back()} />
        <div style={{ fontSize: 17, fontWeight: 700 }}>Settings</div>
      </header>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: wide ? '36px 24px 140px' : '20px 16px 160px', display: 'grid', gap: 18 }}>
        <AccountCard Card={Card} />
        <EngineCard />
        <GeminiCard />
        <Card title="Listening">
          <Field title="Default voice">
            <select value={s.voice} onChange={e => settings.set({ voice: e.target.value })} style={{ ...inputStyle, appearance: 'auto' }}>
              {VOICES.map(v => <option key={v.id} value={v.id} style={{ background: T.bg }}>{v.name} · {v.accent} {v.g === 'F' ? 'female' : 'male'} · grade {v.grade}</option>)}
            </select>
          </Field>
          <Field title={`Default speed · ${s.speed}x`}>
            <input type="range" min={0.5} max={3} step={0.05} value={s.speed} onChange={e => settings.set({ speed: +e.target.value })} style={{ accentColor: T.accent, width: '100%' }} />
          </Field>
          <Toggle checked={s.skipVisuals} onChange={v => settings.set({ skipVisuals: v })} labelText="Skip figure, table, equation and code descriptions"
            hint="They stay in the transcript; playback jumps over them." />
        </Card>
        <StorageCard />
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

function EngineCard() {
  const e = useStore(engine)
  const pref = useStore(settings, s => s.engine)
  return (
    <Card title="Voice engine">
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>
          {e.status === 'ready' ? `Ready · ${DEVICE[e.device]}` : e.status === 'loading' ? 'Downloading the voice model…' : e.status === 'error' ? 'Failed to start' : 'Not loaded yet'}
        </div>
        <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.5 }}>
          Kokoro-82M runs entirely on this device. It downloads once (about 90 MB, or about 330 MB for the faster WebGPU build) and then works offline. Your documents never leave this device for voicing.
        </div>
        {e.status === 'loading' && e.total > 0 && <Progress value={e.loaded / e.total} />}
        {e.status === 'error' && <div style={{ fontFamily: T.mono, fontSize: 12, color: T.danger }}>{e.error}</div>}
      </div>
      <Field title="Compute" hint="Auto uses the graphics chip on computers and the compact build on phones. Changes apply after reloading the app.">
        <Segmented value={pref} onChange={v => { settings.set({ engine: v }); toast('Reload Noesis to switch engines') }} size="sm"
          options={[{ value: 'auto', label: 'Auto' }, { value: 'webgpu', label: 'WebGPU' }, { value: 'wasm', label: 'Compact' }]} />
      </Field>
      {e.status !== 'ready' && e.status !== 'loading' && (
        <Button kind="accent" icon="download" onClick={() => loadEngine().then(kickVoice).catch(() => {})}>{e.status === 'error' ? 'Retry' : 'Download now'}</Button>
      )}
    </Card>
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
        <Button kind="accent" onClick={() => test()} disabled={draft.trim().length < 20 || state === 'testing'}>{state === 'testing' ? 'Checking…' : 'Save & test'}</Button>
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

function StorageCard() {
  const [est, setEst] = useState(null)
  const [persisted, setPersisted] = useState(null)
  const refresh = () => {
    navigator.storage?.estimate?.().then(setEst)
    navigator.storage?.persisted?.().then(setPersisted)
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
      <div style={{ fontFamily: T.mono, fontSize: 11.5, color: T.faint }}>Noesis {__APP_VERSION__} · build {__APP_BUILD__.slice(0, 16).replace('T', ' ')} · free & open source (MIT) · voices by Kokoro-82M (Apache-2.0)</div>
    </Card>
  )
}
