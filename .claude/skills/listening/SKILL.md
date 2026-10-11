---
name: listening
description: Test Noesis's generated speech the way a careful listener would, without human ears. Use after any change to voices, the voice worker, pauses, tone, encoding or the player's joined audio, when a voice is added or a new language is introduced, or when someone says the audio sounds robotic, echoey, clipped, rushed, gappy or wrong.
---

# Listening

You cannot hear. This skill gives you numbers that stand in for hearing, and tells you where they stop.

## Run

From the repo root (`C:\Users\tharu\OneDrive\Desktop\Noesis`). It drives the LIVE site, so deploy first.

```bash
node tools/listen/selftest.mjs                              # 13 checks of the measurements themselves; must pass
node tools/listen/listen.mjs --voice en_GB-alba-medium       # one voice, 1 to 3 minutes
node tools/listen/listen.mjs --voice A --voice B             # compare
node tools/listen/listen.mjs --all                           # every voice in src/lib/voices.js
node tools/listen/listen.mjs --voice A --text "Your text."   # your own text
```

Read `tools/listen/out/report.md` (table, then per-voice boundaries and sentences). Audio is in
`tools/listen/out/<voice>/` (`s01.wav`… as generated, `stretch.wav` as the player joins them).

Right after a deploy the first run can time out waiting for "Add document". Run it again before concluding
anything.

## What to check, in this order

1. **Did it say the words?** WER and the `misheard` list. Read the list, not only the percentage: names
   (Tharun, Gundu, Ananya) are Whisper's weakness and do not count against the voice. A voice above about 30%
   on ordinary words is broken (Reza Ibrahim measured 98% and was removed).
2. **Do sentences join cleanly?** `worst join click` under 6, no `flagged joins`. Gaps should sit near the
   targets in `src/lib/tts.worker.js` (`PAUSE_MS`: 260 ms sentence, 480 paragraph, 650 heading) plus the
   voice's own lead-in of 40 to 60 ms. Gaps far above the target mean the pause measure is not seeing the
   voice's own silence (this happened: a per-sample threshold missed the noise floor and Alba came out at
   480 to 750 ms).
3. **Is it clean?** `clipped` must be 0. RMS around -20 to -28 dBFS.
4. **Character**, for comparing voices, not pass/fail: `roominess` (dry reference 10 ms, echoey 85 ms),
   `pitch dev` (under about 2 semitones is flat), `brightness`.

Always compare against a run from before your change. A number on its own means little; the difference
between two runs is the evidence.

## Where this stops (say so when you report)

- It does not measure whether a voice is pleasant or natural. Only a person can say that. Report the numbers,
  name what a person should listen for, and do not claim "sounds good".
- The thresholds for clicks, gaps, flatness and roominess are guesses that have not been checked against
  human listening (list in `tools/listen/README.md`, "Guesses, to calibrate"). When Tharun says how something
  sounded, record it there beside the number: that is the calibration.
- Transcription is trustworthy for English only (Whisper base, English). For other languages the tools
  switch to multilingual Whisper small, and on 2026-10-11 that was NOT reliable: it wrote Telugu speech in
  Hindi script and then repeated one word, and returned two syllables for 8.7 s of Hindi. So for Hindi,
  Telugu and the rest, WER means nothing yet; only the signal metrics (joins, clipping, levels) count, and a
  person has to listen. `node tools/listen/hear.mjs file.wav "expected text"` checks any WAV the same way.
- It runs desktop Chrome. It says nothing about a phone's speaker, Bluetooth, or background playback.
- Each run uses a fresh browser profile and downloads the voice again (about 63 MB).

## Reporting

Give the before and after numbers for what you changed, the misheard words that are real (not names), and
one line on what a person should still check by ear.
