# M17: focus sounds under the voice, and haptic rhythm (roadmap 21 binaural mode, 22 haptics)

Create NEW files only. Do NOT edit any existing file (someone else wires them in). No new dependencies.

## `src/lib/ambient.js` + `src/lib/ambient.test.js`
- Modes: 'off', 'focus' (binaural beat: left ear 200 Hz, right ear 214 Hz), 'calm' (left 200 Hz, right
  208 Hz), 'brown' (brown noise, both ears).
- Pure, tested: `beatFrequencies(mode)` returns `{ left, right }` or null; `brownNoise(length, seed)` returns
  a Float32Array in [-1, 1], deterministic for a seed, with clearly more energy below 500 Hz than above
  4 kHz at 44100 Hz (test it by comparing the mean square of the signal with the mean square of its first
  difference, or with a small DFT); `gainFor(volume)` is 0 for 0, at most 0.25 for 1 (these sounds sit
  UNDER a voice), and monotonic.
- `ambient.set({ mode, volume })` and `ambient.playing(bool)`: built on ONE lazily created `AudioContext`
  (created only inside `playing(true)`, which is called from a user gesture). Two `OscillatorNode`s through a
  `ChannelMergerNode` for the beats; a looping 4-second `AudioBufferSourceNode` for brown noise. Every start,
  stop and mode change ramps the gain over 0.4 s (`linearRampToValueAtTime`): no clicks. `playing(false)`
  ramps down, then suspends the context. Nothing sounds when the mode is 'off'. The module must import
  cleanly in Node (no `AudioContext` access at import time).

## `src/lib/haptics.js` + `src/lib/haptics.test.js`
- Pure, tested: `pulseFor({ kind, text, last })` returns a `navigator.vibrate` pattern (array of ms):
  a heading (`kind === 'h'`): `[30, 40, 30]`; a sentence ending in "!" or "?": `[20, 30, 20]`; the last
  sentence of a paragraph (`last` true): `[18]`; any other sentence: `[8]`.
- `hapticsSupported()` (`typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'`) and
  `haptic(pattern)` (calls `navigator.vibrate(pattern)` when supported; never throws).

## `src/ui/AmbientCard.jsx`
`AmbientCard({ Card, mode, volume, haptics, onChange })`: a settings card titled "Focus sounds". A
`Segmented` (from src/ui/kit.jsx) with Off, Focus, Calm, Brown noise; a volume slider (native
`input type="range"`, 0 to 1, step 0.05, aria-label "Focus sound volume") shown when the mode is not off;
the line "Focus and Calm are binaural beats: they need headphones, because each ear gets a slightly
different tone. They play only while the voice is playing."; and, only when `hapticsSupported()`, a `Toggle`
(from kit.jsx) "Vibrate with the rhythm of the text" with hint "A short pulse at the end of each sentence, a
longer one at headings. For readers who feel rhythm better than they hear it." `onChange` receives
`{ mode }`, `{ volume }` or `{ haptics }`. Inline styles with tokens from src/theme.js.

## Done when
`npm test` passes and `npx vite build` has no errors or warnings. Report: files created, the test list,
build and test output lines, and what you could not run (no audio output here). Do not commit.
