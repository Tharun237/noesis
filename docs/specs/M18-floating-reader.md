# M18: the floating reader (words outside the app; roadmap "Limits", approach 3)

Create NEW files only. Do NOT edit any existing file (someone else wires them in). No new dependencies.
Works only where the browser has Document Picture-in-Picture (`window.documentPictureInPicture`): Chrome and
Edge on a computer. Everywhere else it must not appear at all.

## `src/lib/floating.js` + `src/lib/floating.test.js`
- `floatingSupported()` returns `typeof window !== 'undefined' && 'documentPictureInPicture' in window`.
- Pure, tested: `floatingSize(screenWidth)` returns `{ width, height }` (width 420, or screenWidth - 40 when
  smaller, never under 260; height 190); `baseCss(T)` returns a CSS string for the floating document:
  `html, body { margin: 0; height: 100%; background: <T.bg>; color: <T.text>; font-family: <T.font>; }`
  plus `* { box-sizing: border-box; }`.
- `openFloating(render)` returns `Promise<{ close(), window }>`: `documentPictureInPicture.requestWindow(size)`,
  copies every `<link rel="stylesheet">` and font `<link>` from the main document's head into the new one,
  adds a `<style>` with `baseCss`, creates a root `div`, and mounts React there with
  `createRoot(div).render(render())` (import from 'react-dom/client'). When the floating window closes
  (`pagehide` on it) the root is unmounted. `close()` closes the window. Must be called from a user gesture.
  The module must import cleanly in Node (no `window` access at import time).

## `src/ui/FloatingReader.jsx`
`FloatingReader()`: what is shown inside the floating window. It reads the player store
(`player` from src/lib/player.js: `id`, `i`, `playing`, `waiting`, `word`) and the loaded document
(`loadDoc(id)` from src/lib/library.js, in an effect; nothing while it loads). It shows the sentence being
read, centred, 18 px, with the word being spoken in `T.lime` (for the natural voice use `audioClock()`,
`wordWeights` from src/lib/words.js and the document's `durs` / `tails` exactly as `FocusView` in
src/ui/FocusView.jsx does: read that file and reuse `wordIndexAt` from src/lib/focus.js; with the built-in
voice use `player.word`). Under it three buttons: previous sentence, play / pause, next sentence, calling
`prevSentence`, `toggle`, `nextSentence` from src/lib/player.js (aria-labels "Previous sentence", "Play" or
"Pause", "Next sentence"). No document playing: the line "Nothing is playing." Store rule: a `useStore`
selector returns a primitive or the same object reference; never filter or map inside it.
Inline styles with tokens from src/theme.js; components at top level only.

## Done when
`npm test` passes and `npx vite build` has no errors or warnings. Report: files created, the test list,
build and test output lines, and what you could not run (no Picture-in-Picture here). Do not commit.
