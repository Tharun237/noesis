import { pause } from '../lib/text.js'
import { cleanMeta } from './meta.js'
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
// Decoders, CMaps and fonts are self-hosted (copied from node_modules on install), so pdf.js matches its own version and works offline.
const CDN = '/pdfjs/'

export const openPdf = data => pdfjs.getDocument({
  data,
  cMapUrl: CDN + 'cmaps/',
  cMapPacked: true,
  standardFontDataUrl: CDN + 'standard_fonts/',
  wasmUrl: CDN + 'wasm/',
  iccUrl: CDN + 'iccs/',
}).promise

export async function renderPage(pdf, n, width, quality = 0.72) {
  const page = await pdf.getPage(n)
  const base = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: width / base.width })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)
  await page.render({ canvas, viewport }).promise
  const url = canvas.toDataURL('image/jpeg', quality)
  page.cleanup()
  return url
}

// -- page-view exports (used by src/ui/PageView.jsx; ingest logic stays here) ----------------
// Height/width ratio of page n (1-based), for placeholders before anything is drawn.
export async function pageRatio(pdf, n) {
  const page = await pdf.getPage(n)
  const v = page.getViewport({ scale: 1 })
  page.cleanup()
  return v.height / v.width
}

// Paint page n (1-based) into the given canvas. Pixel width = CSS width × min(devicePixelRatio, 2).
// Calls onTask with the pdf.js render task so the caller can cancel it; resolves to the page's
// height/width ratio so the placeholder can be refined to the page's true size.
export async function paintPage(pdf, n, canvas, cssWidth, dpr, onTask) {
  const page = await pdf.getPage(n)
  const base = page.getViewport({ scale: 1 })
  const px = Math.max(1, Math.round(cssWidth * Math.min(dpr || 1, 2)))
  const viewport = page.getViewport({ scale: px / base.width })
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)
  const task = page.render({ canvas, viewport })
  onTask?.(task)
  try {
    await task.promise
  } finally {
    page.cleanup()
  }
  return viewport.height / viewport.width
}

// Mirrors the cleanup in prepare() (src/lib/library.js): the loading task owns the worker-side document.
export function closePdf(pdf) {
  try { pdf?.loadingTask?.destroy?.() } catch { /* already destroyed */ }
}

// pdf.js text items → visual lines {text, y, size, x}
function toLines(items) {
  const lines = []
  let cur = null
  for (const it of items) {
    if (!it.str && !it.hasEOL) continue
    const [, b, c, d, x, y] = it.transform
    const size = Math.hypot(c, d) || it.height || Math.abs(b) || 10
    if (it.str.trim()) {
      if (cur && Math.abs(y - cur.y) <= size * 0.45) {
        const gap = x - cur.xEnd
        if (gap > size * 0.12 && !cur.text.endsWith(' ') && !it.str.startsWith(' ')) cur.text += ' '
        cur.text += it.str
        cur.xEnd = x + it.width
        cur.size = Math.max(cur.size, size)
      } else {
        cur = { text: it.str, y, x, xEnd: x + it.width, size }
        lines.push(cur)
      }
    }
    if (it.hasEOL) cur = null
  }
  for (const l of lines) l.text = l.text.replace(/\s+/g, ' ').trim()
  return lines.filter(l => l.text)
}

const norm = t => t.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim()
const PAGE_NO = /^(?:page\s*)?(?:#|[ivxlc]+)(?:\s*(?:of|\/)\s*#)?$|^[-–—]\s*#\s*[-–—]$/i
const REFS = /^(?:\d+\.?\s*|[ivx]+\.\s*)?(?:references|bibliography|works cited|literature cited|citations)$/i
const APPENDIX = /^(?:appendix|appendices|supplementary|[a-z]\s+appendix)/i
const CAPTION = /^(fig(?:ure)?\.?|table|algorithm|listing)\s*[\dIVX]+[a-z]?\s*[.:|—–-]/i
const NUMBERED_HEADING = /^(?:\d+(?:\.\d+){0,3}\.?|[IVX]+\.|[A-Z]\.)\s+[A-Z][^.!?]{2,90}$/

// Navigation pages (contents, index) are mostly lines ending in a page number: "4.4. Space Flight / 113",
// "Thrust coefficient, 23, 45", "Chapter 3 ........ 52". They are for eyes, not ears.
const NAV_LINE = /(?:^|[\s.…\/|=,–-])(?:\d{1,3}|(?!1[5-9]\d\d|20\d\d)\d{4})(?:\s*[-–]\s*\d{1,4})?\s*$/ // years (1500–2099) are not page numbers
const isNavPage = lines => lines.length >= 8 && lines.filter(l => l.text.length < 160 && NAV_LINE.test(l.text)).length / lines.length >= 0.4
const BOILERPLATE = /^(?:digitized by|no sponsor|in \d{4} with funding from|with funding from|this page (?:is )?intentionally left blank|all rights reserved|printed in |library of congress|isbn\b|copyright\s?©|©\s?\d{4})/i
const isLegalPage = lines => lines.some(l => /all rights reserved|ISBN[\s:-]*[\dX-]{10}/i.test(l.text))
const wordy = t => (t.match(/\p{L}{3,}/gu) || []).length >= 1 && (t.match(/\p{L}/gu) || []).length / t.length >= 0.5

const median = arr => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 0 }

// ponytail: digit/symbol-heavy short paragraphs are table cells, axis labels or broken equations.
// Rule mode drops them; AI mode (Gemini sees the page image) describes them properly instead.
const isResidue = t => {
  const words = (t.match(/[A-Za-z]{3,}/g) || []).length
  const sym = (t.match(/[^A-Za-z\s]/g) || []).length
  return words < 4 && (sym / t.length > 0.3 || t.length < 40)
}

async function pageLines(pdf, n) {
  const page = await pdf.getPage(n)
  const tc = await page.getTextContent()
  page.cleanup()
  return toLines(tc.items) // content-stream order: follows columns in typeset papers
}

// Visual lines with positions for the sentence mark: [{ text, x, y, w, h }] as
// fractions (0..1) of the page, origin top-left, y = top edge of the line.
export async function pageLayout(pdf, n) {
  const page = await pdf.getPage(n)
  const viewport = page.getViewport({ scale: 1 })
  const tc = await page.getTextContent()
  page.cleanup()
  return toLines(tc.items).map(l => {
    const [vx, vy] = viewport.convertToViewportPoint(l.x, l.y)
    return {
      text: l.text,
      x: vx / viewport.width,
      y: (vy - l.size) / viewport.height,
      w: (l.xEnd - l.x) / viewport.width,
      h: l.size * 1.25 / viewport.height,
    }
  })
}

export async function readPdf(data, filename, onProgress) {
  const pdf = await openPdf(data)
  const pages = []
  const BATCH = 8 // keep several requests in flight so worker round-trips overlap
  for (let n = 1; n <= pdf.numPages; n += BATCH) {
    const nums = Array.from({ length: Math.min(BATCH, pdf.numPages - n + 1) }, (_, k) => n + k)
    pages.push(...(await Promise.all(nums.map(k => pageLines(pdf, k)))))
    onProgress?.(pages.length / pdf.numPages)
  }

  // Running headers/footers: the first/last two lines of a page that repeat across many pages.
  const edge = new Map()
  pages.forEach(lines => {
    if (lines.length < 3) return
    const byY = [...lines].sort((a, b) => b.y - a.y)
    const seen = new Set([...byY.slice(0, 2), ...byY.slice(-2)].map(l => norm(l.text)))
    for (const k of seen) edge.set(k, (edge.get(k) || 0) + 1)
  })
  // Repeating 3+ times at a page edge = running header/footer, even if it only spans one chapter
  // ("8 CLASSIFICATION", "10 CLASSIFICATION" both normalise to "# classification").
  const junk = new Set([...edge].filter(([k, c]) => pages.length >= 6 && c >= 3 && k.length < 90).map(([k]) => k))

  const allLines = pages.flat()
  const body = median(allLines.map(l => l.size)) || 10
  const blocks = []
  const pageText = []
  let para = null
  let skipping = false
  let tocPage = -1
  const flush = () => { if (para && para.text.trim()) blocks.push(para); para = null }

  const frontMatter = Math.max(8, pages.length * 0.06)
  for (let pi = 0; pi < pages.length; pi++) {
    const lines = pages[pi]
    if (pi % 80 === 79) await pause() // a 700-page book is one long job: let the screen draw in between
    if (isNavPage(lines) || (pi < frontMatter && isLegalPage(lines))) { pageText.push(''); continue }
    const byY = [...lines].sort((a, b) => b.y - a.y)
    const edges = new Set([...byY.slice(0, 2), ...byY.slice(-2)])
    pageText.push(lines.map(l => l.text).join('\n'))
    const gaps = []
    for (let i = 1; i < lines.length; i++) { const g = lines[i - 1].y - lines[i].y; if (g > 0 && g < body * 3) gaps.push(g) }
    const lead = median(gaps) || body * 1.2

    lines.forEach((l, i) => {
      const key = norm(l.text)
      if (edges.has(l) && (junk.has(key) || PAGE_NO.test(key))) return
      if (BOILERPLATE.test(l.text)) return
      const isHeading = wordy(l.text) && !NAV_LINE.test(l.text) && ((l.size >= body * 1.18 && l.text.length < 140) ||
        (NUMBERED_HEADING.test(l.text) && (i === 0 || lines[i - 1].y - l.y > lead * 1.4)))
      if (isHeading) {
        if (REFS.test(l.text.trim())) { flush(); skipping = true; return }
        if (/^(?:table of )?contents$/i.test(l.text.trim())) { flush(); tocPage = pi; return } // OCR'd TOC lines may not end in numbers
        if (skipping && !APPENDIX.test(l.text.trim())) return
        skipping = false
        flush()
        const prev = blocks[blocks.length - 1]
        if (prev?.k === 'h' && prev.page === pi && Math.abs(prev.size - l.size) < 0.5 && prev.text.length < 100) prev.text += ' ' + l.text
        else blocks.push({ k: 'h', text: l.text, page: pi, size: l.size })
        return
      }
      if (skipping || tocPage === pi) return
      const prev = lines[i - 1]
      const gap = prev ? prev.y - l.y : Infinity
      const caption = CAPTION.exec(l.text)
      const newPara = !para || caption || gap > lead * 1.55 || Math.abs(l.size - para.size) > body * 0.2 ||
        (gap < 0 && /[.!?:]["”)]?$/.test(para.text)) // column jump after a finished sentence
      if (newPara) {
        flush()
        const k = caption ? (/^tab/i.test(caption[1]) ? 'table' : 'fig') : 'p'
        para = { k, text: l.text, page: pi, size: l.size }
      } else if (/[a-z]-$/.test(para.text) && /^[a-z]/.test(l.text)) {
        para.text = para.text.slice(0, -1) + l.text // re-join hyphenated line breaks
      } else {
        para.text += ' ' + l.text
      }
    })
  }
  flush()

  const kept = blocks.filter(b => b.k !== 'p' || !isResidue(b.text))
  const info = (await pdf.getMetadata().catch(() => null))?.info || {}
  const firstHeading = kept.find(b => b.k === 'h')?.text || ''
  const { title, author } = cleanMeta(
    { title: info.Title, author: info.Author },
    { fileName: filename, firstHeading },
  )
  // A cover is decoration: never let a slow image decode (huge scanned page 1) hold up the document.
  const cover = await Promise.race([renderPage(pdf, 1, 240, 0.7), new Promise(r => setTimeout(r, 6000, null))]).catch(() => null)

  return {
    title,
    author,
    cover,
    blocks: kept.map(({ k, text, page }) => ({ k, text, page: page + 1 })),
    pdf,
    pageText,
    scanned: await isScanned(pdf),
  }
}

// A scanned PDF draws its OCR text invisibly (render mode 3) over a page image. Checked on three body
// pages: structural, so it never mistakes a technical book's jargon for OCR noise (measured: word-based
// heuristics can't tell a clean engineering text from a scan).
async function isScanned(pdf) {
  const { OPS } = pdfjs
  let hits = 0
  for (const f of [0.3, 0.5, 0.7]) {
    const page = await pdf.getPage(Math.max(1, Math.round(pdf.numPages * f)))
    const { fnArray: fn, argsArray: args } = await page.getOperatorList()
    page.cleanup()
    const invisible = fn.some((op, i) => op === OPS.setTextRenderingMode && args[i][0] === 3)
    const image = fn.some(op => op === OPS.paintImageXObject || op === OPS.paintJpegXObject)
    if (invisible && image) hits++
  }
  return hits >= 2
}
