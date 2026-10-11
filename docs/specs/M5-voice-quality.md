# M5: voice quality — default voice, pauses, tone presets

## Evidence (tools/listen, all 11 voices, production, 2026-10-11; full table in docs/research/voices-measured.md)
- LJ (the default) is among the most echoey (65 ms decay; dry reference 10, reverb reference 85) and leaves
  only 30–110 ms between sentences; every other voice leaves about 200–400 ms. Listeners called it "robotic"
  and "like a bathroom".
- Reza Ibrahim is unintelligible to the transcriber (98% of words missed): broken, must not be offered.
- Mike is the flattest (2.0 semitones of pitch movement) and the most echoey (85 ms).
- Best measured: Alba (driest 40 ms, 11% misheard), Northern English male (10% misheard, 50 ms),
  Joe (driest 40 ms, most pitch movement 5.4).

## 1. Voice catalogue (src/lib/voices.js)
- Remove `en_US-reza_ibrahim-medium`.
- Order: Alba, Kristin, Cori, LJ (female, best measured first), then Northern, Joe, John, Norman, Bryce, Mike.
- `DEFAULT_VOICE` = `en_GB-alba-medium` (it is `VOICES[0]`; keep that relationship).
- `src/lib/settings.js` DEFAULTS.voice = the same id.
- A document or setting that still names the removed voice must fall back to the default: extend the existing
  `isVoice` / `fromKokoro` handling so any unknown voice id maps to `DEFAULT_VOICE` (keep the Kokoro mapping).
  Existing documents keep the voice they have (do not change other documents' voices).
- The stats line on the first-run screen uses `VOICES.length`: it will read 10. That is correct.

## 2. A natural pause after every sentence (src/lib/tts.worker.js, pure helper + test)
- After synthesis and before encoding, measure the silence already at the end of the sentence's samples
  (trailing samples whose level is more than 40 dB below the sentence's RMS) and add silence so the total
  trailing pause reaches a target: 260 ms after an ordinary sentence, 480 ms when it is the last sentence of
  its paragraph, 650 ms after a heading. Never remove audio; only add.
- The worker's `speak` message gains a `pause` field ('sentence' | 'paragraph' | 'heading', default
  'sentence'); `synthesize(text, voice, pause)` in src/lib/tts.js passes it; `voiceOne` in src/lib/library.js
  decides it from the document: the sentence's block kind is 'h' → 'heading'; it is the last sentence of its
  block → 'paragraph'; else 'sentence' (see `loadDoc`: `segs[i].b` is the block index, `doc.starts[b]` the
  first sentence of block b, `doc.blocks[b].s.length` its sentence count).
- Put the measuring/padding in a pure function `padTail(pcm, rate, targetMs)` in a new file
  `src/lib/pause.js` (returns a Float32Array) with a node test `src/lib/pause.test.js`: a tone with 50 ms of
  trailing silence padded to 260 ms ends with 260 ms (±5 ms) of silence; one that already has 400 ms is
  returned unchanged; an all-silent input is returned unchanged.
- Word highlighting (src/ui/Reader.jsx) estimates word times from the sentence duration minus a tail
  allowance of 0.18 s. The tail is now longer: store the added pause on the record (`rec.tail` = seconds of
  trailing silence after padding) and use `dur - rec.tail` as the spoken length where the highlight computes
  word positions. `loadDoc` exposes durations as `c.durs[i]`; add a parallel `c.tails[i]` filled the same way
  (0 when unknown), persisted with the durations if they are persisted together, otherwise kept in memory and
  filled when a sentence is voiced or read back. Keep this change minimal.

## 3. Tone presets — the "equalizer" (generation-time, so it cannot break background playback)
- New setting `voiceTone` in src/lib/settings.js DEFAULTS: 'natural' | 'clear' | 'warm' | 'bright'
  (default 'natural' = no processing).
- New pure module `src/lib/tone.js`: `applyTone(pcm, rate, tone)` → Float32Array, using standard biquad
  filters (RBJ cookbook) implemented in plain JS, processed in place on a copy:
  clear = low-shelf −3 dB at 180 Hz + peaking +3 dB at 3 kHz (Q 0.9) + high-shelf +2 dB at 6 kHz;
  warm = low-shelf +3 dB at 200 Hz + high-shelf −2 dB at 5 kHz;
  bright = high-shelf +5 dB at 4.5 kHz + peaking −2 dB at 300 Hz (Q 1).
  After filtering, if the peak exceeds 0.98, scale the whole sentence down to 0.98 (no clipping).
  Node test `src/lib/tone.test.js`: 'natural' returns the input unchanged; for a mix of 150 Hz + 5 kHz tones,
  'bright' raises the 5 kHz component relative to 150 Hz and 'warm' lowers it (measure with a simple
  single-frequency correlation); no output sample exceeds 1.
- The worker applies the tone after padding and before encoding; `speak` gains a `tone` field.
- Stored audio is only valid for the voice AND tone it was made with: the record tag `rec.v` becomes
  `voice + '|' + tone` when tone is not 'natural' (plain `voice` for natural, so existing audio stays valid).
  Update `audioMatches` and the place that sets `rec.v` in src/lib/library.js accordingly, and make a change
  of `voiceTone` behave exactly like a change of voice for every document (existing audio for the old tone is
  regenerated from the listening position: reuse `resetAudio`; the player already restarts on voice change —
  add `voiceTone` to the values it watches in `voiceChanged`).
- UI: Settings → Voice card (src/ui/VoiceCard.jsx), natural voice only: a `Segmented` control labelled
  "Tone" with Natural, Clear, Warm, Bright, and the hint "Changes how the voice is made. Audio you already
  have is made again from where you are listening."

## Project rules (must follow)
- No new dependencies. Pure helpers get node tests (`node --test`, see existing src/lib/*.test.js).
- React components at top level only; inline styles with tokens from src/theme.js.
- Touch only: src/lib/voices.js, src/lib/settings.js, src/lib/tts.js, src/lib/tts.worker.js, src/lib/library.js,
  src/lib/player.js (voiceChanged only), src/ui/Reader.jsx (tail in word timing only), src/ui/VoiceCard.jsx,
  NEW src/lib/pause.js, src/lib/pause.test.js, src/lib/tone.js, src/lib/tone.test.js, and e2e/qa.mjs.
- e2e/qa.mjs: the voice-change step picks the voice by button name /^John/ and expects
  'en_US-john-medium': keep that working. If a step relies on the default voice id, update it to the new
  default. Do not run e2e/qa.mjs yourself.
- `npx vite build` with no errors or warnings (do not raise any limit) and `npm test` passing.

## Done when
Report: files changed, the test cases added, and the build + test output lines. Do not commit, push or deploy.
