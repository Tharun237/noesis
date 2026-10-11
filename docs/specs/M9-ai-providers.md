# M9: the customer chooses the AI provider (Gemini or NVIDIA)

## Why (Tharun, 2026-10-11): "Restriction of customer's choice is not acceptable."
Today every AI feature works only with a Gemini key. A customer with an NVIDIA key (free from
build.nvidia.com with their own account) cannot use it anywhere. After this task they can.

## The customer's seat (the work is judged by this)
1. Settings has one card "AI" with: a provider choice (Gemini, NVIDIA), the key for the chosen provider, and
   the model to use. Each provider keeps its own key; switching provider does not erase the other key.
2. With an NVIDIA key and NVIDIA chosen: translation ("Listen in another language", and Language in Add a
   document), summaries (Long / Short), and Ask all work, with the same progress and error text as today.
3. Every line in the app that says "Gemini key" where either provider would do must say "AI key" instead
   ("Translation needs a free AI key. Add one in Settings."). Lines about something only Gemini can do keep
   saying Gemini (see 4).
4. Reading scanned pages as images ("AI narration") stays Gemini-only in this task. With NVIDIA chosen, the
   AI narration toggle is hidden and nothing claims it is available.
5. Truth about privacy, shown under the NVIDIA key field, exactly: "NVIDIA does not accept requests straight
   from a browser, so your key and the text travel through Noesis's relay to reach NVIDIA. Nothing is stored."

## Facts already measured (do not re-argue)
- NVIDIA's API is OpenAI-compatible at `https://integrate.api.nvidia.com/v1` (`/chat/completions`, `/models`,
  `Authorization: Bearer <key>`). A browser preflight to it returned no CORS allow-origin header, so the
  browser cannot call it directly. Hence the relay.
- Free NVIDIA accounts are limited to roughly 40 requests a minute: retry on 429 exactly as the Gemini code
  does, with the same "quota is limiting requests" stage text, saying NVIDIA instead of Google.

## 1. Relay: NEW `functions/api/nvidia/[[path]].js` (Cloudflare Pages Function)
- Forwards `POST /api/nvidia/chat/completions` and `GET /api/nvidia/models` to
  `https://integrate.api.nvidia.com/v1/<same path>` with the caller's `Authorization` header and body; any
  other path or method: 404. Streams the response body through unchanged (`new Response(upstream.body, …)`)
  with the upstream status and content-type.
- Refuses a request with no `Authorization: Bearer …` header (401) and a body over 1 MB (413).
- Only for this site: when an `Origin` header is present and its host is not the request's own host: 403.
- Logs nothing, stores nothing, sets `cache-control: no-store`.
- Read an existing function under `functions/` first and follow its style.

## 2. One door for AI text: NEW `src/lib/ai.js` (+ `src/lib/ai.test.js` for the pure parts)
- Settings (src/lib/settings.js DEFAULTS): `aiProvider: 'gemini'`, `nvidiaKey: ''`, `nvidiaModel: ''`
  (existing `geminiKey` / `geminiModel` stay as they are).
- `hasAiKey()`: a usable key for the CHOSEN provider (Gemini: today's rule; NVIDIA: key starts with `nvapi-`
  and is longer than 20 characters, and a model is chosen). `hasKey()` in settings.js keeps meaning "Gemini
  key" and is used only for Gemini-only features.
- `aiText({ prompt, system, json, signal, onRetry })` → string. Gemini: the existing request helper in
  src/lib/gemini.js (read it; reuse its retry). NVIDIA: `POST /api/nvidia/chat/completions` with
  `{ model, messages, temperature: 0.2, stream: false }`; when `json` is true add the instruction "Reply with
  JSON only." to the system message (do not rely on a response-format parameter: not every model has it).
  Same retry policy as Gemini (429 and 5xx, backoff, `onRetry(seconds | null)`).
- `aiStream({ system, messages, onText, signal, onRetry })` for Ask: Gemini as today; NVIDIA with
  `stream: true`, parsing the OpenAI server-sent events (`data: {…}` lines, `choices[0].delta.content`,
  ends at `data: [DONE]`). The SSE line parser is a pure function with tests (split chunks, a chunk ending
  mid-line, the [DONE] line, a line that is not JSON is skipped).
- `listAiModels()` → `[{ id, name }]` for the chosen provider (Gemini: existing `listModels`; NVIDIA:
  `GET /api/nvidia/models`, `data[].id`). No default NVIDIA model is invented: the customer picks one from
  the list their key returns.
- `providerName()` → 'Gemini' | 'NVIDIA' for status text.

## 3. Use it
- src/lib/translate.js, the summary step and Ask (src/lib/gemini.js `summarize`, `askStream`, and their
  callers in src/lib/library.js and src/ui/Ask.jsx) go through `aiText` / `aiStream`, so they work with
  either provider. Keep each function's prompts and outputs unchanged. `narratePdf` is untouched (Gemini).
- Replace `hasKey()` with `hasAiKey()` where the feature works with either provider (translation,
  summaries, Ask and their disabled states and hints); keep `hasKey()` for AI narration.
- Quota retry text: `${providerName()}'s free quota is limiting requests. Retrying in about N s.`

## 4. Settings UI (plain controls; Opus designs the look afterwards)
- The existing Gemini card in src/ui/Settings.jsx becomes "AI": a `Segmented` Gemini | NVIDIA, then the key
  field and model select of the chosen provider (the NVIDIA model list loads when a valid-looking key is
  present; while loading show nothing extra; on failure show the error text returned), the privacy line
  for NVIDIA quoted above, and where to get a key: Gemini as today; NVIDIA: "Free from build.nvidia.com
  with your own account."

## Project rules (must follow)
- No new dependencies. Pure helpers get node tests. React components at top level only; inline styles with
  src/theme.js tokens. No `try/catch` that hides an error. Status text must be true.
- Touch only: NEW functions/api/nvidia/[[path]].js, src/lib/ai.js, src/lib/ai.test.js; src/lib/settings.js,
  src/lib/gemini.js, src/lib/translate.js, src/lib/library.js, src/ui/Settings.jsx, src/ui/Sheets.jsx,
  src/ui/Ask.jsx (and the file holding the Gemini settings card if it is separate). Do not touch
  e2e/qa.mjs; do not run it. Existing text that e2e/qa.mjs matches must keep working when the provider is
  Gemini with no key (the default): before changing any visible sentence, grep e2e/qa.mjs for it, and if it
  is matched there, list it in your report instead of changing it.
- `npm test` and `npx vite build` with no errors or warnings (do NOT raise any warning limit).

## Done when
Report: files changed; the exact request the browser sends for one NVIDIA translation chunk and what the
relay forwards; every visible sentence you changed (old → new) and any you left because QA matches it; the
test cases added; the build and test output lines. Say plainly what you could not run (there is no NVIDIA
key here). Do not commit, push or deploy.
