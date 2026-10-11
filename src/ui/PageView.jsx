// Original PDF pages, one under another, fitted to the reading column width.
//
// Performance (phones, 700-page books): every page is a placeholder div of the
// right height; ONE IntersectionObserver (about a screen of margin) tracks which
// pages are near; pages are painted one at a time through pdf.js's worker, and at
// most 6 canvases stay drawn (the farthest is released by zeroing its size).
import { useEffect, useRef, useState } from 'react'
import { T } from '../theme.js'
import { db } from '../lib/db.js'

const MAX_DRAWN = 6
const FALLBACK_RATIO = 1.4142 // A4-ish until the first page reports its true size

export function PageView({ id, activePage, invert, userScroll, onPages, onVisible, onTapPage, onFail }) {
  const [numPages, setNumPages] = useState(0)
  const [near, setNear] = useState(() => new Set([1]))
  const [visible, setVisible] = useState(1)
  const [, setTick] = useState(0) // ratios/drawn live in refs; bump to re-render
  const boxRef = useRef(null)
  const pdfRef = useRef(null)
  const ratios = useRef(new Map())
  const fallback = useRef(FALLBACK_RATIO)
  const drawn = useRef(new Set())
  const canvases = useRef(new Map())
  const tasks = useRef(new Map())
  const bad = useRef(new Set()) // pages that failed to paint: skip, don't stall the queue
  const nearRef = useRef(near)
  nearRef.current = near
  const visibleRef = useRef(1)
  const drawing = useRef(false)
  const failed = useRef(false)

  // Open the PDF once; destroy it when the view unmounts.
  useEffect(() => {
    let live = true
    let pdf = null
    let mod = null
    setNumPages(0)
    drawn.current = new Set()
    ratios.current = new Map()
    tasks.current = new Map()
    bad.current = new Set()
    failed.current = false
    ;(async () => {
      try {
        const src = await db.getSource(id)
        if (!src?.blob) throw new Error('no source on this device')
        const data = new Uint8Array(await src.blob.arrayBuffer())
        mod = await import('../ingest/pdf.js')
        if (!live) return
        pdf = await mod.openPdf(data)
        if (!live) { mod.closePdf(pdf); return }
        pdfRef.current = pdf
        try { fallback.current = await mod.pageRatio(pdf, 1) } catch { /* keep A4-ish */ }
        if (!live) return
        const n = pdf.numPages
        setNumPages(n)
        onPages?.(n)
        setTick(t => t + 1)
      } catch (e) {
        if (live && !failed.current) { failed.current = true; onFail?.(e) }
      }
    })()
    return () => {
      live = false
      for (const t of tasks.current.values()) { try { t.cancel() } catch { /* already done */ } }
      tasks.current = new Map()
      if (pdf) { try { mod?.closePdf ? mod.closePdf(pdf) : pdf.loadingTask?.destroy?.() } catch { /* already destroyed */ } }
      pdfRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // ONE observer for the whole document: which pages are near the screen.
  // A page that leaves the near set has its in-flight paint cancelled.
  useEffect(() => {
    if (!numPages || !boxRef.current) return
    setNear(new Set([1]))
    const io = new IntersectionObserver(entries => {
      setNear(prev => {
        let changed = false
        const next = new Set(prev)
        for (const e of entries) {
          const p = +e.target.dataset.page
          if (e.isIntersecting) {
            if (!next.has(p)) { next.add(p); changed = true }
          } else {
            if (next.delete(p)) changed = true
            const t = tasks.current.get(p)
            if (t) { try { t.cancel() } catch { /* already done */ } }
          }
        }
        return changed ? next : prev
      })
    }, { rootMargin: '1000px 0px' })
    boxRef.current.querySelectorAll('[data-page]').forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [numPages])

  // Which page is on screen (for the "Page N of M" label). Scroll position, not
  // the observer: the observer's margin is deliberately wider than the screen.
  useEffect(() => {
    if (!numPages) return
    let raf = 0
    const update = () => {
      raf = 0
      const root = boxRef.current
      if (!root) return
      const mid = window.innerHeight / 2
      let best = 1
      let bd = Infinity
      root.querySelectorAll('[data-page]').forEach(el => {
        const r = el.getBoundingClientRect()
        if (!r.height) return
        const d = Math.abs(r.top + r.height / 2 - mid)
        if (d < bd) { bd = d; best = +el.dataset.page }
      })
      if (best !== visibleRef.current) { visibleRef.current = best; setVisible(best); onVisible?.(best) }
    }
    const kick = () => { if (!raf) raf = requestAnimationFrame(update) }
    kick()
    window.addEventListener('scroll', kick, { passive: true })
    window.addEventListener('resize', kick)
    return () => { window.removeEventListener('scroll', kick); window.removeEventListener('resize', kick); if (raf) cancelAnimationFrame(raf) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numPages])

  // Paint near pages nearest-first, one at a time. The loop re-reads the near
  // set after every page, so a scroll mid-paint reprioritises without piling up.
  useEffect(() => {
    if (!numPages || !pdfRef.current || drawing.current) return
    drawing.current = true
    ;(async () => {
      const mod = await import('../ingest/pdf.js')
      try {
        for (;;) {
          const pdf = pdfRef.current
          const root = boxRef.current
          if (!pdf || !root) break
          const vis = visibleRef.current
          const next = [...nearRef.current]
            .filter(p => !drawn.current.has(p) && !bad.current.has(p))
            .sort((a, b) => Math.abs(a - vis) - Math.abs(b - vis))[0]
          if (next == null) break
          const canvas = canvases.current.get(next)
          const wrap = root.querySelector(`[data-page="${next}"]`)
          if (!canvas || !wrap) break
          const cssW = wrap.clientWidth || root.clientWidth || 600
          try {
            const ratio = await mod.paintPage(pdf, next, canvas, cssW, window.devicePixelRatio || 1, t => { tasks.current.set(next, t) })
            tasks.current.delete(next)
            if (!nearRef.current.has(next) || pdfRef.current !== pdf) { canvas.width = 0; canvas.height = 0; continue }
            ratios.current.set(next, ratio)
            drawn.current.add(next)
            while (drawn.current.size > MAX_DRAWN) {
              let far = -1
              let fd = -1
              for (const q of drawn.current) {
                const dd = Math.abs(q - visibleRef.current)
                if (dd > fd) { fd = dd; far = q }
              }
              drawn.current.delete(far)
              const c = canvases.current.get(far)
              if (c) { c.width = 0; c.height = 0 } // frees the decoded pixels
            }
            setTick(t => t + 1)
          } catch (e) {
            tasks.current.delete(next)
            if (e?.name === 'RenderingCancelledException') continue
            bad.current.add(next) // one broken page must not stall the rest
          }
        }
      } finally {
        drawing.current = false
      }
    })()
  }, [near, visible, numPages])

  // Follow the audio: a page change scrolls into view — a far jump cuts, a near
  // one glides — but never within 4 s of the listener scrolling by hand.
  useEffect(() => {
    if (typeof activePage !== 'number') return
    if (activePage === visibleRef.current) return
    if (userScroll && Date.now() - userScroll.current < 4000) return
    const el = boxRef.current?.querySelector(`[data-page="${activePage}"]`)
    if (!el) return
    const top = el.getBoundingClientRect().top
    const far = top < -window.innerHeight * 2 || top > window.innerHeight * 3
    el.scrollIntoView({ block: 'start', behavior: far ? 'auto' : 'smooth' })
  }, [activePage, userScroll])

  return (
    <div ref={boxRef} data-testid="page-view" style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
      {Array.from({ length: numPages }, (_, k) => {
        const p = k + 1
        const ratio = ratios.current.get(p) ?? fallback.current
        const isDrawn = drawn.current.has(p)
        return (
          <div key={p} data-page={p} onClick={() => onTapPage?.(p)}
            style={{
              width: '100%', aspectRatio: `1 / ${ratio}`, scrollMarginTop: 120, borderRadius: T.r.sm,
              overflow: 'hidden', background: T.surface, border: `1px solid ${T.border}`, cursor: 'pointer',
            }}>
            <canvas ref={el => { if (el) canvases.current.set(p, el); else canvases.current.delete(p) }}
              style={{
                width: '100%', height: 'auto', display: isDrawn ? 'block' : 'none',
                filter: invert ? 'invert(1) hue-rotate(180deg)' : 'none',
              }} />
          </div>
        )
      })}
    </div>
  )
}
