// Each document has one colour, wherever its listening is drawn (its own bar, its block on the library's
// shelf, its part of a day's column). It comes from the document's own cover, the way a player takes its
// colours from the album art, so the bar beside a red book is red. A cover with no colour to speak of, and
// a document with generated artwork, use the hue that artwork is drawn in.
import { createStore } from '../lib/store.js'

const HUES = ['#AAFF00', '#00E5FF', '#00D4A8', '#2288FF', '#6EE7B7']
export const hueOf = s => { let h = 0; for (const ch of s) h = (h * 31 + ch.codePointAt(0)) >>> 0; return HUES[h % HUES.length] }

export const colours = createStore({}) // docId → a CSS colour read from its cover
const asked = new Set()

const SIDE = 24 // the cover is looked at this small: its main colour, not its detail
const BINS = 12
const MIN_COLOUR = 0.08 // a pixel greyer, darker or paler than this says nothing about the cover's colour
const MIN_SHARE = 0.03 // fewer coloured pixels than this: the cover is black and white

function read(src) {
  return new Promise(done => {
    const img = new Image()
    img.onerror = () => done(null)
    img.onload = () => {
      const canvas = Object.assign(document.createElement('canvas'), { width: SIDE, height: SIDE })
      const g = canvas.getContext('2d', { willReadFrequently: true })
      g.drawImage(img, 0, 0, SIDE, SIDE)
      const px = g.getImageData(0, 0, SIDE, SIDE).data
      const bins = Array.from({ length: BINS }, () => ({ w: 0, x: 0, y: 0 }))
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i] / 255, gr = px[i + 1] / 255, b = px[i + 2] / 255
        const max = Math.max(r, gr, b), min = Math.min(r, gr, b), l = (max + min) / 2, d = max - min
        if (!d) continue
        const s = d / (1 - Math.abs(2 * l - 1))
        const w = s * (1 - Math.abs(2 * l - 1)) // vivid and mid-toned counts most
        if (w < MIN_COLOUR) continue
        const h = (max === r ? ((gr - b) / d) % 6 : max === gr ? (b - r) / d + 2 : (r - gr) / d + 4) * 60
        const bin = bins[Math.floor(((h + 360) % 360) / (360 / BINS)) % BINS]
        bin.w += w; bin.x += Math.cos(h * Math.PI / 180) * w; bin.y += Math.sin(h * Math.PI / 180) * w
      }
      const top = bins.reduce((a, b) => (b.w > a.w ? b : a))
      if (top.w < SIDE * SIDE * MIN_SHARE) return done(null)
      done(`hsl(${Math.round((Math.atan2(top.y, top.x) * 180 / Math.PI + 360) % 360)} 88% 66%)`) // lifted to read on black
    }
    img.src = src
  })
}

// `known` is the colours store's value (useStore(colours)): a cover's colour arrives a moment after first asked.
export function colourOf(d, known) {
  if (known[d.id]) return known[d.id]
  if (d.cover && !asked.has(d.id)) { asked.add(d.id); read(d.cover).then(c => { if (c) colours.set({ [d.id]: c }) }) }
  return hueOf(d.title || '')
}
