# M23: hear a chart or table as sound (roadmap 21, plot sonification)

Create NEW files only. Do NOT edit any existing file (someone else wires them in). No new dependencies.

## What the customer gets
At a table or figure description in a document, "Hear this as sound": the numbers are played as a rising and
falling line of tones (higher value, higher pitch), so the shape of the data can be heard. It works from
the numbers found in the text; no AI is needed.

## `src/lib/sonify.js` + `src/lib/sonify.test.js`
- `numbersIn(text)` (pure, tested) returns the numbers in a text in order, as JavaScript numbers: handles
  thousands separators ("21,000"), decimals, negatives, percentages (the % is dropped) and "1.2 million" /
  "3 billion" / "5 thousand"; ignores years written as bare 4-digit numbers between 1500 and 2100 when the
  text has other numbers, and ignores numbers that are part of a label like "Table 3" or "Figure 2".
- `toTones(values, { low = 220, high = 880, seconds = 0.28 })` (pure, tested) returns
  `[{ freq, start, duration, value }]`: values mapped linearly from min to max onto `low`..`high` on a
  musical (logarithmic) scale; all equal values give the middle pitch; at most 40 tones (longer series are
  sampled evenly, always keeping the first and last); `start` increases by `seconds`.
- `describe(values)` (pure, tested) returns one plain sentence, for example "12 values, from 3 up to 21,000;
  it rises overall, with the highest at the end." (rises / falls / stays level / goes up and down).
- `playTones(tones, { volume = 0.2, onTone, signal })` returns a Promise that resolves when it finishes:
  one `AudioContext` created inside the call (it is called from a tap), one `OscillatorNode` (type 'sine')
  per tone through a `GainNode` with a 15 ms attack and release so there are no clicks; `onTone(index)` is
  called as each tone starts; `signal` aborts and stops the sound. The module must import cleanly in Node.
- Tests: every number form above; the year and label rules; tone mapping (min is `low`, max is `high`, the
  40-tone cap keeps first and last, equal values); the four descriptions.

## `src/ui/SonifySheet.jsx`
`SonifySheet({ text })`: the content of a sheet. It shows the sentence from `describe`, a row of bars (one
per tone, height by value, SVG or divs) where the bar being played turns `T.lime`, a "Play" / "Stop" button,
and the line "Higher pitch means a larger number. Made from the numbers in this passage." Fewer than 3
numbers: the line "There are not enough numbers in this passage to play." and no button. Bars may animate
only `opacity` and `transform` (use `scaleY` with `transformOrigin: 'bottom'`). Inline styles with tokens
from src/theme.js; components at top level only.

## Done when
`npm test` passes and `npx vite build` has no errors or warnings. Report: files created, the test list,
build and test output lines, what you could not run (no sound here). Do not commit.
