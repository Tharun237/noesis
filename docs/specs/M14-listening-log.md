# M14: your listening (a log on the device) and a spoken retrospective

## The customer's seat (the work is judged by this)
1. The library's AI menu (the sparkle button; `LibraryAi` in src/ui/Library.jsx) gains an item "Your
   listening". It opens a sheet that shows, for THIS device: time listened today, in the last 7 days, this
   calendar month and in total; how many documents were finished this month; the current streak (days in a
   row with at least 1 minute); and the five documents listened to most this month, with their time.
2. Under the numbers, exactly: "Counted on this device since <date of the first entry>." With no entries
   yet: "Nothing counted yet. Listening time is counted from now on, on this device." Nothing is estimated
   or back-filled from before this feature existed.
3. A button "Hear your month" makes a short spoken retrospective as a new ordinary document titled
   "Your listening in <Month Year>", built from those numbers and titles by the customer's AI, and opens it
   in the reader. Fewer than 10 minutes this month: the button is disabled with "Listen for a little longer
   first." No AI key: disabled with "A retrospective needs an AI key. Add one in Settings."

## Design decisions (do not change them)
- Time is wall-clock time while sound is actually playing, not audio duration and not multiplied by speed.
- The log lives only on the device, in IndexedDB, as days: `{ 'YYYY-MM-DD': { [docId]: seconds } }`
  (local calendar date), plus `titles: { [docId]: title }` (kept so a deleted document still has a name) and
  `finished: [{ id, day }]`. It is not synced in this task.
- The retrospective sends the model only the numbers and titles, never document text.

## 1. `src/lib/history.js` (+ `src/lib/history.test.js` for the pure parts)
- Pure, tested: `dayKey(date)` (local date → 'YYYY-MM-DD'); `addSeconds(log, day, docId, seconds, title)` →
  new log; `markFinished(log, day, docId)` (once per document per day);
  `summarise(log, now)` → `{ today, week, month, total, finishedThisMonth, streak, top: [{ id, title,
  seconds }] (five, this month), since }`. Tests: seconds land on the right day and document; the week is
  the last 7 calendar days including today; the month is the calendar month; the streak counts back from
  today (or from yesterday when today has under 60 s) and stops at the first day under 60 s; top five in
  order; an empty log gives zeros and `since: null`.
- `startHistory()`: every 5 seconds, when `player.get().playing` is true and `player.get().waiting` is false
  and the page's audio is really running (`audioState().paused === false`, or the built-in voice is the
  active engine and `speechSynthesis.speaking`), add 5 seconds to today for `player.get().id`. Save at most
  every 20 seconds and when the page is hidden (`visibilitychange`). Watch the library for a document
  becoming `finished` and record it. Load the log once at start. `useHistory()` gives React the current log
  (a store from src/lib/store.js; selectors must return primitives or the SAME object reference until it
  changes: do NOT filter or map inside a `useStore` selector, use `useMemo` after it).
- `retrospectivePrompt(summary, monthName)` (pure, tested: the numbers and every title appear; asks for
  about 150 words of plain flowing prose, warm and specific, no lists, in English) and
  `makeRetrospective({ signal })` → new document id, through `aiText` and `addDocument` exactly as
  src/lib/briefing.js does (read it).
- src/lib/db.js: `getHistory()` / `putHistory(log)` beside the other helpers.
- Start it once from src/App.jsx with one import and one call next to the other start-up calls.

## 2. UI (plain controls; Opus designs the look afterwards)
- NEW `src/ui/Listening.jsx`: the sheet named 'listening' (register in src/ui/Sheets.jsx as 'briefing' is).
  Durations shown as "12 min" under an hour and "3 h 20 min" above; numbers in `T.mono`.
- src/ui/Library.jsx: one more item in `LibraryAi`'s menu: "Your listening" (icon 'clock' if the icon set has
  it, otherwise 'list'). The sparkle button must now show whenever the library has at least one document OR
  the log has any entry. Change nothing else.

## Project rules (must follow)
- No new dependencies. Pure helpers get node tests. React components at top level only; inline styles with
  src/theme.js tokens. No `try/catch` that hides an error. Status text must be true.
- Touch only: NEW src/lib/history.js, src/lib/history.test.js, src/ui/Listening.jsx; src/lib/db.js,
  src/App.jsx (one import, one call), src/ui/Sheets.jsx (one registration line + import), src/ui/Library.jsx
  (the menu item and its condition). Other files may be edited by someone else at the same time: never
  rewrite, reformat or revert a file outside your list. Do not touch or run e2e/qa.mjs.
- `npm test` and `npx vite build` with no errors or warnings (do NOT raise any warning limit).

## Done when
Report: files changed; exactly when 5 seconds are added (the condition, quoted from the code); the
retrospective prompt in full; the test cases added; the build and test output lines. Say plainly what you
could not run. Do not commit, push or deploy.
