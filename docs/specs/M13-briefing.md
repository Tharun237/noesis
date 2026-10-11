# M13: one audio briefing from several documents

## The customer's seat (the work is judged by this)
1. On the Library screen, next to "Ask your library", an action "Make a briefing". It opens a sheet that
   lists the customer's documents with a tick box each (only documents whose text is ready).
2. The customer ticks 2 to 5 documents and presses "Make the briefing". Fewer than 2 or more than 5: the
   button is disabled and one line says why ("Choose 2 to 5 documents.").
3. The sheet shows true progress: "Reading 2 of 4: <title>" while each document is condensed, then
   "Writing the briefing". It can be stopped.
4. The result is a NEW ordinary document in the library, titled "Briefing: <first title> + N more", which
   opens in the reader and is listened to like any other (voice, speed, Ask, translation all work).
5. The briefing has these headed parts, in this order: "What each one says" (a short paragraph per
   document, naming it), "Where they agree", "Where they disagree", "Shared methods and ideas",
   "What to read first and why". A part with nothing to say is left out, not padded.
6. No AI key: the action is still shown; the sheet says "A briefing needs an AI key. Add one in Settings."
   with a button to Settings.

## Design decisions (do not change them)
- Two steps, so it works with small-context models: (a) condense each chosen document on its own into
  notes; (b) write the briefing from the notes only. Reuse `splitText` and `contextChars` from
  src/lib/ai.js; a document longer than the context is condensed part by part first, exactly as `summarize`
  in src/lib/gemini.js does (read it and follow the same approach; do not edit that file).
- The briefing is added with the existing `addDocument({ kind: 'text', text, name }, { title, renamed: true,
  mode: 'full' })` (read how a pasted text is added in src/ui/Sheets.jsx `AddForm` and use the same source
  shape). Headings must come out as headings in the reader: write the text in the form the text ingester
  turns into heading blocks (read src/ingest/ to see how a pasted Markdown heading `## Title` is handled,
  and produce that).
- The model is asked for plain flowing prose for listening: no tables, no bullet lists, no bold.

## 1. `src/lib/briefing.js` (+ `src/lib/briefing.test.js` for the pure parts)
- `briefingTitle(titles)` → "Briefing: A + 2 more" (pure, tested: 2, 3 and 5 titles; long first title cut at
  60 characters with an ellipsis).
- `notesPrompt(title, text, words)` and `briefingPrompt(items)` (items = `[{ title, notes }]`) → strings
  (pure, tested: every title appears; the five part names appear in order; the instruction to leave out an
  empty part appears).
- `makeBriefing(ids, { onStage, signal })` → the new document's id. Stages reported through `onStage`:
  `{ step: 'reading', n, total, title }` and `{ step: 'writing' }`. Uses `aiText` (src/lib/ai.js) with
  `onRetry` surfaced as `{ step: 'waiting', seconds }`. Reads each document's text with `db.getDoc(id)`
  (blocks → headings and paragraphs joined). Throws a plain Error when a chosen document has no text.

## 2. UI (plain controls; Opus designs the look afterwards)
- NEW `src/ui/Briefing.jsx`: the sheet named 'briefing' (register it in src/ui/Sheets.jsx exactly as
  'libraryask' is registered). List with tick boxes (native `input type="checkbox"` with a visible label),
  the count line, "Make the briefing", "Stop", the stage line, the no-key state. On success: close the sheet
  and open the new document in the reader (`go('reader', id)`).
- src/ui/Library.jsx: ONE more entry point beside "Ask your library": "Make a briefing" (icon 'list'),
  shown only when the library has at least 2 documents. Change nothing else.

## Project rules (must follow)
- No new dependencies. Pure helpers get node tests. React components at top level only; inline styles with
  src/theme.js tokens. No `try/catch` that hides an error. Status text must be true.
- Touch only: NEW src/lib/briefing.js, src/lib/briefing.test.js, src/ui/Briefing.jsx; src/ui/Sheets.jsx (one
  registration line + import), src/ui/Library.jsx (the one entry point). Other files in this working tree
  are being edited by someone else at the same time: never rewrite, reformat or revert a file outside your
  list. Do not touch or run e2e/qa.mjs.
- `npm test` and `npx vite build` with no errors or warnings (do NOT raise any warning limit).

## Done when
Report: files changed; the two prompts in full; how a document longer than the context is handled; the test
cases added; the build and test output lines. Say plainly what you could not run. Do not commit, push or
deploy.
