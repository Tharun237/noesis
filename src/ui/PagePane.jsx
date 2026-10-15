// One page of the original PDF beside the flowing text ("Both" on a wide screen): the page that holds the
// sentence being read, with that sentence marked. It turns the page by itself as the voice, or the reader's
// scrolling, moves on. One page is drawn at a time, fitted to the pane; the page before stays on screen until
// the next one has been drawn, so turning never shows an empty pane.
import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { T } from '../theme.js'
import { db } from '../lib/db.js'
import { locatePage, sentenceAt } from '../lib/locate.js'
import { SentenceOnPage, WordOnPage } from './PageView.jsx'

const FALLBACK_RATIO = 1.4142 // A4-ish until the page reports its true size
const TURN = { duration: 0.2, ease: T.ease }

export function PagePane({ id, page, invert, pageSentences, activeSentence, onTapSentence, onTapPage, onPages, onFail, spoken }) {
  const [pdf, setPdf] = useState(null) // { doc, mod }: the open PDF and the module that reads it
  const [size, setSize] = useState(null) // the pane's inner size
  const [drawn, setDrawn] = useState(0) // the last page whose drawing finished
  const pane = useRef(null)

  // Open the PDF once; close it when the pane goes away.
  useEffect(() => {
    let live = true
    let doc = null
    let mod = null
    ;(async () => {
      try {
        const src = await db.getSource(id)
        if (!src?.blob) throw new Error('no source on this device')
        const data = new Uint8Array(await src.blob.arrayBuffer())
        mod = await import('../ingest/pdf.js')
        if (!live) return
        doc = await mod.openPdf(data)
        if (!live) { mod.closePdf(doc); return }
        setPdf({ doc, mod })
        onPages?.(doc.numPages)
      } catch (e) {
        if (live) onFail?.(e)
      }
    })()
    return () => {
      live = false
      setPdf(null)
      setDrawn(0)
      if (doc) mod.closePdf(doc)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    const el = pane.current
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const ready = pdf && size && size.w > 0 && size.h > 0 && page >= 1 && page <= pdf.doc.numPages
  const pages = ready ? (drawn && drawn !== page ? [drawn, page] : [page]) : []
  return (
    <div ref={pane} style={{ position: 'relative', width: '100%', height: '100%' }}>
      {pages.map(p => (
        <PageSheet key={p} pdf={pdf} page={p} size={size} invert={invert} current={p === page}
          sentences={pageSentences} activeSentence={activeSentence} spoken={spoken} onTapSentence={onTapSentence} onTapPage={onTapPage}
          onDrawn={() => setDrawn(p)} />
      ))}
    </div>
  )
}

// One drawn page: its own canvas (pdf.js cannot draw two pages onto one canvas at once), its sentences found
// in its own text layer, and the mark on the sentence being read.
function PageSheet({ pdf, page, size, invert, current, sentences, spoken, activeSentence, onTapSentence, onTapPage, onDrawn }) {
  const canvas = useRef(null)
  const [ratio, setRatio] = useState(FALLBACK_RATIO)
  const [located, setLocated] = useState(null) // [{ i, rects }] for this page's sentences
  const [painted, setPainted] = useState(false) // drawn (or failed): time to fade in over the page before
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    let task = null
    const { doc, mod } = pdf
    ;(async () => {
      try {
        const r = await mod.pageRatio(doc, page)
        if (!live) return
        setRatio(r)
        const width = Math.floor(Math.min(size.w, size.h / r))
        await mod.paintPage(doc, page, canvas.current, width, window.devicePixelRatio || 1, t => { task = t })
        if (!live) return
        setPainted(true)
        const list = sentences?.(page) ?? []
        if (!list.length) return // a scanned page has no text layer: no mark, the page still turns
        const lines = await mod.pageLayout(doc, page)
        if (live) setLocated(locatePage(lines, list))
      } catch (e) {
        if (live && e?.name !== 'RenderingCancelledException') { setFailed(true); setPainted(true) } // say so in the pane; the next page still turns
      }
    })()
    return () => { live = false; if (task) task.cancel() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, page, size.w, size.h, sentences])

  const width = Math.floor(Math.min(size.w, size.h / ratio))
  const hit = current && located ? located.find(e => e.i === activeSentence) : null
  const onTap = e => {
    if (located?.length && onTapSentence) {
      const r = e.currentTarget.getBoundingClientRect()
      const i = sentenceAt(located, (e.clientX - r.left) / (r.width || 1), (e.clientY - r.top) / (r.height || 1))
      if (i != null) { onTapSentence(i); return }
    }
    onTapPage?.(page)
  }
  return (
    <motion.div data-testid="page-pane-sheet" onClick={onTap} initial={{ opacity: 0 }} animate={{ opacity: painted ? 1 : 0 }} transition={TURN}
      onAnimationComplete={() => { if (painted) onDrawn() }} // only now may the page before be taken away
      style={{
        position: 'absolute', left: '50%', top: 0, x: '-50%', width, aspectRatio: `1 / ${ratio}`, borderRadius: T.r.sm, overflow: 'hidden',
        background: T.surface, border: `1px solid ${T.border}`, cursor: 'pointer', zIndex: current ? 1 : 0,
      }}>
      <canvas ref={canvas} style={{ width: '100%', height: 'auto', display: 'block', filter: invert ? 'invert(1) hue-rotate(180deg)' : 'none' }} />
      {failed && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center', fontSize: 13, color: T.sub }}>This page could not be drawn.</div>}
      {hit && <SentenceOnPage i={activeSentence} rects={hit.rects} invert={invert} />}
      {hit && <WordOnPage rects={hit.rects} spoken={spoken} invert={invert} />}
    </motion.div>
  )
}
