// Figures, charts, diagrams and tables put into words by the customer's own AI, so they can be heard. Before this a
// figure was only its caption: the picture went unsaid, in every book, and AI narration (new uploads only) sent
// pages to a model that could not see them and got nothing back (Tharun, 15 October 2026: "what about figures,
// diagrams, charts? does it understand old uploads and new ones?").
//
// The page holding the figure is drawn from the document's own file, kept on this device, and shown to the model
// of the customer's key that sees (ai.js chooseVisionModel) with its caption. What it says is kept beside the text
// (figstore.js) and heard with the caption (library.js figuresArrived); other devices receive it (sync).
// Old uploads and new ones alike: any PDF whose file is on this device.
// Where the customer is comes first: the book in the player, from its place onwards, then the two listened to
// before it. Not the whole library at once: a key's free quota, and a phone's memory, are spent where they are heard.
// ponytail: pages are drawn on the page's own thread (as AI narration does), one figure at a time between requests
// that take seconds; a worker with OffscreenCanvas if it is ever felt.
import { settings } from './settings.js'
import { library, loadDoc, figuresArrived } from './library.js'
import { player } from './player.js'
import { aiText, canSee, chooseVisionModel, hasAiKey } from './ai.js'
import { db } from './db.js'
import { described, addFigures } from './figstore.js'
import { touch } from './sync.js'

const BOOKS = 3 // the one in the player and the two listened to before it
const WIDTH = 1100 // the page as AI narration draws it
const MOST = 700 // characters: a description is a few sentences, not a lecture
const START_AFTER_MS = 8000 // opening the app comes first
const BREATH_MS = 250 // between two figures, at least
const failed = new Map() // doc:figure → tries this session
const noFile = new Set() // documents whose file is on another device
let refused = false // the provider said no (a key, a model): nothing more is asked until either changes

const PAGE_TEXT = 3000 // characters of the page's own text given with the picture
// The page's own words go with its picture: a small model reading a table from pixels alone said a turbojet "has no
// such limit" where the table printed one (15 October 2026). With the text it reads the numbers instead of guessing.
const ask = (title, caption, page, text) => `This is page ${page} of "${title}". On it is the figure, chart, diagram or table with this caption:
"${caption}"
${text ? `
The text printed on the page, for exact words and numbers (labels and table cells may be out of order):
"""
${text}
"""
` : ''}
The page may hold other figures and text: describe ONLY the one with this caption, not the page. Describe it for someone LISTENING, who cannot see it, in 2 to 4 plain sentences: what it shows, and the one thing to take from it. Say only what the picture or the page's text shows; never add facts of your own. For a chart or graph, say what is plotted against what and how it changes. For a diagram, name the main parts and how they connect. Do not repeat the caption, do not begin with "This figure" or "The image", no lists, no markdown. If the page holds no such picture, answer only: none.`

const OPENER = /^(the|this) (image|picture|figure|diagram|table|chart|graph|page) (shows|presents|displays|depicts|illustrates|contains)\s+(?=(a|an|the|two|three|several)\s)/i // only where a noun phrase follows: "shows how" stays
function clean(raw) {
  const t = String(raw || '').replace(/[*_#`>]+/g, '').replace(/\s+/g, ' ').trim().replace(/^["“]|["”]$/g, '')
  if (!t || /^none\.?$/i.test(t) || t.length < 30) return null
  // A small model opens with "The image shows…" whatever it is told: the listener knows it is a figure.
  const bare = t.replace(OPENER, '')
  if (bare !== t) return clean(bare.charAt(0).toUpperCase() + bare.slice(1))
  const cut = t.length > MOST ? t.slice(0, t.lastIndexOf('. ', MOST) + 1 || MOST) : t
  return /[.!?]$/.test(cut) ? cut : `${cut}.`
}

// → { d, c, bi } the next figure to put into words, or null
async function nextFigure() {
  const p = player.get()
  const docs = library.get().docs.filter(d => d.kind === 'pdf' && (d.status === 'ready' || d.status === 'voicing') && !noFile.has(d.id))
  const order = [...docs].sort((a, b) => (b.id === p.id) - (a.id === p.id) || (b.lastPlayed || 0) - (a.lastPlayed || 0)).slice(0, BOOKS)
  for (const d of order) {
    const c = await loadDoc(d.id)
    if (!c) continue
    const at = d.id === p.id ? p.i : d.pos || 0
    const todo = c.blocks.map((b, bi) => (b.fk && !described(d.id, b) && (failed.get(`${d.id}:${b.fk}`) || 0) < 2 ? { bi, i: c.starts[bi] } : null)).filter(Boolean)
    if (!todo.length) continue
    todo.sort((x, y) => (y.i >= at) - (x.i >= at) || x.i - y.i) // from the place onwards, then what is behind it
    return { d, c, bi: todo[0].bi }
  }
  return null
}

const open = new Map() // id → the open PDF, while its figures are described
async function pdfOf(id) {
  if (open.has(id)) return open.get(id)
  const src = await db.getSource(id)
  if (src?.kind !== 'pdf' || !src.blob) { noFile.add(id); return null }
  const { openPdf } = await import('../ingest/pdf.js')
  const pdf = await openPdf(new Uint8Array(await src.blob.arrayBuffer())) // the document itself, already waited for
  for (const [k, other] of open) { if (k !== id) { other.destroy?.(); open.delete(k) } } // one book's file in memory at a time
  open.set(id, pdf)
  return pdf
}

async function describeOne({ d, c, bi }) {
  const b = c.blocks[bi]
  const tag = `${d.id}:${b.fk}`
  let words = null
  // Any failure counts against this figure, wherever it happens (opening the file, drawing the page, the request):
  // one that did not count was tried again at once, for ever, and the page froze (15 October 2026).
  try {
    const pdf = await pdfOf(d.id)
    if (!pdf) throw new Error('its file could not be opened') // counted below, like any failure
    const { renderPage, pageLayout } = await import('../ingest/pdf.js')
    const image = await renderPage(pdf, b.p, WIDTH)
    const text = (await pageLayout(pdf, b.p)).map(l => l.text).join('\n').slice(0, PAGE_TEXT)
    words = clean(await aiText({ parts: [{ text: ask(d.title, b.s.join(' ').slice(0, 600), b.p, text) }, { image }] }))
  } catch (e) {
    console.warn('A figure could not be described:', e?.message || e)
    if ([400, 401, 403, 404].includes(e?.status)) refused = true // asking about the next figure would be refused too
  }
  if (!words) { failed.set(tag, (failed.get(tag) || 0) + 1); return }
  const fresh = await addFigures(d.id, { [b.fk]: words })
  if (!fresh.length) return
  touch('figs:' + d.id) // to the account's other devices: described once
  await figuresArrived(d.id, fresh)
}

let running = false
let wake = null
export function kickFigures() {
  if (wake) { const w = wake; wake = null; w() }
  if (running) return
  running = true
  ;(async () => {
    for (;;) {
      let job = null
      try {
        const s = settings.get()
        if (s.describeFigures && hasAiKey(s) && !s.skipVisuals && !refused) {
          if (!canSee(s)) await chooseVisionModel()
          if (canSee()) job = await nextFigure()
        }
        if (job) await describeOne(job)
      } catch (e) { console.error('Noesis figures:', e); if (job) failed.set(`${job.d.id}:${job.c.blocks[job.bi].fk}`, 9) }
      // the page's own turn between two figures: a step that needed no waiting would otherwise never let it draw
      if (job) { await new Promise(r => setTimeout(r, BREATH_MS)); continue }
      for (const [, pdf] of open) pdf.destroy?.()
      open.clear()
      await new Promise(r => { wake = r })
    }
  })()
}

// Woken when there may be something new: the app opened, a book opened or added, a key or a setting changed.
export function startFigures() {
  setTimeout(kickFigures, START_AFTER_MS)
  let id = player.get().id
  player.sub(() => { const now = player.get().id; if (now !== id) { id = now; kickFigures() } })
  let was = ''
  settings.sub(() => { const s = settings.get(); const now = [s.describeFigures, s.aiProvider, s.nvidiaKey, s.nvidiaModel, s.nvidiaVision, s.customKey, s.customModel, s.customVision, s.skipVisuals].join('|'); if (now !== was) { was = now; refused = false; kickFigures() } })
  let ready = 0
  library.sub(() => { const n = library.get().docs.filter(d => d.status === 'ready' || d.status === 'voicing').length; if (n !== ready) { ready = n; kickFigures() } })
}
