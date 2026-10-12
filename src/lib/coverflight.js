// A document's cover is one object: tapped in the library it flies to its place in the reader, and on the
// way back it flies home to its card. The two pages are never on screen together (one leaves, then the other
// arrives), so the cover that travels is a copy fixed to the screen: it outlives the page it left and lands
// where the arriving page puts its own cover. Only transform and opacity change.
import { animate } from 'motion/react'
import { T } from '../theme.js'
import { reducedMotion } from './motion.js'

const WAIT_MS = 700 // a copy nobody claims (the arriving page never showed this cover) fades away
const Z = 40 // above the page and its header, below sheets
let flight = null // { id, ghost, from, timer }: the copy in the air

const drop = f => { clearTimeout(f.timer); f.ghost.remove() }

// Where an element will rest once its page has finished sliding in (the page is still offset when it mounts).
function restingRect(el) {
  const r = el.getBoundingClientRect()
  const page = el.closest('[data-page]')
  const m = page ? new DOMMatrix(getComputedStyle(page).transform) : { m41: 0, m42: 0 }
  return { left: r.left - m.m41, top: r.top - m.m42, width: r.width, height: r.height }
}

// The page holding `el` (the cover of document `id`) is about to leave: lift a copy of it off the page.
export function leaveCover(id, el) {
  if (flight) { drop(flight); flight = null }
  if (!el || reducedMotion()) return
  const from = el.getBoundingClientRect()
  if (!from.width || !from.height || from.bottom < 0 || from.top > innerHeight) return // not on screen: nothing to follow
  const ghost = el.cloneNode(true)
  ghost.setAttribute('aria-hidden', 'true')
  Object.assign(ghost.style, {
    position: 'fixed', left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`,
    margin: '0', zIndex: String(Z), pointerEvents: 'none', transformOrigin: '0 0', transform: 'none', opacity: '1',
  })
  document.body.appendChild(ghost)
  const mine = { id, ghost, from }
  mine.timer = setTimeout(() => {
    if (flight === mine) flight = null
    animate(ghost, { opacity: 0 }, { duration: 0.15 }).then(() => ghost.remove())
  }, WAIT_MS)
  flight = mine
}

// Is a copy of this document's cover in the air? (The arriving cover then skips its own entrance.)
export const coverInFlight = id => !!flight && flight.id === id

// The arriving page's cover claims the copy: the copy flies to it, then the real cover takes its place.
// Returns true when a flight started.
export function arriveCover(id, el) {
  if (!el || !flight || flight.id !== id) return false
  const f = flight
  flight = null
  clearTimeout(f.timer)
  const to = restingRect(el)
  if (!to.width || !to.height) { f.ghost.remove(); return false }
  el.style.opacity = '0'
  animate(f.ghost, { x: to.left - f.from.left, y: to.top - f.from.top, scaleX: to.width / f.from.width, scaleY: to.height / f.from.height }, T.settle)
    .then(() => { el.style.opacity = ''; f.ghost.remove() })
  return true
}
