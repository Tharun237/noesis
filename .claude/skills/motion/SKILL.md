---
name: motion
description: Rules for every animation, transition, sheet, menu, page change and Back behaviour in Noesis. Use whenever UI is added or changed (a new screen, sheet, panel, list, button, status), whenever something "jumps", "breaks", "flickers" or "feels laggy", and before calling any frontend change done. Tharun's rule (2026-10-12): these are applied wherever motion or navigation is involved, no exceptions.
---

# Motion and navigation in Noesis

Distilled from four skills in `iart-ai/web-animation-skills` (MIT): `page-transition-animation`,
`micro-interaction`, `60fps-animation`, `accessible-animation`. Their GSAP, Lottie, glass and video skills
do not apply here: Noesis animates with `motion/react` only, and its surfaces are pitch black.

## 1. Only transform and opacity move
- Animate `x`, `y`, `scale`, `rotate`, `opacity`. Never `width`, `height`, `top`, `left`, `margin`,
  `padding`, `box-shadow`, `filter`, `background-position`.
- A size or position change is done with layout animation (`layout`, `layout="position"`, `layoutId`),
  which is transforms underneath. Inside a `layout` element, children that must not stretch get
  `layout="position"`; radius goes in `style` so it is corrected.
- No per-frame `getBoundingClientRect` / `offsetWidth` after a write. Read first, then write.

## 2. Speeds
- Press, toggle, menu, toast: 100 to 250 ms. Press feedback is instant: `whileTap={{ scale: 0.96 }}`.
- A page or a sheet: 200 to 400 ms. Leaving is faster than arriving: exit ease-in (about 110 to 150 ms),
  enter ease-out (`T.ease`, about 220 ms).
- A spring that takes more than about 300 ms to settle is too soft for UI: use a duration instead.
- Something already on screen that only changes shape (the small player becoming the full one) cross-fades
  in place. It does not replay its entrance.

## 3. Pages: one leaves, then one arrives (src/App.jsx)
- `AnimatePresence mode="wait" initial={false}` around ONE keyed `motion.div`
  (`key = view + docId`), which is a direct child with `initial`, `animate`, `exit`.
- The leaving page must keep showing its own content. Pages read their route with `useRoute()`
  (src/lib/route.js), which is frozen in context for the page that is animating out. A page that reads
  `ui.docId` from the live store flashes the next page's content while it leaves.
- Scroll is set when the new page arrives (`PageScroll`), never while the old one is still visible.
- Lazy pages inside it get `Suspense fallback={null}`.

## 4. Back closes the top thing (src/lib/nav.js)
Android's back gesture is the customer's main control. Whatever opened last is what Back closes.
- A sheet: `openSheet(name)` / `closeSheet()`.
- A panel inside a page (reader contents, reading settings, bookmarks, Ask): `pushPanel(name)` /
  `popPanel()`, with the page listening to `popstate`.
- The library search: `openSearch()` / `closeSearch()`.
- Leaving from inside any of these (`go(view, id)`) REPLACES its history entry. Stacking the new page on
  top makes Back return to the old page with the overlay open again.
- New overlay? It gets a history entry the same way, or Back will leave the page behind it.

## 5. People who asked for less motion
- `MotionConfig reducedMotion="user"` wraps the app: movement and scale stop, fades stay.
- index.html holds the CSS backstop (`0.01ms`, not `0s`, so end events still fire) and re-enables the
  spinner (`[data-spin]`): a spinner says "working" and stays.
- Smooth scrolling in code goes through `scrollBehavior()` (src/lib/motion.js).
- Do not remove all motion: a fade or a focus ring is orientation, not decoration.

## 6. Check before saying it is done
1. `node e2e/sweep.mjs` and `node e2e/sweep.mjs wide` on a freshly started dev server (port 5180). It
   wanders like a customer (into a document, back, menus, sheets, panels, search, rapid taps) and records,
   every frame for 800 ms after each action, whether the tab bar or player moved, whether the page
   overflowed sideways, whether an error was logged, and where history ended up. A line marked `!!` is
   something to look at. The player rising once when playback first starts is expected.
2. Look at one mid-transition screenshot (`.qa-out/sw-NN-mid.png`): no leftover page, no half-drawn frame.
3. `node e2e/qa.mjs` (it asserts that Back from a new document shows the library, not the Add sheet).
4. With reduced motion emulated, a sheet's vertical offset must stay 0 while it opens.

## The shared pieces (use these; do not write one-off motion)
- `Icon` (`src/ui/icons.jsx`): add a new icon's movement to `MOVE`. Icons move only inside a button that
  passes `tap` / `hover` down: `Button`, `IconButton`, menu rows, or any motion element with
  `variants={{ tap: ... }} whileTap="tap" whileHover="hover"`.
- `T.tap` (`src/theme.js`): how far a pressed thing gives way, by size. `T.press` for the press itself,
  `T.spring` for things that land, `T.settle` for things that move to a new place.
- `Swap` (kit): text that changes in place. `Appear` (kit): anything that arrives late. `Count` (kit): a total.
  `rowIn(i)` (kit): rows of a list that has just appeared. `Reveal` (kit): a drawing on plain black.
- `coverflight.js`: a shared element across two pages that are never on screen together. `Sheet` (kit) already
  settles its contents and ties its dark to the pull.
- Fixed things at the bottom of the screen stand on `var(--dock)` (player plus status strip), set by App.
- Never put an entrance delay in `transition` on something that can be pressed: it delays the press too. Put it
  inside `animate.transition`.

## Cost: what may be a Motion component, and what may not (measured 2026-10-12, e2e/feel.mjs)

When every icon, button and label was its own Motion component, more than half of all script time on a slowed
processor was inside the Motion library and opening a book ran at 24 frames a second. So:

- **Small reactions are the style sheet's job** (`src/ui/press.js`, built from the theme's numbers): a press
  (`data-press`, depth by `--press`), an icon's movement (automatic inside a `data-press`), a label that changes
  (`Swap`), a status that changes (`data-fade`), anything that arrives (`data-rise`, `rowIn(i)`, `Appear`), the
  pulsing dot, and the two things tied to scrolling. They run on the compositor and cost nothing per element.
- **Motion is for what only it can do**: pages, sheets and their drag, menus, things leaving (`AnimatePresence`),
  shared elements (`layoutId`), the flying cover, the sentence light, counting numbers.
- **Movement is written as one `transform`**, never as separate `x` / `y` / `scale`, wherever the page is busy
  at the same time (a page arriving): one `transform` is run by the compositor; separate values are animated
  by script on every frame, on the thread that is building the page. Take the transform off at rest
  (`transitionEnd: { transform: 'none' }`) or it traps everything `position: fixed` inside it.
- **Every `layout` / `layoutId` element has a `layoutDependency`**: without it Motion measures the element on
  every re-render of its parent. Cards glide to a new place on desktop only.
- **Nothing slow in a render that runs often**: the player re-renders every tick. One `Intl` formatter made
  once, never `toLocaleTimeString` in a render.
- **How much a thing moves** is `T.enter` (rise, duration, easing, stagger) and `T.tap` (press depth), from the
  ACS pages. The first values were a fifth of a second and 8 px: Tharun could not feel them at all.
- **The customer can turn motion up or down** (Settings, Motion). A phone in battery saver asks for less motion;
  the card says so, and Full overrides it.

## A transition is judged by its film, not by its two ends (2026-10-12, e2e/film.mjs)

Tharun's recording of Text | Pages | Focus: the white pill left its control and flew in from the bottom of the
screen for 0.7 s, an empty grey frame sat between two views, and the page moved a second time after it had
arrived. Both ends of every one of those were correct; no photograph of a screen at rest could show them.
`node e2e/film.mjs [phone|wide]` films each transition frame by frame into `.qa-out/film-*.png`. Open every
picture after any change to motion, navigation, a view, a sheet or a lazy-loaded part, and follow each moving
thing from where it was to where it lands.

- **A marker is placed by arithmetic, never by measuring the page.** The pill of a segmented control and the
  bar over a tab are ONE element with `data-slide`, moved by `translateX(place * 100%)` (kit.jsx `Segmented`,
  `TabBar.jsx`). A `layoutId` marker inside a pinned bar (sticky or fixed) is measured against the page, and
  when the page's scroll changes with the choice it flies across the screen. Where sizes are not equal and a
  shared layout is the only way (the sidebar's shelf marker), its pinned holder is a `motion` element with
  `layoutRoot`.
- **One view replaces another at once, and the new one rises in** (`data-rise="view"`). Not "the old one
  fades, wait, the new one fades in": the wait is an empty frame, and everything outside the waiting part
  (the title block, the bar) has already changed.
- **The new view arrives AT its place.** Scroll is set in a layout effect before the first paint, or with
  `behavior: 'auto'` the first time (`placed` in Reader, `fresh` in PageView). Arrive-then-scroll is a second
  movement. Gliding is for following the voice afterwards.
- **A bar keeps its height in every view.** A note about one view goes in that view's content, not in the bar:
  a bar that grows moves everything pinned under it.
- **A lazy-loaded part is `later()` (src/ui/later.jsx), not `React.lazy`, and is fetched in a quiet moment**
  (`whenIdle(Part.fetch)`). React shows the empty fallback first even for a part already fetched, then holds
  the real thing back about 300 ms: that was a third of a second of black on the first tap on Settings.
- **While something is being fetched or opened, its shape stands in its place** (a page-shaped box for Pages),
  never nothing.
- **A copy that flies between pages lets go if its landing place moves** (`coverflight.js`): it is fixed to the
  screen, its landing place is on the page.

## What the browser will and will not move by itself (measured 2026-10-13, on an idle page and in the app)

"Only transform and opacity" is necessary, not sufficient. These were each measured with the browser's own
counters (style recalculations a second, main-thread work a second) while the voice read:

- **A moving `::before` / `::after` inside a moving element is worked out on every frame** by the thread that
  builds the page (145 recalculations a second against none). Put what moves in a real element; a pseudo-element
  may draw the content (`content: attr(...)`) as long as it is not the thing animated. (`[data-lit]`, press.js.)
- **An animation started several times a second spends most of its short life on that thread.** A landing for
  every spoken word (three a second) doubled the work of reading. Per word: nothing moves but the lime's own
  wipe. Something continuous is ONE animation, started once (`[data-breathe]`).
- **A clock is read when what it waits for is due, never on every frame.** A `requestAnimationFrame` loop makes
  the page build a frame sixty times a second, and every running animation is worked out again on each. The
  word clock (litword.js) wakes when the word ends; the player's sentence follower when the sentence ends.
- **The frame counter is itself a frame loop.** To measure the page's own work, measure without it
  (`QUIET=1`), then count late frames in a separate run. And check the voice's clock moved during the run: the
  first three measurements of this change were of a paused page.
- Reading aloud, on a phone four times slower than the laptop: Text 191 ms of work a second (was 246), Focus
  157 (was 213), no frame over 34 ms in either. A change to either view is measured against the build before it.
