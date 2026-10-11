# NVIDIA API: measured with a real key (2026-10-11)

The key itself is NOT in this repository. For testing it sits in the session scratchpad only.

- `GET https://integrate.api.nvidia.com/v1/models` with `Authorization: Bearer <key>` → 200, 80 models.
- Browser preflight (`OPTIONS /v1/chat/completions` with an Origin) → 200 but NO `access-control-allow-origin`
  header. A browser cannot call the API directly; the relay in M9 is required. Confirmed with the real key.
- **The model list is not a list of models that work.** Three tried with the same translation request:
  - `google/gemma-3-12b-it` → 404 `Function '…': Not found for account '…'` (listed, not callable on this account).
  - `meta/llama-3.3-70b-instruct` → 410 `has reached its end of life on 2026-08-26` (not in the list; do not
    hard-code model ids, they retire).
  - `nvidia/nemotron-3-super-120b-a12b` → 200 in 16 s for two sentences.
  So the app must show a 404 / 410 from NVIDIA as "This model is not available for your NVIDIA account.
  Choose another." and never pick a model for the customer.
- **Translation quality, first real sample** (English → Telugu, prompt as in src/lib/translate.js):
  1. "1945లో, రొబర్ట్ ఆప్‌పెన్హైమర్ న్యూ మెక్సికో మరుభూమిలో మొదటి న్యూక్లియర్ పరీక్షను చూశాడు." (clean)
  2. "విస్ఫోటం تقریباً 21,000 టన్ টিএনటీ‑కు సమాన శక్తి విడిచింది." (an Urdu word in Arabic script and Bengali
     letters inside "TNT": the Telugu voice cannot say those)
  So a reply must be checked before it is spoken: letters outside the target script (Latin allowed) mean
  the chunk is asked again. To build: a pure `foreignLetters(text, lang)` check in translate.js.
- Speed: 16 s for two sentences on that model. A whole book needs a faster model; measure before promising.
- Not measured: the 40-requests-a-minute limit, streaming, the TTS endpoints (magpie-tts-zeroshot).

## Chat models on a free account, probed 2026-10-11 (same two-sentence Telugu translation)
45 chat-looking models of the 80 listed were asked. 10 answered, 32 were refused (404, one 500, one 503),
3 timed out at 45 s.
- Fast and clean Telugu: `google/diffusiongemma-26b-a4b-it` (0.8 s), `nvidia/ising-calibration-1.5-31b` (1.5 s,
  wraps its answer in a json code fence; it is a specialised model and answers small talk with a canned line).
- Reasoning models (5 to 23 s; the reply was empty when given only 400 tokens because the thinking used them):
  nemotron-3-super-120b, nemotron-3.5-lightning-30b, nemotron-3-nano-omni-30b, kimi-k3, nemotron-3-ultra-550b
  (2 wrong-alphabet letters), gpt-oss-20b, glm-5.3-flash, muse-glimmer-30b.
- `google/diffusiongemma-26b-a4b-it` returns an EMPTY reply to "Reply with the single word: ready" but answers
  ordinary questions and translates well: a model check must ask something ordinary.
- Through the app, with the real key, UI only (Settings → AI → NVIDIA → Add a document → Telugu): a 7-sentence
  text came back in about 1 s, 0 wrong-alphabet letters.
- Relay checks (wrangler pages dev): with key 200; no key 401; other path 404; foreign Origin 403; streaming
  passes through as `data: {…}` lines ending `data: [DONE]`.

## Voices (measured by Opus with the real key, 2026-10-11, after Haiku found the route)
- Hosted Magpie multilingual TTS answers over plain HTTPS (no gRPC):
  `https://877104f7-e885-42b9-8de8-f6e4c6303969.invocation.api.nvcf.nvidia.com/v1/audio/`
  - `GET list_voices` → 200. Reply shape: one object whose single key is the comma-joined language list
    ("en-US,es-US,fr-FR,de-DE,zh-CN,vi-VN,it-IT,hi-IN,ja-JP,ko-KR,ar-AR,pt-BR") holding `{ voices: [names] }`,
    86 names such as `Magpie-Multilingual.EN-US.Mia`, `…EN-US.Mia.Calm` (emotion variants have a 4th part),
    `Magpie-Multilingual.HI-IN.Sofia`.
  - `POST synthesize`, multipart fields `text`, `language=hi-IN`, `voice=Magpie-Multilingual.HI-IN.Sofia`,
    `encoding=LINEAR_PCM`, `sample_rate_hz=22050` → 200 `audio/wav`, RIFF WAVE 16-bit mono 22050 Hz,
    8.68 s of speech for two Hindi sentences, returned in 1.29 s.
  - Browser preflight (OPTIONS with an Origin) → 401 and no allow-origin header: a relay is needed.
- No Telugu: `language=te-IN` → 400 "Voice … for language te-IN not found" (Haiku's call).
- Hindi voices (Haiku's reading of the list): Leo, Pascal, Siwei, Sofia.
- Haiku's reading of NVIDIA's pages, NOT verified by Opus: the model page says "ready for commercial use"
  under the NVIDIA Open Model License; the shared limit is "up to 40 rpm, 10,000 requests per day";
  `magpie-tts-zeroshot` is restricted ("Apply for access"); `chatterbox-multilingual-tts` is gRPC only.
- Not checked: whether the Hindi audio says the right words (no multilingual transcriber in tools/listen
  yet), and how it sounds.
