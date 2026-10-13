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
| When Noesis reads a book better, my place and bookmarks stay on the same words | `carry.test.js`; the upgrade run of 13 October (three real books) | Kept on the device that reads it again. **Not proved across devices**: a place written against the older text by a device that has not yet received the new text is taken as a sentence number of the new one. Places and bookmarks need to say which version of the text they are counted in |
| Bookmarks and their notes follow me | `e2e/sync.mjs`: a bookmark and its note made on B are on A; removed on A, it is removed on B | Kept |
| What I set (speed, voice, how the library is sorted) follows me | nothing: settings are kept on the device only | **Not promised yet**: decide with Tharun which settings are the customer's and which are the device's |

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

Found and **not fixed** (say so when it matters; do not let these be discovered by Tharun):

- A place or bookmark does not say which version of the text it is counted in (ledger above).
- A voice changed on another device can start a book that was only open and waiting (`player.js` voiceChanged):
  not verified by reading it through.
- A document whose preparing is resumed when the app opens re-stamps its place from when preparing began.
- A place past the end of a text (after a re-read made it shorter) marks the book finished on opening.
- The speed reader, a tap on a passage in "ask the library", and switching language version move the place but
  leave the old part-of-a-sentence and the old "last listened" time with it.
- Bookmarks are one record for the whole book: two devices adding one each in the same minute lose one.
- A version of a document that is one chapter (`part`) is not told to other devices as that chapter.
- Not kept in step at all, and a customer would expect it: listening speed, the default voice, how the library
  is sorted, autoplay next, archive when finished, full text or summary, skip figures, the speed reader's
  speed, which AI service (not its key), the address of a custom voice service, and the conversations had with
  a book in Ask. Tharun decides which are the customer's and which are the device's.

Numbers that can contradict each other (question 6), none fixed yet:

- "X done" (from the place) beside "Y today" (from the listening log): after going back, after finishing, in a
  translated version.
- The library's "Today" and the sum of what the cards say today (cards hide under a minute, and when finished).
- The player's elapsed time (the audio's seconds) and its time left (divided by the speed): at 2x they do not
  add up to the length; a chapter's time in the contents is divided by the speed, the player's is not.
- "left" on a card (from the place, at the default speed) and "left" in the player (at the speed being played).
- "done / left" in the library strip (the documents shown, filters and archived included) and in the listening
  page it opens (every unarchived document).
- "N documents" in the library header (archived and still-preparing included) and in the listening page (not).
- "Finished" in the listening page counts every time a book became finished on this device, again if it was
  finished twice, and still after the book is deleted.
- The same book has a different length on each device (each measures its own voice's speed).
