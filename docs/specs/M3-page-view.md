# M3: original page view for PDFs

## Why
Listeners want to see the real page (figures, equations, layout) while they listen, not only the flowing
text. Paper2Audio has this ("PDF view" with page number, zoom and invert colours); Noesis does not.

## What to build (this task: page-level; sentence boxes on the page come in a later task)
In the reader, for a document whose kind is `pdf` AND whose source file is on this device, the listener can
switch between **Text** and **Pages**.

**Pages view**
- Shows the original PDF pages, one under another, fitted to the reading column width.
- Follows the audio: when the sentence being spoken is on another page than the one on screen, that page
  scrolls into view (same rule as the text view: not within 4 s of the listener scrolling by hand; a far jump
  cuts, a near one glides).
- A small label fixed above the player shows "Page N of M" for the page on screen.
- Tapping a page starts playback at the first sentence on that page.
- "Invert colours" toggle (default ON, because the app is pitch black and a white page glares): applied with
  the CSS filter `invert(1) hue-rotate(180deg)` on the page canvases. Remember the choice in settings.
- The switch, the page label and the invert toggle live in the reader header: a two-option control
  "Text | Pages" (use `Segmented` from src/ui/kit.jsx, size "sm") shown only when pages are available, and an
  "Invert colours" item in the existing document menu (the ⋯ menu) while in Pages view.

## Data: which page is a sentence on?
- `src/ingest/pdf.js` already puts `page` (0-based) on every block it produces.
- `src/lib/text.js` `listenBlock` drops it. Keep it: return `{ k, s, p: b.page }` when `b.page` is a number
  (do not add `p` otherwise). `toListening` and `toListeningAsync` then carry it through unchanged.
- Sentence i belongs to block `segs[i].b` (see `loadDoc` in src/lib/library.js: `segs: [{ t, b, k }]`), so its
  page is `doc.blocks[segs[i].b].p`.
- Documents prepared before this change have no `p`. For them Pages view still works as a viewer, but it
  cannot follow the audio. Say so, truthfully, in one line under the page label:
  "Pages aren't linked to the audio for this document. Add it again to link them."
  Do NOT guess a page from proportions. Do NOT re-prepare the document automatically (that would discard
  hours of generated audio).

## Rendering (performance matters: phones, 700-page books)
- New file `src/ui/PageView.jsx`. Open the PDF once with the helpers in `src/ingest/pdf.js` (read how
  `openPdf` and `renderPage` work there; export what you need from that file rather than duplicating it).
  Get the source with `db.getSource(id)` (src/lib/db.js); it has `.blob` for files. Destroy the PDF when the
  view unmounts (see how pdf.js cleanup is done in src/ingest/pdf.js).
- Only pages near the screen are drawn. Every page has a placeholder `div` of the correct height
  (page aspect ratio from the first page's viewport, refined per page when it is drawn). Use ONE
  IntersectionObserver (rootMargin about one screen) to know which pages are near. This mirrors the windowed
  text rendering already in src/ui/Reader.jsx (`useNearChunks`): read it and follow the same approach.
- Draw at most one page at a time; cancel a page's render task when it leaves the near set; keep at most 6
  drawn canvases, releasing the farthest (set the canvas width/height to 0 to free memory).
- Canvas pixel size = CSS width × min(devicePixelRatio, 2).
- Never block the UI: all drawing is async through pdf.js's own worker (already configured).

## Settings (src/lib/settings.js DEFAULTS)
- `readerView: 'text'` ('text' | 'pages') and `invertPages: true`.

## Truthfulness rules (the product owner's rule; see docs/specs/M2-true-status.md)
- If the source file is not on this device (document synced from another device), do not show the switch.
- While a page is being drawn, its placeholder shows nothing but a faint page outline (no spinner per page).
- If the PDF cannot be opened: one line, "This file can't be shown as pages on this device." and fall back to
  Text view.

## Project rules (must follow)
- React function components at top level only; inline styles with tokens from src/theme.js; no CSS files.
- Animate `transform` and `opacity` only. No new dependencies.
- Plain language in the UI, sentence case.
- Touch only: src/lib/text.js, src/lib/settings.js, src/ingest/pdf.js (exports only), src/ui/Reader.jsx,
  NEW src/ui/PageView.jsx, e2e/qa.mjs. Do not refactor anything else.

## Tests
- `npm test` must pass (src/lib/*.test.js, src/ingest/*.test.js). Add one small node test in
  src/lib/text.page.test.js: `toListening` keeps `p` for blocks with a page and omits it for blocks without.
- e2e/qa.mjs: add ONE step after the step named 'add scanned PDF (Traction)' (that document is a PDF added
  from a file, so pages are available): open it (see the helper `openDoc('Traction')` used later in the file),
  switch to Pages (role 'tab', name 'Pages'), wait until at least one canvas inside the page view has a
  width greater than 100 and the text "Page 1 of" is visible, then switch back to Text (tab 'Text') and go
  back to the library (button 'Back to library'). Do not run e2e/qa.mjs yourself.
- Run `npx vite build` (no errors or warnings; do NOT raise any warning limit) and `npm test`.

## Done when
Report: files changed, how the near-page set and the 6-canvas cap are implemented (two sentences), and the
build + test output lines. Do not commit, push or deploy.
