// Single source of design truth. Every colour, radius, font and motion curve in the UI traces here.
export const T = {
  // Palette follows the ACS landing + product pages: monochrome. Pure black floor, white type and
  // white controls. The ONE colour is lime, and only for highlights: the word being spoken, what is
  // playing now, live/ready states and the single decisive action on a screen (like "One Tap Pay").
  // No orange anywhere.
  bg: '#000000',
  surface: 'rgba(255,255,255,0.04)',
  surfaceHi: 'rgba(255,255,255,0.07)',
  surfaceTop: 'rgba(255,255,255,0.11)',
  border: 'rgba(255,255,255,0.07)',
  borderHi: 'rgba(255,255,255,0.18)',
  glass: 'rgba(10,10,10,0.82)',
  text: '#FFFFFF',
  brand: '#F8F4EF', // the logo's ivory (sampled from the artwork); used for the logo only
  body: 'rgba(255,255,255,0.84)',
  sub: 'rgba(255,255,255,0.56)',
  faint: 'rgba(255,255,255,0.34)',
  accent: '#FFFFFF',
  accentSoft: 'rgba(255,255,255,0.09)',
  accentInk: '#000000',
  lime: '#AAFF00',
  limeSoft: 'rgba(170,255,0,0.12)',
  danger: '#FF6B6B',
  ok: '#22C55E',
  scrim: 'rgba(0,0,0,0.72)',

  font: "'DM Sans Variable', 'DM Sans', system-ui, -apple-system, sans-serif",
  mono: "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, monospace",
  serif: "'Literata Variable', 'Literata', Georgia, serif",

  r: { xs: 6, sm: 10, md: 14, lg: 20, xl: 28, pill: 999 },
  ease: [0.22, 1, 0.36, 1],
  // Timed springs (motion.dev: visualDuration + bounce): they arrive when they say they will.
  spring: { type: 'spring', visualDuration: 0.26, bounce: 0.14 }, // sheets, pills, things that land
  press: { type: 'spring', stiffness: 400, damping: 30 }, // a finger going down: instant
  settle: { type: 'spring', visualDuration: 0.3, bounce: 0.08 }, // things moving to a new place in a list
  dur: { fast: 0.16, base: 0.28, slow: 0.5 },

  playerH: 132,
  playerHDesktop: 96,
  tabH: 62, // phone tab bar (plus the safe-area inset)
  miniH: 80, // phone mini player, docked above the tab bar
  sidebarW: 248,
  tocW: 290,
  askW: 420,
  readerW: 720,
  split: 900,
}

export const label = { fontFamily: T.mono, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.faint }
// ACS eyebrow: wide-tracked mono caps above a headline ("COASTAL HARVEST · CATALOG").
export const eyebrow = { fontFamily: T.mono, fontSize: 11, letterSpacing: '0.24em', textTransform: 'uppercase', color: T.sub }
