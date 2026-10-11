import { useState } from 'react'
import { T, label } from '../theme.js'
import { useStore } from '../lib/store.js'
import { settings } from '../lib/settings.js'
import { cleanBase } from '../lib/ai.js'
import { activeEngine, hasSystemVoice, isMobile, systemVoices, pickSystemVoice, systemVoiceLabel } from '../lib/engine.js'
import { voicesFor } from '../lib/voices.js'
import { isCloudVoice, cloudTruth, parseVoiceNames, fetchOwnSpeech, encodeWav, explainVoiceError, ownHost } from '../lib/cloudvoice.js'
import { Field, Segmented, Button, inputStyle, IconButton } from './kit.jsx'

export function speakSample(voice) {
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance('This is the built-in voice. It starts instantly and works offline.')
  if (voice) { u.voice = voice; u.lang = voice.lang }
  u.rate = settings.get().speed
  speechSynthesis.speak(u)
}

export function SystemVoiceSelect() {
  const list = useStore(systemVoices, s => s.list)
  const chosen = useStore(settings, s => s.systemVoice)
  const current = pickSystemVoice()
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <select value={chosen || current?.voiceURI || ''} onChange={e => settings.set({ systemVoice: e.target.value })} style={{ ...inputStyle, flex: 1, appearance: 'auto' }}>
        {list.length === 0 && <option value="">Default voice</option>}
        {list.map(v => <option key={v.voiceURI} value={v.voiceURI} style={{ background: T.bg }}>{systemVoiceLabel(v)} · {v.lang}</option>)}
      </select>
      <IconButton icon="play" fill label="Preview built-in voice" size={40} iconSize={15} onClick={() => speakSample(pickSystemVoice())} />
    </div>
  )
}

const testAudio = new Audio()

// Settings → Voice → "Your own voice service": any service that speaks the OpenAI speech protocol.
// Test asks the service to say one short sentence in the first voice and plays the reply.
export function OwnVoiceService() {
  const base = useStore(settings, s => s.voiceBase || '')
  const key = useStore(settings, s => s.voiceKey || '')
  const model = useStore(settings, s => s.voiceModel || '')
  const names = useStore(settings, s => s.voiceNames || '')
  const [show, setShow] = useState(false)
  const [state, setState] = useState(null) // null | 'testing' | 'ok' | an error sentence
  const first = parseVoiceNames(names)[0] || ''
  const ready = !!cleanBase(base) && !!model.trim() && !!first

  async function test() {
    if (!ready) return
    setState('testing')
    try {
      const { pcm, rate } = await fetchOwnSpeech('Your own voice service is working.', 'oa:' + first, {})
      const url = URL.createObjectURL(new Blob([encodeWav(pcm, rate)], { type: 'audio/wav' }))
      testAudio.src = url
      await testAudio.play()
      setState('ok')
    } catch (e) {
      const host = ownHost() || 'The voice service'
      setState(explainVoiceError(e, host, typeof navigator === 'undefined' ? true : navigator.onLine))
    }
  }

  return (
    <>
      <div style={{ ...label, paddingTop: 4 }}>Your own voice service</div>
      <div style={{ fontSize: 13.5, color: T.sub, lineHeight: 1.6 }}>
        Use any voice service that speaks the OpenAI protocol: OpenAI, Groq, or a model on your own computer.
        Its voices appear in every language&apos;s list. The text goes straight from this device to that address.
      </div>
      <Field title="Address" hint="The service's address, for example https://api.openai.com/v1 or http://localhost:8880/v1.">
        <input value={base} onChange={e => settings.set({ voiceBase: e.target.value })} placeholder="https://api.openai.com/v1" autoComplete="off" spellCheck={false} inputMode="url"
          aria-label="Voice service address" style={{ ...inputStyle, fontFamily: T.mono, fontSize: 13 }} />
      </Field>
      <Field title="Key" hint="Optional. Stored only on this device and sent only to that address.">
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={key} onChange={e => settings.set({ voiceKey: e.target.value })} type={show ? 'text' : 'password'}
            placeholder="API key (leave empty for a local server)" autoComplete="off" spellCheck={false}
            aria-label="Voice service key" style={{ ...inputStyle, flex: 1, minWidth: 0, fontFamily: T.mono, fontSize: 13 }} />
          <IconButton icon="eye" active={show} label={show ? 'Hide key' : 'Show key'} onClick={() => setShow(!show)} size={46} />
        </div>
      </Field>
      <Field title="Model" hint="The model name, as the service writes it, for example tts-1.">
        <input value={model} onChange={e => settings.set({ voiceModel: e.target.value })} placeholder="tts-1" autoComplete="off" spellCheck={false}
          aria-label="Voice service model" style={{ ...inputStyle, fontFamily: T.mono, fontSize: 13 }} />
      </Field>
      <Field title="Voices" hint="Voice names separated by commas, for example alloy, nova.">
        <input value={names} onChange={e => settings.set({ voiceNames: e.target.value })} placeholder="alloy, nova" autoComplete="off" spellCheck={false}
          aria-label="Voice service voices" style={{ ...inputStyle, fontFamily: T.mono, fontSize: 13 }} />
      </Field>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button kind="primary" onClick={test} disabled={!ready || state === 'testing'}>{state === 'testing' ? 'Testing…' : 'Test'}</Button>
        {state === 'ok' && <span style={{ fontSize: 12.5, color: T.ok }}>This voice service answers.</span>}
        {state && state !== 'ok' && state !== 'testing' && <span style={{ fontSize: 12.5, color: T.danger }}>{state}</span>}
      </div>
    </>
  )
}

// Settings → Voice: natural voices (Piper, generated on this device), cloud voices, or the device's built-in voice.
export function VoiceCard({ Card }) {
  const s = useStore(settings)
  const engineNow = activeEngine(s)
  const canSystem = hasSystemVoice()
  const speed = s.voiceSpeed
  return (
    <Card title="Voice">
      <Segmented value={engineNow} onChange={v => settings.set({ voiceEngine: v })} size="sm" disabled={canSystem ? [] : ['system']}
        options={[{ value: 'natural', label: 'Natural' }, { value: 'system', label: 'Built-in' }]} />
      <div style={{ fontSize: 13.5, color: T.sub, lineHeight: 1.6 }}>
        {engineNow === 'system'
          ? <><b style={{ color: T.text }}>Built-in voice:</b> your {isMobile() ? 'phone' : 'device'}'s own text to speech. Starts instantly and works offline, but sounds less natural. "Save audio" isn't available with this voice.</>
          : <><b style={{ color: T.text }}>Natural voice:</b> neural voices generated on this device, the same on your phone and computer. Each voice downloads once (about 63 MB), then works offline.</>}
      </div>
      {speed > 0 && engineNow === 'natural' && (
        <div style={{ fontFamily: T.mono, fontSize: 12, color: speed >= 1 ? T.lime : T.sub }}>
          This device generates {speed.toFixed(1)}× faster than speaking speed{speed >= 1 ? ' · plays immediately' : ` · a 1-hour book needs ~${Math.round(60 * (1 - speed) / speed)} min to prepare`}
        </div>
      )}
      {engineNow === 'system'
        ? <Field title="Built-in voice"><SystemVoiceSelect /></Field>
        : (
          <>
            <Field title="Natural voice (default for new documents)" hint={isCloudVoice(s.voice) ? cloudTruth(s.voice) : null}>
              <select value={s.voice} onChange={e => settings.set({ voice: e.target.value })} style={{ ...inputStyle, appearance: 'auto' }}>
                {voicesFor('en').map(v => <option key={v.id} value={v.id} style={{ background: T.bg }}>{v.name} · {v.cloud ? v.accent : `${v.accent} ${v.g === 'F' ? 'female' : 'male'}`}</option>)}
              </select>
            </Field>
            <Field title="Tone" hint="Changes how the voice is made. Audio you already have is made again from where you are listening.">
              <Segmented value={s.voiceTone || 'natural'} onChange={v => settings.set({ voiceTone: v })} size="sm"
                options={[{ value: 'natural', label: 'Natural' }, { value: 'clear', label: 'Clear' }, { value: 'warm', label: 'Warm' }, { value: 'bright', label: 'Bright' }]} />
            </Field>
          </>
        )}
      <OwnVoiceService />
    </Card>
  )
}
