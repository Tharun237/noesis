# Listening test for Noesis voices

A tool that judges generated speech the way a careful listener would. It drives the live app
(https://noesis-777.pages.dev) in headless Chrome, generates a text with a chosen Piper voice, pulls the audio
out of the browser, measures it, transcribes it with Whisper, and compares the words with the text.

## Run it

```bash
# one or more voices
node tools/listen/listen.mjs --voice en_US-ljspeech-medium --voice en_US-kristin-medium
# all eleven voices (about 11 runs; each run downloads the voice again, ~63 MB)
node tools/listen/listen.mjs --all
# your own text
node tools/listen/listen.mjs --voice en_US-john-medium --text "Your sentence here. And another."
# self-test of the measurements (no network, no app; exit 0 = all checks pass)
node tools/listen/selftest.mjs
```

Needs Google Chrome installed (the `chrome` channel of playwright-core), the repo's `node_modules`, and
internet access for the first Whisper model download (cached under `tools/listen/.cache/`).

Output: `tools/listen/out/<voice>/` holds `s01.wav`... (one per sentence, as generated) and `stretch.wav`
(all sentences joined into one Ogg Opus file, decoded, as the player builds it). `out/report.md` is the readable
report; `out/report.json` has every number.

Each run is a fresh browser profile, so every run downloads the voice. Expect 1 to 3 minutes per voice.

## What the table means

| Column | What you would hear | Source |
|---|---|---|
| **WER** | Share of words that were wrong, skipped or added, as Whisper heard them. 0% is perfect. Whisper is itself imperfect, so a few percent of misses on clean speech is normal. | compare.mjs |
| **misheard** | The exact words: `a>b` means expected `a`, heard `b`; `-w` means `w` was skipped; `+w` means an extra word. | compare.mjs |
| **RMS dBFS** | Average loudness of the joined audio. Around -20 dBFS is comfortable; much lower sounds quiet next to other audio. | levels |
| **clipped** | Samples at full scale. Above 0 means distortion or crackle on loud words. | levels |
| **worst join click** | At the seam between sentences, the largest sudden jump in the waveform, relative to the local loudness. A ratio above 6 is an audible tick or pop. | joins |
| **gap max / min ms** | Silence around each sentence boundary. Under 60 ms the sentences run into each other; over 700 ms the voice seems to stop and wonder. | joins |
| **flagged joins** | Boundaries with a gap or click flag. | joins |
| **pitch dev st** | How far the pitch moves around its middle, in semitones. Under about 2 is flat and robotic; lively speech, questions and emphasis move more. | pitch |
| **roominess ms** | How long a word's sound takes to fade 20 dB after it stops. Dry studio speech fades in a few ms; a room with echo lets each word ring for 100 ms or more ("bathroom"). | roominess |
| **brightness** | Share of the sound's energy above 4 kHz. Low means muffled, like a phone call; high is crisp. | brightness |

The report.md file also lists every boundary and every sentence (length, loudness, leading and trailing silence,
pitch spread).

## How each measurement works

Everything is computed on the joined audio at 48 kHz, after decoding, so the seams are measured as they play.

- **Levels**: peak and RMS in dBFS over the file, clipped samples (|x| >= 0.999), DC offset (average value).
- **Speech level**: the 90th percentile of the 10 ms loudness envelope. Pauses do not pull it down.
- **Silence**: envelope more than 35 dB below the speech level. Leading and trailing silence are measured
  from the file edges; internal pauses are runs of 250 ms or more.
- **Joins**: for each sentence boundary (the `starts` array the player uses):
  - *gap*: silence directly before plus directly after the boundary;
  - *click ratio*: largest sample-to-sample jump within 8 ms of the boundary, divided by the RMS of the 200 ms
    centred on it. The RMS is floored at 50 dB under the speech level, so silence does not blow up the ratio.
- **Pitch**: resampled to 16 kHz; 40 ms frames every 10 ms; normalised autocorrelation over 60 to 400 Hz. A frame
  is voiced when it is at speech level and its best correlation is at least 0.6. The shortest lag within 90% of
  the best is used (avoids octave errors), refined by parabolic interpolation. The spread is the standard
  deviation of the semitone values around the median.
- **Roominess**: each loud peak that starts a fall. The clock starts when the envelope first sits 3 dB under the
  peak and stops at 20 dB under it. Falls are discarded if the level rises back by 3 dB first. The reported
  value is the median.
- **Brightness**: Welch average of a 2048-point Hann spectrum over speech frames; share of power at 4 kHz and above.
- **WER**: word-level Levenshtein alignment after normalising both texts (lower case, apostrophes removed, "%" as "percent", British spellings folded onto American, other
  punctuation turned into spaces, so "3.5" is "3 5" on both sides).
- **Transcription**: Whisper base (English), `onnx-community/whisper-base.en`, word timestamps when the model
  supports them, 30 s chunks with 5 s stride.

## Thresholds: measured or guessed

Measured in selftest.mjs (the metric responds to the synthetic signal it should):
- click ratio: a 0.8 spike at a seam gives 19; a clean seam gives 0.2.
- gap: 300 ms and 900 ms pauses are measured to within 30 ms.
- roominess: a 0.3 s room gives 85 ms; dry gives 10 ms. (The 85 ms matches the physics: 17 dB of a 60 dB/0.3 s decay.)
- pitch: a constant 150 Hz tone reads 148.4 Hz with 0.08 semitones of spread; a tone moving +/-4 semitones reads 2.84.
- brightness: 6 kHz gives 1.0; 500 Hz gives 0.0.
- levels, silence, WER, and the WAV and FFT round trips are exact on their test signals.

**Guesses, to calibrate on real Noesis audio** (none of these has been checked against human listening yet):
- click ratio threshold 6 (`joins`).
- gap limits 60 ms and 700 ms (`joins`).
- silence 35 dB under speech, and the 250 ms minimum pause (`silences`).
- the 50 dB floor for the click denominator (`joins`).
- pitch voicing correlation 0.6, and the "under about 2 semitones is robotic" reading (`pitch`).
- roominess 3 dB start, 20 dB depth, 3 dB "speech resumed" rule (`roominess`).
- brightness "muffled under about 0.1" reading (`brightness`).

## Known limits

- The joined file starts with the Opus pre-skip (312 samples, 6.5 ms). The app's `starts` values count those
  samples, so the stored boundary times are 6.5 ms later than the decoded audio. The click window (8 ms) still
  covers the seam. Each record's packet frames are summed the same way the player sums them.
- Only Opus records are joined. A sentence stored as WAV, or one that failed to generate, makes the run fail
  loudly rather than measuring a different file.
- Metrics measure the signal, not meaning. A good score does not mean the voice sounds natural; the table should
  be checked by ear too, using the WAVs in `out/`.
- Whisper can misspell names and numbers ("3.5" as "three point five"); those show up in `misheard` and are a
  transcription limit as much as a voice limit.
