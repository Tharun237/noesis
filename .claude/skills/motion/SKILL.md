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
