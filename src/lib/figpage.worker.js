// A page of a PDF drawn as a picture, with its printed text, away from the screen's thread (figures.js).
// Measured at a phone's speed (4 times slower): drawn on the page's own thread, one step of pdf.js's drawing held
// the screen for 105 ms while the reader scrolled (15 October 2026). Here it holds nothing: only the finished
// picture and the text go back.
//   { n, id, blob, page, width, quality } → { n, picture (a JPEG Blob: a handle, nothing copied), text } | { n, error }
import { openPdf, pageLayout } from '../ingest/pdf.js'

let open = null // { id, pdf }: one book's file at a time (figures.js asks for one page at a time)

self.onmessage = async ({ data: { n, id, blob, page, width, quality } }) => {
  try {
    if (open?.id !== id) {
      open?.pdf.destroy()
      open = null
      open = { id, pdf: await openPdf(new Uint8Array(await blob.arrayBuffer())) }
    }
    const pg = await open.pdf.getPage(page)
    const viewport = pg.getViewport({ scale: width / pg.getViewport({ scale: 1 }).width })
    const canvas = new OffscreenCanvas(Math.round(viewport.width), Math.round(viewport.height))
    await pg.render({ canvas, viewport }).promise
    pg.cleanup()
    const picture = await canvas.convertToBlob({ type: 'image/jpeg', quality })
    canvas.width = canvas.height = 0
    const text = (await pageLayout(open.pdf, page)).map(l => l.text).join('\n')
    self.postMessage({ n, picture, text })
  } catch (e) {
    self.postMessage({ n, error: String(e?.message || e) })
  }
}
