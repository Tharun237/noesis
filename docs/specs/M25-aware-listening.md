# M25: aware listening (roadmap "Earbud-style awareness", approved 2026-10-11: the phone-microphone version)

Create NEW files only. Do NOT edit any existing file (someone else wires them in). No new dependencies.

## What the customer gets
Two switches in Settings. "Slow down when it is noisy": while there is steady noise around the listener the
voice slows a little, and returns to their speed when it is quiet again. "Pause when I speak": the book pauses
when the listener starts talking. The microphone is used only while a document is playing with the app open;
sound is measured on the device, never recorded or sent.

## `src/lib/aware.js` + `src/lib/aware.test.js`
- `levelDb(samples)` (pure, tested): the loudness of a block of samples (a Float32Array or array of numbers
  from -1 to 1) as decibels relative to full scale: `20 * log10(rms)`, and `-100` for silence or an empty block.
- `createTracker(options)` (pure, tested) returns `{ feed(db, tMs), floor(), noisy() }`.
  Options and defaults: `noisyDb = -38`, `quietDb = -46`, `noisyMs = 4000`, `quietMs = 6000`,
  `speechRiseDb = 14`, `speechMs = 350`, `speechCooldownMs = 4000`, `floorSeconds = 3`.
  - It keeps a slowly moving estimate of the background level (`floor()`): an exponential average of the
    levels fed in, with time constant `floorSeconds` (weight from the real time between two feeds, so uneven
    feed times still work). The first level fed becomes the floor at once. While a level is more than
    `speechRiseDb` above the floor, the floor is NOT updated (a voice must not drag the background up).
  - `feed(db, tMs)` returns an array of events (usually empty), each `{ type }`:
    - `'noisy'` once, when the floor has stayed at or above `noisyDb` for `noisyMs` without a break;
    - `'quiet'` once, when after `'noisy'` the floor has stayed at or below `quietDb` for `quietMs`;
      (between the two thresholds nothing changes: that gap stops it flapping);
    - `'speech'` when the level has stayed more than `speechRiseDb` above the floor for `speechMs` without a
      break, and at least `speechCooldownMs` has passed since the last `'speech'`.
  - `noisy()` is true between a `'noisy'` and the next `'quiet'`.
- `awareSupported()`: true when `navigator.mediaDevices.getUserMedia` and an AudioContext exist.
- `startAwareness({ onEvent, onLevel }, options)` returns a Promise of `{ stop() }`. It asks for the microphone
  with `{ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false } }`, connects it to
  an `AnalyserNode` (fftSize 2048; do NOT connect to the speakers), and every 100 ms reads the samples
  (`getFloatTimeDomainData`), computes `levelDb`, calls `onLevel(db)` if given, feeds the tracker with
  `performance.now()` and calls `onEvent(event)` for each event. `stop()` clears the timer, stops every track of
  the stream and closes the AudioContext; calling it twice is harmless. If the microphone is refused it rejects
  with `Error("Noesis could not use the microphone. Allow it in the browser's site settings.")`.
  The module must import cleanly in Node (no browser object touched at import time).
- Tests (node:test, like the other tests in src/lib): `levelDb` for silence, a full-scale square wave (0 dB),
  and a half-scale one (about -6 dB); the floor follows a steady level and ignores a loud burst; `'noisy'` after
  4 s of loud background and not before, never twice; `'quiet'` only after 6 s below the quiet level; no change
  between the thresholds; `'speech'` after 350 ms of a level 20 dB above the floor, not for a 200 ms click, and
  not again inside the cooldown.

## `src/ui/AwarenessCard.jsx`
`AwarenessCard({ Card, slow, pauseOnSpeech, onChange })`, written like `src/ui/AmbientCard.jsx` (read it and
`src/ui/kit.jsx` for `Toggle`). Inside `<Card title="Aware listening">`:
- a Toggle, label "Slow down when it is noisy", hint "The voice slows a little while there is noise around
  you, and returns to your speed when it is quiet again.", `onChange(next => onChange({ slow: next }))`;
- a Toggle, label "Pause when I speak", hint "The book pauses when you start talking, and stays paused until
  you press play. Best with headphones: on the phone's speaker the book's own voice can set it off.",
  `onChange({ pauseOnSpeech: next })`;
- a paragraph: "Uses the microphone only while a document is playing with the app open. Sound is measured on
  this device. Nothing is recorded or sent."
- when `awareSupported()` is false: only the paragraph "This browser cannot use the microphone, so aware
  listening is not available here."
Inline styles with tokens from src/theme.js; components at top level only; no em dashes in any text.

## Done when
`npm test` passes and `npx vite build` has no errors or warnings (also no `INEFFECTIVE_DYNAMIC_IMPORT`
notice). Report: files created, the test list, build and test output lines, what you could not run (no
microphone here). Do not commit.
