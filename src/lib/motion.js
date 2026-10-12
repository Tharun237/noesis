// Motion rules in one place (from the web-animation skills the project follows: page-transition-animation,
// micro-interaction, 60fps-animation, accessible-animation). See .claude/skills/motion/SKILL.md.
//
// Noesis moves in full for everyone, and there is no setting for it. Tharun, 2026-10-12: "By default it
// should be smooth for everyone. Nobody needs such an option to select: it just shows we have failed to make
// the motion smooth." (There was one, Follow my phone / Full / Less, added when a phone in battery saver
// silently asked for less motion and the app looked dead. The answer to that is motion cheap enough to run
// on every phone, which is what e2e/feel.mjs and e2e/film.mjs hold it to.) This is the one place that would
// change if that were ever revisited.
export const reducedMotion = () => false

// A glide to the place, not a jump.
export const scrollBehavior = () => 'smooth'

// Work that can wait for a quiet moment (fetching a screen the customer has not asked for yet). Safari has no
// requestIdleCallback: there it waits a moment instead.
const IDLE_FALLBACK_MS = 1500
export const whenIdle = work => (typeof requestIdleCallback === 'function' ? requestIdleCallback(work) : setTimeout(work, IDLE_FALLBACK_MS))
