# M2: every status message is true, and about something the user is waiting on

## Why
The product owner's rule: a status message must be TRUE at the moment it shows, and about something the user
is WAITING ON or must act on. Two facts shown together must never look contradictory. Routine background work
that blocks nothing is silent. An audit found 40 violations and 8 silent waits:
`docs/research/status-audit.md` (rows V1–V40 and MM1–MM8, each with file:line, the condition, and a proposal).

Read that file first. Implement every row as proposed there, EXCEPT where a ruling below says otherwise.
Line numbers may have shifted by a few lines; match on the quoted text.

## Rulings (these override the audit's proposals)

**One source of truth for "is this book waiting on audio?"** (V4, V40, V3, V18, V19, V21, V27)
- A library card shows an audio line ONLY for the document loaded in the player (`player.id === d.id`) and
  only while the player's gate is closed (`player.gate != null`): "Preparing audio · ready in <wait>", using
  the same `gate` seconds the player shows. Every other card shows no audio line at all.
- The thin progress bar under a card (Library.jsx, the `working && d.status === 'voicing'` bar): remove it.
- If the voice engine is in error, the card of the player's document says "The voice didn't load" (no ETA).
- "Waiting for the voice" / "Getting the voice ready": only when the gate is closed, or a real download is in
  progress (`engine.total > 0 && !engine.opening`). Never for a load from this device's storage that nobody
  is waiting on. Same rule in the reader's Preparing card and in the activity strip.

**Reader "Preparing" card** (V1, V2, V17, V28)
- "Play starts by itself when ready." only when `player.gate != null` for this document (Play was pressed).
  Otherwise: "Press Play when it's ready." 
- When ready: the heading is "Ready to play" and the line under it is
  "The rest is prepared ahead of you as you listen." No percentage.
- `fmtWait(null)` must not print a time: with no estimate yet, print "Preparing the voice" with no ETA.
- Queued / syncing / reading each get their own true sentence, as the audit proposes (V28).

**Activity strip** (V11, V12, V6, V16, MM6)
- Priority: (1) voice error, (2) the listener's own wait (gate closed), (3) a real voice download,
  (4) the document actually being processed now (status `reading` or `narrating` first; a `queued` one only
  if nothing is being processed), (5) nothing.
- A synced document with no text yet (no `contentVer`): "Waiting for your other device to finish preparing".
- Voice errors: distinguish offline ("You're offline. The voice downloads when you're back online.") from
  other failures ("The voice couldn't start." + Retry). Retry must load `engine.get().voice`, the voice that
  failed, not the default voice.
- Offline line (MM6): only while an action that needs the network is actually pending.

**Percentages** (V13, V14, V15, V29)
- Reset `prep` to 0 whenever the stage changes (library.js, before narration and before repair).
- Never print "0%". Print a percentage only when it is at least 1; below that, show the stage text alone.
- "Save audio" while unfinished: right-hand text "when fully voiced", not a percentage.

**Sleep timer menu** (V5, MM3)
- No timer running: the menu lists only the options to start one. There is no "off" row.
- A timer running: the first row is "Turn sleep timer off", with what is running on the right
  ("12 min left", "at end of chapter", "at end of document").
- While a timer runs, the player also shows it in words (MM3), e.g. "Sleep in 12 min".
- The e2e test sets a 10-minute timer and then clicks the off row: update it to 'Turn sleep timer off'.

**Errors** (V22, V23, V25, V34): never show raw exception text as the message. Offline → say offline and that
nothing was lost. Google 429 → "Google's free quota is full right now. Try again in a minute." Other → one
plain sentence plus the way forward. Keep the raw text only in a small secondary line where the audit says so.

**Claims** (V30, V31, V32, V33, V35, V36, V37, V38): take the audit's wording.

**Bug behind a wrong message** (V9, MM7): `deleteAllAudio()` in src/lib/library.js must call `kickVoice()`.

**Silent waits** (MM1, MM2, MM4, MM5): add the sentences the audit proposes.

## Also in this task: Noesis is now a private, commercial product
- Remove the words "open source" and "MIT" from user-visible text: the first-run screen in
  src/ui/Library.jsx ("... Open source.") and the footer line in src/ui/Settings.jsx
  ("free & open source (MIT)" → "free to use").
- README.md: remove the claims that it is open source / MIT; the License section becomes:
  "Copyright (c) 2026 Tharun Gundu. All rights reserved. Voices: rhasspy/piper-voices (see src/lib/voices.js
  for each voice's license)."
- LICENSE: replace the whole file with: "Copyright (c) 2026 Tharun Gundu. All rights reserved." and one line:
  "Third-party components keep their own licenses."
- vite.config.js manifest description: drop "Free and open source." 

## Also: diagnostics card
src/ui/Diagnostics.jsx: wrap the rows in a native `<details>` element, closed by default, with a `<summary>`
reading "Show diagnostics" (styled with theme tokens, pointer cursor). The Copy report button stays visible
outside the `<details>`. The 1-second refresh should only run while the details element is open.

## Project rules (must follow)
- React function components at top level only. Inline styles with tokens from src/theme.js; no CSS files.
- Motion animates `transform` and `opacity` only.
- No new dependencies. No `try/catch` that hides errors (mapping an error to a clear message is fine).
- Plain language, sentence case, no jargon ("voice", not "engine" or "model"; never "worker", "cache").
- Do not change behaviour outside what the rows and rulings describe. Do not refactor.

## Tests
- `e2e/qa.mjs` finds elements by their text. When you change a string, search e2e/qa.mjs for the old string
  and update the selector. Known ones: the toast matched by `/still being prepared on this device/`
  (keep those words in the toast, shortened: "Audio is still being prepared on this device: ready in <wait>.
  It starts by itself."), the menu items 'Sleep in 10 minutes' and 'Sleep timer off' (rename the test's
  'Sleep timer off' to the new label), 'Sleep at end of document', the heading /Listen to\s*anything/.
- Run `npx vite build` (no errors or warnings) and `npm test` (all pass). Do not run e2e/qa.mjs yourself.

## Done when
Report: each V/MM row with done / skipped (and why), the files changed, and the build + test output lines.
Do not commit, push or deploy.
