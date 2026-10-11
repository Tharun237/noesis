# M7: a document is read in a voice of its own language (Telugu first)

Read docs/research/languages.md first: it holds the measurements this spec rests on.
Translation is NOT part of this task. This task makes a Telugu (or any non-English) document sound right.

## 1. Which language is a document in? `src/lib/lang.js` (pure) + `src/lib/lang.test.js`
- `LANGS = { en: { name: 'English', locale: 'en' }, hi: { name: 'Hindi', locale: 'hi' }, te: { name: 'Telugu', locale: 'te' } }`.
- `detectLang(text)` returns a key of LANGS. Count letters (`\p{L}`) by script in the first 4000 characters:
  Devanagari (`\p{Script=Devanagari}`) is 'hi', Telugu (`\p{Script=Telugu}`) is 'te'. The language is the
  script holding MORE THAN HALF of the letters; otherwise 'en'. (An English paper quoting one Telugu line
  stays English.) Empty text is 'en'.
- Tests: plain English; plain Hindi; plain Telugu; English with one Hindi sentence is 'en'; Telugu with
  English names and numbers is 'te'; empty is 'en'.
- A document gets `lang` when it is prepared (in `prepare` in src/lib/library.js, from the text of its
  blocks, saved with `patch`). A document without `lang` (added before this change) is English: do NOT
  re-prepare or scan old documents.

## 2. Voices know their language: `src/lib/voices.js`
- Every entry gains `lang` ('en' for all current ones). Add, after the English voices:
  `{ id: 'te_IN-padmavathi-medium', name: 'Padmavathi', accent: 'Telugu', g: 'F', license: 'CC BY 4.0', lang: 'te' }`,
  `{ id: 'te_IN-venkatesh-medium', name: 'Venkatesh', accent: 'Telugu', g: 'M', license: 'CC BY 4.0', lang: 'te' }`.
  (Check that `voiceUrl` builds `te/te_IN/padmavathi/medium/te_IN-padmavathi-medium.onnx` for them.)
  Add NO Hindi voice: none has a verified licence yet.
- Export `voicesFor(lang)` and `defaultVoiceFor(lang)` (first voice of that language, or null).
  `DEFAULT_VOICE` stays the first English voice. `VOICES.length` is shown on the first-run screen as the
  number of natural voices: it will read 12, which is correct.
- A document's voice: when a document is prepared and its `lang` is not the language of its current voice,
  set its voice to `defaultVoiceFor(lang)` (null when there is none). `settings.voice` stays an English voice
  and is never changed by this.
- No voice for the language (Hindi today): the document is never generated with a wrong-language voice. Its
  `note` says exactly: "No natural voice for Hindi yet. Choose the built-in voice in Settings to listen."
  (language name from LANGS), and generation skips it (`voiceOne` and the generation loop must return early
  for a document whose voice is null, without an error and without spinning). The built-in (system) voice
  path: pass the document's locale so the device picks a voice of that language when it has one (see
  `pickSystemVoice` in src/lib/engine.js and where the utterance is created in src/lib/player.js; set
  `utterance.lang` to the locale when no matching voice object is found).

## 3. Sounds for other languages: `src/lib/tts.worker.js` + a pure helper
- New dependency (the ONLY one allowed): `@echogarden/espeak-ng-emscripten@0.3.5`. Add to package.json
  `postinstall`: copy `espeak-ng.js` and `espeak-ng.data` from the package to `public/espeak/` (same pattern
  as `public/ort`). In vite.config.js add `'espeak/**'` to workbox `globIgnores` and a runtime cache rule for
  `/espeak/` exactly like the one for `/ort/`.
- In the worker: when `cfg.espeak.voice` starts with `en`, keep today's `phonemizer` path unchanged.
  Otherwise load the eSpeak module lazily, once, from the absolute URL of `/espeak/espeak-ng.js` (as for ORT:
  read how `ort.env.wasm.wasmPaths` is set and why), create it with `locateFile` returning the absolute
  `/espeak/` URL for the data file, make ONE `eSpeakNGWorker`, call `set_voice(cfg.espeak.voice, '', 0, 0, 0)`
  when the language changes (a non-zero result is an error: throw with the language in the message), then
  `synthesize_ipa(part).ipa`.
  THIS HAS NOT BEEN RUN IN A BROWSER WORKER. Making it load in the built app (`npx vite build`, then
  `npx vite preview`) is part of the task; if the module's glue needs a different way to load, find it and
  say what you did. Add no new status text.
- Pure helper in NEW `src/lib/ipa.js` + `src/lib/ipa.test.js`: `ipaChars(ipa)` returns a string: remove every
  `_`, remove every `.`, turn newlines into single spaces, collapse spaces, trim. Tests: the sample outputs in
  docs/research/languages.md, including `b_ˈʌ_r_._h_i` becoming `bˈʌrhi`.
- `PUNCT` in the worker gains the danda `।` and double danda `॥`; when pushed they use the id of `.`
  (the voice maps have no danda).

## 4. Sentences in other scripts: `src/lib/text.js`
- `sentences(text, lang = 'en')` uses an `Intl.Segmenter` for the language's locale (cache one per locale).
  The "unterminated fragment" rule must treat `।` and `॥` as sentence ends. `toListening`,
  `toListeningAsync` and `listenBlock` take the language and pass it down; `prepare` passes the detected one.
- Read `cleanText` and `listenBlock`: any rule that only makes sense for English (abbreviation expansion,
  spelling out symbols in English words) must be skipped when the language is not 'en'. List in your report
  which rules you skipped and which you kept.

## 5. Picking a voice (logic only; Opus designs the look)
- The per-document voice picker (src/ui/Sheets.jsx: `VoicePicker` and the select near line 184) lists only
  `voicesFor(document.lang || 'en')`. Settings, Voice (src/ui/VoiceCard.jsx) keeps listing English voices
  only (`voicesFor('en')`): it is the default for English documents. Change no styling.

## Project rules (must follow)
- Pure helpers get node tests. React components at top level only; inline styles with src/theme.js tokens.
- No `try/catch` that hides an error. No other new dependency. Plain, true status text only.
- Touch only: NEW src/lib/lang.js, lang.test.js, ipa.js, ipa.test.js; src/lib/voices.js, src/lib/library.js,
  src/lib/text.js, src/lib/tts.worker.js, src/lib/engine.js, src/lib/player.js (system-voice language only),
  src/ui/Sheets.jsx, src/ui/VoiceCard.jsx, package.json, vite.config.js. Do not touch e2e/qa.mjs; do not run it.
- Run `npm install` (so postinstall copies the files), `npm test`, and `npx vite build` with no errors or
  warnings (do NOT raise any warning limit).

## Done when
Report: files changed; how the eSpeak module is loaded in the worker and what you saw when you ran it in the
built app (or exactly why you could not); the English-only text rules you skipped; the test cases added; the
build and test output lines. Do not commit, push or deploy.
