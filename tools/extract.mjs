// Reads real PDFs with exactly the code the app uses (src/ingest/pdftext.js, ocrfix.js, lib/text.js) and writes
// what would be heard, so extraction can be judged and compared on whole books without opening a browser.
//   node tools/extract.mjs <out-dir> <file.pdf> [more.pdf ...]
// Per book: <name>.txt (the text as heard, a blank line between paragraphs, "## " before a heading, "[p N]" where
// the page changes) and one line of numbers on the screen.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { basename } from 'node:path'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import nspell from 'nspell'
import { toLines, blocksFromPages } from '../src/ingest/pdftext.js'
import { createRepair } from '../src/ingest/ocrfix.js'
import { takeRefs } from '../src/lib/citations.js'
import { toListening } from '../src/lib/text.js'

const dict = f => readFileSync(new URL('../node_modules/dictionary-en/' + f, import.meta.url), 'utf8')
const speller = nspell(dict('index.aff'), dict('index.dic'))
const PDFJS = new URL('../node_modules/pdfjs-dist/', import.meta.url).href

// the same test as isScanned in src/ingest/pdf.js
async function isScanned(pdf) {
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

export async function extract(file) {
  const pdf = await getDocument({
    data: new Uint8Array(readFileSync(file)), cMapUrl: PDFJS + 'cmaps/', cMapPacked: true,
    standardFontDataUrl: PDFJS + 'standard_fonts/', verbosity: 0,
  }).promise
  const pages = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n)
    const tc = await page.getTextContent()
    page.cleanup()
    pages.push(toLines(tc.items))
  }
  const scanned = await isScanned(pdf)
  const parsed = await blocksFromPages(pages)
  let blocks = parsed.blocks.map(({ k, text, page }) => ({ k, text, page: page + 1 }))
  blocks = takeRefs(blocks).blocks
  const fix = createRepair(speller)
  if (scanned) blocks = fix.repair(blocks)
  const heard = toListening(blocks, 'en')
  await pdf.loadingTask.destroy()
  return { pages: pages.length, rawLines: pages.flat().length, scanned, heard, fix: fix.stats, unknown: createRepair(speller).unknownRate(blocks, 20000) }
}

if (process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]))) {
  const [out, ...files] = process.argv.slice(2)
  mkdirSync(out, { recursive: true })
  for (const file of files) {
    const name = basename(file).slice(0, 28).replace(/[^\w]+/g, '_')
    try {
      const t0 = Date.now()
      const r = await extract(file)
      let page = 0
      const text = r.heard.map(b => {
        const mark = b.p !== page ? `[p ${page = b.p}]\n` : ''
        return mark + (b.k === 'h' ? '## ' : b.k === 'p' ? '' : `(${b.k}) `) + b.s.join(' ')
      }).join('\n\n')
      writeFileSync(`${out}/${name}.txt`, text)
      const n = k => r.heard.filter(b => b.k === k).length
      const words = text.split(/\s+/).length
      console.log(`${name.padEnd(30)} pages ${String(r.pages).padStart(4)} · scanned ${r.scanned ? 'yes' : 'no '} · words ${String(words).padStart(7)} · headings ${String(n('h')).padStart(4)} · paragraphs ${String(n('p')).padStart(5)} · unknown words ${(r.unknown * 100).toFixed(1).padStart(4)}% · ${((Date.now() - t0) / 1000).toFixed(0)} s`)
    } catch (e) {
      console.log(`${name.padEnd(30)} FAILED: ${e.message}`)
    }
  }
}
