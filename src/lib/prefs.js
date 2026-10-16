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
// One record, `prefs`, merged SETTING BY SETTING: each carries when it was last changed, and the newest change to
// each wins. It was one block, newest whole block winning: a device that changed anything sent its whole block,
// the keys it never had among it, and the key added on the laptop was wiped from the account (16 October 2026,
// twice; the second "fix" only guarded a device receiving an empty key, not the account's copy). A device that
// never changed a setting has no time for it, and never wins with it.
import { settings, DEFAULTS } from './settings.js'
import { onShelf } from './shelf.js'
import { touch, touchAfter } from './sync.js'
import { clockNow } from './drive.js'
import { mergePrefs } from './prefsmerge.js'

// the customer's own services: which AI, its key and model, and their own voice service
export const SERVICES = ['aiProvider', 'geminiKey', 'geminiModel', 'nvidiaKey', 'nvidiaModel', 'nvidiaVision', 'customBase', 'customKey', 'customModel', 'customVision', 'voiceBase', 'voiceKey', 'voiceModel', 'voiceNames', 'describeFigures', 'aiNarration']
// how they listen and read
export const CHOICES = ['voiceTone', 'skipVisuals', 'mode', 'view', 'ambientMode', 'ambientVolume', 'haptics', 'lockScreenWords', 'readFont', 'readSize', 'readLeading', 'readWidth', 'justify', 'wordHighlight', 'tocOpen', 'readerView', 'focusWpm', 'invertPages']
export const FOLLOW = ['speed', 'voice', 'sort', 'autoplayNext', 'archiveFinished', 'listenGoal', ...SERVICES, ...CHOICES]
const OFFERED = onShelf('noesis.prefs.offered')
const only = s => Object.fromEntries(FOLLOW.filter(k => s[k] !== undefined).map(k => [k, s[k]]))

// When each setting was last changed by the customer on this device, or taken from another (clock of the account,
// drive.clockNow). Missing: never changed here.
const AT = onShelf('noesis.prefs.at')
const loadAt = () => { try { return JSON.parse(localStorage.getItem(AT)) || {} } catch { return {} } }
let at = loadAt()
const saveAt = () => { try { localStorage.setItem(AT, JSON.stringify(at)) } catch { /* no storage: this visit only */ } }

let quiet = false // a change that is not the customer's (it arrived from another device, or the app mended it)
let last = only(settings.get())
settings.sub(() => {
  const now = only(settings.get())
  const changed = FOLLOW.filter(k => now[k] !== last[k])
  last = now
  if (!changed.length || quiet) return
  const t = clockNow()
  for (const k of changed) at[k] = t
  saveAt()
  touch('prefs')
})

export const prefsSnapshot = () => ({ ...only(settings.get()), at: { ...at }, paced: 1, v: 2 })
export const quietly = fn => { quiet = true; try { return fn() } finally { quiet = false } }

// From a device that still has the old usual speed written down (no `paced`): 1x there means "never chosen".
export function applyPrefs(v) {
  const got = only(v && !v.paced && v.speed === 1 ? { ...v, speed: DEFAULTS.speed } : v || {})
  const r = mergePrefs(FOLLOW, DEFAULTS, only(settings.get()), at, got, v?.at && typeof v.at === 'object' ? v.at : null)
  Object.assign(at, r.at)
  saveAt()
  if (Object.keys(r.take).length) quietly(() => settings.set(r.take))
  return r.again ? 'again' : undefined // sync.js: what this device holds that is newer goes back out
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
