import { T } from '../theme.js'
import { useStore } from '../lib/store.js'
import { settings } from '../lib/settings.js'
import { activeEngine, hasSystemVoice, isMobile, systemVoices, pickSystemVoice, systemVoiceLabel } from '../lib/engine.js'
import { VOICES } from '../lib/voices.js'
import { Field, Segmented, inputStyle, IconButton } from './kit.jsx'

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

// Settings → Voice: which engine speaks on this device, and with which voice.
export function VoiceCard({ Card }) {
  const s = useStore(settings)
  const engineNow = activeEngine(s)
  const canSystem = hasSystemVoice()
  const speed = s.naturalSpeed
  return (
    <Card title="Voice">
      <Segmented value={s.voiceEngine} onChange={v => settings.set({ voiceEngine: v })} size="sm" disabled={canSystem ? [] : ['system']}
        options={[{ value: 'auto', label: 'Auto' }, { value: 'natural', label: 'Natural AI' }, { value: 'system', label: 'Built-in' }]} />
      <div style={{ fontSize: 13.5, color: T.sub, lineHeight: 1.6 }}>
        {engineNow === 'system'
          ? <><b style={{ color: T.text }}>Built-in voice{s.voiceEngine === 'auto' ? ' (Auto)' : ''}:</b> your {isMobile() ? 'phone' : 'device'}'s own text to speech. Starts instantly, works offline, uses almost no battery, and highlights each word exactly. "Save audio" isn't available with this voice.</>
          : <><b style={{ color: T.text }}>Natural AI voice{s.voiceEngine === 'auto' ? ' (Auto)' : ''}:</b> Kokoro, generated on this device. The most natural sound. Audio is prepared before playing, so it never stalls; on slower devices long books take time to prepare.</>}
      </div>
      {speed > 0 && (
        <div style={{ fontFamily: T.mono, fontSize: 12, color: speed >= 1 ? T.ok : T.sub }}>
          Natural voice on this device: {speed.toFixed(2)}× speaking speed{speed < 1 ? ` · a 1-hour book needs ~${Math.round(60 * (1 - speed) / speed)} min to prepare` : ' · plays immediately'}
        </div>
      )}
      {engineNow === 'system'
        ? <Field title="Built-in voice"><SystemVoiceSelect /></Field>
        : (
          <Field title="Natural voice (default for new documents)">
            <select value={s.voice} onChange={e => settings.set({ voice: e.target.value })} style={{ ...inputStyle, appearance: 'auto' }}>
              {VOICES.map(v => <option key={v.id} value={v.id} style={{ background: T.bg }}>{v.name} · {v.accent} {v.g === 'F' ? 'female' : 'male'} · grade {v.grade}</option>)}
            </select>
          </Field>
        )}
    </Card>
  )
}
