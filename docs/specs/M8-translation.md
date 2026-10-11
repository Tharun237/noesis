# M8: listen to a document in another language (translation)

## The customer's seat (this is the test the work is judged by)
Tharun opened "Add a document" and the voice list with an English book and saw nothing about languages.
After this task a customer must be able to:
1. In **Add a document**, choose the language to listen in (Original, English, Telugu, Hindi) next to
   "Listen to" and "Voice".
2. In the **reader**, open the document menu, choose "Listen in another language", pick a language, and land
   in the translated version at the same place in the book. Doing it again later (either direction) returns
   to the matching place: nothing is translated twice.
3. Always see the truth while it works: how much is translated, and why it cannot start when there is no key.

Translation uses the customer's own Gemini key (Settings), exactly like summaries. No key: the choices are
shown but disabled, with the line "Translation needs a free Gemini key. Add one in Settings."

## Design decisions (do not change them)
- A translated version is an ordinary library document with one extra field: `target` (a key of `LANGS` in
  src/lib/lang.js). `prepare` in src/lib/library.js translates the parsed blocks when `d.target` is set and
  differs from the detected language, then continues exactly as today. Because M7 already detects the
  language of the final text and picks a voice of that language, everything after translation (voices,
  audio, reader, player) needs no change.
- A version made from the reader is a new document that points at the original instead of copying its file:
  its stored source is `{ kind: 'ref', from: <original id> }`, resolved in `prepare` to the original's
  source. It also carries `from: <original id>` in its metadata (add `target` and `from` to `META_FIELDS`).
- One output block per input block, same order, same kind (`k`) and same `page`. That is what lets the
  place be carried between versions by block number.

## 1. `src/lib/translate.js` (+ `src/lib/translate.test.js` for the pure parts)
- `chunkBlocks(blocks, maxChars = 6000)` → arrays of block indexes; a chunk never splits a block; blocks of
  kind 'code', 'math', 'table', 'fig' are never sent (they are kept unchanged). Pure, tested.
- `buildPrompt(texts, languageName)` → the instruction + a JSON array of the texts. The instruction must say:
  translate each item into natural, fluent {language} for listening aloud; return ONLY a JSON array of
  strings with exactly the same number of items in the same order; write people's names, place names and
  technical terms in {language} script the way a {language} speaker would say them (the voice cannot
  pronounce Latin letters well); keep numbers as digits; do not add, remove, merge or explain anything.
  Pure, tested (item count and language name appear).
- `parseReply(text, expected)` → array of strings; accepts a reply wrapped in a ```json fence; throws
  `Error('The translation came back with N items instead of M.')` on a count mismatch or invalid JSON.
  Pure, tested.
- `translateBlocks(blocks, target, { key, model, onProgress, signal, onRetry, saved, onChunk })` → new blocks.
  Read src/lib/gemini.js first and call the model the SAME way `summarize` does (same request helper, same
  retry and rate-limit handling, same `onRetry`). One request per chunk, in order. A chunk whose reply fails
  `parseReply` is retried once as two halves; a second failure throws. `onProgress(done / total)` by
  characters translated. `saved` (Map chunkIndex → strings) lets a restarted run skip finished chunks;
  `onChunk(index, strings)` is called after each chunk so the caller can store it.

## 2. `src/lib/library.js`
- `prepare`: after the blocks are final (after the summary step when the mode is a summary) and BEFORE
  `detectLang`: when `d.target` is set and `detectLang(...) !== d.target`: require a key (`hasKey()`, else
  throw `Error('Translation needs a free Gemini key. Add one in Settings.')`), set
  `patch(id, { status: 'narrating', stage: 'Translating into Telugu', prep: 0 })` (language name from
  `LANGS`), translate with real progress in `prep`, storing finished chunks under a db key for this document
  (add `getTranslation(id)` / `putTranslation(id, map)` / `delTranslation(id)` to src/lib/db.js next to the
  existing helpers) and deleting them when the document is prepared. A reload mid-translation continues
  from the stored chunks.
- Resolve `{ kind: 'ref', from }` sources at the start of `prepare` (load the original's source; if it is
  gone: throw `Error('The original document was removed from this device.')`).
- `addDocument(src, opts)` accepts `target` (stored only when it is a key of `LANGS`).
- `export async function listenIn(id, target)`: the reader's switch.
  - Let `root = getDoc(id).from || id` (the original). The wanted version is: the original itself when
    `target` equals the original's `lang`; otherwise the document with `from === root && target === target`
    if it exists; otherwise a new one created with `addDocument({ kind: 'ref', from: root }, { target, title:
    original title, renamed: true, mode: 'full' })` plus `from: root`.
  - Carry the place: find the block number being read in the current document (`loadDoc(id)`: sentence
    `pos` → `segs[pos].b`) and store it on the wanted document as `startBlock`. When a document with
    `startBlock` is (or becomes) prepared, set its `pos` to the first sentence of that block
    (`starts[Math.min(startBlock, starts.length - 1)]`) and clear `startBlock`. For an already prepared
    document do this immediately.
  - Returns the wanted document's id. Does not navigate.
- Deleting an original does not delete its translated versions.

## 3. UI (logic and plain controls only; Opus designs the look afterwards)
- src/ui/Sheets.jsx `AddForm`: a `Field` titled "Language" under "Listen to", a `Segmented` (size "sm") with
  Original, English, Telugu, Hindi; without a key every option except Original is disabled and the hint is
  the line quoted above. Pass `target` to `addDocument` (nothing for Original).
- A new sheet named 'language' (same mechanism as the 'lockscreen' sheet): heading "Listen in another
  language"; one row per language in `LANGS` (the current one marked); a faint line: "Uses your Gemini key.
  A long book takes several minutes the first time."; without a key the rows are disabled and the hint is
  shown. Choosing a row calls `listenIn(id, lang)` and opens the returned document in the reader (read how
  a document is opened from the library: `openReader` or its equivalent in src/lib/nav.js).
- src/ui/Reader.jsx: one item in the existing document menu (the ⋯ menu): label "Listen in another
  language", opening that sheet for the current document. Nothing else in Reader.jsx.

## Project rules (must follow)
- No new dependencies. Pure helpers get node tests. React components at top level only; inline styles with
  src/theme.js tokens. No `try/catch` that hides an error. Status text must be true: never show progress
  that is not measured.
- Touch only: NEW src/lib/translate.js, src/lib/translate.test.js; src/lib/library.js, src/lib/db.js,
  src/ui/Sheets.jsx, src/ui/Reader.jsx (the one menu item), src/lib/nav.js only if the sheet mechanism needs
  the new name registered. Do not touch e2e/qa.mjs; do not run it.
- `npm test` and `npx vite build` with no errors or warnings (do NOT raise any warning limit).

## Done when
Report: files changed; the exact request you send to Gemini for one chunk (the JSON body); how a restarted
translation continues; the test cases added; the build and test output lines. Say plainly what you could
not run (you have no Gemini key). Do not commit, push or deploy.
