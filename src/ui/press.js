// The small reactions: a button giving way under a finger, its icon leaning the way it points, a label
// sliding to its new text, a status fading to the next. There are hundreds of these on a screen, so they are
// done by the browser's own compositor from ONE style sheet, built here from the theme's numbers, and not by a
// Motion component each.
//
// Why: measured on 2026-10-12 with the processor slowed four times (e2e/feel.mjs), when every icon, button and
// label was its own Motion component, more than half of all script time was inside the Motion library and
// opening a book ran at 24 frames a second with a 217 ms stall. Tharun on his phone: "lagging and not
// optimised". Motion stays for what only it can do: pages, sheets, shared covers, lists that reorder, drag,
// scroll-linked values. A press is not one of those.
//
// How to use: put `data-press` on anything pressable (set `--press` in its style for how far it gives way:
// T.tap.card, .row, .control, .icon); icons inside it move by themselves (see MOVE). `Swap` and `Icon` use the
// rest. Reduced motion is handled by the rules in index.html, which shorten every transition and animation.
import { T } from '../theme.js'

const LEAN = 4 // px an arrow leans
// What each icon does when the thing it sits in is pressed (or pointed at, on a computer): a movement that
// says what the button does.
const MOVE = {
  back: `translateX(-${LEAN}px)`, prev: `translateX(-${LEAN}px)`, next: `translateX(${LEAN}px)`, send: `translate(${LEAN}px, -${LEAN}px)`, list: 'translateX(2px)', toc: 'translateX(2px)',
  up: `translateY(-${LEAN}px)`, upload: `translateY(-${LEAN}px)`, folder: 'translateY(-2px)', file: 'translateY(-2px)', bookmark: 'translateY(-2px) scale(1.14)',
  down: `translateY(${LEAN}px)`, download: `translateY(${LEAN}px)`, install: `translateY(${LEAN}px)`, archive: 'translateY(2px)',
  refresh: 'rotate(180deg)', settings: 'rotate(60deg)', close: 'rotate(90deg)', plus: 'rotate(90deg)', edit: 'rotate(-12deg)', link: 'rotate(-15deg)', moon: 'rotate(-20deg)',
  sparkle: 'rotate(30deg) scale(1.18)', search: 'scale(1.18)', check: 'scale(1.22)', play: 'scale(1.14)', pause: 'scale(0.86)', stop: 'scale(0.86)', more: 'scale(1.22)',
  speaker: 'scale(1.14)', voice: 'scale(1.14)', type: 'scale(1.14)', grid: 'scale(0.88)', waves: 'scaleY(1.32)', sliders: 'scaleX(0.8)', minus: 'scaleX(0.7)', text: 'scaleX(1.12)',
}
const SHAKE = { bell: 'noesis-ring', trash: 'noesis-rattle' } // these two do not lean, they shake
const MENU_HELD = 8 // rows of a menu that follow one another
const MENU_STEP = 28 // ms between them
export const menuRow = i => `m${Math.min(i, MENU_HELD)}`
const SPRING = 'cubic-bezier(0.2, 0.9, 0.3, 1.35)' // lets go with a little overshoot
const EASE = `cubic-bezier(${T.enter.ease.join(', ')})`
const SLIDE = 'cubic-bezier(0.25, 1.18, 0.35, 1)' // a marker landing on what was chosen: arrives, with a little give
const SLIDE_MS = 380
const VIEW_MS = 320
const VIEW_Y = 12 // px a whole view rises as it arrives: less than a row (T.enter.y), it is a bigger thing

const rules = [
  `[data-press]{transition:transform 220ms ${SPRING};-webkit-tap-highlight-color:transparent;touch-action:manipulation}`,
  `[data-press]:active:not(:disabled){transform:scale(var(--press,${T.tap.control}));transition-duration:70ms}`,
  `[data-ico]{transition:transform 260ms ${SPRING}}`,
  ...Object.entries(MOVE).map(([name, move]) => `[data-press]:active:not(:disabled) [data-ico="${name}"]{transform:${move}}`),
  `@media (hover:hover){${Object.entries(MOVE).map(([name, move]) => `[data-press]:hover:not(:disabled) [data-ico="${name}"]{transform:${move}}`).join('')}}`,
  '@keyframes noesis-ring{0%,100%{transform:rotate(0)}25%{transform:rotate(-14deg)}50%{transform:rotate(12deg)}75%{transform:rotate(-6deg)}}',
  '@keyframes noesis-rattle{0%,100%{transform:rotate(0)}25%{transform:rotate(-8deg)}50%{transform:rotate(8deg)}75%{transform:rotate(-4deg)}}',
  ...Object.entries(SHAKE).map(([name, anim]) => `[data-press]:active:not(:disabled) [data-ico="${name}"]{animation:${anim} 420ms ease-in-out}`),
  // an icon that has just replaced another in the same place draws itself in
  '@keyframes noesis-draw{from{stroke-dashoffset:1;opacity:0}to{stroke-dashoffset:0;opacity:1}}',
  `[data-draw]{stroke-dasharray:1;animation:noesis-draw 300ms ${EASE} both}`,
  // text that has just changed in place slides up into it
  '@keyframes noesis-swap{from{transform:translateY(70%);opacity:0}to{transform:none;opacity:1}}',
  `[data-swap]{display:inline-block;animation:noesis-swap 260ms ${EASE} both}`,
  // Things that arrive (a row, a card, a late answer, what is inside a sheet) rise into place. `backwards`:
  // the rule lets go when it is done, so a press on the same element works afterwards. Rows of a list carry
  // their place (data-rise="3") and follow one another; a menu's rows ("m3") do the same, quicker.
  `@keyframes noesis-rise{from{opacity:0;transform:translateY(${T.enter.y}px)}}`,
  `[data-rise]{animation:noesis-rise ${T.enter.duration * 1000}ms ${EASE} backwards}`,
  ...Array.from({ length: T.enter.held + 1 }, (_, i) => `[data-rise="${i}"]{animation-delay:${Math.round(40 + i * T.enter.step * 1000)}ms}`),
  '[data-rise="sheet"]{animation-delay:90ms}',
  '@keyframes noesis-drop{from{opacity:0;transform:translateY(-8px)}}',
  `[data-rise^="m"]{animation:noesis-drop 280ms ${EASE} backwards}`,
  ...Array.from({ length: MENU_HELD + 1 }, (_, i) => `[data-rise="m${i}"]{animation-delay:${i * MENU_STEP}ms}`),
  // the dot beside something that is still working
  '@keyframes noesis-pulse{50%{opacity:0.25}}',
  '[data-pulse]{animation:noesis-pulse 1.4s ease-in-out infinite}',
  // Tied to the page's own scrolling by the browser (no script runs as it scrolls): the reading line fills
  // from start to end of the page; the shelf name comes into the bar as the big title scrolls away. A browser
  // without scroll timelines shows neither, and loses nothing it needs.
  '[data-readline]{transform:scaleX(0);transform-origin:0 50%}',
  '[data-bartitle]{opacity:0}',
  '@keyframes noesis-readline{to{transform:scaleX(1)}}',
  '@keyframes noesis-bartitle{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',
  '@supports (animation-timeline: scroll()){[data-readline]{animation:noesis-readline linear both;animation-timeline:scroll(root)}[data-bartitle]{animation:noesis-bartitle linear both;animation-timeline:scroll(root);animation-range:84px 124px}}',
  // The marker of a choice (the white pill of a segmented control, the bar over a tab) is ONE object that
  // slides to what was chosen. It is placed by a transform worked out from which choice it is, never by
  // measuring the page: measured, it flew in from the bottom of the screen whenever the page's scroll
  // changed with the choice (Tharun's recording of Text, Pages, Focus, 2026-10-12).
  `[data-slide]{transition:transform ${SLIDE_MS}ms ${SLIDE};will-change:transform}`,
  '[data-slide-ink]{transition:color 200ms linear}',
  // a whole view that replaces another in the same place (Text, Pages, Focus): the old one goes at once, the
  // new one rises in. No waiting, no empty frame between them.
  `@keyframes noesis-view{from{opacity:0;transform:translateY(${VIEW_Y}px)}}`,
  `[data-rise="view"]{animation:noesis-view ${VIEW_MS}ms ${EASE} backwards}`,
  // a line that has just replaced another (a status) fades up
  '@keyframes noesis-fade{from{transform:translateY(5px);opacity:0}to{transform:none;opacity:1}}',
  `[data-fade]{animation:noesis-fade 240ms ${EASE} both}`,
]

if (typeof document !== 'undefined' && !document.getElementById('noesis-press')) {
  const sheet = document.createElement('style')
  sheet.id = 'noesis-press'
  sheet.textContent = rules.join('\n')
  document.head.appendChild(sheet)
}
