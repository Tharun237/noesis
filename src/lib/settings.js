import { createStore } from './store.js'

// Per-device preferences. The Gemini key lives only here (localStorage on this device) and is
// sent only to generativelanguage.googleapis.com — never to Noesis servers.
const KEY = 'noesis.settings.v1'

export const DEFAULTS = {
  geminiKey: '',
  geminiModel: 'gemini-flash-latest',
  voice: 'af_heart',
  speed: 1,
  engine: 'auto', // auto | webgpu | wasm
  aiNarration: true, // use Gemini for PDFs when a key is set
  skipVisuals: false, // skip figure/table/math/code descriptions during playback
  mode: 'full', // full | long | short
  view: 'grid',
  // Reading
  readFont: 'serif', // serif (Literata) | sans (DM Sans)
  readSize: 19,
  readLeading: 1.75,
  readWidth: 700,
  justify: false,
  wordHighlight: true,
  tocOpen: true,
}

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return { ...DEFAULTS } }
}

export const settings = createStore(load())
settings.sub(() => localStorage.setItem(KEY, JSON.stringify(settings.get())))

export const hasKey = () => settings.get().geminiKey.trim().length > 20
