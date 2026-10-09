// Single source of design truth. Every colour, radius, font and motion curve in the UI traces here.
export const T = {
  bg: '#000000',
  surface: 'rgba(255,255,255,0.04)',
  surfaceHi: 'rgba(255,255,255,0.07)',
  surfaceTop: 'rgba(255,255,255,0.11)',
  border: 'rgba(255,255,255,0.08)',
  borderHi: 'rgba(255,255,255,0.16)',
  text: '#F4F4F1',
  body: 'rgba(244,244,241,0.82)',
  sub: 'rgba(244,244,241,0.58)',
  faint: 'rgba(244,244,241,0.34)',
  accent: '#6EE7FF',
  accentSoft: 'rgba(110,231,255,0.14)',
  accentInk: '#001A20',
  danger: '#FF6B6B',
  ok: '#4ADE80',
  scrim: 'rgba(0,0,0,0.72)',

  font: "'DM Sans Variable', 'DM Sans', system-ui, -apple-system, sans-serif",
  mono: "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, monospace",
  serif: "'Literata Variable', 'Literata', Georgia, serif",

  r: { xs: 6, sm: 10, md: 14, lg: 20, xl: 28, pill: 999 },
  ease: [0.22, 1, 0.36, 1],
  spring: { type: 'spring', stiffness: 420, damping: 38, mass: 0.9 },
  dur: { fast: 0.16, base: 0.28, slow: 0.5 },

  playerH: 132,
  playerHDesktop: 96,
  sidebarW: 248,
  tocW: 290,
  askW: 420,
  readerW: 720,
  split: 900,
}

export const label = { fontFamily: T.mono, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.faint }
