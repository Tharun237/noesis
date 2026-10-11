# Noesis on WebKit: smoke test report

Date: 2026-10-11 · Site: https://noesis-777.pages.dev · Harness: `e2e/webkit-smoke.mjs`
Browser: Playwright 1.64 WebKit 27.2 (`npx playwright-core install webkit` worked as written; it installed to `C:\Users\tharu\AppData\Local\ms-playwright\webkit-2370`). Device profile: `devices['iPhone 15']` (393 x 659 @3x, iPhone user agent).

## What this is, and what it is not

- This is **WebKit on Windows with an iPhone user agent and viewport**. It is not iOS Safari. Its feature set, media stack and permission rules come from this build, so every result below is an observation about this build unless it says otherwise.
- **No audio decodes in this build.** Section 4 shows that MP3, WAV, M4A, WebM/Opus and Ogg/Opus all fail with media error code 4. Audible output, playback timing, highlight-while-playing, pause and lock-screen behaviour are therefore **not tested** (checks 4b to 4d were skipped).
- Nothing under `src/`, `public/` or `e2e/qa.mjs` was changed. Nothing was committed, pushed or deployed. Only the two requested files were created in the repo. Screenshots went to `.qa-out/` as requested. The diagnostic probes in section 4 were run inline via stdin, and the sample audio files were written to the session scratchpad, outside the repo.

## 1. Summary

| # | Check | Result in this WebKit build | User impact on Safari |
|---|---|---|---|
| 1 | First-run screen shows "Listen to anything" | PASS (heading visible) | None |
| 2a | App-required browser APIs present | FAIL: `AudioEncoder`, `AudioData`, `MediaMetadata`, `SpeechSynthesisUtterance`, `speechSynthesis`, `mediaSession` absent | Natural voice falls back to WAV storage; no built-in voice; no lock-screen controls. **Whether iOS Safari has these is unverified.** |
| 2b | Opus encoding at the Piper rate (`AudioEncoder.isConfigSupported`) | FAIL (no `AudioEncoder`) | Every sentence is stored as 16-bit WAV, about 11 times the size of Opus (section 3.3) |
| 2c | `<audio>` can play Ogg/Opus | FAIL: `canPlayType('audio/ogg; codecs=opus')` returns `""` (`mp4/opus` and `wav` return `probably`) | The app builds Ogg blobs whenever `AudioEncoder` exists (`player.js:67`, `tts.js:60`). On a browser like this they would be unplayable |
| 3a | "Try a sample" opens the reader (`history.state.view === 'reader'`) | PASS | None |
| 3b | Natural voice downloads and voices the sample | PASS: ready in 33 s and 36 s over two runs, 11 of 11 sentences. Model download and ONNX WASM run worked | Generation works in WebKit |
| 3c | Stored audio records (codec and size) | PASS, but every record is `wav`: 11 records, 1,999 KB total (about 45 s of audio, derived from the WAV header rate; about 2.6 MB per minute) | 11 times the storage of the 32 kbps Opus the code is designed for (`encode.js:5`) |
| 4a | Play turns the button into Pause | FAIL: `play()` rejected with `NotSupportedError`, media error code 4, aria-label stayed "Play" | No audio in this build at all (section 4). **The app also gave no feedback (section 4.3)** |
| 4b to 4d | Audio clock advances, highlight advances in 20 s, Pause stops | SKIP (Play did not start) | Not testable here |
| 5 | Horizontal overflow at 393 px: library (empty), reader, library (with sample), settings | PASS: scrollWidth 393 equals innerWidth 393 on all four | None measured. The reader screenshot shows a horizontal scrollbar along the bottom edge; the document-level check passes, so this is probably an inner scroll container, not identified |
| 6 | Console errors, uncaught page errors, HTTP 400+ | PASS: 0 console errors, 0 page errors, 0 HTTP 400+ responses | The Play failure produced no console error, so it was silent |

Tally from the final run: 12 PASS, 4 FAIL, 1 SKIP, 33 INFO.

## 2. Feature probe (this WebKit build)

| Probe | Value | Why it matters to Noesis |
|---|---|---|
| `AudioEncoder` / `AudioData` | absent / absent | `encode.js:10-13` falls back to WAV (section 3.3) |
| `MediaMetadata` | absent | `player.js:434-442` runs only inside `if ('mediaSession' in navigator)`, so no crash, but no metadata |
| `speechSynthesis` / `SpeechSynthesisUtterance` | absent / absent | Built-in voice unavailable (`engine.js:9` returns false, so the option is hidden) |
| `serviceWorker in navigator` | true | Service worker and notification code can run (`ready.js:11`) |
| `mediaSession in navigator` | false | Lock-screen and Now Playing controls are no-ops here (`player.js:457-467`) |
| `navigator.vibrate` | absent | Not used by the app; no impact |
| `IntersectionObserver` | function | `Reader.jsx:216`, `ReaderParts.jsx:132` |
| `scheduler` in window | false | `text.js:130` falls back to `setTimeout` |
| `crossOriginIsolated` / `SharedArrayBuffer` | false / absent | Expected: the app runs one ONNX thread (`tts.worker.js:16`), so isolation is not needed |
| `CSS content-visibility: auto` / `text-wrap: pretty` | supported / supported | Not used by the app |
| `documentPictureInPicture` / `document.pictureInPictureEnabled` | absent / undefined | Not used |
| `navigator.storage.persist` | function | `db.js:37-39` |
| `navigator.storage.persisted()` | false | Storage not persistent in this run |
| `navigator.storage.estimate().quota` | 1,048,576,000 bytes (about 1 GB) | Quota differs on iOS; unverified |
| `canPlayType`: Ogg/Opus, WAV, MP4/Opus | `""` / `probably` / `probably` | Ogg blobs (`player.js:67`) would be unplayable |
| `caches` in window | true | Voice cache (`tts.worker.js:22,35`) |
| `Intl.Segmenter` | function | Sentence splitting, `text.js:83` |
| `Array.prototype.findLastIndex` | function | `gemini.js:141`, `Reader.jsx:375` |
| `isSecureContext` | true | |
| `navigator.userAgentData` | absent | `engine.js:8` falls back to the user-agent regex, which matches iPhone |

## 3. Details

### 3.1 First run, and the layout at 393 px

The heading "Listen to anything" rendered on first load (HTTP 200). The library and reader fit the 393 px width (see check 5). Screenshots: `.qa-out/webkit-library-empty.png`, `.qa-out/webkit-reader.png`, `.qa-out/webkit-reader-overflow.png`, `.qa-out/webkit-library.png`, `.qa-out/webkit-settings.png`.

The library screenshot shows the iOS install hint ("Tap ... then Add to Home Screen"), which `InstallPrompt.jsx:19-22` shows because the user agent looks like iOS Safari. This confirms the iOS detection branch runs. It does not test installing.

### 3.2 Generation

The voice engine downloaded the Piper LJ voice from `huggingface.co` with the page's COEP header set, and generated all 11 sentences (33 s in run 2, 36 s in run 1). The reader reached "Ready to play" and the stored status became `ready`. This is the first observed proof that the WebAssembly ONNX path runs in WebKit.

### 3.3 Stored codec and size

Every record is WAV (`codecs {"wav":11}`), because `AudioEncoder` is absent. `encode.js:13` returns `{ codec: 'wav', bytes }` with no `rate` field. Sizes: about 2.0 MB total, sentence 0 about 227 KB, and the WAV header reads 22050 Hz, mono, 16-bit. That is 44.1 KB per second, or about 2.6 MB per minute. Opus at 32 kbps (`encode.js:5`) is about 4 KB per second, or about 0.24 MB per minute, so this path is roughly 11 times larger.

### 3.4 Playback (check 4a)

Observed in the final run, after Play was pressed:

- `waiting`, then `play() rejected` with `NotSupportedError: The operation is not supported.`, then the audio element `error` with code 4 (`MEDIA_ERR_SRC_NOT_SUPPORTED`).
- The app had created one blob of type `audio/wav`, 232,492 bytes.
- The Play button's aria-label stayed "Play" (labels read: "Playback speed", "Play", "Player menu").

## 4. Diagnosis of the Play failure

The question was whether the app or this WebKit build caused the failure. Evidence:

| Source (played via `<audio>` in this WebKit) | Result |
|---|---|
| Noesis's own stored sentence-0 WAV (22050 Hz, mono, 16-bit) | error code 4 |
| An independently generated valid WAV, 22050 Hz 16-bit | error code 4 |
| Same WAV at 8000/22050 Hz 8-bit, 8000 Hz 16-bit, 44100 Hz 16-bit, 48000 Hz 16-bit | error code 4 each |
| The same WAV as a `data:` URL | error code 4 |
| Real MP3 (`libmp3lame`, 22050 Hz) | error code 4 |
| Real M4A (AAC) | error code 4 |
| Real WebM (Opus, 48000 Hz) | error code 4 |
| Real Ogg (Opus, 48000 Hz) | error code 4 |

Conclusion: **this WebKit build decodes no audio.** `canPlayType` says `probably` for MP3, WAV and AAC, so it cannot be used to predict playback here. The app's WAV bytes are valid (the header is correct), so the app's audio data is not at fault in this build. The Play failure is therefore an artefact of this environment, not evidence about iOS Safari.

The diagnostic probes were run inline with `node --input-type=module -`, so no extra files were saved. The sample files were `diag-probe.{mp3,wav,m4a,webm,ogg}` in the scratchpad.

### 4.1 What is not established

- Whether iOS Safari decodes these formats. Safari decodes WAV, MP3 and AAC natively, but that is a pattern-based assumption and is not verified here.
- Whether iOS Safari requires the `play()` call to happen in the same tap (gesture window). The app calls `play()` after awaits: `player.js:320-338` awaits `gateCheck()` (IndexedDB) before `audio.play()` at line 337, and `player.js:165-180` awaits `stretchAt()` before line 180. This is a plausible iOS failure mode. This run cannot test it, because the build fails with a decode error before any gesture rule would matter. Treat it as an unverified risk.

### 4.2 Read from code, not run

`library.js:552` writes the exported WAV's header with `wav(new Float32Array(0), 24000)`. The voice is 22050 Hz (the header of the stored record reads 22050), and WAV records do not store their rate, so the `rate` variable keeps its 24000 default (`library.js:540`, updated only from records that carry a rate at `library.js:545`). The exported file should play about 9% fast and about 1.4 semitones high (24000 / 22050 = 1.088). The menu label `Library.jsx:353` always says `.opus`, while the file is named `.wav`. The QA script expects `.opus` (`e2e/qa.mjs:250`), so the existing QA would fail on any engine that takes this path.

### 4.3 The failure is silent

`player.js:180` and `player.js:337` both end with `.catch(() => player.set({ playing: false }))`. When `play()` is rejected, the app only flips the state back, with no message. In this run the user-visible result was that tapping Play did nothing, and the console showed 0 errors. Any engine that rejects `play()` (decode failure, gesture rule) produces the same silence.

## 5. Unverified on a real iPhone

Nothing in this list was tested. Each item is either a pattern-based assumption or a gap that this WebKit build cannot cover.

- **Home-screen install and standalone launch.** Only the UA-based hint was seen. `index.html:5-11` has no `apple-mobile-web-app-capable` tag. Whether iOS needs it for standalone is unverified.
- **Background audio and lock-screen controls.** `mediaSession` is absent here. The code paths are `player.js:434-467`. Whether iOS keeps audio playing in the background is unverified.
- **Autoplay and gesture rules.** The `play()` path after awaits (section 4.1) is unverified.
- **Audio decoding.** This build decodes nothing. Whether iOS decodes the app's WAV blobs, and whether it plays `audio/ogg; codecs=opus`, is unverified. The Ogg path only runs when `AudioEncoder` exists, which is itself unverified on iOS.
- **Storage eviction.** `navigator.storage.persisted()` is false here, and `db.js:37-39` requests persistence. Safari's eviction rules (including any limit on script-written storage) are a pattern-based assumption. The 63 MB voice sits in Cache Storage (`tts.worker.js:8,34-57`), so eviction matters.
- **System voices.** `speechSynthesis` is absent here. Whether iOS voices load, and whether word boundaries (`onboundary`, `player.js:195-199`) fire reliably, is unverified.
- **Notifications.** `ready.js:11-20` gates on `Notification`. Whether Notification exists in a Safari tab, as opposed to an installed web app, is a pattern-based assumption and is unverified.
- **Cross-origin isolation.** `_headers:2-3` and `vite.config.js:12-15` set `COEP: credentialless`. Here the model download still succeeded, but whether iOS honours or ignores the value is unverified. The app runs one thread, so isolation should not matter.
- **Memory and tab kills.** Loading a 63 MB model plus an ONNX session (`tts.worker.js:59-68`) may be killed by iOS memory limits. Unverified.
- **Touch, fonts and safe areas.** Tap targets, Literata and DM Sans rendering, `env(safe-area-inset-top)` (`Reader.jsx:90`), keyboard zoom on inputs, and momentum scrolling were not inspected on a device.
- **The horizontal scrollbar** visible at the bottom of the reader screenshot. Its source element was not identified.

## 6. Prioritised fixes for Safari

Ordered by user impact. Items 1 and 2 apply to every browser, not only Safari.

1. **Stop swallowing `play()` failures.** `player.js:180` and `player.js:337` reset `playing` with no message. Show the error (name and a plain sentence) and keep the state honest. Verify with a forced rejection.
2. **Make the tap start playback synchronously.** `player.js:320-338` awaits IndexedDB before `audio.play()`. Unlock the single `<audio>` element inside the tap (a silent clip played synchronously in the click handler) and reuse it, so later awaited `play()` calls are allowed. Unverified on iOS, so test on a device first.
3. **Fix the WAV export.** `library.js:552` hard-codes 24000 Hz, and `encode.js:13` does not store the rate. Store `rate` on WAV records and pass it to `wav()`. Align `Library.jsx:353` (`.opus` label) with the file type. Then update the QA expectation in `e2e/qa.mjs:250` in a separate change.
4. **Gate the Ogg path on a real capability, and decide the Safari codec.** `player.js:67` and `tts.js:60` produce Ogg whenever `AudioEncoder` exists. Check `canPlayType('audio/ogg; codecs=opus')` first, and pick a container Safari plays (WAV is what it gets today, at about 11 times the size of Opus). Decide only after verifying `AudioEncoder` and Ogg support on iOS.
5. **Add the iOS standalone meta tags, then verify.** `index.html:5-11` lacks `apple-mobile-web-app-capable` and a status-bar style. Add them and check the home-screen launch on a real iPhone. Low cost, and the result is pattern-based until tested.

## 7. Reproduce

```
cd /c/Users/tharu/OneDrive/Desktop/Noesis
npx playwright-core install webkit
node e2e/webkit-smoke.mjs            # default https://noesis-777.pages.dev, about 3-4 min
```

Screenshots are written to `.qa-out/webkit-*.png`. The `webkit-reader-playing.png` screenshot is not produced because playback never started in this build.
