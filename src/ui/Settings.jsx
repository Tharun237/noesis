import { useEffect, useState } from 'react'
import { T, label, eyebrow } from '../theme.js'
import { useStore } from '../lib/store.js'
import { ui, toast, goBack, openSheet } from '../lib/nav.js'
import { settings, hasKey } from '../lib/settings.js'
import { hasAiKey, isNvidiaKey, listAiModels } from '../lib/ai.js'
import { deleteAllAudio } from '../lib/library.js'
import { Button, IconButton, Segmented, Toggle, Field, inputStyle } from './kit.jsx'
import { AccountCard } from './AccountCard.jsx'
import { VoiceCard } from './VoiceCard.jsx'
import { DiagnosticsCard } from './Diagnostics.jsx'
import { CreditsCard } from './Credits.jsx'


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
        <AiCard />
        <StorageCard />
        <DiagnosticsCard Card={Card} />
        <CreditsCard Card={Card} />
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

function AiCard() {
  const provider = useStore(settings, s => s.aiProvider || 'gemini')
  const gKey = useStore(settings, s => s.geminiKey)
  const gModel = useStore(settings, s => s.geminiModel)
  const nKey = useStore(settings, s => s.nvidiaKey)
  const nModel = useStore(settings, s => s.nvidiaModel)
  const ai = useStore(settings, s => s.aiNarration)
  const [gDraft, setGDraft] = useState(gKey)
  const [nDraft, setNDraft] = useState(nKey)
  const [show, setShow] = useState(false)
  const [models, setModels] = useState(null)
  const [state, setState] = useState(null)

  const nvidia = provider === 'nvidia'
  const key = nvidia ? nKey : gKey
  const model = nvidia ? nModel : gModel
  const draft = nvidia ? nDraft : gDraft
  const setDraft = nvidia ? setNDraft : setGDraft
  const validLook = nvidia ? isNvidiaKey(draft) : draft.trim().length > 20

  async function test(k = draft.trim(), auto = false) {
    setState('testing')
    try {
      if (nvidia) {
        settings.set({ nvidiaKey: k })
        const list = await listAiModels()
        setModels(list)
      } else {
        const { listModels } = await import('../lib/gemini.js')
        const list = await listModels(k)
        setModels(list.map(m => ({ id: m.id, name: m.label || m.id })))
        settings.set({ geminiKey: k })
      }
      setState('ok')
    } catch (e) {
      const offline = !navigator.onLine || /failed to fetch|networkerror|load failed|network request failed/i.test(e.message || '')
      if (auto && offline) { setState(null); return }
      setState(offline ? 'No connection. Your key is saved. Test again when online.' : e.message)
    }
  }
  useEffect(() => {
    setModels(null); setState(null)
    const s = settings.get()
    if (s.aiProvider === 'nvidia') { if (isNvidiaKey(s.nvidiaKey)) test(s.nvidiaKey.trim(), true) }
    else if (s.geminiKey) test(s.geminiKey.trim(), true)
  }, [provider]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (nvidia) { if (isNvidiaKey(nKey) && !models) test(nKey.trim(), true) }
    else if (gKey && !models) test(gKey.trim(), true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card title="AI" right={hasAiKey() && state === 'ok' ? <span style={{ fontFamily: T.mono, fontSize: 11.5, color: T.ok }}>connected</span> : null}>
      <Segmented value={provider} onChange={v => settings.set({ aiProvider: v })}
        options={[{ value: 'gemini', label: 'Gemini' }, { value: 'nvidia', label: 'NVIDIA' }]} />
      {nvidia ? (
        <div style={{ fontSize: 13.5, color: T.sub, lineHeight: 1.55 }}>
          Add your own free NVIDIA key to unlock <span style={{ color: T.text }}>summaries</span>, <span style={{ color: T.text }}>translation</span> and <span style={{ color: T.text }}>Ask</span>.
          Free from build.nvidia.com with your own account.
        </div>
      ) : (
        <div style={{ fontSize: 13.5, color: T.sub, lineHeight: 1.55 }}>
          Add your own free Google Gemini key to unlock <span style={{ color: T.text }}>summaries</span>, <span style={{ color: T.text }}>figure and table descriptions</span>, spoken math, and reading <span style={{ color: T.text }}>scanned PDFs</span>.
          The key is stored only on this device and sent only to Google. Get one free at{' '}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" style={{ color: T.accent }}>aistudio.google.com/apikey</a>.
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={draft} onChange={e => setDraft(e.target.value)} type={show ? 'text' : 'password'} placeholder={nvidia ? 'Paste your NVIDIA API key (nvapi-…)' : 'Paste your Gemini API key'} autoComplete="off" spellCheck={false}
          style={{ ...inputStyle, flex: 1, fontFamily: T.mono, fontSize: 13 }} />
        <IconButton icon="eye" active={show} label={show ? 'Hide key' : 'Show key'} onClick={() => setShow(!show)} size={46} />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button kind="primary" onClick={() => test()} disabled={!validLook || state === 'testing'}>{state === 'testing' ? 'Checking…' : 'Save & test'}</Button>
        {key && <Button kind="danger" onClick={() => {
          if (nvidia) { settings.set({ nvidiaKey: '', nvidiaModel: '' }); setNDraft('') } else { settings.set({ geminiKey: '' }); setGDraft('') }
          setModels(null); setState(null)
        }}>Remove key</Button>}
        {state && state !== 'ok' && state !== 'testing' && <span style={{ fontSize: 12.5, color: state === 'No connection. Your key is saved. Test again when online.' ? T.sub : T.danger }}>{state}</span>}
      </div>
      {nvidia && (
        <div style={{ fontSize: 12.5, color: T.sub, lineHeight: 1.55 }}>
          NVIDIA does not accept requests straight from a browser, so your key and the text travel through Noesis&apos;s relay to reach NVIDIA. Nothing is stored.
        </div>
      )}
      {models && (
        nvidia ? (
          <Field title="Model">
            <select value={model} onChange={e => settings.set({ nvidiaModel: e.target.value })} style={{ ...inputStyle, appearance: 'auto' }}>
              <option value="" style={{ background: T.bg }}>Choose a model…</option>
              {models.map(m => (
                <option key={m.id} value={m.id} style={{ background: T.bg }}>{m.name}</option>
              ))}
            </select>
          </Field>
        ) : (
          <Field title="Model" hint="gemini-flash-latest always points to Google's newest Flash model.">
            <select value={model} onChange={e => settings.set({ geminiModel: e.target.value })} style={{ ...inputStyle, appearance: 'auto' }}>
              {[{ id: 'gemini-flash-latest', name: 'Gemini Flash (latest)' }, ...models.filter(m => m.id !== 'gemini-flash-latest')].map(m => (
                <option key={m.id} value={m.id} style={{ background: T.bg }}>{m.name} · {m.id}</option>
              ))}
            </select>
          </Field>
        )
      )}
      {!nvidia && (
        <Toggle checked={ai} onChange={v => settings.set({ aiNarration: v })} disabled={!hasKey()} labelText="AI narration for PDFs by default"
          hint="Better for papers and textbooks. One request per 5 pages, in order: a 700-page book is 140 requests." />
      )}
    </Card>
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
