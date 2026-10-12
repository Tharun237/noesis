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

## The Hindi voice's licence, read on 2026-10-12

`hi_IN-rohan-medium` (Piper) is trained on IIT Madras's IndicTTS "Hindi Mono Male". Its model card names the
licence at https://www.iitm.ac.in/donlab/indictts/downloads/license.pdf. The university's server did not
answer; the text below is from the Internet Archive's copy of that address made on 2025-03-16 (three pages,
"END USER LICENSE AGREEMENT"). Read by Opus, not by a lawyer.

What it says, in its own words:
- 2.1: "a perpetual, nonexclusive, worldwide, transferable, sub licensable, royaltyfree license to a) make
  copies of the Licensed Software in source and object code and data; b) modify copies of the Licensed
  Software and data to create derivative works thereof." And: "Licensee shall be allowed to freely distribute
  the Derivative Work."
- 2.2: "The Licensee agrees not to remove any copyright, trademark or patent notices". "The Licensee shall
  ensure that the third party to whom the Derivative Work is sold is made aware that the Derivative Work has
  few open source component along with Licensee's IP. Such third party shall not be allowed to further sell,
  lease, license, sublicense, decompile, disassemble or reverse engineer any portion of the Licensed Software
  or the Derivative Work."
- 5: "REDISTRIBUTORS MUST RETAIN THE FOLLOWING COPYRIGHT NOTICE: COPYRIGHT 2016 TTS Consortium, TDIL, Meity
  represented by Hema A Murthy & S Umesh, DEPARTMENT OF Computer Science and Engineering and Electrical
  Engineering, IIT Madras. ALL RIGHTS RESERVED"
- Nothing in it forbids commercial use, and nothing asks for a fee or a registration.

What Noesis does because of it: the voice is offered (Rohan, Hindi, on the device); the copyright notice is
shown with it in Credits; Credits says the voice is built on openly shared recordings and may not be resold
or sublicensed on its own. Open point for a lawyer, if Noesis is ever sold as a product: clause 2.2's wording
about what a buyer may do with "the Derivative Work".
The two other Piper Hindi voices (pratham, priyamvada) name CC BY-NC-SA 4.0: not for a paid product, not offered.
