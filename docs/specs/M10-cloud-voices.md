# M10: the customer brings the voice too (NVIDIA voices, 12 languages)

Read docs/research/nvidia.md first (section "Voices"): it holds the measurements this spec rests on.

## Why
"A user should have all the options. Noesis should allow whatever tools they bring." (Tharun, 2026-10-11.)
Until now a voice is either a Piper voice made on the device (English, Telugu) or the phone's built-in
voice. Hindi has no natural voice at all. NVIDIA's Magpie voices answer over HTTPS with the customer's own
free NVIDIA key: 86 voices in English, Spanish, French, German, Chinese, Vietnamese, Italian, Hindi,
Japanese, Korean, Arabic and Portuguese.

## The customer's seat (the work is judged by this)
1. A customer who saved an NVIDIA key in Settings → AI sees NVIDIA voices wherever voices are chosen (Add a
   document, the document's voice picker, Settings → Voice), marked "NVIDIA · online", for the language in
   question. No key: none of this appears, and nothing claims it.
2. A Hindi document (or a book translated into Hindi) gets a natural Hindi voice when the key is there,
   instead of the phone's built-in voice.
3. The languages a document can be translated into grow to every language that has a voice: English,
   Telugu, Hindi + Spanish, French, German, Italian, Portuguese, Vietnamese, Chinese, Japanese, Korean,
   Arabic. A language whose only voices are NVIDIA's is offered only when the NVIDIA key is there.
4. Truth, wherever an NVIDIA voice is chosen, exactly: "Made online by NVIDIA: the text travels through
   Noesis's relay to NVIDIA. The audio is kept on this device and plays offline."
5. Offline or rate-limited while audio is being made: the document's stage says so and continues by itself:
   "This voice is made online. Waiting for a connection." / "NVIDIA's free quota is limiting requests.
   Retrying in about N s." A sentence is NEVER marked as failed because the network or the quota failed.

## Design decisions (do not change them)
- A cloud voice produces the same stored audio as a Piper voice. After the samples arrive, everything is
  the existing pipeline: natural pause (`padTail`), tone, Opus encoding, the stored record, stretches,
  playback. Only where the samples come from differs.
- Voice ids: `nv:<NVIDIA voice name>`, for example `nv:Magpie-Multilingual.HI-IN.Sofia`.
- One request per sentence, one at a time, at least 1.6 s between request starts (the account limit is about
  40 a minute; measured: 8.7 s of Hindi speech came back in 1.3 s).

## 1. Relay: NEW `functions/api/nvidia-tts/[[path]].js`
Same rules and style as `functions/api/nvidia/[[path]].js` (read it): forwards `POST /api/nvidia-tts/synthesize`
(multipart body passed through untouched, with its content-type header including the boundary) and
`GET /api/nvidia-tts/list_voices` to
`https://877104f7-e885-42b9-8de8-f6e4c6303969.invocation.api.nvcf.nvidia.com/v1/audio/<same path>`, with the
caller's `Authorization` header. Requires a Bearer header (401), refuses other paths and methods (404),
other origins (403), bodies over 1 MB (413); `cache-control: no-store`; logs and stores nothing. Keep the
upstream address in ONE constant with a comment that NVIDIA may change it.

## 2. Languages: `src/lib/lang.js` (+ tests)
- `LANGS` gains: es Spanish, fr French, de German, it Italian, pt Portuguese, vi Vietnamese, zh Chinese,
  ja Japanese, ko Korean, ar Arabic. Each entry: `{ name, locale, nv }` where `nv` is NVIDIA's code:
  en-US, es-US, fr-FR, de-DE, zh-CN, vi-VN, it-IT, hi-IN, ja-JP, ko-KR, ar-AR, pt-BR (te has none).
- `detectLang(text)`: by script first, majority of letters in the first 4000 characters: Devanagari hi,
  Telugu te, Arabic ar, Hangul ko, Hiragana or Katakana present among Han/kana letters → ja, Han → zh.
  Otherwise Latin: score the words against a short list of the commonest words of en, es, fr, de, it, pt, vi
  (about 15 words each, no word shared between two lists); the best score wins when it is at least 0.08 of
  the words and beats the second by a clear margin (1.3×); otherwise 'en'. `isEnglish` keeps working.
  Tests: one real paragraph per language detects correctly; the existing tests keep passing.
- In `prepare` (src/lib/library.js): when `d.target` is set and translation ran (or the text was already in
  the target language), the document's `lang` is `d.target`, not a new detection.

## 3. Cloud voice client: NEW `src/lib/cloudvoice.js` (+ `cloudvoice.test.js` for the pure parts)
- `isCloudVoice(id)` (`nv:` prefix); `cloudVoiceInfo(id)` → `{ name: 'Sofia', nv: 'hi-IN', lang: 'hi' }`
  parsed from the name (`Magpie-Multilingual.HI-IN.Sofia`; map the middle part back to a `LANGS` key).
- `parseWav(arrayBuffer)` → `{ pcm: Float32Array, rate }` for 16-bit mono PCM WAV (find the `data` chunk; do
  not assume it starts at byte 44). Pure, tested with a WAV built in the test.
- `baseVoices(listReply)` → `{ lang: [voice names] }` from the `list_voices` reply (shape in the research
  note), keeping only names with exactly three dot-separated parts (drops emotion variants such as
  `…Mia.Calm`). Pure, tested.
- `loadCloudVoices()`: GET `/api/nvidia-tts/list_voices` with the saved NVIDIA key; stores the result in
  settings (`nvidiaVoices`, default `{}`); called after the NVIDIA key is saved or tested (hook it where
  src/ui/AiCard.jsx saves the NVIDIA key) and at most once a day at startup when a key exists.
- `cloudSynthesize(text, voiceId, { signal, onRetry })` → `{ pcm, rate }`: multipart POST with fields
  `text`, `language` (the voice's nv code), `voice` (name without `nv:`), `encoding=LINEAR_PCM`,
  `sample_rate_hz=22050`; `Authorization: Bearer <nvidiaKey>`. Spaces requests 1.6 s apart (module-level
  timestamp). 429 and 5xx: wait and retry with `onRetry(seconds)` (same backoff as src/lib/ai.js); a network
  failure (TypeError) or `navigator.onLine === false`: wait for the `online` event (or 15 s), then retry,
  reporting `onRetry('offline')`. 401/403/404: throw an Error with a sentence the customer can act on
  ("NVIDIA did not accept the key. Check it in Settings." / the upstream detail text).

## 4. One synthesis door: `src/lib/tts.js`, `src/lib/tts.worker.js`
- `synthesize(text, voice, pause, tone)`: for a cloud voice, get `{ pcm, rate }` from `cloudSynthesize`, then
  send the worker a new message `{ type: 'encode', pcm, rate, pause, tone }` that runs exactly the tail of
  the existing `speak` (padTail → trailingSeconds → applyTone → encode) and returns the same record shape
  (`dur`, `tail`, codec fields). Refactor that tail into one function used by both; do not duplicate it.
- `loadEngine(voice)` for a cloud voice: nothing to download; the engine store reads ready for it.
- The retry callbacks surface as the document's stage (see the customer's seat, 5). Read how `voiceOne` in
  src/lib/library.js treats a thrown error today (it records the sentence as failed): for a cloud voice a
  thrown network or quota error must not reach that code; only a real refusal (bad key, text rejected) may.

## 5. Voices and languages in the lists
- src/lib/voices.js: `voicesFor(lang)` returns the on-device voices of that language followed by the cloud
  ones (`{ id: 'nv:…', name, accent: 'NVIDIA · online', g: undefined, license: 'NVIDIA', lang, cloud: true }`)
  when an NVIDIA key is saved and `settings.nvidiaVoices[lang]` has entries. `isVoice(id)` accepts a cloud
  id. `voiceName(id)` works for cloud ids. `defaultVoiceFor(lang)`: first on-device voice, else first cloud
  voice, else null. `VOICES` (the on-device catalogue) is unchanged.
- Everywhere a voice label is built from `v.g` (`female` / `male`), a cloud voice shows `v.accent` only.
- src/ui/Sheets.jsx: the Add form's Language control becomes a `select` (13 languages do not fit a segmented
  control): "Original" then every language in `LANGS` that currently has a voice (`voicesFor(l).length > 0`)
  or is 'hi' (built-in fallback exists). The reader's language sheet lists the same set.
- Where a cloud voice is the chosen one (Add form, voice picker, Settings → Voice), show the truth line from
  the customer's seat, 4, as the hint.
- src/lib/translate.js: the wrong-alphabet check (`SCRIPT`) gets an entry for every language: Arabic, Hangul,
  Han plus kana for ja, Han for zh, Latin for es/fr/de/it/pt/vi.
- src/lib/text.js: the sentence-end test also accepts `。`, `！`, `？` and `؟`.
- src/ui/Credits.jsx: one row under Voices: "NVIDIA Magpie voices (online, with the customer's NVIDIA key)"
  linking to https://build.nvidia.com/nvidia/magpie-tts-multilingual.

## Project rules (must follow)
- No new dependencies. Pure helpers get node tests. React components at top level only; inline styles with
  src/theme.js tokens. No `try/catch` that hides an error. Status text must be true.
- Touch only: NEW functions/api/nvidia-tts/[[path]].js, src/lib/cloudvoice.js, src/lib/cloudvoice.test.js;
  src/lib/lang.js, src/lib/lang.test.js, src/lib/voices.js, src/lib/tts.js, src/lib/tts.worker.js,
  src/lib/library.js, src/lib/settings.js, src/lib/translate.js, src/lib/text.js, src/ui/Sheets.jsx,
  src/ui/VoiceCard.jsx, src/ui/AiCard.jsx (the one hook), src/ui/Credits.jsx. Do not touch e2e/qa.mjs; do
  not run it. Do not change any visible sentence that e2e/qa.mjs matches (grep it first).
- `npm test` and `npx vite build` with no errors or warnings (do NOT raise any warning limit).

## Done when
Report: files changed; the exact multipart request the browser sends for one sentence; how a network or
quota failure is kept from marking a sentence as failed (name the function and the lines); the test cases
added; the build and test output lines. Say plainly what you could not run (there is no NVIDIA key in your
environment). Do not commit, push or deploy.
