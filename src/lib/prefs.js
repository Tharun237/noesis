// What a customer sets that is theirs, not the device's: it follows them to every device they sign in on.
// Tharun, 13 October 2026, asked which: how fast they listen, their usual voice, how the library is sorted,
// whether the next document plays by itself, whether a finished one is archived. What suits a screen (the
// size of the text, the layout) and what belongs to a device (its own voices, its measured speed, the AI
// keys, which never leave it) stays where it is.
// One record, `prefs`, newest wins, like the rest of the library (sync.js).
import { settings, DEFAULTS } from './settings.js'
import { onShelf } from './shelf.js'
import { touch, touchAfter } from './sync.js'

export const FOLLOW = ['speed', 'voice', 'sort', 'autoplayNext', 'archiveFinished', 'listenGoal']
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
export const applyPrefs = v => quietly(() => settings.set(only(v && !v.paced && v.speed === 1 ? { ...v, speed: DEFAULTS.speed } : v || {})))

// The first time on a device: what it is already set to is offered to the others, as something worked out
// (sync.js touchAfter), so it never beats a setting really changed somewhere.
export function offerPrefs() {
  try {
    if (localStorage.getItem(OFFERED)) return
    localStorage.setItem(OFFERED, '1')
  } catch { return }
  if (FOLLOW.some(k => settings.get()[k] !== DEFAULTS[k])) touchAfter('prefs')
}
