# M22: interactive equation exploder (roadmap 20)

Create NEW files only. Do NOT edit any existing file (someone else wires them in). No new dependencies.

## What the customer gets
At an equation in a document, a sheet that takes the equation apart: one line saying what it is for, then
each part as a tappable row (the symbol or term, and what it means in plain words). Tapping a row has it
spoken. The parts come from the customer's own AI (any provider), through `aiText` in src/lib/ai.js.

## `src/lib/equation.js` + `src/lib/equation.test.js`
- `equationPrompt(equationText, context)` (pure, tested): asks for JSON only, shape
  `{"purpose": "...", "parts": [{"term": "...", "meaning": "..."}], "inWords": "..."}`: `purpose` one or two
  plain sentences on what the equation is for; `parts` in the order they appear, 2 to 10 of them, `term` as
  written in the equation, `meaning` one plain sentence, no symbols read out one by one; `inWords` the whole
  equation said aloud as a sentence. It includes the equation text and up to 600 characters of `context`
  (the sentences around it), and says to answer in the language of the context.
- `parseEquation(reply)` (pure, tested): accepts the JSON with or without a ```json fence and with text
  before or after it (take the outermost `{ ... }`); returns `{ purpose, parts, inWords }` with strings
  trimmed, parts without a term or meaning dropped, at most 10 parts; throws
  `Error('The explanation came back in a form that could not be read.')` when there is no usable object or
  no parts.
- `explainEquation(equationText, context, { signal })` → the parsed object, through
  `aiText({ prompt, json: true, shape, signal })` (read src/lib/ai.js for its signature).
- Tests: the prompt carries the equation, the context (cut at 600) and the shape; parsing a clean reply, a
  fenced reply, a reply with chatter around it; dropping empty parts; the error cases.

## `src/ui/EquationSheet.jsx`
`EquationSheet({ equation, context, onSpeak })`: the content of a sheet. On mount it calls
`explainEquation`; while waiting it shows "Taking the equation apart"; on failure the error's message and a
"Try again" button. Then: the equation itself in `T.mono` in a bordered box; `purpose` as a paragraph; the
parts as a list of buttons (term in `T.lime` and `T.mono`, meaning under it in `T.sub`); a last button "Hear
it in words" for `inWords`. Tapping a part calls `onSpeak(term + ': ' + meaning)`; the last button calls
`onSpeak(inWords)`. Rows appear in a short stagger using `motion` from 'motion/react' (variants with
`delayChildren: stagger(0.04)`, each row `opacity 0 → 1` and `y 6 → 0`); only transform and opacity animate.
No AI key (`hasAiKey()` from src/lib/ai.js is false): the line "Taking an equation apart needs an AI key. Add
one in Settings." Inline styles with tokens from src/theme.js; components at top level only.

## Done when
`npm test` passes and `npx vite build` has no errors or warnings (also no `INEFFECTIVE_DYNAMIC_IMPORT`
notice). Report: files created, the test list, build and test output lines, what you could not run. Do not
commit.
