# M20: reading insights for one document: emotional arc and hard words (roadmap 19)

Create NEW files only. Do NOT edit any existing file (someone else wires them in). No new dependencies.
No AI is used. The emotional arc works for English text only, and the screen must say so.

## `src/lib/insights.js` + `src/lib/insights.test.js` (all pure, all tested)
- `POSITIVE` and `NEGATIVE`: two exported Sets of about 120 common English words each (joy, hope, love,
  success, calm, bright, win, safe, ... / fear, death, loss, war, pain, dark, fail, danger, ...). Lower case.
- `tone(text)` returns a number from -1 to 1: (positive words - negative words) / (positive + negative),
  0 when there are none; a word directly after "not", "no" or "never" counts for the other side.
- `arc(sections)` where `sections = [{ title, start, text }]` (start = index of the section's first
  sentence) returns `[{ title, start, tone, words }]`, one per section, skipping sections under 40 words.
- `splitSections(blocks, starts)` turns a loaded document (blocks `{ k, s: [sentences] }`, `starts[b]` =
  index of block b's first sentence) into those sections: a new section at every heading block (`k === 'h'`);
  text before the first heading is a section titled "Beginning"; a document with no headings is cut into
  sections of about 60 sentences titled "Part 1", "Part 2", ...
- `hardWords(text, { max = 30 })` returns `[{ word, count }]`: words of 9 or more letters, not capitalised
  in most of their uses (names are not hard words), ranked by length times `log(1 + count)`, most first.
- Tests: tone of a clearly positive, a clearly negative and a neutral sentence; the negation rule; sections
  from headings, from a headingless document, and the "Beginning" case; short sections skipped; hardWords
  ignores names and ranks a long repeated word above a long word used once.

## `src/ui/Insights.jsx`
`Insights({ doc, title, onSeek, onAsk })`: the content of a sheet for the document open in the reader
(`doc` is the loaded content: `blocks`, `segs`, `starts`).
- "Emotional arc": an SVG line chart (width 100%, height 140) of `arc` over the sections, with a faint zero
  line, lime (`T.lime`) above zero and white below; under it the section titles as a tappable list, each with
  its tone shown as a word ("bright", "even", "dark" for above 0.15, between, below -0.15); tapping a section
  calls `onSeek(start)`. Under the chart, exactly: "Counted from ordinary English words of feeling. It does
  not understand irony, and it works for English text only."
- "Hard words": the list from `hardWords` (word and count, in `T.mono` for the count); tapping a word calls
  `onAsk(word)`. Under the heading, exactly: "Long words used here that are not names. Tap one to have it
  explained."
- Compute with `useMemo` from `doc`. Nothing to show (no sections of 40 words): the line "This document is
  too short for an arc."
Inline styles with tokens from src/theme.js; components at top level only.

## Done when
`npm test` passes and `npx vite build` has no errors or warnings. Report: files created, the test list, the
build and test output lines, and what you could not run. Do not commit.
