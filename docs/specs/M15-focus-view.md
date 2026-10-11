# M15: Focus view (one word at a time: follows the voice, or reads fast without it)

## Why
Roadmap item 22: readers who are deaf or hard of hearing, and anyone who wants to read fast. One word at a
time at a fixed spot removes eye movement (RSVP reading), and while the voice plays it becomes a large
caption that moves with the speech.

## The customer's seat (the work is judged by this)
1. The reader's view switch gains "Focus": Text | Focus for every document, Text | Pages | Focus for a PDF
   whose file is on the device. The choice is remembered (`readerView: 'focus'`).
2. Focus shows ONE word, large and centred. One letter of the word (the point the eye should rest on, about
   a third of the way in) is lime, and that letter sits at the SAME horizontal position for every word.
   Under it, small and faint: the sentence being read, with the current word in full white.
3. While the voice is playing, the word shown is the word being spoken. Nothing else is needed from the
   customer: press play in the player as usual.
4. When nothing is playing, Focus is a speed reader. Its own controls: a play / pause button, "−" and "+"
   for speed (200 to 900 words a minute in steps of 50, default 300, remembered as `focusWpm`), and "Back a
   sentence". Words rest a little longer after a comma and longer after the end of a sentence. Reading this
   way moves the document's place (the same `pos` the player uses), so listening later carries on from
   there. Pressing the player's play stops the speed reader and hands over to the voice.
5. Emphasis is shown, for readers who cannot hear it: a word written in capitals, or one followed by "!"
   or "?", is shown a size larger.
6. Truth: with the built-in (device) voice the word follows the device's own word reports and can lag by a
   word; say nothing about it. If a sentence has no audio yet while the voice is playing, Focus shows the
   sentence's first word and waits; it never runs ahead of the voice.

## 1. `src/lib/focus.js` (pure) + `src/lib/focus.test.js`
- `pivot(word)` → index of the letter to mark: 0 for 1 letter, 1 for 2 to 5, 2 for 6 to 9, 3 for 10 to 13,
  4 beyond; counted on letters and digits only (leading quotes or brackets are skipped; return the index in
  the original string).
- `wordDelay(word, wpm)` → milliseconds: base `60000 / wpm`; ×1.3 when the word has more than 8 letters;
  ×1.5 when it ends with `,` `;` `:`; ×2.2 when it ends a sentence (`.` `!` `?` `…` `।`, also before a
  closing quote).
- `emphatic(word)` → true for a word of 2 or more letters all in capitals, or ending in `!` or `?`.
- `splitWords(sentence)` → words split on whitespace, never empty.
- `wordIndexAt(weights, fraction)` → which word a fraction (0 to 1) of the spoken length falls in, given the
  relative weights the reader already uses (read `wordWeights` in src/lib/words.js and how
  `ActiveSentence` in src/ui/Reader.jsx turns audio time into a word; reuse, do not reinvent).
- Tests for each, including: pivot on `"(Hello`, on a Telugu word (marks do not count as letters), delays
  at 300 wpm for a short word, a long word, a comma word and a sentence end; emphatic cases.

## 2. `src/ui/FocusView.jsx` (new) and the reader
- Props it needs from the reader: the loaded document, the active sentence index, a way to seek to a
  sentence (`onSeek`), whether the voice is playing. Read src/ui/Reader.jsx to see what exists
  (`active`, `doc`, `onSeek`, the player store) and pass only that.
- The pivot letter stays at the same x: render the word as three spans (before, pivot, after) inside a
  grid with columns `1fr auto 1fr`, the first right-aligned and the last left-aligned.
- Word changes must not animate layout. A change of word is an instant swap; only opacity or transform may
  animate (project rule).
- The speed reader runs on `setTimeout` chained per word (`wordDelay`), cleared on unmount, on pause, when
  the voice starts playing, and when the view changes. At the end of a sentence it moves to the next
  readable sentence and saves the place with the library's `patch(id, { pos })` at most once a second and
  when it stops.
- src/ui/Reader.jsx: add 'focus' to the view switch options and render `FocusView` for it in place of the
  text. Keep Pages exactly as it is. Change nothing else in Reader.jsx.
- src/lib/settings.js DEFAULTS: `focusWpm: 300`; `readerView` already exists.

## Project rules (must follow)
- No new dependencies. Pure helpers get node tests. React components at top level only; inline styles with
  src/theme.js tokens (lime is `T.lime`). Animate `transform` and `opacity` only.
- The store rule: a `useStore` selector must return a primitive or the same object reference until it
  changes; never filter or map inside a selector (use `useMemo` after it).
- Touch only: NEW src/lib/focus.js, src/lib/focus.test.js, src/ui/FocusView.jsx; src/ui/Reader.jsx (the
  view switch and where the view is rendered), src/lib/settings.js. Do not touch or run e2e/qa.mjs; the
  text "Text" and "Pages" on the switch must stay exactly as they are (QA uses them).
- `npm test` and `npx vite build` with no errors or warnings (do NOT raise any warning limit).

## Done when
Report: files changed; how the spoken word is found while the voice plays (name the function and where the
time comes from); how the speed reader is stopped in each of the four cases; the test cases added; the
build and test output lines. Say plainly what you could not run. Do not commit, push or deploy.
