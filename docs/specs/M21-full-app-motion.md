# M21: Motion across the whole app (Tharun, 2026-10-12: "Our entire Noesis should be running this motions
# with full potential. No this or that, not some not just now fixes. Full App.")

Frontend work: Opus does this itself (not delegated). Rules: `.claude/skills/motion/SKILL.md`; API notes:
`.claude/skills/motion/references/motion-dev.md`. Every item is verified with `node e2e/sweep.mjs` (phone and
wide) and a mid-transition screenshot. Each motion has a PURPOSE written beside it; no decoration.

## Done already (live)
- Pages: exit then enter, direction-aware (`custom`), route frozen for the leaving page, sliding area clipped.
- Back closes the top overlay everywhere (sheets, reader panels, library search).
- Sheets: pulled down by the handle (drag controls). Menus, toasts, buttons: press 0.96, short fades.
- Player: cross-fades when it only changes shape. Status island: layout animation, text slides.
- Voice display. Reduced motion: `MotionConfig reducedMotion="user"` + CSS backstop, spinner kept.

## Slice 1, live 2026-10-12
Item 1 (timed springs `T.spring` / `T.press` / `T.settle`, `MotionConfig` default), item 2 except the shared
cover between library and reader (pages use `mode="wait"`, so the two covers are never on screen together:
it needs overlapping pages, not done), item 3 (already there), item 4 view cross-fade only, item 5 cover as a
shared element between the small and full player, item 7. Sweep clean, QA 41/41. Not seen with my own eyes:
the shelf name in the bar (the test library is too short to scroll).
Left: 4 (progress line, sentence fade, side panels), 6, 8, 9, 10, and the library-to-reader shared cover.

## Slice 2, live 2026-10-12
Shelf chips: one white pill that slides to the chosen shelf (`layoutId`), chips press. Library search bar and
the reader's find bar ease in and out (`AnimatePresence`). The reader's cover settles in on arrival (a stand-in
for the shared cover). Sweep clean, QA 41/41.
Left: reader progress line, sentence highlight that moves (sentences are inline, so `layout` cannot do it:
needs a measured overlay), side panels on wide screens, sheet contents and scrim tied to the drag, the Add
drop zone, count-up numbers, the logo draw-on, the library-to-reader shared cover (needs overlapping pages),
and a last audit for anything that still pops.

## Slice 3, live 2026-10-12
The dark behind a sheet lightens as the sheet is pulled down. A reading line under the reader's header fills
with the scroll. Results, errors and status lines that arrive late ease in (`Appear` in the kit: library
ask, briefing, concept map, listening, focus-sound volume, the three ways to add a document, voice and AI
test results). Listening totals count up (`Count`). On a wide screen the contents panel slides in and the
text glides over when a side panel opens (measured only then). Found by the sweep and fixed: on desktop,
Back from a reader sheet left the document; the desktop sidebar did not scroll and ran under the player.
Sweep clean on phone and desktop, QA 41/41. Not seen with my own eyes: the contents panel sliding (the test
documents have no headings), the sheet's dark changing during a real finger pull.

Decided against, with the reason:
- A highlight that slides from sentence to sentence. Sentences wrap over several lines, so a moving box
  would need to be measured and redrawn inside text that is built and discarded as it scrolls; the word
  highlight already moves within the sentence.
- The contents of a sheet rising one by one after the sheet lands. The sheet arriving is the motion; a
  second one delays reading. Lists that arrive later (an equation's parts) do stagger.
- A logo that draws itself. The wordmark is a filled shape, not strokes; drawing it on would need new art.
Left: the library-to-reader shared cover (needs two pages on screen at once), and the frame-by-frame study
against the ACS categories page.

## Slices 4 and 5, live 2026-10-12: motion on everything (Tharun: "every icon, every button, every text")
Built at the source, so it reaches every screen:
- **Icons** (`src/ui/icons.jsx`): every icon answers the press of its button, or the pointer on a computer,
  with a movement that says what the button does (arrows lean, refresh turns, the bell rings, the bin
  rattles); when the icon in one place changes it draws itself in. The button passes `tap` / `hover` down.
- **Buttons** (`kit.jsx`): press depth by size (`T.tap`: card 0.985, row 0.98, control 0.96, icon 0.9); a
  label that changes slides to its new text (`Swap`), as do shelf titles, the speed and the citation count.
- **Rows**: menu rows, sheet rows (voices, passages, citations, mentions, listening totals) and the reader's
  title block follow one another (`rowIn`, first ten only; the delay is on the entrance, never on the press).
- **Sheets**: contents settle a moment after the sheet. **Charts and maps** are uncovered (`Reveal`); sound
  bars grow in turn. **Status lines** on cards fade from one state to the next.
- **Cover**: one object. It flies from the library card to the reader and home again (`coverflight.js`: a
  copy fixed to the screen, because the two pages are never on screen together). Measured: lands exactly.
- **Sentence light**: fades from sentence to sentence (boxes measured from the sentence's own lines, drawn
  behind the text). **Sidebar marker** slides. **Wordmark** is revealed once on first run.
All three items listed above as decided against were built after all, each in a form that keeps to
transform and opacity. Sweep clean on phone and desktop, QA 41/41.
Deliberately still: the words of the document itself as you scroll (reading comfort, and thousands of
paragraphs), the contents list rows (hundreds, re-rendered every sentence), numbers that tick every second.
Not seen with my own eyes: any of this on a real phone. (The desktop contents panel and the page pane were
seen sliding in on 2026-10-12, in the side-by-side walk.)

## To do, in this order (most seen first)
1. **One motion system** (`src/lib/motion.js`): named transitions (`press`, `quick` 0.16 s, `page` 0.24 s,
   `sheet` spring by duration with bounce 0, `settle` layout spring) and variants (`rise`, `fade`,
   `list`/`item` with `delayChildren: stagger(0.04)`); `MotionConfig transition` default in App. Replace the
   scattered inline transitions and the slow `T.spring` (420/38 has a long tail) with these.
2. **Library**
   - Cards arrive in a short stagger the first time (purpose: the eye is led down the list); never again on
     return from a document (purpose: returning must feel instant).
   - Sorting, filtering, archiving, deleting: cards move to their new places (`layout="position"` inside
     `AnimatePresence mode="popLayout"`), so the customer sees WHERE things went.
   - Cover as a shared element: the card's cover grows into the reader's cover (`layoutId={'cover-' + id}`)
     and back (purpose: the document you tapped is the document that opened).
   - Header title shrinks into the bar as the list scrolls (`useScroll` + `useTransform`, no renders).
3. **Tab bar**: the active marker slides between tabs (`layoutId`), icons press.
4. **Reader**
   - Text | Pages | Focus: the views cross-fade (`AnimatePresence mode="wait"`), the switch pill already slides.
   - A thin reading-progress line under the header tied to scroll (`useScroll`, `scaleX`).
   - The active sentence: the highlight fades between sentences instead of snapping.
   - Panels on a wide screen slide in from the side they dock on.
5. **Player**: small ↔ full as shared elements (cover and title by `layoutId`), play/pause morph kept;
   scrubber thumb grows while held (`whileTap`/`whileDrag`).
6. **Sheets and their contents**: contents rise in a 30 ms stagger after the sheet lands; drag-down also on
   the header area of long sheets; the scrim follows the drag (opacity tied to the sheet's `y`).
7. **Settings**: cards rise once as they scroll into view (`whileInView`, `viewport={{ once: true }}`);
   toggles and segmented controls already spring.
8. **Add a document**: the drop zone answers a dragged file (scale + border), progress of reading and
   translating as one continuous bar that morphs into "Ready".
9. **First-run screen**: keep the staggered rise; add the logo draw-on once.
10. **Audit**: grep every `motion.` and every conditional render that pops in without a transition; every
    list that reorders; every number that changes (count-up for durations and percentages by `useSpring`).

## Not doing, and why
- `LazyMotion`: the app needs drag and layout (`domMax`), so the saving is about 9 kb of 34; not worth the
  `m` rewrite now.
- Glass, blur, parallax: pitch-black surfaces, and blur is the most expensive thing to animate.
