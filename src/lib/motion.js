// Motion rules in one place (from the web-animation skills the project follows: page-transition-animation,
// micro-interaction, 60fps-animation, accessible-animation). See .claude/skills/motion/SKILL.md.
const REDUCE = '(prefers-reduced-motion: reduce)'
export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia(REDUCE).matches

// A glide for people who are fine with motion; an instant jump for those who asked for less.
export const scrollBehavior = () => (reducedMotion() ? 'auto' : 'smooth')
