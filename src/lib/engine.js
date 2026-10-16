// Which voice speaks on THIS device.
//   natural — Piper voices generated on the device (natural; fast enough for phones; the default)
//   system  — the device's built-in text to speech (instant, offline, no generation at all)
// Older settings ('auto', 'piper', Kokoro-era values) all mean natural now.
import { settings } from './settings.js'
import { createStore, useStore } from './store.js'
import { voiceName } from './voices.js'

export const isMobile = () => navigator.userAgentData?.mobile ?? /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
export const hasSystemVoice = () => typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined'

export const activeEngine = (s = settings.get()) => (s.voiceEngine === 'system' && hasSystemVoice() ? 'system' : 'natural')
// A document in a language with no natural voice (voice === null, set when it was prepared) is read by the
// device's built-in voice whatever the setting says: there is nothing to generate for it.
export const builtInOnly = d => !!d && d.voice === null && hasSystemVoice()

// Built-in voices load asynchronously in Chrome; keep a reactive list.
export const systemVoices = createStore({ list: [] })
function refresh() {
  if (!hasSystemVoice()) return
  const list = speechSynthesis.getVoices()
    .sort((a, b) => (b.localService - a.localService) || (b.default - a.default) || a.name.localeCompare(b.name))
  systemVoices.set({ list })
}
if (hasSystemVoice()) {
  refresh()
  speechSynthesis.addEventListener?.('voiceschanged', refresh)
  // Some browsers fill the list late and never say so (no "voiceschanged"): looked at again a few times as the app
  // starts, so a voice the browser has is never missing from Settings for having been asked too early.
  for (const ms of [500, 1500, 4000, 10000]) setTimeout(refresh, ms)
}

export function pickSystemVoice(locale = 'en') {
  const list = systemVoices.get().list
  const prefix = String(locale || 'en').split(/[-_]/)[0].toLowerCase()
  const chosen = settings.get().systemVoice && list.find(v => v.voiceURI === settings.get().systemVoice)
  if (chosen && (prefix === 'en' || (chosen.lang || '').toLowerCase().startsWith(prefix))) return chosen
  return list.find(v => v.localService && v.default && (v.lang || '').toLowerCase().startsWith(prefix))
    || list.find(v => v.localService && (v.lang || '').toLowerCase().startsWith(prefix))
    || list.find(v => (v.lang || '').toLowerCase().startsWith(prefix))
    || null
}

// "Microsoft David - English (United States)" → "David"; "Google UK English Female" → "UK English Female".
export const systemVoiceLabel = v => (v ? `${v.name.replace(/^(Google|Microsoft|Samsung|Apple)\s+/i, '').replace(/\s+[-–]\s+.*$/, '').replace(/\s*\((Natural|Enhanced|Premium)\)/i, '') || v.name}${v.localService ? '' : ' · online'}` : 'Default voice')

// The name of the voice a document is HEARD in on this device: the built-in voice when it speaks (chosen in
// Settings, or the document's language has no natural voice), else the voice its audio is made in. Every place
// that names a document's voice says this one: the menu said "Zephyr" while Edge's Ava was speaking (Tharun,
// 16 October 2026). Same choice as player.js `system()`.
export const heardVoice = d => (activeEngine() === 'system' || builtInOnly(d) ? systemVoiceLabel(pickSystemVoice(d.lang || 'en')) : voiceName(d.voice))
// The same in a component, kept up to date: follows the engine, the chosen built-in voice and the browser's list.
export function useHeardVoice(d) {
  useStore(settings, s => `${activeEngine(s)}|${s.systemVoice}`)
  useStore(systemVoices, s => s.list)
  return heardVoice(d)
}
