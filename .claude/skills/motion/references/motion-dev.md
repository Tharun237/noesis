# Motion for React: the parts Noesis uses (read from motion.dev/docs on 2026-10-12)

Source pages: /docs/react-animate-presence, /react-drag, /react-layout-animations, /react-transitions,
/react-gestures, /react-scroll-animations, /react-reduce-bundle-size. Everything imports from `motion/react`.
These are working notes in our own words; go back to the pages for anything not here.

## AnimatePresence (things arriving and leaving)
- Tracks its DIRECT children; each needs a stable, unique `key` (never an array index). It must itself stay
  mounted: the condition goes inside it.
- `mode`: `"sync"` (default, both at once), `"wait"` (the old one finishes leaving first; ONE child only),
  `"popLayout"` (the leaving one is lifted out of the flow so siblings close up at once; pair with `layout`;
  parent needs a non-static `position`; a custom component child must forward its ref).
- `initial={false}`: no entrance for what is already there on first render.
- `custom={value}` + function variants: the way to tell a LEAVING child something new (it can no longer get
  props). Used for direction-aware pages: `enter: dir => ({ x: dir * 28 })`.
- `onExitComplete`, `propagate`, hooks `useIsPresent()`, `usePresence()`, `usePresenceData()`.

## Layout animation (things changing size or place)
- `layout` animates any layout change made by a render, with transforms. `layout="position"` moves without
  stretching (text, images). `layoutId` joins two elements across mounts: the new one grows out of the old
  (shared element). Wrap in `AnimatePresence` to animate back.
- `LayoutGroup` for siblings that affect each other but render separately. `layoutScroll` on a scrolling
  parent, `layoutRoot` on a `position: fixed` parent, so offsets are measured right.
- Radius and shadow are only corrected when set through `style` (or an animation prop). Prefer padding over
  `border` on a layout-animated box. Not for `display: inline`. Not for SVG. Timing: `transition={{ layout: {…} }}`.
- Make the layout change through `style`, never through `animate`.

## Gestures
- `whileTap` (press), `whileHover`, `whileFocus` (same rules as `:focus-visible`), `whileDrag`, `whileInView`.
  Tap is keyboard-accessible (Enter). A tap inside a draggable parent cancels after 3 px of movement.
- For pan or drag to work by touch, the element needs `touch-action` set (we use `touchAction: 'none'` on a
  sheet's handle only).

## Drag
- `drag="y"`, `dragConstraints={{ top: 0, bottom: 0 }}`, `dragElastic` (number or per side),
  `dragMomentum`, `dragDirectionLock`, `whileDrag`.
- `useDragControls()` + `dragListener={false}`: start the drag from one part only
  (`onPointerDown={e => controls.start(e)}`), so scrolling the rest is not a drag.
- `onDragEnd(event, info)`: `info.offset` (from the start), `info.velocity`, `info.point`, `info.delta`.
  Our sheet rule: close when `offset.y > 110` or `velocity.y > 600`.

## Transitions
- Tween: `duration` (default 0.3), `ease` (names such as `easeIn`, `easeOut`, `circOut`, `backOut`,
  `anticipate`, or a cubic-bezier array). Spring: either physical (`stiffness`, `damping`, `mass`) or timed
  (`duration` / `visualDuration` + `bounce`, 0 = no overshoot); the physical ones override the timed ones.
- Per value: `transition: { default: { type: 'spring' }, opacity: { ease: 'linear' } }`.
- Children: variants + `delayChildren: stagger(0.05)` (also `stagger(0.05, { from: 'last' })`), `when:
  'beforeChildren'`.
- `MotionConfig` sets a default transition and `reducedMotion="user"` for everything inside.

## Scroll
- `whileInView` + `viewport={{ once: true }}` for things that appear as they scroll in.
- `useScroll()` gives `scrollY`, `scrollYProgress` (0 to 1); with `target` + `offset` it tracks one element.
  `useTransform(value, [in], [out])` maps it to a style; `useSpring` smooths it; `useMotionValueEvent` reacts
  to it. Scroll-linked values run on the browser's own scroll timeline where possible: no React renders.

## Size
- The full `motion` component is about 34 kb. `LazyMotion` + `m` (`motion/react-m`) starts at about 4.6 kb
  and loads `domAnimation` (+15 kb: animate, exit, tap/hover/focus) or `domMax` (+25 kb: adds drag and
  layout). Noesis uses drag and layout, so it needs `domMax`; the saving would be small. Not adopted.
