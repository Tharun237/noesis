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
