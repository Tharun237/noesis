# M11: the customer's own voice service (OpenAI speech protocol)

## Why
M10 added NVIDIA voices. A customer may have another voice service: OpenAI, Groq, or a model on their own
computer (many local servers speak the same protocol). "Noesis should allow whatever tools they bring."

## The protocol (the de-facto standard; nothing Noesis-specific)
`POST {address}/audio/speech`, JSON body `{ "model": "<model>", "voice": "<voice>", "input": "<text>",
"response_format": "wav" }`, header `Authorization: Bearer <key>` when a key is set. The reply body is a WAV
file. Called straight from the browser (no relay): the address is the customer's own choice.

## The customer's seat (the work is judged by this)
1. Settings → Voice has a section "Your own voice service" with: Address (for example
   `https://api.openai.com/v1` or `http://localhost:8880/v1`), Key (optional), Model (for example `tts-1`),
   Voices (names separated by commas, for example `alloy, nova`), and a button "Test": it asks the service
   to say one short sentence in the first voice, plays it, and says either "This voice service answers."
   or the reason it did not, in plain words.
2. When the service is set up (address, model and at least one voice), its voices appear wherever voices
   are chosen, for every language (the service decides what it can speak), marked with the service's host,
   for example "nova · api.openai.com · online".
3. Truth, wherever such a voice is the chosen one, exactly (with the real host): "Made online by
   api.openai.com: the text goes straight from this device to that address. The audio is kept on this
   device and plays offline."
4. Failure is said plainly and never marks a sentence as failed for a network reason (same rule as M10):
   offline → "This voice is made online. Waiting for a connection."; 429/5xx → retry with the quota line
   using the host's name; 401/403 → "{host} did not accept the key. Check it in Settings."; a browser
   block (fetch TypeError while online) → "Couldn't reach {host} from the browser. Check the address; some
   services do not accept requests from a web page."

## Design decisions (do not change them)
- Voice ids: `oa:<voice name>`. Everything after the samples arrive is M10's path (`synthesize` → worker
  `encode`). Generalise src/lib/cloudvoice.js instead of copying it: `isCloudVoice` accepts `nv:` and `oa:`;
  `cloudSynthesize` picks the provider from the prefix; shared retry/offline logic is written once.
- `parseWav` must also accept stereo (average the channels) and 8-, 24- and 32-bit PCM and 32-bit float
  (format tags 1 and 3); anything else throws `Error('This audio format is not supported: …')`. Tested.
- Settings (src/lib/settings.js DEFAULTS): `voiceBase: ''`, `voiceKey: ''`, `voiceModel: ''`,
  `voiceNames: ''`. Reuse `cleanBase` and `hostOf` from src/lib/ai.js.
- A custom voice has no language of its own: `voicesFor(lang)` appends the custom voices for EVERY lang
  (after on-device and NVIDIA ones); `cloudVoiceInfo('oa:nova')` → `{ name: 'nova', lang: null }`; in
  `prepare` a document keeps an `oa:` voice whatever its language. `defaultVoiceFor(lang)` never picks an
  `oa:` voice unless nothing else exists for that language.
- No spacing between requests is imposed for a custom service (its limits are unknown); one at a time.

## Touch only
src/lib/cloudvoice.js, src/lib/cloudvoice.test.js, src/lib/voices.js, src/lib/settings.js,
src/lib/library.js (only where a voice's language is decided), src/ui/VoiceCard.jsx, src/ui/Sheets.jsx (only
the truth-line hint), src/ui/Credits.jsx is NOT touched. Do not touch e2e/qa.mjs; do not run it.

## Project rules (must follow)
- No new dependencies. Pure helpers get node tests. React components at top level only; inline styles with
  src/theme.js tokens. No `try/catch` that hides an error. Status text must be true.
- `npm test` and `npx vite build` with no errors or warnings (do NOT raise any warning limit).

## Done when
Report: files changed; the exact request sent for one sentence; the `parseWav` cases tested; how the Test
button plays the reply; the build and test output lines. Say plainly what you could not run. Do not commit,
push or deploy.
