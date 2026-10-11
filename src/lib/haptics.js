// Haptic rhythm for the text: a short pulse at the end of each sentence, a longer one at headings.
// The pattern logic is pure and tested in Node. The Vibration API is touched only inside functions.

export function pulseFor({ kind, text, last }) {
  if (kind === 'h') return [30, 40, 30]
  if (/[!?]\s*$/.test(text)) return [20, 30, 20]
  if (last) return [18]
  return [8]
}

export function hapticsSupported() {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

// A haptic is an extra on top of the text. The browser may refuse a vibration (a frame without the permission,
// or a pattern it will not take); a refusal is ignored so the reader keeps working.
export function haptic(pattern) {
  if (!hapticsSupported()) return
  try {
    navigator.vibrate(pattern)
  } catch {
    // refused: there is nothing else to do for an optional extra
  }
}
