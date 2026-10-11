# M12: ask my entire library

## The customer's seat (the work is judged by this)
1. On the Library screen there is an action "Ask your library". It opens a panel with a question box.
2. The customer asks, for example, "What do my books say about how the first atomic bomb was tested?".
   The panel shows, truthfully, what is happening: "Reading your library: 4 of 12", then "Asking Gemini"
   (the provider's real name), then the answer as it streams.
3. Under the answer: the passages it was built from, as a list. Each shows the document's title and a short
   quote. Tapping one opens that document in the reader AT that passage (playback not started).
4. The answer marks which passage supports which statement with bracket numbers like [1], [2] that match the
   list.
5. No AI key: the panel says "Asking your library needs an AI key. Add one in Settings." with a button to
   Settings, and the search half still works: typing a question lists the best-matching passages without an
   answer (label: "Passages that match").
6. Nothing found: "Nothing in your library matches that." No answer is invented.

## Design decisions (do not change them)
- No embeddings, no server, no new dependency. Retrieval is a classic keyword ranking (BM25) over the text
  the app already stores for every document, computed on the device. It works offline and in any language.
- The AI only sees the top passages, never the whole library, so it works with small-context models too
  (budget from `contextChars()` in src/lib/ai.js; use at most half of it for passages).

## 1. `src/lib/search.js` (pure) + `src/lib/search.test.js`
- `tokens(text)` → lower-cased word list: `\p{L}[\p{L}\p{M}\p{N}]*` and numbers, after `normalize('NFKC')`;
  drop one-letter Latin words and a short English stop list (the, a, an, of, to, in, is, and, or, for, on,
  with, that, this, it, as, at, by, be, are, was, were, what, how, do, does, my, about).
- `buildIndex(docs)` where `docs = [{ id, title, blocks: [{ k, s: [sentences], p }] }]` → an index of
  **passages**: one passage per block of kind 'p' or 'h' with at least 40 characters, text = the block's
  sentences joined; keep `{ doc, title, block, text }`; plus the document frequencies and average length
  BM25 needs.
- `search(index, query, k = 12)` → the top k passages with `score`, best first, BM25 with k1 = 1.4, b = 0.75;
  a passage with no query term is never returned; at most 4 passages per document so one long book cannot
  crowd out the rest.
- Tests: a tiny 3-document library where the right passage ranks first; a query with no match returns [];
  the 4-per-document cap; Telugu or Hindi text is tokenised into words (marks kept inside words).

## 2. `src/lib/libraryask.js`
- `loadLibraryIndex({ onProgress })`: for every document in `library.get().docs` with status 'voicing' or
  'ready', read its stored text (`db.getDoc(id)`), yield to the UI between documents (`pause()` from
  src/lib/text.js), report `onProgress(done, total)`, and build the index. Cache the built index in memory
  and rebuild only when the set of document ids or their `contentVer` values changed.
- `askLibrary(question, { onStage, onPassages, onText, signal })`:
  1. `onStage('reading')` + load the index; 2. `search`; if nothing: `onPassages([])` and return;
  3. `onPassages(passages)` (each with `doc`, `title`, `block`, `text` trimmed to 300 characters for display);
  4. no AI key (`hasAiKey()` false): return; 5. `onStage('asking')`, then `aiStream` (src/lib/ai.js) with a
  system instruction: answer ONLY from the numbered passages; after each statement give the number(s) of the
  passage(s) it comes from in square brackets; if the passages do not answer the question, say so plainly;
  plain flowing sentences; answer in the language of the question. The user message holds the question and
  the passages as `[n] (Title) text`.
- Opening a passage: export `openPassage(p)` that sets the document's position to the first sentence of that
  block (see `loadDoc` in src/lib/library.js: `starts[block]`; use `patch(id, { pos })`) and navigates to the
  reader (`go('reader', id)` from src/lib/nav.js). It must not start playback.

## 3. UI (plain controls; Opus designs the look afterwards)
- NEW `src/ui/LibraryAsk.jsx`: the panel as a sheet named 'libraryask' (same mechanism as the 'language'
  sheet in src/ui/Sheets.jsx: register it there with one line). Question input + "Ask" button (Enter
  submits), the stage line, the streamed answer, the passage list (title in T.text, quote in T.sub), the
  no-key and nothing-found states from the customer's seat. A "Stop" button while streaming (AbortController).
- src/ui/Library.jsx: ONE entry point: a button labelled "Ask your library" (icon 'sparkle') beside the
  existing "Add document" control on wide screens and as an `IconButton` with that label in the phone header.
  Show it only when the library has at least one document. Change nothing else in Library.jsx.

## Project rules (must follow)
- No new dependencies. Pure helpers get node tests. React components at top level only; inline styles with
  src/theme.js tokens. No `try/catch` that hides an error. Status text must be true.
- Touch only: NEW src/lib/search.js, src/lib/search.test.js, src/lib/libraryask.js, src/ui/LibraryAsk.jsx;
  src/ui/Sheets.jsx (one registration line + import), src/ui/Library.jsx (the one entry point). Do not touch
  src/ui/Reader.jsx, src/ui/Ask.jsx, src/lib/gemini.js, src/lib/ai.js, e2e/qa.mjs. Do not run e2e/qa.mjs.
- `npm test` and `npx vite build` with no errors or warnings (do NOT raise any warning limit).

## Done when
Report: files changed; the exact system instruction and one example user message sent to the model; how the
index cache is invalidated; the test cases added; the build and test output lines. Say plainly what you
could not run. Do not commit, push or deploy.
