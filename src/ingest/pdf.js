import { splitRefs } from '../lib/citations.js'
import { cleanMeta } from './meta.js'
import { toLines, blocksFromPages } from './pdftext.js'
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
  // In a worker (reread.worker.js) text is read and nothing is drawn: no fonts, and pdf.js is told where its
  // own files are fetched from instead of asking a page it does not have.
  ...(typeof document === 'undefined' ? { disableFontFace: true, useSystemFonts: false, useWorkerFetch: true } : {}),
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

export async function readPdf(data, filename, onProgress, { cover: wantCover = true } = {}) {
  const pdf = await openPdf(data)
  const pages = []
  const BATCH = 8 // keep several requests in flight so worker round-trips overlap
  for (let n = 1; n <= pdf.numPages; n += BATCH) {
    const nums = Array.from({ length: Math.min(BATCH, pdf.numPages - n + 1) }, (_, k) => n + k)
    pages.push(...(await Promise.all(nums.map(k => pageLines(pdf, k)))))
    onProgress?.(pages.length / pdf.numPages)
  }

  const { blocks: kept, refLines, pageText } = await blocksFromPages(pages)
  const info = (await pdf.getMetadata().catch(() => null))?.info || {}
  const firstHeading = kept.find(b => b.k === 'h')?.text || ''
  const { title, author } = cleanMeta(
    { title: info.Title, author: info.Author },
    { fileName: filename, firstHeading },
  )
  // A cover is decoration: never let a slow image decode (huge scanned page 1) hold up the document.
  const cover = !wantCover ? null : await Promise.race([renderPage(pdf, 1, 240, 0.7), new Promise(r => setTimeout(r, 6000, null))]).catch(() => null)

  return {
    title,
    author,
    cover,
    blocks: kept.map(({ k, text, page }) => ({ k, text, page: page + 1 })),
    refs: splitRefs(refLines),
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
