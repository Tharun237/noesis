// Which voice speaks on THIS device.
//   natural — Piper voices generated on the device (natural; fast enough for phones; the default)
//   system  — the device's built-in text to speech (instant, offline, no generation at all)
// Older settings ('auto', 'piper', Kokoro-era values) all mean natural now.
import { settings } from './settings.js'
import { createStore } from './store.js'

export const isMobile = () => navigator.userAgentData?.mobile ?? /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
export const hasSystemVoice = () => typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined'

export const activeEngine = (s = settings.get()) => (s.voiceEngine === 'system' && hasSystemVoice() ? 'system' : 'natural')

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

// "Microsoft David - English (United States)" → "David"; "Google UK English Female" → "UK English Female".
export const systemVoiceLabel = v => (v ? `${v.name.replace(/^(Google|Microsoft|Samsung|Apple)\s+/i, '').replace(/\s+[-–]\s+.*$/, '').replace(/\s*\((Natural|Enhanced|Premium)\)/i, '') || v.name}${v.localService ? '' : ' · online'}` : 'Default voice')
