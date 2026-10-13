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

## A wait is designed too (2026-10-12)

Tharun pressed a voice's preview and "nothing happened for 20 to 30 seconds"; then he was shown "Ready to
play" over a bar a quarter full and said "as a customer I still don't understand it". He will not list every
case: the rule has to do it.

- A tap is answered at once. Work that takes time says so from the first moment, on the thing that was
  pressed: `Button`, `IconButton`, the player's Play and menu commands do this by themselves when their
  handler hands back a promise (`kit.jsx useBusy`, `nav.js during`). Write handlers so that they do.
- One set of words for a wait, everywhere (`tts.js voiceWait`, `readiness-math.js waitWords`):
  Downloading the <name> voice · Starting the <name> voice · Making the audio · Reading the document.
  Never "Preparing", never two names for one wait. A new kind of wait gets its words there, once.
- A bar measures exactly what the sentence above it names, or it sweeps (`Progress unknown`). A bar that
  measures something else is worse than none.
- The normal state has no status. A Play button that works is how "ready" is said: the reader's card
  appears only while something stands between the customer and playing, and says what happens next.
- Anything that starts by itself says what it is for (a voice downloading says which document needs it).
- A time is never promised that is not known ("a few seconds" was said about half a minute).
- Find the silent ones by being the customer on a slow line: a fresh profile with the network throttled
  (CDP `Network.emulateNetworkConditions`), and `node e2e/chaos.mjs --waits` (every tap timed on a
  slowed phone). Reading the code does not find them.

## Signing out looks like signing out (2026-10-12)

- Each account has its own shelf on the device (`src/lib/shelf.js`): library, audio, collections, settings.
  Signing out opens an empty Noesis (the welcome page); signing in brings the account's shelf back at once.
  Nothing is deleted; Settings → Storage can remove the libraries of signed-out accounts.
- The welcome page offers Sign in: that is where someone coming back looks.

## Colour carries data, never chrome (2026-10-12)

"It is just a curving bar... it could be adding colour. You can use colours." The page, its type and its
controls stay black, white and lime. Colour is allowed where it IS the information:

- Mood (`T.mood`): amber where the writing is brighter than the book's usual, blue where darker. The
  player's line has body (the space to the middle is filled), the heard part is lit, the dot takes the
  colour of the feeling it is in. The line is measured from the document's own usual tone (a cheerful book
  still has ups and downs) and is refitted to its width (a phone's line carries fewer turns).
- Each document has one colour, from its own cover (`bookcolour.js`), used wherever its listening is drawn.
- Insight is drawn where the customer already is, as bars: on the document's card and at the top of its
  reader (heard, today's stretch brightest, what is left cut into days at their pace), and above the
  library's list (today, the week by day and by document, the whole shelf). Not a screen to go and visit.
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
- Focus is one word as large as the screen carries it (its size comes from the screen's width), the pivot
  letter in lime on a spot marked by two ticks, on a light whose colour is the mood of the writing at that
  point: the same count as the player's line, so it means the same thing (amber brighter, blue darker, white
  even, and stronger the stronger the feeling). Under it the sentence, at a size that can be read. The word
  itself does not move: the eye rests on it.
- The word being said fills with lime from its first letter to its last, in the time the voice takes to say
  it, then lets the lime fade; said words are bright and words to come wait (`src/ui/Spoken.jsx`: Text and
  Focus use the one component). Never a whole-word switch of colour.
- A number says what it is. A place in a document is "done", not "heard" (a place can be jumped to); "heard"
  and "today" are only ever time sound really played. Seven days back from today is "7 days", not "this
  week". Under half a minute is "<1m", never "1m". Listening is measured from when sound starts to when it
  stops, to the second, and written down the moment it stops.
- Sign language is not drawn by Noesis. A sign language has its own grammar and word order; hand shapes drawn
  for each English word would be finger-spelt English, slower than reading, and wrong to a Deaf reader. What
  Noesis can truthfully give a reader who does not hear is in Focus and Text: the rhythm of the speech (the
  fill), its force (a word said with force is larger) and its mood (the light).
- "Your listening" is one page, opened by tapping the glance above the library (the glance is its door, not
  a second copy): how much, when (a bar a day or a month, split by document in that document's colour; tap a
  bar to narrow everything above the cards to it), what, how steadily, at what hour, on which days, how much
  of the library is left, on which devices. Every number is a sum or a count of the record (`lib/listening.js`,
  tested); a part with nothing true to say yet is not shown; nothing is estimated.
- Listening is the customer's, on all their devices: each device sends only its own record and every device
  shows the sum (`heard:<device>:<year>` in their Drive). Never merge two devices' records by overwriting.

## The habits of a generated interface (2026-10-13: "remove all AI basic slop designs")

Checked against two open lists of what marks an interface as generated (pixelslop's pattern catalogue and
Impeccable's craft floor). What Noesis had, and what it has instead:

- **Monospace as a costume.** Labels, small print and figures were in JetBrains Mono, in capitals with wide
  tracking. They are plain words in the page's own face now (`label`, `eyebrow`, `T.mono` in theme.js; figures
  line up because the page sets tabular numerals). `T.code` is the real monospace: for code and readouts only.
- **A kicker above a heading.** The library said "YOUR LIBRARY · 7 DOCUMENTS" over its title. The title comes
  first; what it holds is said under it.
- **Big number over small label, in a row of boxes.** The four facts on "Your listening" are lines of a list.
- **A gradient with a glow as a cover.** A document without a cover has one flat colour, its own.
- **Glow as decoration.** The mood line keeps its colour and loses its halo.
- **The same entrance on everything.** Rows of a list no longer rise one after another: a page or a sheet
  arrives, and what is on it is simply there.
- **Bounce.** Springs settle; they do not wobble (`T.spring` bounce 0.1, `T.settle` 0).

Kept on purpose, though the lists flag them: the pure black page and the lime accent (the brand, Tharun's own
rule), and the welcome page exactly as it is ("Landing Page is fine", Tharun, same day): it has its OWN small
type and entrances, written in Landing.jsx, so the app can change without changing it.
The concept map was removed the same day ("it's useless at Noesis").
