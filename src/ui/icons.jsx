import { useRef } from 'react'
import { T } from "../theme.js"
import { WORDMARK, MARK, TAGLINE } from "./brand-paths.js"

// Inline SVG icons, 24px grid, currentColor stroke. No icon library needed.
const P = {
  plus: 'M12 5v14M5 12h14',
  person: 'M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8ZM4.5 20c1.1-3.4 3.9-5.2 7.5-5.2s6.4 1.8 7.5 5.2',
  info: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18ZM12 11v5.5M12 7.5v.3',
  next1: 'M9 6l6 6-6 6',
  pip: 'M3 5h18v14H3ZM12 12h6v4h-6Z',
  globe: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18ZM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9s1.3-6.4 3.8-9Z',
  play: 'M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5Z',
  pause: 'M8 5v14M16 5v14',
  prev: 'M11 7 6 12l5 5M18 7l-5 5 5 5',
  next: 'M13 7l5 5-5 5M6 7l5 5-5 5',
  back: 'M15 18l-6-6 6-6',
  close: 'M6 6l12 12M18 6 6 18',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  list: 'M4 6h16M4 12h16M4 18h16',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5ZM14 3v5h5',
  text: 'M5 6h14M5 12h14M5 18h9',
  link: 'M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3',
  archive: 'M3 5h18v4H3zM5 9v10h14V9M10 13h4',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z',
  voice: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM5 11a7 7 0 0 0 14 0M12 18v3',
  install: 'M12 3v12M7 10l5 5 5-5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4',
  toc: 'M4 6h2M4 12h2M4 18h2M9 6h11M9 12h11M9 18h11',
  sliders: 'M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4',
  upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  edit: 'M4 20h4L19 9a2.83 2.83 0 0 0-4-4L4 16v4Z',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  waves: 'M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4',
  minus: 'M5 12h14',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  bookmark: 'M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1Z',
  type: 'M4 19l5-14 5 14M5.8 14h6.4M15.5 19c0-2 1.2-3.2 3-3.2 1.4 0 2.5.9 2.5 2.4V19M21 16.2c0-1.7-1-2.7-2.6-2.7-1 0-1.8.4-2.3 1',
  send: 'M5 12h13M13 6l6 6-6 6',
  speaker: 'M4 10v4h3l5 4V6l-5 4H4ZM16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11',
  stop: 'M7 7h10v10H7z',
  eye:'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
}

// An icon is a plain drawing. It leans, turns or shakes when the thing it sits in is pressed, and draws
// itself in when it replaces another icon in the same place (play to pause, upload to a tick): both are done
// by the style sheet in press.js, so an icon costs nothing to put on screen.
export function Icon({ name, size = 20, stroke = 1.8, fill = false, style }) {
  const last = useRef(name)
  const drawn = useRef(null) // the icon that replaced another here, and so draws itself
  if (last.current !== name) { last.current = name; drawn.current = name }
  const draw = drawn.current === name
  return (
    <svg data-ico={name} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0, display: 'block', ...style }}
      fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      <path key={name} d={P[name]} pathLength={draw ? 1 : undefined} data-draw={draw ? '' : undefined} />
    </svg>
  )
}

// App icon: the N from the Noesis logo, ivory on a black tile (same geometry as public/icon.svg).
export function Logo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
      <rect width="512" height="512" rx="112" fill={T.bg} stroke={T.borderHi} strokeWidth="12" />
      <path transform={`translate(108 116) scale(${280 / MARK.h})`} fillRule="evenodd" fill={T.brand} d={MARK.d} />
    </svg>
  )
}

// The "Noesis" wordmark from the logo; height in px, width follows the artwork's proportions.
export function LogoWordmark({ height = 22, tagline = false }) {
  const h = tagline ? WORDMARK.h + 96 : WORDMARK.h
  return (
    <svg height={height} viewBox={`0 0 ${WORDMARK.w} ${h}`} role="img" aria-label="Noesis" style={{ display: 'block', flexShrink: 0, width: 'auto' }}>
      <path fillRule="evenodd" fill={T.brand} d={WORDMARK.d} />
      {tagline && <path transform={`translate(${(WORDMARK.w - TAGLINE.w) / 2} ${WORDMARK.h + 60})`} fillRule="evenodd" fill={T.brand} d={TAGLINE.d} />}
    </svg>
  )
}
