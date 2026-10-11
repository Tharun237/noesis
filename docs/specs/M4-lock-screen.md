# M4: the lock-screen experience

## What we learned on a real phone (Poco X3 Pro, MIUI, Chrome 154, 2026-10-11)
- The media notification works once Chrome's notifications are enabled in Android settings. On MIUI they are
  OFF by default, and a web app cannot detect that. So customers must be told, once, how to turn them on.
- The notification showed the title "491602_1_En_Print.indd" and the artist "0015220": junk metadata from
  inside the PDF. The cover clearly reads "Antimatter".

## 1. Clean titles and authors
New pure module `src/ingest/meta.js` with `cleanMeta({ title, author }, { fileName, firstHeading })` →
`{ title, author }`, and node tests in `src/ingest/meta.test.js`.

A title is junk when, after trimming, it: is empty; ends with a file extension
(`.indd .pdf .doc .docx .qxd .tex .dvi .ps .rtf .odt .pages .txt`); has no space and contains `_` or is mostly
digits; is a known placeholder ("untitled", "document", "microsoft word - ..." → strip that prefix first and
re-test). A junk title is replaced by `firstHeading` if that looks like a title (3–120 characters, has
letters), else by the file name with its extension removed and `_`/`-` turned into spaces.

An author is junk when it: has no letters; is a tool name (starts with "Adobe", "Microsoft", "Acrobat",
"LaTeX", "TeX", "Quark", "InDesign", "Word", "PScript", "calibre", "Writer"); is a single token of digits.
A junk author becomes '' (the UI already hides an empty author).

Use it in `src/ingest/pdf.js` where the PDF's metadata title/author are read (pass the first heading block's
text and the file name). Tests must cover the two real values above and at least: a good title is kept;
"Microsoft Word - Thesis final.docx" → "Thesis final"; "paper_v3_FINAL" with heading "Attention Is All You
Need" → the heading; author "Adobe InDesign 16.0" → ''.

Repair documents already in the library: in `src/lib/library.js` `boot()`, for each document that the user
did not rename (`!d.renamed`), run `cleanMeta` on its stored title/author with the stored source's file name
(`db.getSource(id)` has `.name`); patch only if something changed. Do it after the library is shown (it must
not delay startup) and yield between documents.

## 2. What the notification says
In `src/lib/player.js` (Media Session code near `setSession`):
- Default: `title` = document title, `artist` = author or 'Noesis', `album` = the chapter being read (the
  nearest heading at or before the current sentence; '' if none).
- New setting `lockScreenWords` (default true), label in Settings → Listening:
  "Show the words being read on the lock screen", hint "The notification follows the speech, a few words at a
  time." When on AND playing with the natural voice: `title` = the phrase being spoken — a window of about 6
  words around the current word, with "…" at a cut end — and `artist` = the document title. On pause, on end,
  and when the setting is off: back to the default.
- The current word comes from the audio position inside the sentence. Reuse the word timing already used for
  highlighting: move `wordWeights` out of src/ui/Reader.jsx into `src/lib/words.js` (export it, import it back
  in Reader.jsx unchanged) and use it in player.js. Compute the word from `audio.currentTime` inside the
  existing `timeupdate` handler (it fires about 4 times a second, also in the background).
- Update `navigator.mediaSession.metadata` ONLY when the text actually changes, and at most once a second
  (Android throttles notification updates; too many get dropped or drain the battery). Keep the same artwork
  object between updates so the cover does not flicker.
- Add to `audioState()`/diagnostics nothing; but add one row to src/ui/Diagnostics.jsx under "System media
  controls": "Media Session artist" (so we can see both lines from a phone).

## 3. Tell Android users how to get the controls
A web app cannot know whether Chrome's notifications are blocked, so do not claim to. Offer the guide:
- The first time playback starts on Android (`/Android/i.test(navigator.userAgent)`), show ONE toast with an
  action: text "Want play and pause on your lock screen?", action "Show me how". Remember it was shown
  (settings key `lockTipSeen: true`) so it never repeats. Never on iPhone/iPad or desktop.
- "Show me how" opens a sheet (use `Sheet` from src/ui/kit.jsx via the existing sheet mechanism in
  src/ui/Sheets.jsx: add a sheet named 'lockscreen'). Content, plain and short:
  Heading: "Controls on your lock screen"
  Body: "While Noesis is playing, pull down your notifications. If you see the book with play and pause,
  you're set. If not, your phone is hiding Chrome's notifications:"
  Steps: 1. "Open your phone's Settings, then Apps." 2. "Find Chrome, then Notifications."
  3. "Turn on Show notifications and Lock screen notifications." 
  Note (faint): "The names differ a little between phones. On Xiaomi, Redmi and Poco it's Settings → Apps →
  Manage apps → Chrome → Notifications. On OnePlus, Oppo and Realme: Settings → Apps → App management →
  Chrome → Manage notifications. On Samsung: Settings → Notifications → App notifications → Chrome."
  Button: "Done".
- The same sheet opens from a row in Settings → Listening: "Lock-screen controls" (Android only).

## Project rules (must follow)
- React function components at top level only; inline styles with tokens from src/theme.js; no CSS files.
- Animate `transform` and `opacity` only. No new dependencies. Plain language, sentence case.
- Status and help text must be true: never say notifications are "blocked" or "enabled"; we cannot know.
- Touch only: NEW src/ingest/meta.js, NEW src/ingest/meta.test.js, NEW src/lib/words.js, src/ingest/pdf.js,
  src/lib/library.js (boot repair only), src/lib/player.js, src/lib/settings.js, src/ui/Reader.jsx (import
  move only), src/ui/Settings.jsx, src/ui/Sheets.jsx, src/ui/Diagnostics.jsx. Do not refactor anything else.

## Tests
- `npm test` passes, including the new meta tests.
- e2e/qa.mjs must keep passing: do not change any existing text it matches. Do not run it yourself.
- `npx vite build` with no errors or warnings (do NOT raise any warning limit).

## Done when
Report: files changed, the meta test cases you added, how the once-a-second / only-when-changed rule is
implemented (two sentences), and the build + test output lines. Do not commit, push or deploy.
