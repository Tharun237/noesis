# M6: the spoken sentence, shown on the original page

## Why
Pages view (M3) follows the audio one page at a time. The listener cannot see WHERE on the page the voice
is. This task marks the sentence being spoken on the page itself, and lets a tap on any line start there.

## Design decision (do not change it)
No geometry is stored when a document is added. The sentence is FOUND on the page when the page is shown,
by matching its text against the page's own text layer. So it works for documents already in the library,
costs no storage, and needs no re-preparing. Scanned pages have no text layer: they simply get no mark and
keep today's page-level behaviour.

## 1. Pure module `src/lib/locate.js` (no DOM, no pdf.js) + node tests `src/lib/locate.test.js`

A **line** is `{ text, x, y, w, h }`: `text` as extracted, the rest as fractions (0..1) of the page width and
height, origin top-left, `y` = top edge of the line.

- `indexLines(lines)` → `{ norm, lineOf, offOf }`. `norm` is every line's text joined in order, lower-cased
  (`toLowerCase()` after `normalize('NFKC')`), keeping ONLY letters and digits (`/[\p{L}\p{N}]/u`). Dropping
  spaces, hyphens and punctuation is deliberate: a word broken across lines ("exam-" / "ple") and any
  difference in spacing or quotes then match without special cases. `lineOf[k]` = index of the line that
  character k of `norm` came from; `offOf[k]` = that character's index inside the line's ORIGINAL `text`.
  Use `Uint32Array` for both.
- `locate(index, sentence, from = 0)` → `{ start, end }` (positions in `norm`, end exclusive) or `null`.
  Normalise `sentence` the same way to `s`. If `s.length < 4` return null.
  1. `index.norm.indexOf(s, from)`; if -1, `indexOf(s, 0)`. Found → `{ start, end: start + s.length }`.
  2. Otherwise anchors (the listening text sometimes differs from the page in the middle: a spoken number,
     a dropped citation): `a = s.slice(0, 16)`, `z = s.slice(-16)` (only when `s.length >= 24`).
     `start = indexOf(a, from)`, else `indexOf(a, 0)`. If -1 → null.
     `zi = indexOf(z, start + a.length)`. If found AND `zi + z.length - start <= s.length * 1.6` →
     `end = zi + z.length`. Else `end = Math.min(index.norm.length, start + s.length)`.
- `rects(index, lines, start, end)` → `[{ x, y, w, h }]`, one per line touched, in line order. For each line,
  the covered part is from the first to the last covered character OF THAT LINE (`offOf`), turned into
  horizontal fractions of the line by character count: `x = line.x + line.w * (firstOff / line.text.length)`,
  `w = line.w * ((lastOff + 1 - firstOff) / line.text.length)`; `y`, `h` from the line.
- `locatePage(lines, sentences)` → `[{ i, rects }]` for `sentences = [{ i, t }]` in reading order: one
  `indexLines`, then `locate` each with `from` = the previous found `end` (0 at first; unchanged when a
  sentence is not found), keeping only found ones.
- `sentenceAt(located, px, py)` → the `i` whose rect contains the point (fractions); if none, the `i` of the
  rect nearest to the point (distance to the rect's edge, 0 inside); `null` when `located` is empty.

Tests (at least): exact match on one line gives one rect covering the right character share; a sentence
across two lines with a hyphenated break ("…the exam-" / "ple shows…") gives two rects; the same phrase twice
on a page with `from` picks the second; a sentence whose middle differs ("grew by 3.5 percent" on the page,
"grew by three point five percent" spoken) is found by anchors with a sane end; a sentence not on the page
returns null; `locatePage` skips a missing sentence and still finds the next; `sentenceAt` inside a rect and
in the margin beside one.

## 2. Page lines with positions: `src/ingest/pdf.js`
Export `pageLayout(pdf, n)` → `Promise<line[]>` (the shape above). Reuse the existing `toLines` (it already
gives `text`, `x`, `xEnd`, `y` baseline, `size` in PDF units, in reading order). Convert with the page's
viewport at scale 1 (`page.getViewport({ scale: 1 })`, `viewport.convertToViewportPoint(x, y)`, which
handles page rotation and the flipped y axis): left = converted x / viewport.width; top = (converted
baseline y − size) / viewport.height; w = (xEnd − x) / viewport.width; h = size × 1.25 / viewport.height.
Call `page.cleanup()` as `pageLines` does. Do not change `toLines`, `pageLines` or `readPdf`.

## 3. `src/ui/PageView.jsx`
New props: `pageSentences(p)` → `[{ i, t }]` (sentences on page p, reading order; `[]` when unknown),
`activeSentence` (index or -1), `onTapSentence(i)`.

- When a page has been painted, get its layout (`pageLayout`) and compute `locatePage(lines,
  pageSentences(p))`; keep the result in a ref `Map` page → located. Drop a page's entry when its canvas is
  released (the existing 6-canvas cap). Compute off the click path: after the paint, one page at a time.
- Mark: each page wrapper becomes `position: relative`. For the page that holds `activeSentence`, draw its
  rects as absolutely positioned `div`s over the canvas using percentages of the wrapper
  (`left/top/width/height` in %; they are set once per sentence, never animated), with
  `pointerEvents: 'none'`. Style placeholder (Opus restyles it): `background: T.lime`, `opacity: 0.28`,
  `borderRadius: 3`. Put the style in ONE constant `MARK` at the top of the file.
- Follow: when `activeSentence` changes and it has rects, and the listener has not scrolled by hand in the
  last 4 s (existing `userScroll` rule), and the first rect is outside the middle band of the screen (above
  20% or below 70% of the window height), scroll so it sits about 35% from the top (`window.scrollTo`,
  `behavior: 'smooth'` when the distance is under 1.5 screens, else `'auto'`). When the active sentence has
  no rects, the existing page-level follow stays as it is.
- Tap: on a page with located sentences, a tap calls `onTapSentence(sentenceAt(located, px, py))` (point as
  fractions of the wrapper's box); otherwise the existing `onTapPage(p)`.

## 4. `src/ui/Reader.jsx` (wiring only)
Pass `pageSentences` (from `doc`: for each sentence i with `doc.blocks[doc.segs[i].b].p === p`, `{ i, t:
doc.segs[i].t }`; build a `Map` page → list once per document with `useMemo`), `activeSentence={active}`
and `onTapSentence={onSeek}`. Change nothing else in Reader.jsx.

## Project rules (must follow)
- React function components at top level only; inline styles with tokens from src/theme.js; no CSS files.
- Animate `transform` and `opacity` only. No new dependencies. No `try/catch` that hides an error: only the
  existing cancellation handling.
- Touch only: NEW src/lib/locate.js, NEW src/lib/locate.test.js, src/ingest/pdf.js (one new export),
  src/ui/PageView.jsx, src/ui/Reader.jsx (wiring). Do not touch e2e/qa.mjs; do not run it.
- `npm test` passes; `npx vite build` has no errors or warnings (do NOT raise any warning limit).

## Done when
Report: files changed, the test cases added, how a page's located sentences are cached and released (two
sentences), and the build + test output lines. Do not commit, push or deploy.
