import { createStore } from './store.js'

// Per-device preferences. The AI keys live only here (localStorage on this device). The
// Gemini key is sent only to generativelanguage.googleapis.com; the NVIDIA key and the text
// travel through Noesis's relay (/api/nvidia) to reach NVIDIA — never anywhere else.
const KEY = 'noesis.settings.v1'

export const DEFAULTS = {
  aiProvider: 'gemini', // gemini | nvidia | custom (any OpenAI-compatible address): which provider AI text features use
  customBase: '', // e.g. https://openrouter.ai/api/v1 or http://localhost:11434/v1
  customKey: '',
  customModel: '',
  modelChecks: {}, // provider id → [{ id, s }] models that answered the last check, with seconds
  geminiKey: '',
  geminiModel: 'gemini-flash-latest',
  nvidiaKey: '',
  nvidiaModel: '', // no default invented: the customer picks one from the list their key returns
  voice: 'en_GB-alba-medium', // default voice for new documents (voices.js)
  voiceTone: 'natural', // natural | clear | warm | bright — generation-time equalizer (tone.js)
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
  lockScreenWords: true, // show the words being read on the lock screen
  lockTipSeen: false, // the lock-screen guide toast was shown once on Android
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
