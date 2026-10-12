---
name: design
description: Review and design every Noesis screen the way Apple's designers would. Use before adding or changing any screen, control, menu, sheet, label or icon, whenever Tharun says something looks wrong, duplicated, confusing, cluttered or "not Apple", and as a whole-app audit (e2e/tour.mjs photographs every screen). Grounded in Apple's Human Interface Guidelines.
---

# The Apple eye

Tharun, 2026-10-12, looking at the reader on his laptop: "What is Both, and the right side is just showing an
image? Why are there two three-dot icons? Can't you integrate the emotional arc into the player's slider?
Think like Apple's design team. And do this for the entire Noesis."

Every one of those was the same fault: features placed NEXT to each other instead of one thing designed.
Apple's guidelines, in their own words (Human Interface Guidelines, via the open `apple-hig-skills` summaries):
"Prioritize content over chrome." "Choose items deliberately to avoid overcrowding." "Prioritize only the most
important items for inclusion in the main toolbar area." "Group toolbar items logically by function and
frequency of use." "Rarely used actions belong in menus." "Add a More menu to contain additional actions."
"Animation should communicate meaning and spatial relationships." "Every interactive element needs an
accessible label."

## The questions to ask of every screen (in this order)

1. **What is this screen for?** One sentence. Everything on it serves that, or it goes into the More menu, or
   it goes away. The reader is for reading and listening; the document is the content, the rest is chrome.
2. **Is there exactly one of everything?** One More menu ("…") per screen. One place for each command. One
   meaning for each icon: the same symbol must never do two different things on one screen (a bookmark that
   opens a list beside a bookmark that adds one), and two different symbols must never do the same thing.
3. **Does every name say what the customer gets?** "Both" says nothing. A name is a noun or a verb the
   customer already uses: Text, Pages, Original page, Sleep timer. If a control needs a sentence to explain
   it, the design is wrong, not the label.
4. **Is anything on screen dead?** Whatever is shown follows what the customer is doing or answers a tap. A
   page of the book that sits on page 1 while the text is on page 40 is a picture, not a feature. If it cannot
   be true, it says why, in words, in its own place.
5. **Does information live where it is used?** The book's emotional arc is a fact about the timeline, so it
   belongs IN the timeline (the scrubber), not in a sheet to visit. A fact that needs its own screen is
   usually a fact in the wrong place. Before adding a sheet, ask what existing control it could live inside.
6. **Is the toolbar only what is used most?** Five items is plenty, seven is the limit. Group by function,
   order by frequency, the rest behind the one More menu. A mode switch is not the place for layout options:
   a side pane is toggled by its own button (like Contents), it is not a fourth mode.
7. **Does it hold together at every size?** Nothing scrolls sideways. No text is cut off without an ellipsis.
   Nothing sits under a bar. The same control is in the same place on phone and desktop unless the screen
   forces otherwise.
8. **Does the motion mean something?** See `.claude/skills/motion`: where it came from, where it went, what
   changed. And it must not cost the phone its smoothness.
9. **Empty, loading, failed, unavailable:** each says what is true and what to do, in one or two lines.

## How to run an audit

```
npx vite --port 5180 --strictPort --host        # fresh dev server
node e2e/tour.mjs                               # photographs every screen, sheet and menu: .qa-out/tour-*.png
```
Then `node e2e/film.mjs` (every transition, frame by frame: `.qa-out/film-*.png`).
Open every picture. For each, answer the nine questions in writing, list the faults, fix them at the source
(a shared component, not one screen), then run the tour again and look again. Then `e2e/chaos.mjs` and
`e2e/feel.mjs` (`.claude/skills/customer`): a design that breaks under a fast customer, or stutters on a
phone, is not finished.

## Decisions already made this way (do not undo without a better reason)

- The reader's views are Text, Pages and Focus. The original page beside the text is a side pane with its own
  toolbar button (wide screens), not a mode. It follows the voice while playing and the reader's scrolling
  while not.
- One More menu per screen. In the reader it is the document's (top right). The player has no "…": its extra
  is the sleep timer, shown as what it is (a moon).
- A bookmark icon adds or removes a bookmark on the sentence being read. The list of bookmarks is in the
  document's More menu, not behind a second bookmark icon.
- The player's progress line is the book's emotional arc (English documents). There is no separate arc chart.
- Design values come from `src/theme.js`; the look is ACS monochrome, pure black, lime for highlights only.
- Settings is a short list of sections (Account, Voice, Listening, Sounds and haptics, AI, Storage, About). Each row says what the section is set to; each section is its own page on a phone and a page beside
  the list on a wide screen. A setting lives in exactly one section and nowhere else (not in a menu as well).
- A document has ONE menu, the same on its library card and in the reader: how it is heard | where it is
  kept | take it out | delete. The reader puts its own tools (find, bookmarks, hard words, float) above it.
- A menu is drawn on the page itself (a portal), never inside its button's holder: a card that clips its
  corners cut it off after one row. It closes when its own button moves, not whenever something scrolls.
- Adding is an action (a button in the library's bar), not a place (a tab). The phone's tabs are Library,
  Search and Settings; tapping a tab while a section is open inside it returns to the tab's first page.
- The phone's library bar has no account picture: the account is the first row of Settings. On a wide screen
  the sidebar keeps it because it also says whether the library is synced.
- On a phone the reader's bar holds what is used most; Find is in the document's menu there.
- Two rows of one menu never share a symbol, and a symbol means one thing on a screen.
- The title block (cover, title, notes about the document) opens the Text view only. Pages are the document
  itself (page 1 is its own cover) and Focus is one word: neither repeats it.
- The original page beside the text (wide screens) is off until asked for, and offered only for a document
  whose pages are linked to its sentences. Beside an unlinked document it could only guess the page: Tharun
  asked what "that raw PDF beside the text" was for, and for his book it was for nothing.
- Transitions are part of the design: see "A transition is judged by its film" in `.claude/skills/motion`.
- An empty library is the landing page (`src/ui/Landing.jsx`), with none of the app's bars around it: no
  sidebar, no tab bar, only the wordmark, Settings and Add. It is one idea to a screen: what it is and the
  thing itself (a document being read, the lime word moving), what it does (a paragraph lit word by word as
  the page is scrolled), three chapters (made on your device; three ways to follow, with the real switch
  working; ask the document), and the way in once more. Every claim on it must be true of the app as it is.
  Its motion is the browser's own (one keyframe rule for the spoken word, scroll-driven animations for the
  rest): no script runs while it scrolls. `e2e/tour.mjs` photographs it first, from a thrown-away profile.
- No setting for motion. It is full for everyone; if it is not smooth on some phone, the motion is what gets
  fixed. A setting that asks the customer how much the app should move says the app could not decide.
- The reader's menu is about reading the document (find, bookmarks, hard words, float, voice, language,
  export). Keeping it (rename, collection, archive, delete) is the library card's menu.
- A spoken command is plain speech, anywhere in a short sentence, with no name to say first.
