// What a customer sets that is theirs, not the device's: it follows them to every device they sign in on.
// Tharun, 13 October 2026, asked which: how fast they listen, their usual voice, how the library is sorted,
// whether the next document plays by itself, whether a finished one is archived. On 16 October 2026 their own AI
// and voice services joined them, keys included ("a user has to carry the API key everywhere: absurd"): a key
// left behind on one device made a book there race by in silence. The same day the rest of what they choose joined
// too: how the reader looks, sounds and haptics ("entire settings doesn't remember my preference", Tharun, on a new
// install of the app). They travel in the customer's own Drive folder, which only Noesis can open with their
// sign-in; never through Noesis's server. What belongs to a device stays: what it measured or found (its speed,
// its voices, what it learnt about a voice or a service), the built-in voice (each browser has its own), and what
// needs that device's own permission (the microphone of aware listening).
// One record, `prefs`, newest wins, like the rest of the library (sync.js).
import { settings, DEFAULTS } from './settings.js'
import { onShelf } from './shelf.js'
import { touch, touchAfter } from './sync.js'

// the customer's own services: which AI, its key and model, and their own voice service
export const SERVICES = ['aiProvider', 'geminiKey', 'geminiModel', 'nvidiaKey', 'nvidiaModel', 'nvidiaVision', 'customBase', 'customKey', 'customModel', 'customVision', 'voiceBase', 'voiceKey', 'voiceModel', 'voiceNames', 'describeFigures', 'aiNarration']
const SECRETS = ['geminiKey', 'nvidiaKey', 'customKey', 'voiceKey']
// how they listen and read
export const CHOICES = ['voiceTone', 'skipVisuals', 'mode', 'view', 'ambientMode', 'ambientVolume', 'haptics', 'lockScreenWords', 'readFont', 'readSize', 'readLeading', 'readWidth', 'justify', 'wordHighlight', 'tocOpen', 'readerView', 'focusWpm', 'invertPages']
export const FOLLOW = ['speed', 'voice', 'sort', 'autoplayNext', 'archiveFinished', 'listenGoal', ...SERVICES, ...CHOICES]
const OFFERED = onShelf('noesis.prefs.offered')
const only = s => Object.fromEntries(FOLLOW.filter(k => s[k] !== undefined).map(k => [k, s[k]]))

let quiet = false // a change that is not the customer's (it arrived from another device, or the app mended it)
let last = only(settings.get())
settings.sub(() => {
  const now = only(settings.get())
  const changed = FOLLOW.some(k => now[k] !== last[k])
  last = now
  if (changed && !quiet) touch('prefs')
})

export const prefsSnapshot = () => ({ ...only(settings.get()), paced: 1 })
export const quietly = fn => { quiet = true; try { return fn() } finally { quiet = false } }
// From a device that still has the old usual speed written down (no `paced`): 1x there means "never chosen".
// A key never arrives as nothing over a key this device has: a device that never had it (a new browser) must not
// wipe it everywhere. This device keeps its own and sends it back out.
export function applyPrefs(v) {
  const got = only(v && !v.paced && v.speed === 1 ? { ...v, speed: DEFAULTS.speed } : v || {})
  const mine = settings.get()
  const kept = SECRETS.filter(k => !String(got[k] || '').trim() && String(mine[k] || '').trim())
  for (const k of kept) delete got[k]
  quietly(() => settings.set(got))
  return kept.length ? 'again' : undefined // sync.js: what was here goes back out, as the record after this one
}

// The first time on a device: what it is already set to is offered to the others, as something worked out
// (sync.js touchAfter), so it never beats a setting really changed somewhere.
// Offered again when more settings come to follow the customer (their services, 16 October 2026): a device that had
// offered the first few never sent its key.
export function offerPrefs() {
  try {
    if (localStorage.getItem(OFFERED) === FOLLOW.join(',')) return
    localStorage.setItem(OFFERED, FOLLOW.join(','))
  } catch { return }
  if (FOLLOW.some(k => settings.get()[k] !== DEFAULTS[k])) touchAfter('prefs')
}
