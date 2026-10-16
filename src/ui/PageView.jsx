// Original PDF pages, one under another, fitted to the reading column width.
//
// Performance (phones, 700-page books): every page is a placeholder div of the
// right height; ONE IntersectionObserver (about a screen of margin) tracks which
// pages are near; pages are painted one at a time through pdf.js's worker, and at
// most 6 canvases stay drawn (the farthest is released by zeroing its size).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { T } from '../theme.js'
import { db } from '../lib/db.js'
import { locatePage, sentenceAt, partOf } from '../lib/locate.js'
import { useLitWord } from './litword.js'
import { scrollBehavior } from '../lib/motion.js'

const MAX_DRAWN = 6
const FOLLOW_AT = 0.38 // where on the screen the line being read is kept
const FOLLOW_SLACK = 0.06 // how far it may drift before the page glides it back
const FALLBACK_RATIO = 1.4142 // A4-ish until the first page reports its true size
// The sentence being spoken, marked like a highlighter pen: on a white page the ink multiplies (the text
// stays black); on an inverted page it is a lime wash. The ink (opacity, blend) is on ONE layer and the
// line shapes inside it are solid, so lines that overlap in tight type do not show darker bands.
// Position is set once per sentence; only opacity animates.
export const MARK = { position: 'absolute', background: T.lime, borderRadius: 3 }
export const MARK_INK = { light: { opacity: 0.5, mixBlendMode: 'multiply' }, dark: { opacity: 0.32, mixBlendMode: 'normal' } }

// The sentence being spoken, on the page. Handed over, never blinked: the mark of the sentence before fades as this
// one's comes, so no frame is without one (it was taken away at once and the new one rose from nothing).
export function SentenceOnPage({ i, rects, invert }) {
  const ink = MARK_INK[invert ? 'dark' : 'light']
  return (
    <AnimatePresence initial={false}>
      <motion.div key={i} data-testid="sentence-mark" data-sentence={i} initial={{ opacity: 0 }} animate={{ opacity: ink.opacity }}
        exit={{ opacity: 0, transition: { duration: 0.24, ease: 'easeOut' } }} transition={{ duration: 0.2, ease: 'easeOut' }}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none', mixBlendMode: ink.mixBlendMode }}>
        {rects.map((rc, k) => <div key={k} style={{ ...MARK, left: `${rc.x * 100}%`, top: `${rc.y * 100}%`, width: `${rc.w * 100}%`, height: `${rc.h * 100}%` }} />)}
      </motion.div>
    </AnimatePresence>
  )
}

// The sentence Find is on, ringed as the Text view rings it (Reader.jsx Block): the page turned to the match and
// showed nothing, so Find in Pages looked broken (random customer, 16 October 2026). Still: it is placed, not moved.
export function FoundOnPage({ rects }) {
  return (
    <div data-testid="found-mark" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {rects.map((rc, k) => <div key={k} style={{ position: 'absolute', borderRadius: 3, outline: `2px solid ${T.accent}`, outlineOffset: 1, left: `${rc.x * 100}%`, top: `${rc.y * 100}%`, width: `${rc.w * 100}%`, height: `${rc.h * 100}%` }} />)}
    </div>
  )
}

// The word being said, on the page: it fills with lime from its first letter to its last in the time the voice
// takes to say it, as in Text and Focus (Spoken.jsx): one language for the voice in every view. It was a box that
// appeared at each word and vanished at the next, three times a second. Now ONE pen stays on the page: at each word
// it is placed there and its fill started again (the browser's own animation, run by the compositor). New elements
// and a second fade for every word cost a phone's main thread three times what the old box did (measured,
// 16 October 2026); one element moved costs what the box did. Its place is worked out from the word's share of the
// sentence's length (the page gives lines, not words); a word broken over two lines fills both pieces at once.
const WORD_INK = { light: { opacity: 0.55, mixBlendMode: 'multiply' }, dark: { opacity: 0.5, mixBlendMode: 'normal' } }
const PIECES = 2 // a word is on one line, or broken over two
// Where in a sentence a character falls, as a share of the sentence's WIDTH when set in type. Letters are not equally
// wide (an "M" is three "i"s): a share by count put the word a letter late on the page ("S|equence" filled from its
// "e", 16 October 2026). Measured with a serif face, as most books and papers are set, so wide and narrow letters
// count as they should whatever the face; the page's own line widths do the rest (partOf).
let ruler = null
function shareOf(text) {
  ruler ??= new OffscreenCanvas(1, 1).getContext('2d')
  ruler.font = '100px serif'
  const total = ruler.measureText(text).width || 1
  return i => ruler.measureText(text.slice(0, i)).width / total
}
const FILL = [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }]
export function WordOnPage({ rects, spoken, invert }) {
  const { ws, starts, lit, ms, shown } = useLitWord(spoken?.text, spoken?.dur, spoken?.tail, !!spoken?.words)
  const pens = useRef([])
  const fills = useRef([]) // the fill under way on each piece: cancelled before the next starts, or they pile up on the element
  const on = shown && lit >= 0 && lit < ws.length
  const share = useMemo(() => (spoken?.text ? shareOf(spoken.text) : null), [spoken?.text])
  const parts = on ? partOf(rects, share(starts[lit]), share(starts[lit] + ws[lit].length)).slice(0, PIECES) : []
  const key = on ? `${spoken.text.length}:${lit}` : ''
  useLayoutEffect(() => {
    if (!key) return
    fills.current.forEach(f => f?.cancel())
    // no fill mode: once said, the piece rests in its own style, full; nothing is left holding on to it
    fills.current = pens.current.map(el => (el && el.style.display !== 'none' ? el.animate(FILL, { duration: Math.max(1, ms), easing: 'linear' }) : null))
  }, [key, ms])
  const ink = WORD_INK[invert ? 'dark' : 'light']
  return (
    <div data-testid="word-mark" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: ink.opacity, mixBlendMode: ink.mixBlendMode, display: on ? 'block' : 'none' }}>
      {Array.from({ length: PIECES }, (_, k) => {
        const rc = parts[k]
        return <div key={k} ref={el => { pens.current[k] = el }} style={rc ? { ...MARK, transformOrigin: '0 50%', left: `${rc.x * 100}%`, top: `${rc.y * 100}%`, width: `${rc.w * 100}%`, height: `${rc.h * 100}%` } : { display: 'none' }} />
      })}
    </div>
  )
}

export function PageView({ id, activePage, invert, userScroll, onPages, onVisible, onTapPage, onFail, pageSentences, activeSentence, onTapSentence, spoken, found = -1, foundPage = null }) {
  const [numPages, setNumPages] = useState(0)
  const [near, setNear] = useState(() => new Set([1]))
  const [visible, setVisible] = useState(1)
  const [tick, setTick] = useState(0) // ratios/drawn/located live in refs; bump to re-render
  const boxRef = useRef(null)
  const pdfRef = useRef(null)
  const ratios = useRef(new Map())
  const fallback = useRef(FALLBACK_RATIO)
  const drawn = useRef(new Set())
  const canvases = useRef(new Map())
  const tasks = useRef(new Map())
  const located = useRef(new Map()) // page -> [{ i, rects }] for the sentences on that page
  const followed = useRef(-1) // the sentence the view last decided about: one decision per sentence
  const placedFound = useRef({ i: -1, exact: false }) // the match Find last turned to, and whether to its line yet
  const psRef = useRef(pageSentences)
  psRef.current = pageSentences
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
    located.current = new Map()
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

  // Find page p's sentences in its own text layer, after its paint. Scanned
  // pages have no text layer: they keep no entry and today's page-level behaviour.
  const locateOne = (pdf, mod, p) => {
    const list = psRef.current?.(p) ?? []
    if (!list.length) return
    mod.pageLayout(pdf, p).then(
      lines => {
        if (pdfRef.current !== pdf || !drawn.current.has(p)) return
        located.current.set(p, locatePage(lines, list))
        setTick(t => t + 1)
      },
      e => { if (pdfRef.current === pdf) throw e }, // the view closed mid-read: nothing to report
    )
  }

  // The document's sentences can arrive after a page is already painted (the PDF and the text load
  // separately): look again on the pages that are drawn but not yet matched.
  useEffect(() => {
    const pdf = pdfRef.current
    if (!pdf || !drawn.current.size) return
    import('../ingest/pdf.js').then(mod => { for (const p of drawn.current) if (!located.current.has(p)) locateOne(pdf, mod, p) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSentences])

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
              located.current.delete(far)
              const c = canvases.current.get(far)
              if (c) { c.width = 0; c.height = 0 } // frees the decoded pixels
            }
            setTick(t => t + 1)
            // Off the click path: after the paint, one page at a time, find the
            // page's sentences in its own text layer for the mark and tap.
            locateOne(pdf, mod, next)
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
  // one glides — but never within 4 s of the listener scrolling by hand. The first
  // placement after the view opens is a cut too: the view arrives AT the page being
  // read (it used to open on page 1 of a book that was on page 80). It runs again
  // when the pages are first laid out, which is when there is a page to go to.
  const fresh = useRef(true)
  useEffect(() => {
    if (typeof activePage !== 'number') return
    if (activePage === visibleRef.current) return
    if (userScroll && Date.now() - userScroll.current < 4000) return
    if (located.current.get(activePage)?.some(e => e.i === activeSentence)) return // the sentence follow below places it
    const el = boxRef.current?.querySelector(`[data-page="${activePage}"]`)
    if (!el) return
    const top = el.getBoundingClientRect().top
    const far = top < -window.innerHeight * 2 || top > window.innerHeight * 3
    el.scrollIntoView({ block: 'start', behavior: far || fresh.current ? 'auto' : scrollBehavior() })
    fresh.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage, userScroll, numPages])

  // The page holding the sentence being spoken, and its mark rects.
  let activeRects = null
  let activeLocPage = 0
  if (typeof activeSentence === 'number' && activeSentence >= 0) {
    for (const [p, loc] of located.current) {
      const hit = loc.find(e => e.i === activeSentence)
      if (hit) { activeRects = hit.rects; activeLocPage = p; break }
    }
  }

  // Follow the sentence: when it changes and it has rects, and the listener has not scrolled by hand in the last
  // 4 s, glide it to FOLLOW_AT. When the active sentence has no rects, the page-level follow above stays as is.
  useEffect(() => {
    if (typeof activeSentence !== 'number' || activeSentence < 0) return
    const loc = located.current.get(activeLocPage)
    const hit = loc?.find(e => e.i === activeSentence)
    if (!hit?.rects?.length) return
    // Once per sentence. This effect also runs when a page finishes painting (tick): without this, a
    // paint would pull the screen back to the sentence while the listener is looking somewhere else.
    if (followed.current === activeSentence) return
    followed.current = activeSentence
    if (userScroll && Date.now() - userScroll.current < 4000) return
    const el = boxRef.current?.querySelector(`[data-page="${activeLocPage}"]`)
    if (!el) return
    const r = el.getBoundingClientRect()
    if (!r.height) return
    const top = r.top + hit.rects[0].y * r.height
    // The line being read stays where the eye already is, like lyrics: a short glide at each sentence, not a jump
    // of half a screen each time it had sunk out of the middle (it waited until 70% down, then went to 35%).
    const dy = top - window.innerHeight * FOLLOW_AT
    if (Math.abs(dy) < window.innerHeight * FOLLOW_SLACK) return
    window.scrollTo({ top: window.scrollY + dy, behavior: Math.abs(dy) < window.innerHeight * 1.5 ? scrollBehavior() : 'auto' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSentence, tick, userScroll])

  // Find: its page is turned to at once, then, when the page has been painted and its sentences found on it, the
  // match is brought to where the eye is (FOLLOW_AT), once.
  const foundRects = typeof foundPage === 'number' && found >= 0 ? located.current.get(foundPage)?.find(e => e.i === found)?.rects || null : null
  useEffect(() => {
    if (!(found >= 0) || typeof foundPage !== 'number') { placedFound.current = { i: -1, exact: false }; return }
    const el = boxRef.current?.querySelector(`[data-page="${foundPage}"]`)
    if (!el) return
    const r = el.getBoundingClientRect()
    if (placedFound.current.i !== found) {
      placedFound.current = { i: found, exact: false }
      const far = r.top < -window.innerHeight * 2 || r.top > window.innerHeight * 3
      if (!foundRects) { el.scrollIntoView({ block: 'start', behavior: far ? 'auto' : scrollBehavior() }); return }
    }
    if (placedFound.current.exact || !foundRects?.length || !r.height) return
    placedFound.current.exact = true
    const dy = r.top + foundRects[0].y * r.height - window.innerHeight * FOLLOW_AT
    window.scrollTo({ top: window.scrollY + dy, behavior: Math.abs(dy) < window.innerHeight * 1.5 ? scrollBehavior() : 'auto' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found, foundPage, tick, numPages])

  // A tap on a page with located sentences starts at the tapped sentence (point
  // as fractions of the wrapper's box); otherwise the page-level tap stays.
  const onTap = (e, p) => {
    const loc = located.current.get(p)
    if (loc?.length && onTapSentence) {
      const r = e.currentTarget.getBoundingClientRect()
      const i = sentenceAt(loc, (e.clientX - r.left) / (r.width || 1), (e.clientY - r.top) / (r.height || 1))
      if (i != null) { onTapSentence(i); return }
    }
    onTapPage?.(p)
  }

  return (
    <div ref={boxRef} data-testid="page-view" style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
      {Array.from({ length: numPages || 1 }, (_, k) => { // one page's shape while the file is being opened
        const p = k + 1
        const ratio = ratios.current.get(p) ?? fallback.current
        const isDrawn = drawn.current.has(p)
        return (
          <div key={p} data-page={p} onClick={e => onTap(e, p)}
            style={{
              position: 'relative',
              width: '100%', aspectRatio: `1 / ${ratio}`, scrollMarginTop: 120, borderRadius: T.r.sm,
              overflow: 'hidden', background: T.surface, border: `1px solid ${T.border}`, cursor: 'pointer',
            }}>
            <canvas ref={el => { if (el) canvases.current.set(p, el); else canvases.current.delete(p) }}
              style={{
                width: '100%', height: 'auto', display: isDrawn ? 'block' : 'none',
                filter: invert ? 'invert(1) hue-rotate(180deg)' : 'none',
              }} />
            {p === activeLocPage && activeRects && <SentenceOnPage i={activeSentence} rects={activeRects} invert={invert} />}
            {p === activeLocPage && activeRects && <WordOnPage rects={activeRects} spoken={spoken} invert={invert} />}
            {p === foundPage && foundRects && <FoundOnPage rects={foundRects} />}
          </div>
        )
      })}
    </div>
  )
}
