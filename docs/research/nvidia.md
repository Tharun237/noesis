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
