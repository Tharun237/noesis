import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { T, label } from '../theme.js'
import { useStore } from '../lib/store.js'
import { ui, closeSheet, toast } from '../lib/nav.js'
import { settings, hasKey } from '../lib/settings.js'
import { library, addDocument, changeVoice, addCollection, toggleInCollection } from '../lib/library.js'
import { synthesize, recordToBlob, loadEngine, engine } from '../lib/tts.js'
import { kindOf, ACCEPT } from '../ingest/index.js'
import { VOICES, voiceName } from '../lib/voices.js'
import { activeEngine, pickSystemVoice, systemVoiceLabel } from '../lib/engine.js'
import { SystemVoiceSelect } from './VoiceCard.jsx'
import { Icon } from './icons.jsx'
import { Button, IconButton, Segmented, Sheet, Toggle, Field, inputStyle } from './kit.jsx'

export function Sheets({ wide }) {
  const sheet = useStore(ui, s => s.sheet)
  return (
    <>
      <Sheet open={sheet === 'add'} onClose={closeSheet} wide={wide} title="Add document"><AddForm wide={wide} /></Sheet>
      <Sheet open={sheet === 'voice'} onClose={closeSheet} wide={wide} title="Choose a voice" width={520}><VoicePicker /></Sheet>
      <Sheet open={sheet === 'collect'} onClose={closeSheet} wide={wide} title="Add to collection" width={440}><CollectPicker /></Sheet>
    </>
  )
}

// ── voice preview ──────────────────────────────────────────────────────────────
const previewAudio = new Audio()
let previewUrl = null
async function preview(voice, setBusy) {
  setBusy(voice)
  try {
    const rec = await synthesize(`Hi, I'm ${voiceName(voice)}. I'll read your documents to you, clearly and calmly.`, voice)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    previewUrl = URL.createObjectURL(recordToBlob(rec))
    previewAudio.src = previewUrl
    await previewAudio.play()
  } catch (e) {
    toast("Preview couldn't play. Check your connection and try again.")
  } finally {
    setBusy(null)
  }
}

function PreviewButton({ voice, busy, setBusy }) {
  const mine = busy === voice
  return (
    <IconButton icon={mine ? 'waves' : 'play'} label={`Preview ${voiceName(voice)}`} fill={!mine} iconSize={16} size={36}
      active={mine} onClick={() => !busy && preview(voice, setBusy)} style={{ opacity: busy && !mine ? 0.35 : 1 }} />
  )
}

// ── add document ───────────────────────────────────────────────────────────────
function AddForm({ wide }) {
  const prefill = useStore(ui, s => s.prefill)
  const s = useStore(settings)
  const keyed = hasKey()
  const [tab, setTab] = useState(prefill?.tab || 'file')
  const [file, setFile] = useState(prefill?.file || null)
  const [text, setText] = useState(prefill?.text || '')
  const [title, setTitle] = useState(prefill?.title || '')
  const [url, setUrl] = useState(prefill?.url || '')
  const [mode, setMode] = useState(keyed ? s.mode : 'full')
  const [voice, setVoice] = useState(s.voice)
  const [ai, setAi] = useState(keyed && s.aiNarration)
  const [busy, setBusy] = useState(null)
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
    else if (tab === 'text') src = { kind: /^#{1,6}\s/m.test(text) ? 'md' : 'text', name: title.trim() || 'Pasted text', title: title.trim() || undefined, text }
    else src = { kind: 'link', name: url.trim(), url: url.trim() }
    const named = tab === 'text' && title.trim()
    const id = await addDocument(src, { mode, voice, ai: ai && keyed, ...(named ? { title: named, renamed: true } : {}) })
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
        <label onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
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
        </label>
      )}
      {tab === 'text' && (
        <div style={{ display: 'grid', gap: 10 }}>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title (optional)" style={inputStyle} />
          <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Paste any text. Markdown works too." rows={wide ? 9 : 7} autoFocus
            style={{ ...inputStyle, height: 'auto', padding: 14, lineHeight: 1.55, resize: 'vertical' }} />
        </div>
      )}
      {tab === 'link' && (
        <Field hint="Web articles, PDFs, EPUBs, and arXiv links (Noesis fetches the paper itself, not the abstract page).">
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://" inputMode="url" autoFocus type="url"
            onKeyDown={e => e.key === 'Enter' && submit()} style={inputStyle} />
        </Field>
      )}

      <Field title="Listen to" hint={keyed ? null : 'Summaries need a free Gemini key. Add one in Settings.'}>
        <Segmented value={mode} onChange={setMode} disabled={keyed ? [] : ['long', 'short']} size="sm"
          options={[{ value: 'full', label: 'Full text' }, { value: 'long', label: 'Long summary' }, { value: 'short', label: 'Short summary' }]} />
      </Field>

      {activeEngine(s) === 'system' ? (
        <Field title="Voice" hint="Your device's built-in voice: starts instantly. Change it, or switch to the natural AI voice, in Settings.">
          <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', color: T.sub }}>{systemVoiceLabel(pickSystemVoice())}</div>
        </Field>
      ) : (
      <Field title="Voice">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={voice} onChange={e => setVoice(e.target.value)} style={{ ...inputStyle, flex: 1, appearance: 'auto' }}>
            {VOICES.map(v => <option key={v.id} value={v.id} style={{ background: T.bg }}>{v.name} · {v.accent} {v.g === 'F' ? 'female' : 'male'}</option>)}
          </select>
          <PreviewButton voice={voice} busy={busy} setBusy={setBusy} />
        </div>
      </Field>
      )}

      {keyed && aiApplies && (
        <Toggle checked={ai} onChange={setAi} labelText="AI narration"
          hint="Gemini reads each page image: it describes figures and tables, speaks math, and fixes broken text. Uses your own key." />
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
  const [busy, setBusy] = useState(null)
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
      <div style={{ padding: '0 12px 14px', fontSize: 13, color: T.sub }}>Changing the voice regenerates this document's audio, starting where you are. A voice downloads once on each device (about 63 MB).</div>
      {VOICES.map(v => (
        <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: T.r.sm, background: v.id === d.voice ? T.surfaceHi : 'transparent' }}>
          <button type="button" onClick={() => { changeVoice(d.id, v.id); toast(`Switching to ${v.name}`); closeSheet() }}
            style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: 'none', background: 'transparent', color: T.text, cursor: 'pointer', textAlign: 'left', fontFamily: T.font }}>
            <span style={{ width: 18, color: T.accent }}>{v.id === d.voice && <Icon name="check" size={17} />}</span>
            <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>{v.name}</span>
            <span style={{ fontFamily: T.mono, fontSize: 11.5, color: T.faint }}>{v.accent} · {v.g}</span>
          </button>
          <PreviewButton voice={v.id} busy={busy} setBusy={setBusy} />
        </div>
      ))}
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
