---
name: promises
description: Find what is broken from what was promised, before the customer finds it. Use before calling any feature done, before every release, after any change to sync, the player, listening time, the reader or any number shown on screen, and whenever Tharun reports a fault (a reported fault is one broken promise: find the others like it before answering him).
---

# Promises

Tharun, 13 October 2026, after finding by hand that his phone showed 7 of his 21 books, then that his place in a
book had not followed him: "Why can't you find such issue in code rather than feedback. You know the intent,
right. If I keep providing feedback and you keep fixing, it'll be eternity and we'll be in this loop. We need
to develop a new skill here."

He was right about the cause. Every one of those faults passed its tests, because the tests asked "does the
code do what the code says". None asked "is what the customer was promised still true when two devices, an
old version, a slow network and an impatient hand are involved". This skill is that second question, asked
first.

## The method

1. **Say the promise in the customer's words.** One sentence, no code words. "Where I stopped on my laptop is
   where my phone starts." Not "pos records sync". If it cannot be said in one sentence, the feature is not
   understood yet.
2. **Break it on purpose** with the seven questions below. Write down each way it could be false.
3. **Prove it broken before fixing it.** A test that leaves the app in that state and FAILS on today's code.
   Then the fix; then the same test passes. A fix whose test never failed has proved nothing (both of today's
   sync fixes were found this way: the test failed first, with the very numbers Tharun saw).
4. **Look at the real thing.** The model in your head is not the customer's device. Read real books
   (`tools/extract.mjs`), read the real folder (below), run at a phone's speed (`e2e/feel.mjs`).
5. **Write it in the ledger** at the end of this file: the promise, what proves it, what is still not proved.

## The seven questions (how a promise breaks)

1. **Who else writes this?** List every place that writes the record, and mark each: the customer did
   something, or the machine did (on start, on opening, on receiving, on a timer, on a repair). A record that
   holds the customer's intent (their place, bookmarks, a title, a voice, what is archived) may be stamped
   "newest" only by the customer's own act on that device. *Opening a book wrote its place as the newest: the
   phone's 0:00 beat the laptop's real place.*
2. **What if it arrives late, twice, out of order, or never?** A device may show what it has so far; it must
   then say that more is coming. *7 of 21 books, with nothing to say 14 were on the way.*
3. **What if a device was on last week's version?** State an old version saved is still there after the
   update. A fix that only makes new mistakes impossible leaves the old ones in place. *The mark a device kept
   in the folder's list of changes had been moved past records it never took; no later version looked back.*
4. **What if it is opened and not used, half done, or interrupted?** Closing the app, a call, the screen
   locking, the network going, the tab hidden.
5. **What if the thing underneath changed?** A place and a bookmark are a sentence's number: when the text is
   read again the numbers mean other sentences. Anything counted in one version of a text is carried to the
   same words in the next (`src/lib/carry.js`), on every device that holds it.
6. **Which other number must agree with this one?** Every number on a screen is a claim. Two that a customer
   reads as the same fact must come from the same source, or the screen must say why they differ. *"0m done"
   beside "3m today": the listening was real, the place had been lost.* Read each screen and, for every pair
   of numbers, ask "can these contradict each other?".
7. **What does the customer see while it is not finished?** Empty is a statement ("you have nothing"). If the
   truth is "it is on its way", say that. *A signed-in phone waiting for its library showed the welcome page.*

## A fault he reports is a class, not a case

When Tharun reports something, the fix for that case is the smallest part of the answer. Before replying:

- Say which promise it broke and which of the seven questions would have found it.
- Ask the same question of every sibling: every other record, every other screen, every other number of the
  same kind. Use an agent for the sweep if it is wide (give it the rule, ask for file and line, verify what
  it returns yourself).
- Report what the sweep found, fixed or not. "I fixed the one you saw" is the loop he asked to end.

## Looking at a real folder (with his go-ahead, his own data, counts and titles only)

The app's page in his Chrome is the same device as the installed app. From it, with the app's own sign-in:
the list of files in the folder (`/drive/v3/files?spaces=appDataFolder`) and each document record say whether
the folder is whole (documents, deletions, text present for each). The device's own state is in IndexedDB
(`noesis-meta`, `noesis-sync`). Never print a file id, a token or an account id; never write to the folder.
This is how "the folder is complete, the phone is behind" was known in ten minutes instead of guessed.

## The ledger

What Noesis promises a signed-in customer, and what proves it. **Not proved** means exactly that: say so to
Tharun when it matters, do not round it up.

| Promise | Proved by | Standing |
|---|---|---|
| Every book I added is on every device I sign in on | `e2e/sync.mjs`: B gets the document and its text; a device that had lost its place still gets what it missed | Kept. Not proved on real Google Drive by me |
| While my library is still arriving, the app says so | "syncing N%" in the library; "Getting your library" when it is empty (seen in a phone-sized page with the state set by hand) | Kept, not in an automatic test |
| Where I stopped is where every device starts | `e2e/sync.mjs`: the place A stopped at reaches B; opening a book does not claim its place | Kept for listening and opening. See below for a text read again |
| A book I only opened is not "listened to" | listening is counted only while sound is really playing (`history.js` sounding), `heard.test.js` | Kept |
| My listening time is the same on every device | `e2e/heard-sync.mjs` | Kept |
| A book deleted on one device is gone on all | `e2e/sync.mjs`: a deletion on A reaches B | Kept |
| When a book's text changes, my place and bookmarks stay on the same words, on every device | `carry.test.js`, `marks.test.js`; `e2e/sync.mjs`: a text prepared again on A, the place and bookmarks on the same words on both; the upgrade run of 13 October (three real books, one device) | Kept |
| Bookmarks and their notes follow me | `e2e/sync.mjs`: a bookmark and its note made on B are on A; removed on A, it is removed on B | Kept |
| How fast I listen, my usual voice, how my library is sorted, autoplay next and archive-when-finished follow me (Tharun's decision, 13 October) | `e2e/sync.mjs`: the speed and the sort set on A are set on B | Kept. Text size and layout stay with the device, on purpose |
| The app I open is the newest, or it tells me a newer one is ready and lets me take it | `e2e/update.mjs` (7 checks): switches by itself at launch and in the background; "Check for updates" in Settings gets it while the app is in use; with the service worker's own file blocked, the new build is loaded directly; nothing newer, it says so. `/version.json` is the truth about the newest build | Kept on a computer's Chrome. **Not proved on a phone or in Safari**, and the launch that mends a stuck update by itself has no test |
| An option I switch on shows at once that it is on, or says why it cannot be | Operated on a phone-sized screen, 14 October (not an automatic test): vibration is felt the moment it is switched on, and a phone that will not vibrate is told so and the option stays off; changing the usual voice says what that changes and offers the book in hand; AI narration with no key says why it is dimmed | Kept for those. **Not proved on a phone**: that the pulses are felt (they were 8 ms, now 25 and more), the microphone options (slow down, pause, clearer), the lock screen's words, spoken commands, word-following with the built-in voice |
| Bookmarks made on two devices are all kept | `marks.test.js`; `e2e/sync.mjs`: one made on each device at the same time | Kept |
| I press Play once; if the audio is not ready it starts by itself when it is ("Play starts by itself") | `e2e/play-starts.mjs`, fresh launch each time: the app closed while making a book's audio; a sentence that could not be made at the place; only the place left to make. All three stayed "ready in 2 seconds" for ever before 14 October | Kept on a computer's Chrome. **Not proved on his phone** |

## The first sweep (13 October 2026): question 1 asked of every record, question 6 of every number

An agent listed every place the app writes a synced record without the customer doing anything, and every pair
of numbers on a screen that come from different sources. Each line was read in the code before it was acted on.

Fixed that day, each from the list and not from a report:

- Opening a book wrote its place as the newest (test: fails before, passes after).
- The same through another door: a sentence the player was waiting for arrived, and loading it counted as the
  customer moving. Fixed; **not proved by a test** (it needs a voice being made).
- Opening a finished book marked it unfinished, at the start, on every device (test: fails before, passes after).
- A text read again stamped that device's place and bookmarks as the newest. They are now sent as "the same
  place, carried", one tick after the record they came from (`sync.js` touchAfter, `library.js` derive), so
  anything listened to later on another device still wins. **Not proved across two devices.**
- At every launch: a title mended from the file's name, a retired voice replaced, and a one-time "send
  everything again" all stamped whole records as newest. The first two are now sent as mendings; the third is
  gone (every launch already sends what the folder lacks).

Fixed on 13 October after Tharun said "fix the found" (each with a two-device test in `e2e/sync.mjs` unless said):

- **A place and a bookmark say which text they are counted in** (`ver` in the record; `posVer`, `marksVer`,
  `textVer` on the device). One counted in a text a device does not hold is kept aside, not applied; a device
  that receives a newer text carries its own place and bookmarks to the same words (`library.js` carryHere);
  preparing a document again carries them too. Test: a text prepared again on A, the place and the bookmarks
  end on the same words on both.
- **Bookmarks are put together, not replaced** (`marks.js`): each says when it was made or written on, one taken
  away says when. Test: one made on each device at the same time, both on both.
- **Settings that are the customer's follow them** (`prefs.js`): listening speed, usual voice, sort order,
  autoplay next, archive when finished. Test: speed and sort set on A are set on B. The privacy page says so.
- A voice changed on another device no longer starts a book that was only open and waiting. **No test.**
- A place past the end of a text that became shorter is the last sentence, not "finished". **No test.**
- The speed reader, a tap on a passage in "ask the library" and a switch of language version write the place
  whole (no left-over part of a sentence, and "last listened" is now). **No test.**
- A document's `part` (a chapter as its own version) is told to other devices. **Not proved**: what a second
  device does with it was not looked at.
- The same book is the same length on every device: the first to have voiced twenty minutes of it says how long
  a letter takes (`spc`). **No test.**

Found and **not fixed**:

- The conversations had with a book in Ask stay on the device they were had on.
- Which AI service is used and the address of a custom voice service stay on the device (the keys always will).
- A document whose preparing is resumed when the app opens: its place is now carried and sent as worked out,
  but the resumed job itself still stamps the document's record.

Numbers (question 6), fixed on 13 October. The rule now: **every length of a document shown anywhere is how
long it takes this customer**, at the speed it would be heard at (the player's speed for the document in the
player, their usual speed otherwise: `src/lib/pace.js`). Listening already done ("listened today", the week)
is the clock's time and is never divided.

- Card length, done, left, the reader's header, the library's total, the strip, the listening page, the
  player's elapsed and remaining, a chapter's and a bookmark's time: all at that one pace. Read off a 390 px
  screen with three real books at 1x and 1.5x: header total = done + left = the cards added up.
- "Xm listened today" (not "Xm today", which read as progress), shown for any listening at all, on finished
  books too, so the cards add up to "Today".
- The strip and the listening page it opens count the same documents with one function (`heard.js` shelfOf).
- The listening page says "N in your queue" where it counted a different set from the library's "N documents".
- "Finished" counts each document once, and only on the device where the listening ended.

Still able to differ, and why (say so if asked; none is a contradiction a customer can see on one screen):

- Before about 400 letters of a book are voiced, its length is an estimate on the card ("~") and in the player.
- The player shows minutes and seconds, cards round to the minute.
- "N in your queue" leaves out a document still being prepared; the sidebar's Queue count includes it.
- "Finished only where the listening ended" rests on the player stopping and marking the book in one step
  (`player.js` finish): if that is ever made to wait in between, a finish is not logged. **No test guards it.**

## Play pressed once never started (14 October 2026, his report: "it says it is gathering but it never does")

The broken promise: "Play starts by itself". Question that would have found it: what if the app is closed in the
middle of something (a phone ends an app at will)? Three faults, one class (the wait counted made audio as unmade,
or the news that ended the wait was dropped), each with a failing case first in `e2e/play-starts.mjs`:
- A sentence's length was written 1.5 s after its audio and every new sentence restarted that timer, so a device
  making sentences quickly wrote no lengths at all until the book was done. Closed in between, the audio stayed
  and the lengths were lost; "ready" waited for those sentences for ever and nothing remade them. Now written at
  most every 1.5 s but always, and lost lengths are taken back from the audio records when a book is opened
  (this mends books already damaged on customers' devices).
- A sentence kept as silence (it could not be made) counted as still to come: a book stopped at it for ever.
- The sentence the player sat waiting on was made, loaded silently, and the pressed Play was forgotten.
