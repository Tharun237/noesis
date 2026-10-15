import { onShelf } from './shelf.js'
import { createStore } from './store.js'
import { SPEED_USUAL } from './speed.js'

// Per-device preferences. The AI keys live only here (localStorage on this device). The
// Gemini key is sent only to generativelanguage.googleapis.com; the NVIDIA key and the text
// travel through Noesis's relay (/api/nvidia) to reach NVIDIA — never anywhere else.
const KEY = onShelf('noesis.settings.v1') // a person's settings (their AI key among them) go away with their library

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
  nvidiaVoices: {}, // lang → [full NVIDIA voice names], from /api/nvidia-tts/list_voices
  nvidiaVoicesAt: 0, // when the voice list was last fetched (once a day at most)
  voiceBase: '', // the customer's own OpenAI-protocol voice service address, e.g. https://api.openai.com/v1
  voiceKey: '', // optional key for that service: stored only here, sent only to that address
  voiceModel: '', // model name as that service writes it, e.g. tts-1
  voiceNames: '', // comma-separated voice names for that service, e.g. alloy, nova
  voice: 'en_GB-alba-medium', // default voice for new documents (voices.js)
  voiceTone: 'natural', // natural | clear | warm | bright — generation-time equalizer (tone.js)
  speed: SPEED_USUAL, // 0.9x: about the pace a person talks at (lib/speed.js)
  listenGoal: 60, // minutes a day, read through listening.js goalOf (an hour to eight): the daily ring
  paced: 1, // this device knows 0.9x is the usual speed (see load)
  voiceEngine: 'natural', // natural (Piper, generated on the device) | system (built-in TTS) — see engine.js
  systemVoice: '', // voiceURI of the built-in voice ('' = device default)
  voiceSpeeds: {}, // voice → seconds of audio this device makes a second, as last measured (library.js voicePace)
  translateCps: 0, // measured on this device: characters translated a second (0 = not measured yet); for estimates
  aiNarration: true, // use Gemini for PDFs when a key is set
  skipVisuals: false, // skip figure/table/math/code descriptions during playback
  mode: 'full', // full | long | short
  view: 'grid',
  sort: 'recent', // library order, also the order "up next" plays in
  autoplayNext: false, // when a document ends, play the next one in the queue
  archiveFinished: false, // move finished documents to Archived
  ambientMode: 'off', // off | focus | calm | brown: a quiet sound under the voice
  ambientVolume: 0.5,
  awareSlow: false, // aware listening: slow the voice a little while the room is noisy (microphone, on the device)
  awarePause: false, // aware listening: pause when the listener speaks
  awareClear: false, // aware listening: lift the crisp part of the voice while the room is noisy
  haptics: false, // vibrate with the rhythm of the text (Android)
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
  focusWpm: 300, // Focus speed reader words per minute (200 to 900 in steps of 50)
  invertPages: null, // Pages view: true/false once chosen; null = automatic (invert clean digital pages, not scans)
}

function load() {
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) || '{}')
    // The usual speed was 1x until 13 October 2026, and every device wrote it down whether its owner had
    // chosen it or not. Once, a device still at 1x moves to the new usual. (One whose owner then sets 1x keeps it.)
    if (!kept.paced && kept.speed === 1) kept.speed = SPEED_USUAL
    return { ...DEFAULTS, ...kept, paced: 1 }
  } catch { return { ...DEFAULTS } }
}

export const settings = createStore(load())
settings.sub(() => localStorage.setItem(KEY, JSON.stringify(settings.get())))
// Another window of Noesis on this device (the installed app beside a tab) changed a setting: this one takes it.
// Each window used to keep what it had when it opened and write all of it back on its next change, so a key saved
// in one window was undone by the other ("the key exists and is saved, the entire Noesis doesn't recognise it",
// Tharun, 15 October 2026). The browser tells only the OTHER windows, so taking it here writes nothing back.
if (typeof addEventListener === 'function') {
  addEventListener('storage', e => {
    if (e.key !== KEY || !e.newValue) return
    try { settings.set({ ...DEFAULTS, ...JSON.parse(e.newValue) }) } catch { /* a half-written value: the next one comes */ }
  })
}

export const hasKey = () => settings.get().geminiKey.trim().length > 20
