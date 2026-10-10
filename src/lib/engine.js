// Which voice engine speaks on THIS device.
//   natural — Kokoro-82M generated on the device (best quality; needs a fast device or time to prepare)
//   system  — the device's built-in text to speech (instant, offline, no load on the phone)
// Auto: built-in on phones (measured: Kokoro runs ~0.15–0.5× speaking speed on phone-class CPUs),
// natural on computers. The user can override per device in Settings.
import { settings } from './settings.js'
import { createStore } from './store.js'

export const isMobile = () => navigator.userAgentData?.mobile ?? /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
export const hasSystemVoice = () => typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined'

export function activeEngine(s = settings.get()) {
  if (s.voiceEngine === 'natural') return 'natural'
  if (s.voiceEngine === 'system') return hasSystemVoice() ? 'system' : 'natural'
  return isMobile() && hasSystemVoice() ? 'system' : 'natural'
}

// Built-in voices load asynchronously in Chrome; keep a reactive list.
export const systemVoices = createStore({ list: [] })
function refresh() {
  if (!hasSystemVoice()) return
  const list = speechSynthesis.getVoices()
    .filter(v => /^en(-|_|$)/i.test(v.lang))
    .sort((a, b) => (b.localService - a.localService) || (b.default - a.default) || a.name.localeCompare(b.name))
  systemVoices.set({ list })
}
if (hasSystemVoice()) {
  refresh()
  speechSynthesis.addEventListener?.('voiceschanged', refresh)
}

export function pickSystemVoice() {
  const list = systemVoices.get().list
  const chosen = settings.get().systemVoice
  return list.find(v => v.voiceURI === chosen) || list.find(v => v.localService && v.default) || list.find(v => v.localService) || list[0] || null
}

export const systemVoiceLabel = v => (v ? `${v.name.replace(/^(Google|Microsoft|Samsung)\s+/i, '')}${v.localService ? '' : ' · online'}` : 'Default voice')
