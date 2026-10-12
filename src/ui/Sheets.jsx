import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { T, label } from '../theme.js'
import { useStore } from '../lib/store.js'
import { ui, closeSheet, go, toast } from '../lib/nav.js'
import { settings, hasKey } from '../lib/settings.js'
import { hasAiKey } from '../lib/ai.js'
import { LANGS } from '../lib/lang.js'
import { library, addDocument, changeVoice, addCollection, toggleInCollection, listenIn } from '../lib/library.js'
import { synthesize, recordToBlob, loadEngine, engine, voiceWait } from '../lib/tts.js'
import { kindOf, ACCEPT } from '../ingest/index.js'
import { looksMarkdown } from '../ingest/text.js'
import { voiceName, voicesFor } from '../lib/voices.js'
import { isCloudVoice, cloudTruth } from '../lib/cloudvoice.js'
import { activeEngine, pickSystemVoice, systemVoiceLabel } from '../lib/engine.js'
import { SystemVoiceSelect } from './VoiceCard.jsx'
import { Icon } from './icons.jsx'
import { Button, IconButton, Segmented, Sheet, Toggle, Field, inputStyle, Appear, rowIn, Pulse } from './kit.jsx'
import { LibraryAsk } from './LibraryAsk.jsx'
import { ConceptMap } from './ConceptMap.jsx'
import { Briefing } from './Briefing.jsx'
import { Listening } from './Listening.jsx'

export function Sheets({ wide }) {
  const sheet = useStore(ui, s => s.sheet)
  return (
    <>
      <Sheet open={sheet === 'add'} onClose={closeSheet} wide={wide} title="Add document"><AddForm wide={wide} /></Sheet>
      <Sheet open={sheet === 'voice'} onClose={closeSheet} wide={wide} title="Choose a voice" width={520}><VoicePicker /></Sheet>
      <Sheet open={sheet === 'collect'} onClose={closeSheet} wide={wide} title="Add to collection" width={440}><CollectPicker /></Sheet>
      <Sheet open={sheet === 'lockscreen'} onClose={closeSheet} wide={wide} title="Controls on your lock screen" width={520}><LockScreenGuide wide={wide} /></Sheet>
      <Sheet open={sheet === 'language'} onClose={closeSheet} wide={wide} title="Listen in another language" width={520}><LanguagePicker /></Sheet>
      <Sheet open={sheet === 'libraryask'} onClose={closeSheet} wide={wide} title="Ask your library"><LibraryAsk wide={wide} /></Sheet>
      <Sheet open={sheet === 'briefing'} onClose={closeSheet} wide={wide} title="Make a briefing"><Briefing wide={wide} /></Sheet>
      <Sheet open={sheet === 'conceptmap'} onClose={closeSheet} wide={wide} title="Concept map" width={720}>{sheet === 'conceptmap' && <ConceptMap wide={wide} />}</Sheet>
      <Sheet open={sheet === 'listening'} onClose={closeSheet} wide={wide} title="Your listening"><Listening wide={wide} /></Sheet>
    </>
  )
}

function LockScreenGuide({ wide }) {
  return (
    <div style={{ padding: wide ? '28px 28px 30px' : '18px 20px 24px', display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', flex: 1, color: T.text }}>Controls on your lock screen</h2>
        <IconButton icon="close" label="Close" onClick={closeSheet} />
      </div>
      <div style={{ fontSize: 14, color: T.sub, lineHeight: 1.55 }}>
        While Noesis is playing, pull down your notifications. If you see the book with play and pause, you&apos;re set. If not, your phone is hiding Chrome&apos;s notifications:
      </div>
      <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8, fontSize: 14, color: T.text, lineHeight: 1.5 }}>
        <li>Open your phone&apos;s Settings, then Apps.</li>
        <li>Find Chrome, then Notifications.</li>
        <li>Turn on Show notifications and Lock screen notifications.</li>
      </ol>
      <div style={{ display: 'grid', gap: 10, paddingTop: 14, borderTop: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 12.5, color: T.sub }}>The names differ a little between phones:</div>
        {PHONE_PATHS.map(([brand, path]) => (
          <div key={brand} style={{ display: 'grid', gap: 3 }}>
            <div style={{ ...label, color: T.sub }}>{brand}</div>
            <div style={{ fontSize: 13, color: T.text, lineHeight: 1.45 }}>{path}</div>
          </div>
        ))}
      </div>
      <div><Button kind="primary" full onClick={closeSheet}>Done</Button></div>
    </div>
  )
}

// Where each Android skin keeps Chrome's notification switch (menu names as of 2026; they vary by version).
const PHONE_PATHS = [
  ['Xiaomi · Redmi · Poco', 'Settings → Apps → Manage apps → Chrome → Notifications'],
  ['OnePlus · Oppo · Realme', 'Settings → Apps → App management → Chrome → Manage notifications'],
  ['Samsung', 'Settings → Notifications → App notifications → Chrome'],
]

// ── voice preview ──────────────────────────────────────────────────────────────
const previewAudio = new Audio()
let previewUrl = null
// `busy` is { voice, phase }: 'getting' (the voice is being downloaded or opened and the line is being made)
// then 'playing'. The first preview of a voice on a device downloads the voice, which can take half a minute
// on a phone: the row says so, with how far along it is, from the moment of the tap.
async function preview(voice, setBusy) {
  previewAudio.pause()
  setBusy({ voice, phase: 'getting' })
  try {
    const rec = await synthesize(`Hi, I'm ${voiceName(voice)}. I'll read your documents to you, clearly and calmly.`, voice)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    previewUrl = URL.createObjectURL(recordToBlob(rec))
    previewAudio.src = previewUrl
    previewAudio.onended = previewAudio.onpause = () => setBusy(b => (b?.voice === voice ? null : b))
    await previewAudio.play()
    setBusy({ voice, phase: 'playing' })
  } catch (e) {
    toast("Preview couldn't play. Check your connection and try again.")
    setBusy(null)
  }
}

// The sample belongs to the sheet that asked for it: it stops when that sheet goes.
function usePreview() {
  const state = useState(null)
  useEffect(() => () => previewAudio.pause(), [])
  return state
}

function PreviewButton({ voice, busy, setBusy }) {
  const mine = busy?.voice === voice
  const playing = mine && busy.phase === 'playing'
  return (
    <IconButton icon={playing ? 'stop' : 'play'} label={playing ? `Stop ${voiceName(voice)}` : `Preview ${voiceName(voice)}`} fill iconSize={16} size={36}
      active={mine} busy={mine && !playing} onClick={() => { if (playing) previewAudio.pause(); else if (!busy) preview(voice, setBusy) }} style={{ opacity: busy && !mine ? 0.35 : 1 }} />
  )
}

// What is happening to the voice being previewed, in the app's one set of words for it (tts.js voiceWait).
function PreviewLine({ busy }) {
  const eng = useStore(engine)
  const name = voiceName(busy.voice)
  const wait = eng.voice === busy.voice ? voiceWait(eng) : null
  const text = busy.phase === 'playing' ? `Playing ${name}`
    : wait ? (wait.progress != null ? `${wait.text} · ${Math.floor(wait.progress * 100)}%` : wait.text)
    : `Making ${name}'s sample`
  return (
    <div role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 12px 10px 42px', fontSize: 12.5, color: busy.phase === 'playing' ? T.lime : T.sub }}>
      <Pulse color={busy.phase === 'playing' ? T.lime : T.accent} />{text}
    </div>
  )
}

// ── add document ───────────────────────────────────────────────────────────────
function AddForm({ wide }) {
  const prefill = useStore(ui, s => s.prefill)
  const s = useStore(settings)
  const keyed = hasAiKey()
  const geminiKeyed = hasKey()
  const nvidiaChosen = s.aiProvider === 'nvidia'
  const [tab, setTab] = useState(prefill?.tab || 'file')
  const [file, setFile] = useState(prefill?.file || null)
  const [text, setText] = useState(prefill?.text || '')
  const [title, setTitle] = useState(prefill?.title || '')
  const [url, setUrl] = useState(prefill?.url || '')
  const [mode, setMode] = useState(keyed ? s.mode : 'full')
  const [target, setTarget] = useState(undefined)
  const [voice, setVoice] = useState(s.voice)
  // The voice list follows the language chosen to listen in: choosing Telugu must not leave an English voice showing.
  const voiceLang = target || 'en'
  const langVoices = voicesFor(voiceLang)
  const picked = langVoices.some(v => v.id === voice) ? voice : langVoices[0]?.id
  const [ai, setAi] = useState(keyed && s.aiNarration)
  const [busy, setBusy] = usePreview()
  const [over, setOver] = useState(false)
  const inputRef = useRef(null)

  // Fetch the chosen voice (one download, then cached) while the user picks a file.
  useEffect(() => { if (activeEngine() === 'natural') loadEngine(voice).catch(() => {}) }, [voice])
  useEffect(() => () => ui.set({ prefill: null }), [])

  const kind = file ? kindOf(file.name, file.type) : null
  const urlOk = /^https?:\/\/\S+\.\S+/.test(url.trim())
  const ready = tab === 'file' ? !!kind : tab === 'text' ? text.trim().length > 0 : urlOk
  const aiApplies = tab === 'file' ? kind === 'pdf' : tab === 'link'

  async function submit() {
    if (!ready) return
    let src
    if (tab === 'file') src = { kind, name: file.name, blob: file }
    else if (tab === 'text') src = { kind: looksMarkdown(text) ? 'md' : 'text', name: title.trim() || 'Pasted text', title: title.trim() || undefined, text }
    else src = { kind: 'link', name: url.trim(), url: url.trim() }
    const named = tab === 'text' && title.trim()
    const id = await addDocument(src, { mode, voice: picked || voice, ai: ai && keyed, ...(named ? { title: named, renamed: true } : {}), ...(target ? { target } : {}) })
    if (voice !== s.voice) settings.set({ voice })
    if (mode !== s.mode && keyed) settings.set({ mode })
    history.replaceState({ view: 'reader', docId: id, depth: history.state?.depth || 1 }, '') // the sheet's history entry becomes the reader
    ui.set({ sheet: null, view: 'reader', docId: id })
  }

  const pick = f => { if (!f) return; if (!kindOf(f.name, f.type)) return toast('That file type is not supported yet.'); setFile(f) }

  return (
    <div style={{ padding: wide ? 28 : '18px 20px 24px', display: 'grid', gap: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', flex: 1 }}>Add a document</h2>
        <IconButton icon="close" label="Close" onClick={closeSheet} />
      </div>

      <Segmented value={tab} onChange={setTab} options={[
        { value: 'file', label: 'File', icon: 'file' }, { value: 'text', label: 'Text', icon: 'text' }, { value: 'link', label: 'Link', icon: 'link' },
      ]} />

      {tab === 'file' && (
        <Appear><label onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]) }}
          style={{
            position: 'relative', display: 'grid', placeItems: 'center', gap: 10, padding: '34px 20px', borderRadius: T.r.lg, cursor: 'pointer', textAlign: 'center',
            border: `1.5px dashed ${over || file ? T.accent : T.borderHi}`, background: over ? T.accentSoft : T.surface,
          }}>
          <input ref={inputRef} type="file" accept={ACCEPT} aria-label="Choose a document file" onChange={e => pick(e.target.files[0])}
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden', clip: 'rect(0 0 0 0)' }} />
          <motion.div animate={{ y: over ? -4 : 0 }} transition={T.spring}><Icon name={file ? 'check' : 'upload'} size={26} style={{ color: file ? T.accent : T.sub }} /></motion.div>
          <div style={{ fontSize: 15, fontWeight: 600, color: T.text, wordBreak: 'break-all' }}>{file ? file.name : wide ? 'Drop a file here, or click to choose' : 'Tap to choose a file'}</div>
          <div style={{ fontFamily: T.mono, fontSize: 11.5, color: T.faint }}>{file ? `${(file.size / 1048576).toFixed(1)} MB · ${kind?.toUpperCase()}` : 'PDF · EPUB · DOCX · HTML · MD · TXT'}</div>
        </label></Appear>
      )}
      {tab === 'text' && (
        <Appear style={{ display: 'grid', gap: 10 }}>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title (optional)" style={inputStyle} />
          <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Paste any text. Markdown works too." rows={wide ? 9 : 7} autoFocus
            style={{ ...inputStyle, height: 'auto', padding: 14, lineHeight: 1.55, resize: 'vertical' }} />
        </Appear>
      )}
      {tab === 'link' && (
        <Appear><Field hint="Web articles, PDFs, EPUBs, and arXiv links (Noesis fetches the paper itself, not the abstract page).">
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://" inputMode="url" autoFocus type="url"
            onKeyDown={e => e.key === 'Enter' && submit()} style={inputStyle} />
        </Field></Appear>
      )}

      <Field title="Listen to">
        <Segmented value={mode} onChange={setMode} disabled={keyed ? [] : ['long', 'short']} size="sm"
          options={[{ value: 'full', label: 'Full text' }, { value: 'long', label: 'Long summary' }, { value: 'short', label: 'Short summary' }]} />
      </Field>

      <Field title="Language" hint={keyed ? null : 'A summary or another language needs your own AI key. Add one in Settings.'}>
        <select value={target || 'orig'} onChange={e => setTarget(e.target.value === 'orig' ? undefined : e.target.value)}
          style={{ ...inputStyle, appearance: 'auto' }} aria-label="Language">
          <option value="orig" style={{ background: T.bg }}>Original</option>
          {Object.entries(LANGS).filter(([code]) => voicesFor(code).length > 0 || code === 'hi').map(([code, l]) => (
            <option key={code} value={code} style={{ background: T.bg }} disabled={!keyed && code !== 'orig'}>{l.name}</option>
          ))}
        </select>
      </Field>

      {activeEngine(s) === 'system' ? (
        <Field title="Voice" hint="Your device's built-in voice: starts instantly. Change it, or switch to the natural AI voice, in Settings.">
          <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', color: T.sub }}>{systemVoiceLabel(pickSystemVoice())}</div>
        </Field>
      ) : (
      <Field title="Voice" hint={picked && isCloudVoice(picked) ? cloudTruth(picked) : langVoices.length ? null : `No natural voice for ${LANGS[voiceLang].name} yet. Your device's built-in voice reads it.`}>
        {langVoices.length > 0 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select value={picked} onChange={e => setVoice(e.target.value)} style={{ ...inputStyle, flex: 1, appearance: 'auto' }}>
              {langVoices.map(v => <option key={v.id} value={v.id} style={{ background: T.bg }}>{v.name} · {v.cloud ? v.accent : `${v.accent} ${v.g === 'F' ? 'female' : 'male'}`}</option>)}
            </select>
            {voiceLang === 'en' && <PreviewButton voice={picked} busy={busy} setBusy={setBusy} />}
          </div>
        )}
        {busy && <div style={{ marginLeft: -42, marginBottom: -10, paddingTop: 8 }}><PreviewLine busy={busy} /></div>}
      </Field>
      )}

      {keyed && aiApplies && (
        <Toggle checked={ai} onChange={setAi} labelText="AI narration"
          hint="Your AI model reads each page image: it describes figures and tables, speaks math, and fixes broken text. The model must be one that can see images." />
      )}

      <Button kind="primary" full onClick={submit} disabled={!ready} style={{ height: 50, fontSize: 15 }}>Add to library</Button>
    </div>
  )
}

// ── voice picker (for one document) ────────────────────────────────────────────
function VoicePicker() {
  const docId = useStore(ui, s => s.docId)
  const d = useStore(library, s => s.docs.find(x => x.id === docId))
  const sys = useStore(settings, s => activeEngine(s) === 'system')
  const [busy, setBusy] = usePreview()
  if (!d) return null
  if (sys) {
    return (
      <div style={{ padding: '20px 20px 26px', display: 'grid', gap: 14 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Voice</div>
        <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.5 }}>You're using your device's built-in voice. The change applies immediately, from the sentence you're on.</div>
        <SystemVoiceSelect />
        <Button onClick={() => { settings.set({ voiceEngine: 'natural' }); closeSheet() }}>Switch to the natural AI voice</Button>
      </div>
    )
  }
  return (
    <div style={{ padding: '20px 12px 24px' }}>
      <div style={{ padding: '0 12px 6px', fontSize: 20, fontWeight: 700 }}>Voice</div>
      <div style={{ padding: '0 12px 14px', fontSize: 13, color: T.sub }}>Choose a voice and this document's audio is made again in it, from where you are. Each voice downloads once on a device (about 63 MB), then works offline.</div>
      {d.voice && isCloudVoice(d.voice) && (
        <div style={{ padding: '0 12px 14px', fontSize: 12.5, color: T.sub, lineHeight: 1.55 }}>{cloudTruth(d.voice)}</div>
      )}
      {voicesFor(d.lang || 'en').map((v, i) => (
        <motion.div key={v.id} {...rowIn(i)} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, borderRadius: T.r.sm, background: v.id === d.voice ? T.surfaceHi : 'transparent' }}>
          <button type="button" onClick={() => { changeVoice(d.id, v.id); toast(`Switching to ${v.name}`); closeSheet() }}
            style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: 'none', background: 'transparent', color: T.text, cursor: 'pointer', textAlign: 'left', fontFamily: T.font }}>
            <span style={{ width: 18, color: T.accent }}>{v.id === d.voice && <Icon name="check" size={17} />}</span>
            <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>{v.name}</span>
            <span style={{ fontFamily: T.mono, fontSize: 11.5, color: T.faint }}>{v.cloud ? v.accent : `${v.accent} · ${v.g}`}</span>
          </button>
          <PreviewButton voice={v.id} busy={busy} setBusy={setBusy} />
          {busy?.voice === v.id && <div style={{ flexBasis: '100%' }}><PreviewLine busy={busy} /></div>}
        </motion.div>
      ))}
    </div>
  )
}

// ── listen in another language ─────────────────────────────────────────────────
function LanguagePicker() {
  const docId = useStore(ui, s => s.docId)
  const d = useStore(library, s => s.docs.find(x => x.id === docId))
  useStore(settings)
  const keyed = hasAiKey()
  const [busy, setBusy] = useState(null)
  if (!d) return null
  const choose = async lang => {
    if (busy || !keyed) return
    setBusy(lang)
    try {
      const nid = await listenIn(d.id, lang)
      go('reader', nid)
    } finally {
      setBusy(null)
    }
  }
  return (
    <div style={{ padding: '20px 12px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px 6px' }}>
        <div style={{ fontSize: 20, fontWeight: 700, flex: 1, color: T.text }}>Listen in another language</div>
        <IconButton icon="close" label="Close" onClick={closeSheet} />
      </div>
      <div style={{ padding: '0 12px 14px', fontSize: 13, color: T.sub, lineHeight: 1.5 }}>Uses your AI key. A long book takes several minutes the first time.</div>
      <div style={{ display: 'grid', gap: 2 }}>
        {Object.entries(LANGS).filter(([code]) => voicesFor(code).length > 0 || code === 'hi').map(([code, l]) => (
          <button key={code} type="button" disabled={!keyed || !!busy} onClick={() => choose(code)}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px', border: 'none', borderRadius: T.r.sm, background: code === d.lang ? T.surfaceHi : 'transparent', color: T.text, opacity: !keyed ? 0.4 : 1, cursor: !keyed ? 'not-allowed' : 'pointer', fontFamily: T.font, fontSize: 15, textAlign: 'left' }}>
            <span style={{ width: 18, color: T.accent }}>{code === d.lang && <Icon name="check" size={17} />}</span>
            <span style={{ flex: 1, fontWeight: 600 }}>{l.name}</span>
            {busy === code && <span style={{ fontFamily: T.mono, fontSize: 11.5, color: T.sub }}>Opening…</span>}
          </button>
        ))}
      </div>
      {!keyed && <div style={{ padding: '12px 12px 0', fontSize: 12.5, color: T.sub, lineHeight: 1.5 }}>Translation needs a free AI key. Add one in Settings.</div>}
    </div>
  )
}

// ── collections ────────────────────────────────────────────────────────────────
function CollectPicker() {
  const docId = useStore(ui, s => s.docId)
  const d = useStore(library, s => s.docs.find(x => x.id === docId))
  const collections = useStore(library, s => s.collections)
  const [name, setName] = useState('')
  if (!d) return null
  const create = () => { if (!name.trim()) return; toggleInCollection(d.id, addCollection(name)); setName('') }
  return (
    <div style={{ padding: '20px 20px 24px', display: 'grid', gap: 14 }}>
      <div style={{ fontSize: 20, fontWeight: 700 }}>Collections</div>
      {collections.length === 0 && <div style={{ fontSize: 13.5, color: T.sub }}>No collections yet. Create one below.</div>}
      <div style={{ display: 'grid', gap: 2 }}>
        {collections.map(c => {
          const on = d.collections.includes(c.id)
          return (
            <button key={c.id} type="button" onClick={() => toggleInCollection(d.id, c.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px', border: 'none', borderRadius: T.r.sm, background: on ? T.surfaceHi : 'transparent', color: T.text, cursor: 'pointer', fontFamily: T.font, fontSize: 15, textAlign: 'left' }}>
              <Icon name={on ? 'check' : 'folder'} size={17} style={{ color: on ? T.accent : T.sub }} />{c.name}
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && create()} placeholder="New collection" style={{ ...inputStyle, flex: 1 }} />
        <Button onClick={create} disabled={!name.trim()} icon="plus">Create</Button>
      </div>
    </div>
  )
}
