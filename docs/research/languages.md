# Languages: what was measured (2026-10-11)

## The blocker
`phonemizer` 1.2.1 (the library that turns text into sounds for every Piper voice) holds English only.
Measured: `list_voices()` returns 8 English voices; Hindi and Telugu text throws "Invalid language identifier".

## The replacement for other languages (verified by Opus in Node, not yet in a browser)
`@echogarden/espeak-ng-emscripten` 0.3.5: `espeak-ng.js` 841,996 bytes + `espeak-ng.data` 24,014,553 bytes
(no .wasm; it is a wasm2js build). GPL-3.0.
- Hindi and Telugu phonemize; first call 190 ms, later calls 8 to 40 ms per sentence.
- Every phoneme character it produced exists in the `phoneme_id_map` of the real Piper voices
  (`hi_IN-pratham-medium`, `te_IN-maya-medium`, `en_GB-alba-medium`): nothing would be dropped.
- It reads numbers in the language ("2024" in Hindi text comes out as "do hazaar chaubis").
- Its English output equals `phonemizer`'s once the `_` separators are removed.
- Quirk: Hindi "बढ़ी" comes out as `bˈʌr.hi`; the "." must be removed or Piper reads it as a full stop.
- API: `const M = await ESpeakNG(); const w = new M.eSpeakNGWorker(); w.set_voice('hi', '', 0, 0, 0)` (returns 0);
  `w.synthesize_ipa(text).ipa` gives phonemes separated by `_`, one line per sentence, punctuation dropped.
- Sample outputs (after removing `_`):
  - hi "नमस्ते, यह एक परीक्षण है। आप कैसे हैं?" → `nəmˈʌsteː` / `jˌəh ˈeːk pəɾˈiːkʃəɳ hɛː` / `ˌaːp kˈɛːseː hɛ̃`
  - te "నమస్కారం, ఇది ఒక పరీక్ష. మీరు ఎలా ఉన్నారు?" → `nˈamaskˌaːran` / `ˈidi ˌoka pˈariːkʂa` / `mˈiːru ʲˈelaː ˈunnaːru`
  - hi "…जनसंख्या बढ़ी।" ends `ɟˌənəsˈʌŋkʰjaː bˈʌr.hi`
- Scripts: scratchpad `espeak-eval/echogarden-emscripten/verify.mjs` (Opus), `eval.mjs` (Haiku).

Rejected by measurement (Haiku, spot-checked): `espeak-ng` 1.0.2 on npm garbles all non-ASCII input;
`@diffusionstudio/piper-wasm` 1.0.0 produced no output in about 20 attempts.

## Voice licences (from each voice's MODEL_CARD on huggingface.co/rhasspy/piper-voices)
| Voice | Size | Licence | Can a paid product offer it? |
|---|---|---|---|
| te_IN padmavathi | 64 MB | CC BY 4.0 | Yes, with credit |
| te_IN venkatesh | 64 MB | CC BY 4.0 | Yes, with credit |
| te_IN maya | 63 MB | IIT Madras IndicTTS licence | NOT VERIFIED: the licence PDF could not be read (timeout) |
| hi_IN rohan | 63 MB | IIT Madras IndicTTS licence | NOT VERIFIED: same PDF |
| hi_IN pratham | 64 MB | CC BY-NC-SA 4.0 | No: non-commercial |
| hi_IN priyamvada | 64 MB | CC BY-NC-SA 4.0 | No: non-commercial |

So today: Telugu has two usable natural voices. Hindi has none with a verified commercial licence; Hindi
documents use the device's built-in voice until the IndicTTS licence is read
(https://www.iitm.ac.in/donlab/indictts/downloads/license.pdf) or another Hindi voice is found.

## Open questions
- eSpeak-ng is GPL-3.0 (the English build already ships inside `phonemizer`). Whether a closed commercial
  app may ship it is a licence decision for Tharun.
- 24 MB download for non-English documents: load it only when such a document is voiced, cache it like a voice.
- Nothing here has run in a browser Web Worker yet. That is the first thing M7 must prove.
