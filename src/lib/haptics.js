// Haptic rhythm for the text: a short pulse at the end of each sentence, a longer one at headings.
// The pattern logic is pure and tested in Node. The Vibration API is touched only inside functions.

// How long each pulse is, in milliseconds. A phone's motor needs about 20 ms to be felt at all: the first
// lengths (8 for an ordinary sentence) were shorter than that, so the option could be switched on and nothing
// was ever felt ("some of the options are not working", Tharun, 14 October 2026).
export const FELT_MS = 25
export function pulseFor({ kind, text, last }) {
  if (kind === 'h') return [45, 60, 45]
  if (/[!?]\s*$/.test(text)) return [FELT_MS, 40, FELT_MS]
  if (last) return [40]
  return [FELT_MS]
}
// What is felt the moment the option is switched on: the proof that it works on this phone.
export const HELLO = [30, 50, 30]

export function hapticsSupported() {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

// A haptic is an extra on top of the text. The browser may refuse a vibration (a frame without the permission,
// a pattern it will not take, a page that has not been touched yet); a refusal never stops the reader.
// → whether the browser took it, so that the one place that ASKS (switching the option on) can say when it did not.
export function haptic(pattern) {
  if (!hapticsSupported()) return false
  try {
    return navigator.vibrate(pattern) !== false
  } catch {
    return false
  }
}
