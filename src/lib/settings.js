import { createStore } from './store.js'

// Per-device preferences. The Gemini key lives only here (localStorage on this device) and is
// sent only to generativelanguage.googleapis.com — never to Noesis servers.
const KEY = 'noesis.settings.v1'

export const DEFAULTS = {
  geminiKey: '',
  geminiModel: 'gemini-flash-latest',
  voice: 'en_US-ljspeech-medium', // default voice for new documents (voices.js)
  speed: 1,
  voiceEngine: 'natural', // natural (Piper, generated on the device) | system (built-in TTS) — see engine.js
  systemVoice: '', // voiceURI of the built-in voice ('' = device default)
  voiceSpeed: 0, // measured on this device: seconds of audio generated per second (0 = not measured yet)
  aiNarration: true, // use Gemini for PDFs when a key is set
  skipVisuals: false, // skip figure/table/math/code descriptions during playback
  mode: 'full', // full | long | short
  view: 'grid',
  sort: 'recent', // library order, also the order "up next" plays in
  autoplayNext: false, // when a document ends, play the next one in the queue
  archiveFinished: false, // move finished documents to Archived
  // Reading
  readFont: 'serif', // serif (Literata) | sans (DM Sans)
  readSize: 19,
  readLeading: 1.75,
  readWidth: 700,
  justify: false,
  wordHighlight: true,
  tocOpen: true,
  readerView: 'text', // text | pages (original PDF pages; only when the source file is on this device)
  invertPages: null, // Pages view: true/false once chosen; null = automatic (invert clean digital pages, not scans)
}

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return { ...DEFAULTS } }
}

export const settings = createStore(load())
settings.sub(() => localStorage.setItem(KEY, JSON.stringify(settings.get())))

export const hasKey = () => settings.get().geminiKey.trim().length > 20
