// Settings → AI. The customer brings the AI: Gemini, NVIDIA, or any service that speaks the OpenAI
// protocol at an address they type. Each provider keeps its own key and model.
import { useEffect, useRef, useState } from 'react'
import { T } from '../theme.js'
import { useStore } from '../lib/store.js'
import { settings, hasKey } from '../lib/settings.js'
import { PROVIDERS, hasAiKey, isNvidiaKey, cleanBase, hostOf, listAiModels, testModel, checkModels } from '../lib/ai.js'
import { Button, IconButton, Segmented, Toggle, Field, inputStyle } from './kit.jsx'

const KEY = { gemini: 'geminiKey', nvidia: 'nvidiaKey', custom: 'customKey' }
const MODEL = { gemini: 'geminiModel', nvidia: 'nvidiaModel', custom: 'customModel' }
const KEY_HINT = { gemini: 'Paste your Gemini API key', nvidia: 'Paste your NVIDIA API key (nvapi-…)', custom: 'API key (leave empty for a local server)' }
const OFFLINE = 'No connection. Your key is saved. Test again when online.'

const text = { fontSize: 13.5, color: T.sub, lineHeight: 1.55 }
const small = { fontSize: 12.5, color: T.sub, lineHeight: 1.55 }
const strong = { color: T.text }
const link = { color: T.accent }

function About({ id }) {
  if (id === 'gemini') return (
    <div style={text}>
      Add your own free Google Gemini key to unlock <span style={strong}>translation</span>, <span style={strong}>summaries</span>, <span style={strong}>Ask</span>, figure and table descriptions,
      spoken math, and reading <span style={strong}>scanned PDFs</span>. The key is stored only on this device and sent only to Google. Get one free at{' '}
      <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" style={link}>aistudio.google.com/apikey</a>.
    </div>
  )
  if (id === 'nvidia') return (
    <>
      <div style={text}>
        Add your own NVIDIA key to unlock <span style={strong}>translation</span>, <span style={strong}>summaries</span> and <span style={strong}>Ask</span>.
        Free from <a href="https://build.nvidia.com" target="_blank" rel="noreferrer" style={link}>build.nvidia.com</a> with your own account.
      </div>
      <div style={small}>NVIDIA does not accept requests straight from a browser, so your key and the text travel through Noesis&apos;s relay to reach NVIDIA. Nothing is stored.</div>
    </>
  )
  return (
    <div style={text}>
      Use any service that speaks the OpenAI protocol: OpenRouter, Groq, OpenAI, or a model running on your own computer. Type its address, your key and the model.
      Your key and the text go straight from this device to that address, nowhere else.
    </div>
  )
}

export function AiCard({ Card }) {
  const id = useStore(settings, s => s.aiProvider || 'gemini')
  const savedKey = useStore(settings, s => s[KEY[id]] || '')
  const savedBase = useStore(settings, s => s.customBase || '')
  const model = useStore(settings, s => s[MODEL[id]] || '')
  const checks = useStore(settings, s => s.modelChecks?.[id]) || []
  const ai = useStore(settings, s => s.aiNarration)
  const connectedNow = useStore(settings, s => hasAiKey(s))
  const [draft, setDraft] = useState(savedKey)
  const [base, setBase] = useState(savedBase)
  const [show, setShow] = useState(false)
  const [models, setModels] = useState(null)
  const [state, setState] = useState(null) // null | 'testing' | 'ok' | an error sentence
  const [probe, setProbe] = useState(null) // null | 'testing' | { seconds } | { error }
  const [scan, setScan] = useState(null) // null | { checked, total, working }
  const stop = useRef(null)
  const openai = id !== 'gemini'
  const who = id === 'nvidia' ? 'NVIDIA' : hostOf(savedBase) || 'The provider'
  const ready = id === 'gemini' ? draft.trim().length > 20 : id === 'nvidia' ? isNvidiaKey(draft) : !!cleanBase(base)

  async function load(auto = false) {
    setState('testing')
    try {
      setModels(await listAiModels())
      setState('ok')
    } catch (e) {
      const offline = !navigator.onLine || /failed to fetch|networkerror|load failed|network request failed/i.test(e.message || '')
      setModels(null)
      setState(auto && offline ? null : offline && id !== 'custom' ? OFFLINE : e.message)
    }
  }
  function save() {
    settings.set({ [KEY[id]]: draft.trim(), ...(id === 'custom' ? { customBase: cleanBase(base) } : {}) })
    load()
  }
  // Another provider: its own key, address and model list.
  useEffect(() => {
    const s = settings.get()
    stop.current?.abort()
    setDraft(s[KEY[id]] || ''); setBase(s.customBase || ''); setModels(null); setState(null); setProbe(null); setScan(null)
    if (hasAiKey(s) || (id === 'gemini' ? s.geminiKey : id === 'nvidia' ? isNvidiaKey(s.nvidiaKey) : cleanBase(s.customBase))) load(true)
    return () => stop.current?.abort()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Choosing a model asks it one tiny question, so the customer knows at once whether it answers and how fast.
  async function choose(m) {
    settings.set({ [MODEL[id]]: m })
    if (!openai || !m) return setProbe(null)
    setProbe('testing')
    try { setProbe(await testModel()) } catch (e) { setProbe({ error: e.message }) }
  }
  async function findWorking() {
    stop.current = new AbortController()
    setScan({ checked: 0, total: models.length, working: 0 })
    const found = await checkModels(models.map(m => m.id), { onProgress: setScan, signal: stop.current.signal })
    // A check that was stopped has not seen every model: its result would read as "the rest do not answer".
    if (!stop.current.signal.aborted) settings.set({ modelChecks: { ...settings.get().modelChecks, [id]: found } })
    setScan(null)
  }
  const checked = new Map(checks.map(c => [c.id, c.s]))
  const rest = (models || []).filter(m => !checked.has(m.id))

  return (
    <Card title="AI" right={connectedNow && state === 'ok' ? <span style={{ fontFamily: T.mono, fontSize: 11.5, color: T.ok }}>connected</span> : null}>
      <Segmented value={id} onChange={v => settings.set({ aiProvider: v })} options={PROVIDERS.map(p => ({ value: p.id, label: p.label }))} />
      <About id={id} />
      {id === 'custom' && (
        <input value={base} onChange={e => setBase(e.target.value)} placeholder="Address, for example https://openrouter.ai/api/v1" autoComplete="off" spellCheck={false} inputMode="url"
          aria-label="Provider address" style={{ ...inputStyle, fontFamily: T.mono, fontSize: 13 }} />
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={draft} onChange={e => setDraft(e.target.value)} type={show ? 'text' : 'password'} placeholder={KEY_HINT[id]} autoComplete="off" spellCheck={false}
          aria-label="API key" style={{ ...inputStyle, flex: 1, minWidth: 0, fontFamily: T.mono, fontSize: 13 }} />
        <IconButton icon="eye" active={show} label={show ? 'Hide key' : 'Show key'} onClick={() => setShow(!show)} size={46} />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button kind="primary" onClick={save} disabled={!ready || state === 'testing'}>{state === 'testing' ? 'Checking…' : 'Save & test'}</Button>
        {(savedKey || (id === 'custom' && savedBase)) && <Button kind="danger" onClick={() => {
          settings.set({ [KEY[id]]: '', ...(openai ? { [MODEL[id]]: '' } : {}), ...(id === 'custom' ? { customBase: '' } : {}) })
          setDraft(''); setBase(''); setModels(null); setState(null); setProbe(null)
        }}>Remove</Button>}
        {state && state !== 'ok' && state !== 'testing' && <span style={{ fontSize: 12.5, color: state === OFFLINE ? T.sub : T.danger }}>{state}</span>}
      </div>

      {id === 'gemini' && models && (
        <Field title="Model" hint="gemini-flash-latest always points to Google's newest Flash model.">
          <select value={model} onChange={e => choose(e.target.value)} style={{ ...inputStyle, appearance: 'auto' }}>
            {[{ id: 'gemini-flash-latest', name: 'Gemini Flash (latest)' }, ...models.filter(m => m.id !== 'gemini-flash-latest')].map(m => (
              <option key={m.id} value={m.id} style={{ background: T.bg }}>{m.name} · {m.id}</option>
            ))}
          </select>
        </Field>
      )}

      {openai && models && (
        <Field title="Model" hint={checks.length ? null : `${who} lists ${models.length} models. Not every listed model answers on every account: check which ones do.`}>
          <select value={model} onChange={e => choose(e.target.value)} style={{ ...inputStyle, appearance: 'auto' }}>
            <option value="" style={{ background: T.bg }}>Choose a model…</option>
            {checks.length > 0 && (
              <optgroup label="Answered the last check, fastest first">
                {checks.map(c => <option key={c.id} value={c.id} style={{ background: T.bg }}>{c.id} · {c.s} s</option>)}
              </optgroup>
            )}
            <optgroup label={checks.length ? 'Did not answer, or not checked' : 'Listed by the provider'}>
              {rest.map(m => <option key={m.id} value={m.id} style={{ background: T.bg }}>{m.id}</option>)}
            </optgroup>
          </select>
        </Field>
      )}
      {openai && !models && id === 'custom' && cleanBase(savedBase) && (
        <Field title="Model" hint="This address did not give a list of models. Type the model's name as the provider writes it.">
          <input value={model} onChange={e => settings.set({ customModel: e.target.value })} onBlur={e => choose(e.target.value.trim())} placeholder="Model name" autoComplete="off" spellCheck={false}
            style={{ ...inputStyle, fontFamily: T.mono, fontSize: 13 }} />
        </Field>
      )}
      {openai && probe && (
        <div style={{ ...small, color: probe.error ? T.danger : probe === 'testing' ? T.sub : T.ok }}>
          {probe === 'testing' ? 'Asking the model one question…' : probe.error || `This model answers. First reply in ${probe.seconds.toFixed(1)} s.`}
        </div>
      )}
      {openai && models && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {scan
            ? <Button onClick={() => stop.current?.abort()}>Stop</Button>
            : <Button onClick={findWorking}>{checks.length ? 'Check again' : 'Find the models that work'}</Button>}
          <span style={{ ...small, fontFamily: T.mono, fontSize: 12 }}>
            {scan ? `Checked ${scan.checked} of ${scan.total} · ${scan.working} answer` : checks.length ? `${checks.length} of ${models.length} answered the last check` : `One small request per model: about ${Math.ceil(models.length * 2.2 / 60)} min`}
          </span>
        </div>
      )}

      {id === 'gemini'
        ? <Toggle checked={ai} onChange={v => settings.set({ aiNarration: v })} disabled={!hasKey()} labelText="AI narration for PDFs by default"
            hint="Better for papers and textbooks. One request per 5 pages, in order: a 700-page book is 140 requests." />
        : <div style={small}>Reading scanned pages as images works with Gemini only for now.</div>}
    </Card>
  )
}
