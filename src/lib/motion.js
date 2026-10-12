// Motion rules in one place (from the web-animation skills the project follows: page-transition-animation,
// micro-interaction, 60fps-animation, accessible-animation). See .claude/skills/motion/SKILL.md.
import { settings } from './settings.js'

export const REDUCE = '(prefers-reduced-motion: reduce)'
// What the phone itself is asking for. Battery saver and "Remove animations" both turn this on, often without
// the owner knowing: an app that obeys it silently just looks dead.
export const phoneAsksForLess = () => typeof matchMedia === 'function' && matchMedia(REDUCE).matches
// The customer's choice in Settings: 'system' (follow the phone), 'full', or 'less'.
export const motionChoice = () => settings.get().motion || 'system'
export const reducedMotion = () => { const c = motionChoice(); return c === 'less' || (c === 'system' && phoneAsksForLess()) }

// A glide for people who are fine with motion; an instant jump for those who asked for less.
export const scrollBehavior = () => (reducedMotion() ? 'auto' : 'smooth')

// Work that can wait for a quiet moment (fetching a screen the customer has not asked for yet). Safari has no
// requestIdleCallback: there it waits a moment instead.
const IDLE_FALLBACK_MS = 1500
export const whenIdle = work => (typeof requestIdleCallback === 'function' ? requestIdleCallback(work) : setTimeout(work, IDLE_FALLBACK_MS))
