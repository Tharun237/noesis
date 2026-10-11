# M16: voice commands and hands-free bookmarks (roadmap 12 by voice, 13)

Create NEW files only. Do NOT edit any existing file (someone else wires them in). No new dependencies.

## `src/lib/voicecmd.js` + `src/lib/voicecmd.test.js`
- `parseCommand(transcript)` (pure, tested) returns `{ cmd, arg? }` or `null`. Lower-case, strip punctuation;
  an optional leading "noesis" or "hey noesis" is ignored. Commands and the phrases that trigger them:
  `play` (play, resume, continue, go on), `pause` (pause, stop, wait, hold on), `back` (back, go back,
  repeat, repeat that, say that again), `next` (next, skip, skip that), `bookmark` (bookmark, bookmark that,
  save that, mark that, remember that), `explain` (explain, explain that, what does that mean, what was that),
  `recap` (recap, where was i, what did i miss), `skim` (skim, skim this, skip this section), `slower`,
  `faster`, and `ask` with `arg` = the rest of the sentence for "ask <question>" or "question <question>".
  A longer phrase wins over a shorter one ("skip this section" is `skim`, not `next`). Anything else: null.
  Tests: every phrase above, the wake word, punctuation and capitals, the longer-phrase rule, nonsense is null.
- `speechSupported()` returns a boolean (`window.SpeechRecognition || window.webkitSpeechRecognition`).
- `createListener({ lang = 'en-US', onCommand, onHeard, onState })` returns `{ start(), stop() }`. Continuous
  recognition, final results only; each final transcript goes to `onHeard(text)` and, when `parseCommand`
  matches, to `onCommand(command)`. It restarts itself when the browser ends the session while it is still
  wanted (at most once a second). States reported through `onState`: 'off', 'listening', 'denied' (error
  `not-allowed` or `service-not-allowed`), 'unsupported', 'error'. `stop()` always ends in 'off'.

## `src/ui/VoiceControl.jsx`
Two top-level React components.
`VoiceControl({ onCommand, onState, onHeard })`: an `IconButton` from src/ui/kit.jsx (icon 'mic' if
src/ui/icons.jsx has it, otherwise 'sparkle'; label "Voice commands", `active` while listening) that starts
and stops the listener and passes state and heard text up.
`VoiceStatus({ state, heard })` renders text only (fontSize 12.5, color T.sub):
- listening: "Listening. Say: play, pause, back, bookmark, explain, recap." and, when something was heard,
  after it: `Heard: "<text>"`. Under it, exactly: "Your browser sends what it hears to its own speech
  service to recognise the words."
- denied: "The microphone is blocked for this site. Allow it in the browser's site settings."
- unsupported: "Voice commands need Chrome on Android or a computer."
- error: "Voice commands stopped. Tap the microphone to try again."
- off: nothing (return null).
Inline styles with tokens from src/theme.js.

## Done when
`npm test` passes and `npx vite build` has no errors or warnings. Report: files created, the test list,
build and test output lines, and what you could not run (there is no microphone here). Do not commit.
