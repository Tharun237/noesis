import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, lazy, Suspense } from 'react'
import { motion, AnimatePresence, useScroll, useIsPresent } from 'motion/react'
import { leaveCover, arriveCover, coverInFlight } from '../lib/coverflight.js'
import { T, label } from '../theme.js'
import { useStore } from '../lib/store.js'
import { ui, go, goBack, openSheet } from '../lib/nav.js'
import { library, loadDoc, docDuration, reprocess, readiness, kickVoice } from '../lib/library.js'
import { player, open as openPlayer, seekTo, timeline, audioClock, play, pause, nextSentence, prevSentence, setRate } from '../lib/player.js'
import { toggleMark, setMarkNote } from '../lib/library.js'
import { toast } from '../lib/nav.js'
import { parseCommand, speechSupported } from '../lib/voicecmd.js'
import { VoiceControl, VoiceHud } from './VoiceControl.jsx'
import { floatingSupported, openFloating } from '../lib/floating.js'
import { settings } from '../lib/settings.js'
import { hasAiKey } from '../lib/ai.js'
import { useRoute } from '../lib/route.js'
import { pushPanel, popPanel } from '../lib/nav.js'
import { scrollBehavior } from '../lib/motion.js'
import { activeEngine, hasSystemVoice } from '../lib/engine.js'
import { engine, loadEngine } from '../lib/tts.js'
import { askNotify, notifyAsked } from '../lib/ready.js'
import { VISUAL_KINDS } from '../lib/text.js'
import { wordWeights } from '../lib/words.js'
import { numbersIn, columnsIn } from '../lib/sonify.js'
import { findRef } from '../lib/citations.js'
import { voiceName } from '../lib/voices.js'
import { Icon } from './icons.jsx'
import { Button, IconButton, Menu, Progress, Pulse, Segmented, Sheet, Swap, fmtDur, rowIn } from './kit.jsx'
import { db } from '../lib/db.js'
import { Cover, StatusLine, docMenu } from './Library.jsx'
import { Toc, ReadingSettings, Marks, SearchBar, JumpToNow } from './ReaderParts.jsx'
import { FocusView } from './FocusView.jsx'
import { playerHeight } from './PlayerBar.jsx'

// Ask is only needed once someone opens it: loaded on demand to keep the first screen light.
const AskPanel = lazy(() => import('./Ask.jsx').then(m => ({ default: m.AskPanel })))
const Insights = lazy(() => import('./Insights.jsx').then(m => ({ default: m.Insights })))
const CitationSheet = lazy(() => import('./Citations.jsx').then(m => ({ default: m.CitationSheet })))
const PagePane = lazy(() => import('./PagePane.jsx').then(m => ({ default: m.PagePane })))
const BlockTool = lazy(() => import('./BlockTool.jsx').then(m => ({ default: m.BlockTool })))
const FloatingReader = lazy(() => import('./FloatingReader.jsx').then(m => ({ default: m.FloatingReader })))
function FloatingLazy() { return <Suspense fallback={null}><FloatingReader /></Suspense> }
// Pages view (and its pdf.js engine) loads only when a PDF listener asks for it.
const PageView = lazy(() => import('./PageView.jsx').then(m => ({ default: m.PageView })))

const VISUAL_LABEL = { fig: 'Figure', table: 'Table', math: 'Equation', code: 'Code' }
const HEADER_H = 57
// The app's name as a speech recogniser tends to write it.
const WAKE = /^(?:hey\s+)?(?:noesis|no\s?esis|gnosis|no\s?thesis|know\s?esis|noises)[\s,.:!]*/i
const SEEN_BELOW = 120 // px under the header where the reader's eye is taken to be, for the page beside the text
const SUBROW_H = 44 // second header row (Text | Pages) on documents that have pages

export function Reader({ wide }) {
  const id = useRoute().docId // the page's own document, also while it is animating out
  const d = useStore(library, s => s.docs.find(x => x.id === id))
  const status = d?.status
  const total = d?.total
  const [doc, setDoc] = useState(null)
  const [panel, setPanelState] = useState(null) // toc | type | marks | ask
  // A panel shown as a sheet over the page is a history entry, on any screen: Back closes it instead of
  // leaving the document. Only Ask on a wide screen is different: it sits beside the text and is not modal.
  const setPanel = name => {
    if (wide && name === 'ask') {
      if (history.state?.panel) history.replaceState({ ...history.state, panel: null }, '') // came from a sheet (Insights)
      return setPanelState('ask')
    }
    if (name) { pushPanel(name); setPanelState(name) } else if (history.state?.panel) popPanel(); else setPanelState(null)
  }
  useEffect(() => {
    const onPop = e => setPanelState(e.state?.panel || null)
    addEventListener('popstate', onPop)
    return () => removeEventListener('popstate', onPop)
  }, [])
  const [tool, setTool] = useState(null) // the equation, table or figure a tool sheet is open on: { kind, bi }
  const [citedOpen, setCitedOpen] = useState([]) // the entries the citation sheet was opened on (the voice moves on meanwhile)
  const [askAuto, setAskAuto] = useState(null) // a one-tap question for the Ask panel: { id, n }
  const quick = qid => { setAskAuto({ id: qid, n: Date.now() }); setPanel('ask') }
  const [voiceState, setVoiceState] = useState('off')
  const [heard, setHeard] = useState('')
  // What the microphone heard. While the book is playing through a loudspeaker the microphone hears the
  // book too, and the book says "stop" and "next" all the time: then a command must start with "Noesis".
  const [done, setDone] = useState(null) // what was done with the last thing heard: { text, ok, at }
  const [saying, setSaying] = useState('') // the words as they are being heard
  const did = (text, ok = true) => setDone({ text, ok, at: Date.now() })
  const onHeard = said => {
    setHeard(said)
    setSaying(said)
    const m = said.trim().match(WAKE)
    const p = player.get()
    const c = parseCommand(m ? said.trim().slice(m[0].length) : said)
    if (!c) return did('Not a command. Nothing was done.', false)
    if (p.playing && p.id === id && !m) return did('The book is playing: say “Noesis” first, then the command.', false)
    const at = p.id === id ? p.i : d?.pos || 0
    if (c.cmd === 'play') { p.id === id ? play() : openPlayer(id, { at }).then(play); did('Playing') }
    else if (c.cmd === 'pause') { pause(); did('Paused') }
    else if (c.cmd === 'back') { prevSentence(); did('Back one sentence') }
    else if (c.cmd === 'next') { nextSentence(); did('Next sentence') }
    else if (c.cmd === 'slower') { const r = Math.max(0.5, Math.round((p.rate - 0.1) * 10) / 10); setRate(r); did(`Slower: ${r}×`) }
    else if (c.cmd === 'faster') { const r = Math.min(3, Math.round((p.rate + 0.1) * 10) / 10); setRate(r); did(`Faster: ${r}×`) }
    else if (c.cmd === 'bookmark') {
      // The bookmark keeps the last few sentences as its note, so "what was I marking?" has an answer later.
      if (!(d.marks || []).some(x => x.i === at)) toggleMark(id, at)
      if (doc) setMarkNote(id, at, doc.segs.slice(Math.max(0, at - 2), at + 1).map(x => x.t).join(' '))
      did('Bookmarked, with the last few sentences')
    }
    else if (c.cmd === 'explain' || c.cmd === 'recap' || c.cmd === 'skim') { quick(c.cmd); did({ explain: 'Explaining what you just heard', recap: 'Recapping so far', skim: 'Skimming this section' }[c.cmd]) }
    else if (c.cmd === 'ask' && c.arg) { setAskAuto({ q: c.arg, n: Date.now() }); setPanel('ask'); did(`Asking: ${c.arg}`) }
    else did('Not a command. Nothing was done.', false)
  }
  const float = async () => {
    // Opening the window has to happen inside the tap; only its contents are loaded on demand.
    const win = openFloating(() => <FloatingLazy />)
    await win
  }
  const [searching, setSearching] = useState(false)
  const [hit, setHit] = useState(-1)
  const playId = useStore(player, s => s.id)
  const pi = useStore(player, s => s.i)
  const isPlaying = useStore(player, s => s.playing)
  const rate = useStore(player, s => s.rate)
  const skip = useStore(settings, s => s.skipVisuals)
  const tocOpen = useStore(settings, s => s.tocOpen)
  const font = useStore(settings, s => s.readFont)
  const size = useStore(settings, s => s.readSize)
  const leading = useStore(settings, s => s.readLeading)
  const width = useStore(settings, s => s.readWidth)
  const justify = useStore(settings, s => s.justify)
  const words = useStore(settings, s => s.wordHighlight)
  const readerView = useStore(settings, s => s.readerView || 'text')
  const invertSetting = useStore(settings, s => s.invertPages)
  // Inverting suits clean digital pages. A scan's paper tone turns muddy, so scans start un-inverted
  // until the listener chooses (the setting is then a real true/false).
  const invertPages = invertSetting ?? !d?.scanned
  const active = playId === id ? pi : -1
  const userScroll = useRef(0)
  const [hasSource, setHasSource] = useState(null) // does this device hold the original file?
  const [pdfFail, setPdfFail] = useState(false) // the PDF could not be opened as pages
  const [visPage, setVisPage] = useState(1) // page on screen in Pages view
  const [numPages, setNumPages] = useState(0)

  // (Re)load the listening text whenever the document gets (re)prepared.
  useEffect(() => {
    let live = true
    setDoc(null)
    if (id && total) loadDoc(id).then(c => live && setDoc(c))
    return () => { live = false }
  }, [id, total, status === 'voicing' || status === 'ready'])

  // Pages view needs the original file on this device (a synced document has no source here).
  useEffect(() => {
    let live = true
    setHasSource(null)
    setPdfFail(false)
    setVisPage(1)
    setNumPages(0)
    if (d?.kind !== 'pdf') { setHasSource(false); return }
    db.getSource(id).then(src => live && setHasSource(!!src?.blob)).catch(() => live && setHasSource(false))
    return () => { live = false }
  }, [id, d?.kind])

  const pagesAvailable = d?.kind === 'pdf' && hasSource === true
  const view = readerView === 'focus' ? 'focus' : pagesAvailable && !pdfFail && readerView === 'pages' ? 'pages' : 'text'
  // "Both": the flowing text with the original page beside it. A wide screen only; elsewhere it is the text.
  const sideBySide = wide && pagesAvailable && !pdfFail && readerView === 'both'
  const pageOf = i => (doc && i >= 0 && i < doc.segs.length ? doc.blocks[doc.segs[i].b].p ?? null : null)
  const [seenPage, setSeenPage] = useState(null) // the page of the text at the top of the screen, while nothing is being read
  // Sentence i belongs to block segs[i].b, so its page is blocks[segs[i].b].p (1-based; older
  // documents prepared before pages were linked have no p).
  const activePage = view === 'pages' && doc && active >= 0 ? (doc.blocks[doc.segs[active]?.b]?.p ?? null) : null
  const firstOfPage = useMemo(() => {
    const m = new Map()
    if (doc) doc.segs.forEach((s, i) => { const p = doc.blocks[s.b]?.p; if (typeof p === 'number' && !m.has(p)) m.set(p, i) })
    return m
  }, [doc])
  const linked = firstOfPage.size > 0
  // Sentences per page, once per document: sentence i belongs to block segs[i].b.
  const pageSentenceMap = useMemo(() => {
    const m = new Map()
    if (doc) doc.segs.forEach((s, i) => {
      const p = doc.blocks[s.b]?.p
      if (typeof p !== 'number') return
      const e = { i, t: s.t }
      const arr = m.get(p)
      if (arr) arr.push(e)
      else m.set(p, [e])
    })
    return m
  }, [doc])
  const pageSentences = useCallback(p => pageSentenceMap.get(p) ?? [], [pageSentenceMap])

  useEffect(() => {
    if (view !== 'text') return
    if (active < 0 || Date.now() - userScroll.current < 4000) return
    scrollToSentence(active)
  }, [active, doc, view])

  useEffect(() => { if (hit >= 0) scrollToSentence(hit) }, [hit])

  const typo = useMemo(() => ({ font: font === 'serif' ? T.serif : T.font, size, leading, justify, words }), [font, size, leading, justify, words])
  const offs = useMemo(() => (doc && d ? timeline(d, doc) : null), [doc, d?.done, d?.vSec]) // eslint-disable-line react-hooks/exhaustive-deps
  const headings = useMemo(() => (doc ? doc.blocks.map((b, bi) => b.k === 'h' && { text: b.s.join(' '), i: doc.starts[bi] }).filter(Boolean) : []), [doc])
  const marks = d?.marks
  const chunks = useMemo(() => chunkDoc(doc), [doc])
  // Marked sentences per chunk, as a string so unchanged chunks keep the same prop (and skip rendering).
  const marksBy = useMemo(() => {
    const by = new Map()
    for (const m of marks || []) { const ci = chunkOf(chunks, m.i); if (ci >= 0) by.set(ci, (by.get(ci) || '') + m.i + ',') }
    return by
  }, [marks, chunks])
  const near = useNearChunks(chunks, typo)
  const colRef = useRef(null)
  const heights = useRef(new Map()) // chunk -> measured height, so a chunk scrolled away keeps its exact size
  useEffect(() => { heights.current = new Map() }, [typo, doc, wide, width])
  const onHeight = useCallback((ci, h) => { heights.current.set(ci, h) }, [])

  // The works cited in the paragraph being heard, as entries of this document's own reference list.
  const cited = useMemo(() => {
    const here = doc && doc.refs.length > 0 && active >= 0 && active < doc.segs.length // the voice can be past the end while a document is prepared again
    const keys = (here && doc.blocks[doc.segs[active].b].c) || []
    return [...new Set(keys.map(k => findRef(doc.refs, k)).filter(Boolean))]
  }, [doc, active])

  const citedLabel = cited.length === 1 ? '1 work cited here' : `${cited.length} works cited here`
  // The cover is one object shared with the library card (coverflight.js): it lands here from the card, and
  // lifts off again the moment this page starts to leave for the library.
  const coverRef = useRef(null)
  const [landing] = useState(() => coverInFlight(id))
  const present = useIsPresent()
  useLayoutEffect(() => { arriveCover(id, coverRef.current) }, [id])
  useLayoutEffect(() => { if (!present && history.state?.view === 'library') leaveCover(id, coverRef.current) }, [present, id])

  // Side by side with nothing being read: the page follows the reader's own scrolling.
  useEffect(() => {
    if (!sideBySide || active >= 0 || !doc) return undefined
    let raf = 0
    const look = () => {
      raf = 0
      const col = colRef.current
      if (!col) return
      const r = col.getBoundingClientRect()
      const el = document.elementFromPoint(r.left + r.width / 2, HEADER_H + SUBROW_H + SEEN_BELOW)?.closest('[data-i]')
      if (el) setSeenPage(pageOf(+el.dataset.i))
    }
    const kick = () => { if (!raf) raf = requestAnimationFrame(look) }
    kick()
    addEventListener('scroll', kick, { passive: true })
    return () => { removeEventListener('scroll', kick); if (raf) cancelAnimationFrame(raf) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sideBySide, active, doc])

  if (!d) return null
  const onSeek = i => { userScroll.current = 0; playId === id ? seekTo(i) : openPlayer(id, { at: i }) }
  const showToc = wide && tocOpen && headings.length > 1
  const askDocked = wide && panel === 'ask'
  const showPane = sideBySide && !askDocked && !!doc // Ask takes the same side of the screen: one at a time
  const panePage = showPane ? (pageOf(active) ?? seenPage ?? pageOf(d.pos || 0) ?? 1) : null
  const dock = (showToc ? 1 : 0) + (askDocked ? 2 : 0) + (showPane ? 4 : 0)
  const bottom = playerHeight(wide, true, !!playId)
  const headH = HEADER_H + SUBROW_H // every document has the view switch: Text, Focus, and Pages for a PDF on this device
  const sheet = (name, title, body, w) => (
    <Sheet open={panel === name && !(name === 'ask' && wide)} onClose={() => setPanel(null)} wide={wide} title={title} width={w}>{body}</Sheet>
  )

  return (
    <div onWheel={() => { userScroll.current = Date.now() }} onTouchMove={() => { userScroll.current = Date.now() }} style={{ minHeight: '100%' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 20, background: T.bg, borderBottom: `1px solid ${T.border}`, paddingTop: 'env(safe-area-inset-top)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: HEADER_H - 1, padding: `0 ${wide ? 16 : 6}px` }}>
          <IconButton icon="back" label="Back to library" onClick={goBack} />
          {wide && headings.length > 1 && <IconButton icon="toc" label={tocOpen ? 'Hide contents' : 'Show contents'} active={tocOpen} onClick={() => settings.set({ tocOpen: !tocOpen })} />}
          <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: T.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '0 6px' }}>{d.title}</div>
          <IconButton icon="search" label="Find in document" active={searching} onClick={() => setSearching(!searching)} />
          {!wide && headings.length > 1 && <IconButton icon="toc" label="Contents" onClick={() => setPanel('toc')} />}
          <IconButton icon="type" label="Reading settings" onClick={() => setPanel('type')} />
          {wide && <IconButton icon="bookmark" label="Bookmarks & notes" onClick={() => setPanel('marks')} />}
          {speechSupported() && <VoiceControl onState={st => { setVoiceState(st); if (st !== 'listening') { setSaying(''); setDone(null) } }} onHeard={onHeard} onInterim={setSaying} />}
          <IconButton icon="sparkle" label="Ask about this document" active={panel === 'ask'} onClick={() => setPanel(panel === 'ask' ? null : 'ask')} />
          <Menu trigger={t => <IconButton icon="more" label="Document menu" onClick={t} />}
            items={[...(wide ? [] : [{ label: 'Bookmarks & notes', icon: 'bookmark', onClick: () => setPanel('marks') }, '-']),
              ...(view === 'pages' || sideBySide ? [{ label: 'Invert colours', icon: 'eye', right: invertPages ? 'On' : 'Off', onClick: () => settings.set({ invertPages: !invertPages }) }, '-'] : []),
              ...(floatingSupported() ? [{ label: 'Float the words over other windows', icon: 'eye', onClick: float }, '-'] : []),
              { label: 'Insights: emotional arc and hard words', icon: 'list', onClick: () => setPanel('insights') },
              { label: 'Explain what I just heard', icon: 'sparkle', onClick: () => quick('explain') },
              { label: 'Skim this section', icon: 'sparkle', onClick: () => quick('skim') },
              '-',
              { label: 'Listen in another language', icon: 'sparkle', onClick: () => openSheet('language', { docId: d.id }) },
              ...docMenu(d)]} />
        </div>
        {d && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: SUBROW_H, padding: `0 ${wide ? 20 : 14}px 10px` }}>
            <div style={{ width: !pagesAvailable ? 164 : wide ? 320 : 240, flexShrink: 0 }}>
              <Segmented size="sm" value={sideBySide ? 'both' : view}
                options={[{ value: 'text', label: 'Text' }, ...(pagesAvailable ? [{ value: 'pages', label: 'Pages' }] : []), ...(pagesAvailable && wide ? [{ value: 'both', label: 'Both' }] : []), { value: 'focus', label: 'Focus' }]}
                onChange={v => { setPdfFail(false); settings.set({ readerView: v }) }} />
            </div>
            <div style={{ flex: 1, minWidth: 0, textAlign: 'right', fontFamily: T.mono, fontSize: 12, color: T.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {view === 'pages' && numPages > 0 ? `Page ${Math.min(visPage, numPages)} of ${numPages}` : showPane && numPages > 0 ? `Page ${panePage} of ${numPages}` : ''}
            </div>
            {/* The works cited in the paragraph being heard. It lives here, not floating over the page: the bottom
                of the screen already holds the player, the status pill and toasts. */}
            <AnimatePresence>
              {cited.length > 0 && (
                <motion.button key="cited" type="button" aria-label={citedLabel} onClick={() => { setCitedOpen(cited); setPanel('cites') }} whileTap={{ scale: 0.96 }}
                  initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={T.spring}
                  style={{ flexShrink: 0, height: 30, padding: '0 12px', borderRadius: T.r.pill, border: `1px solid ${T.borderHi}`, background: 'transparent', color: T.text, fontFamily: T.font, fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <Icon name="link" size={13} style={{ color: T.lime }} /><Swap>{view === 'pages' && !wide ? String(cited.length) : citedLabel}</Swap>
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        )}
        {view === 'pages' && numPages > 0 && doc && !linked && (
          <div style={{ padding: `0 ${wide ? 20 : 14}px 10px`, fontSize: 12, lineHeight: 1.45, color: T.sub }}>
            Pages aren't linked to the audio for this document. Add it again to link them.
          </div>
        )}
        <AnimatePresence initial={false}>
          {searching && (
            <motion.div key="find" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6, transition: { duration: 0.1, ease: 'easeIn' } }} transition={{ duration: 0.18, ease: T.ease }}>
              <SearchBar doc={doc} onHit={setHit} onClose={() => setSearching(false)} />
            </motion.div>
          )}
        </AnimatePresence>
        {view !== 'focus' && <ReadLine />}
      </header>

      <div style={{ display: 'flex', alignItems: 'flex-start', position: 'relative' }}>
        <AnimatePresence initial={false} mode="popLayout">
        {showToc && (
          <motion.aside key="toc" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20, transition: { duration: 0.12, ease: 'easeIn' } }} transition={{ duration: 0.22, ease: T.ease }}
            style={{ width: T.tocW, flexShrink: 0, position: 'sticky', top: headH, height: `calc(100dvh - ${headH + bottom}px)`, overflowY: 'auto', padding: '20px 10px 20px 14px', borderRight: `1px solid ${T.border}` }}>
            <div style={{ ...label, padding: '0 12px 10px' }}>Contents</div>
            <Toc headings={headings} offs={offs} rate={rate} active={active} onSeek={onSeek} />
          </motion.aside>
        )}
        </AnimatePresence>

        <article style={{ flex: 1, minWidth: 0, padding: wide ? `48px 32px ${120 + bottom}px` : `28px 20px ${100 + bottom}px`, marginRight: askDocked ? T.askW : 0 }}>
          {/* When a side panel opens or closes, the text glides to its new place instead of jumping (measured only then). */}
          <motion.div layout={wide ? 'position' : false} layoutDependency={dock} transition={{ layout: T.settle }} style={{ maxWidth: wide ? width : '100%', margin: '0 auto' }}>
            <div style={{ display: 'flex', gap: 18, alignItems: 'flex-end', marginBottom: 36 }}>
              <motion.div initial={landing ? false : { scale: 0.86, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={T.settle} style={{ flexShrink: 0, transformOrigin: '0 100%' }}>
                <div ref={coverRef} style={{ display: 'flex' }}><Cover d={d} w={wide ? 84 : 64} h={wide ? 112 : 86} /></div>
              </motion.div>
              <div style={{ minWidth: 0, display: 'grid', gap: 8 }}>
                <motion.h1 {...rowIn(0)} style={{ margin: 0, fontSize: wide ? 34 : 26, lineHeight: 1.12, letterSpacing: '-0.025em', fontWeight: 700, color: T.text, wordBreak: 'break-word' }}>{d.title}</motion.h1>
                <motion.div {...rowIn(1)} style={{ fontFamily: T.mono, fontSize: 12, color: T.faint }}>
                  {[d.author, d.chars ? fmtDur(docDuration(d)) : null, voiceName(d.voice), d.mode !== 'full' ? (d.mode === 'long' ? 'Long summary' : 'Short summary') : d.ai && d.kind === 'pdf' ? 'AI narration' : null].filter(Boolean).join(' · ')}
                </motion.div>
                {playId !== id && (d.status === 'voicing' || d.status === 'ready') && (
                  <motion.div {...rowIn(2)}><Button kind="primary" icon="play" onClick={() => openPlayer(id)}>{d.pos > 0 && !d.finished ? 'Resume' : 'Play'}</Button></motion.div>
                )}
              </div>
            </div>

            {d.status !== 'ready' && <Preparing d={d} doc={doc} pos={active >= 0 ? active : d.pos || 0} />}
            <WelcomeBack key={d.id} d={d} onRecap={() => quick('recap')} />
            {(d.note || (d.scanned && !d.ai)) && <DocNote d={d} />}
            {pdfFail && (
              <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.55, margin: '0 0 24px' }}>This file can't be shown as pages on this device.</div>
            )}

            <AnimatePresence mode="wait" initial={false}>
            <motion.div key={view} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.09, ease: 'easeIn' } }} transition={{ duration: 0.18, ease: T.ease }}>
            {view === 'pages' ? (
              <Suspense fallback={null}>
                <PageView key={id} id={id} activePage={activePage} invert={invertPages} userScroll={userScroll}
                  onPages={setNumPages} onVisible={setVisPage}
                  pageSentences={pageSentences} activeSentence={active} onTapSentence={onSeek}
                  onTapPage={pg => { const i = firstOfPage.get(pg); if (i != null) onSeek(i) }}
                  onFail={() => { setPdfFail(true); settings.set({ readerView: 'text' }) }} />
              </Suspense>
            ) : view === 'focus' ? (
              doc && <FocusView doc={doc} active={active} onSeek={onSeek} playing={isPlaying && playId === id} />
            ) : doc && (
              <div ref={colRef} onClick={e => {
                if (window.getSelection()?.toString()) return
                const t = e.target.closest('[data-tool]') // "Take it apart" on an equation, "Hear as sound" on a table
                if (t) { setTool({ kind: t.dataset.tool, bi: +t.dataset.b }); return setPanel('tool') }
                const el = e.target.closest('[data-i]'); if (el) onSeek(+el.dataset.i)
              }}>
                {chunks.map((ch, ci) => {
                  const hasActive = active >= ch.s0 && active < ch.s1
                  const hasHit = hit >= ch.s0 && hit < ch.s1
                  return <Chunk key={ci} ci={ci} ch={ch} doc={doc} typo={typo} skip={skip}
                    mounted={near.has(ci) || hasActive || hasHit}
                    est={heights.current.get(ci) ?? estimateHeight(ch, typo, colRef.current?.clientWidth || (wide ? width : innerWidth - 40))}
                    active={hasActive ? active : -1} dur={hasActive ? doc.durs[active] : 0} tail={hasActive ? (doc.tails?.[active] || 0) : 0} hit={hasHit ? hit : -1}
                    marks={marksBy.get(ci) || ''} onHeight={onHeight} />
                })}
              </div>
            )}
            </motion.div>
            </AnimatePresence>
          </motion.div>
        </article>

        <AnimatePresence initial={false} mode="popLayout">
        {showPane && (
          <motion.aside key="pane" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24, transition: { duration: 0.12, ease: 'easeIn' } }} transition={{ duration: 0.24, ease: T.ease }}
            style={{ width: T.paneW, flexShrink: 0, position: 'sticky', top: headH, height: `calc(100dvh - ${headH + bottom}px)`, padding: 20, boxSizing: 'border-box', borderLeft: `1px solid ${T.border}` }}>
            <Suspense fallback={null}>
              <PagePane key={id} id={id} page={panePage} invert={invertPages} pageSentences={pageSentences} activeSentence={active} onTapSentence={onSeek}
                onTapPage={pg => { const i = firstOfPage.get(pg); if (i != null) onSeek(i) }} onPages={setNumPages}
                onFail={() => { setPdfFail(true); settings.set({ readerView: 'text' }) }} />
            </Suspense>
          </motion.aside>
        )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {askDocked && (
          <motion.aside key="ask" initial={{ x: T.askW }} animate={{ x: 0 }} exit={{ x: T.askW }} transition={T.spring}
            style={{ position: 'fixed', top: headH, right: 0, bottom, width: T.askW, zIndex: 18, background: T.bg, borderLeft: `1px solid ${T.border}` }}>
            <AskPanel d={d} doc={doc} onClose={() => setPanel(null)} auto={askAuto} onSeek={onSeek} />
          </motion.aside>
        )}
      </AnimatePresence>

      {sheet('cites', 'Cited here', panel === 'cites' && citedOpen.length
        ? <Suspense fallback={null}><CitationSheet refs={citedOpen} d={d} onClose={() => setPanel(null)} /></Suspense> : null, 560)}
      <JumpToNow active={active} bottom={bottom} onJump={() => { userScroll.current = 0; scrollToSentence(active) }} />

      {sheet('toc', 'Contents', <div style={{ padding: '20px 10px 24px' }}><div style={{ ...label, padding: '0 12px 12px' }}>Contents</div>
        <Toc headings={headings} offs={offs} rate={rate} active={active} onSeek={onSeek} onClose={() => setPanel(null)} /></div>, 480)}
      {sheet('type', 'Reading settings', <ReadingSettings wide={wide} />, 460)}
      {sheet('marks', 'Bookmarks & notes', <Marks d={d} doc={doc} offs={offs} rate={rate} onSeek={onSeek} onClose={() => setPanel(null)} />, 520)}
      <VoiceHud state={voiceState} words={saying} done={done} bottom={bottom} playing={isPlaying && playId === id} />
      {sheet('insights', 'Insights', panel === 'insights' && doc ? <Suspense fallback={null}><Insights doc={doc} title={d.title}
        onSeek={i => { setPanel(null); onSeek(i) }}
        onAsk={word => { setAskAuto({ q: `Explain the word "${word}" as it is used in this document, in two plain sentences.`, n: Date.now() }); setPanel('ask') }} /></Suspense> : null, 560)}
      {sheet('tool', tool?.kind === 'sonify' ? 'Heard as sound' : 'The equation, taken apart', panel === 'tool' && tool && doc?.blocks[tool.bi]
        ? <Suspense fallback={null}><BlockTool key={tool.kind + tool.bi} tool={tool} doc={doc} d={d} onClose={() => setPanel(null)} /></Suspense> : null, 560)}
      {sheet('ask', 'Ask about this document', <div style={{ height: '78dvh' }}><AskPanel d={d} doc={doc} onClose={() => setPanel(null)} auto={askAuto} onSeek={onSeek} /></div>)}
    </div>
  )
}

// A hairline under the header that fills as the page is read: where am I in this document. It is tied to
// the scroll itself, so it costs no renders.
function ReadLine() {
  const { scrollYProgress } = useScroll()
  return <motion.div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 2, background: T.text, opacity: 0.5, scaleX: scrollYProgress, transformOrigin: '0 50%' }} />
}

// -- windowed rendering -----------------------------------------------------------------
// A book is tens of thousands of sentences. Building them all froze a phone for seconds on open and made
// every background update walk the whole book (measured 2026-10-11: a 3.2 s frame to open a 763-page PDF
// at 4x CPU throttle). So the text is cut into chunks, and only chunks near the screen, plus the one
// holding the sentence being spoken or found, exist in the page. The rest are placeholders of the right height.
const CHUNK_BLOCKS = 24
const AHEAD_PX = 1400 // how far beyond the screen chunks stay built, so scrolling never shows a gap

function chunkDoc(doc) {
  if (!doc) return []
  const out = []
  for (let from = 0; from < doc.blocks.length; from += CHUNK_BLOCKS) {
    const to = Math.min(doc.blocks.length, from + CHUNK_BLOCKS)
    let chars = 0
    for (let bi = from; bi < to; bi++) for (const t of doc.blocks[bi].s) chars += t.length
    out.push({ from, to, s0: doc.starts[from], s1: doc.starts[to - 1] + doc.blocks[to - 1].s.length, chars })
  }
  return out
}

// Chunks are in sentence order: binary search for the one holding sentence i.
function chunkOf(chunks, i) {
  let lo = 0, hi = chunks.length - 1
  while (lo <= hi) {
    const m = (lo + hi) >> 1
    if (i < chunks[m].s0) hi = m - 1
    else if (i >= chunks[m].s1) lo = m + 1
    else return m
  }
  return -1
}

// Height of a chunk that has never been built: characters -> lines at this column width and type size.
function estimateHeight(ch, typo, colW) {
  const perLine = Math.max(20, colW / (typo.size * 0.5))
  const blocks = ch.to - ch.from
  return Math.round((ch.chars / perLine + blocks * 0.6) * typo.size * typo.leading + blocks * typo.size * 1.1)
}

// Which chunks are on or near the screen. One observer for the whole book.
function useNearChunks(chunks, typo) {
  const [near, setNear] = useState(() => new Set([0, 1]))
  useEffect(() => {
    setNear(new Set([0, 1]))
    if (!chunks.length) return
    const io = new IntersectionObserver(entries => {
      setNear(prev => {
        const next = new Set(prev)
        for (const e of entries) e.isIntersecting ? next.add(+e.target.dataset.c) : next.delete(+e.target.dataset.c)
        return next
      })
    }, { rootMargin: `${AHEAD_PX}px 0px` })
    document.querySelectorAll('[data-c]').forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [chunks, typo])
  return near
}

// Far jumps (a chapter away) cut straight there; near ones glide. Gliding across a whole book would build
// and discard every chunk on the way.
function scrollToSentence(i) {
  const el = document.querySelector(`[data-i="${i}"]`)
  if (!el) return
  const top = el.getBoundingClientRect().top
  const far = top < -innerHeight * 2 || top > innerHeight * 3
  el.scrollIntoView({ block: 'center', behavior: far ? 'auto' : scrollBehavior() })
}

const Chunk = memo(function Chunk({ ci, ch, doc, typo, skip, mounted, est, active, dur, tail, hit, marks, onHeight }) {
  const ref = useRef(null)
  useLayoutEffect(() => { if (mounted && ref.current) onHeight(ci, ref.current.offsetHeight) })
  if (!mounted) return <div data-c={ci} style={{ height: est }} />
  const marked = marks ? new Set(marks.split(',').filter(Boolean).map(Number)) : null
  const out = []
  for (let bi = ch.from; bi < ch.to; bi++) {
    const b = doc.blocks[bi]
    const start = doc.starts[bi]
    const end = start + b.s.length
    let m = ''
    if (marked) for (let k = start; k < end; k++) if (marked.has(k)) m += k - start + ','
    out.push(<Block key={bi} bi={bi} b={b} start={start} active={active >= start && active < end ? active - start : -1} dur={dur} tail={tail}
      hit={hit >= start && hit < end ? hit - start : -1} marks={m} dim={skip && VISUAL_KINDS.has(b.k)} typo={typo} />)
  }
  return <div ref={ref} data-c={ci}>{out}</div>
})

// Back after a long gap: offer to hear where the book had got to. The gap is measured once, when the reader
// opens, because listening itself keeps moving `lastPlayed`.
const AWAY_MS = 8 * 3600 * 1000
function WelcomeBack({ d, onRecap }) {
  const keyed = useStore(settings, s => hasAiKey(s))
  const [away] = useState(() => (d.lastPlayed && d.pos > 10 ? Date.now() - d.lastPlayed : 0))
  const [gone, setGone] = useState(false)
  if (!keyed || gone || away < AWAY_MS) return null
  const days = Math.floor(away / 86400000)
  return (
    <div style={{ fontSize: 13.5, color: T.sub, lineHeight: 1.55, margin: '0 0 24px', padding: '12px 14px', borderRadius: T.r.md, border: `1px solid ${T.border}`, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ flex: 1, minWidth: 180 }}>Welcome back. You last listened {days >= 1 ? `${days} day${days === 1 ? '' : 's'} ago` : 'earlier today'}.</span>
      <Button kind="accent" icon="sparkle" onClick={() => { setGone(true); onRecap() }}>Hear a recap</Button>
      <Button onClick={() => setGone(true)}>Not now</Button>
    </div>
  )
}

// Notes about how a document was prepared; scanned books get a one-tap path to AI narration.
function DocNote({ d }) {
  const keyed = useStore(settings, s => hasAiKey(s))
  const offerAi = d.scanned && !d.ai && d.status !== 'queued' && d.status !== 'reading' && d.status !== 'narrating'
  return (
    <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.55, margin: '0 0 24px', padding: '12px 14px', borderRadius: T.r.md, border: `1px solid ${T.border}`, display: 'grid', gap: 10 }}>
      {d.note && <div>{d.note}</div>}
      {offerAi && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 200 }}>For the cleanest read, AI narration reads the page images directly instead of the scan's text layer.</span>
          {keyed
            ? <Button kind="accent" icon="sparkle" onClick={() => reprocess(d.id, { ai: true })}>Use AI narration</Button>
            : <Button icon="settings" onClick={() => go('settings')}>Add an AI key</Button>}
        </div>
      )}
    </div>
  )
}

const fmtWait = w => (w == null ? null : w < 90 ? 'under 2 minutes' : w < 3600 ? `about ${Math.round(w / 60)} minutes` : `about ${(w / 3600).toFixed(1)} hours`)
const offlineErr = e => !navigator.onLine || /failed to fetch|networkerror|load failed|offline|network request failed/i.test(e || '')

function Preparing({ d, doc, pos }) {
  const eng = useStore(engine, s => s.status)
  const engVoice = useStore(engine, s => s.voice)
  const engErr = useStore(engine, s => s.error)
  const loaded = useStore(engine, s => s.loaded)
  const total = useStore(engine, s => s.total)
  const opening = useStore(engine, s => s.opening)
  const sys = useStore(settings, s => activeEngine(s) === 'system')
  const speed = useStore(settings, s => s.voiceSpeed)
  const playId = useStore(player, s => s.id)
  const gate = useStore(player, s => s.gate)
  const textReady = d.status === 'voicing' || d.status === 'ready'
  const [asked, setAsked] = useState(notifyAsked)
  if (sys && textReady) return null // the built-in voice speaks straight away: nothing to prepare
  const gated = playId === d.id && gate != null
  const realDownload = total > 0 && !opening
  // A load from this device's storage that nobody is waiting on is routine: silent.
  const downloading = d.status === 'voicing' && eng !== 'ready' && eng !== 'error' && (gated || realDownload)
  const pct = downloading ? (total ? loaded / total : 0) : d.status === 'voicing' ? d.done / Math.max(1, d.total) : d.prep || 0
  const ready = d.status === 'voicing' && !downloading ? readiness(d, doc, pos) : null
  const slow = speed > 0 && speed < 1 && hasSystemVoice()
  const voiceOff = eng === 'error' && offlineErr(engErr)
  return (
    <div style={{ padding: 18, borderRadius: T.r.lg, border: `1px solid ${d.status === 'error' || eng === 'error' ? T.danger : T.border}`, background: T.surface, display: 'grid', gap: 12, marginBottom: 32 }}>
      <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
        {eng === 'error' && d.status === 'voicing'
          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: T.danger }}>
              <Pulse color={T.danger} />
              {voiceOff ? "You're offline. The voice downloads when you're back online." : "The voice couldn't start."}
            </span>
          : downloading
          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: eng === 'error' ? T.danger : T.accent }}>
              <Pulse color={eng === 'error' ? T.danger : T.accent} />
              {realDownload && pct >= 0.01 ? `Downloading the voice · ${Math.floor(pct * 100)}%` : realDownload ? 'Downloading the voice' : 'Getting the voice ready'}
            </span>
          : ready
            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: ready.ready ? T.lime : T.text }}>
                {ready.ready ? <Icon name="check" size={15} /> : <Pulse />}
                {ready.ready ? 'Ready to play' : ready.wait == null ? 'Preparing the voice' : `Preparing the natural voice · ready in ${fmtWait(ready.wait)}`}
              </span>
            : <StatusLine d={d} />}
      </div>
      {d.status !== 'error' && <Progress value={pct} />}
      <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.5 }}>
        {eng === 'error' && d.status === 'voicing'
          ? voiceOff ? "The voice downloads when you're back online." : 'Tap Retry to try again.'
          : downloading
          ? realDownload ? 'One time only. After this, this voice works offline on this device.' : 'A few seconds.'
          : ready
            ? ready.ready
              ? 'The rest is prepared ahead of you as you listen.'
              : gated
                ? `Noesis prepares enough audio to play to the end without pauses (this device generates at ${speed ? speed.toFixed(2) : '…'}× speaking speed). Play starts by itself when ready.`
                : "Noesis prepares enough audio to play to the end without pauses. Press Play when it's ready."
            : d.status === 'error' ? 'Use the menu above to try again.'
            : d.status === 'queued' ? 'Starts when the earlier book is done.'
            : d.status === 'syncing' ? 'Waiting for your other device or the download.'
            : d.status === 'reading' ? 'Reading the file on this device.'
            : 'Preparing the text. This page fills in when it is ready.'}
      </div>
      {eng === 'error' && d.status === 'voicing' && !voiceOff && (
        <div><Button icon="refresh" onClick={() => loadEngine(engVoice).then(kickVoice).catch(() => {})}>Retry</Button></div>
      )}
      {ready && !ready.ready && slow && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 200, fontSize: 13, color: T.sub }}>Don't want to wait? Your device's built-in voice starts instantly.</span>
          <Button kind="accent" onClick={() => settings.set({ voiceEngine: 'system' })}>Use built-in voice</Button>
        </div>
      )}
      {!asked && d.status !== 'error' && !ready?.ready && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 200, fontSize: 13, color: T.sub }}>Leave it running and get a notification when it's ready.</span>
          <Button icon="bell" onClick={async () => { await askNotify(); setAsked(true) }}>Notify me</Button>
        </div>
      )}
    </div>
  )
}

// Word timing lives in src/lib/words.js so the lock screen can reuse it.
function ActiveSentence({ i, text, dur, tail, words, plain }) {
  const { ws, ends } = useMemo(() => wordWeights(text), [text])
  const starts = useMemo(() => { let at = 0; return ws.map(x => { const s0 = at; at += x.length + 1; return s0 }) }, [ws])
  const [w, setW] = useState(-1)
  // Built-in voice: exact word positions reported by the speech engine.
  const sys = useStore(settings, s => activeEngine(s) === 'system')
  const spoken = useStore(player, s => s.word)
  const sysWord = sys ? Math.max(0, starts.findLastIndex(x => x <= spoken)) : -1
  useEffect(() => {
    if (sys || !words || !dur) return
    let raf
    const tick = () => {
      const f = (audioClock() - 0.06) / Math.max(0.2, dur - (tail || 0))
      setW(f <= 0 ? 0 : ends.findIndex(e => e >= f))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [sys, words, dur, tail, ends])
  const lit = sys ? sysWord : w
  const showWords = words && (sys || dur)
  return (
    <span data-i={i} style={{ cursor: 'pointer', borderRadius: 4, padding: '2px 1px', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone', background: plain ? 'transparent' : T.accentSoft, color: T.text, boxShadow: plain ? 'none' : `0 0 0 2px ${T.accentSoft}` }}>
      {showWords ? ws.map((x, k) => <span key={k} style={{ color: k === lit ? T.lime : undefined }}>{x}{k < ws.length - 1 ? ' ' : ''}</span>) : text}{' '}
    </span>
  )
}

// What a block offers beyond being read aloud: an equation can be taken apart, numbers can be heard as sound.
const SOUND_MIN = 3 // fewer numbers than this make no shape worth hearing
const hasSound = b => (b.d ? columnsIn(b.d).length > 0 : numbersIn(b.s.join(' ')).length >= SOUND_MIN)
const toolFor = b => (b.k === 'math' ? 'equation' : (b.k === 'table' || b.k === 'fig') && hasSound(b) ? 'sonify' : null)
const TOOL_LABEL = { equation: 'Take it apart', sonify: 'Hear as sound' }

// The light behind the sentence being read. A sentence wraps over several lines, so its background cannot
// itself fade without repainting text; instead the same shapes are drawn behind the text as boxes measured
// from the sentence's own lines, and the boxes fade: the light leaves one sentence as it reaches the next.
// Until they are measured (or if they cannot be) the sentence keeps its own plain background.
const LIT = { position: 'relative', isolation: 'isolate' }
function useGlow(host, at) {
  const [boxes, setBoxes] = useState(null) // 'x,y,w,h;...' relative to the host, or null
  useLayoutEffect(() => {
    const el = host.current
    if (!el || at < 0) { setBoxes(null); return undefined }
    const measure = () => {
      const s = el.querySelector(`[data-i="${at}"]`)
      const base = el.getBoundingClientRect()
      const lines = s ? [...s.getClientRects()].filter(r => r.width > 1 && r.height > 1) : []
      const next = lines.map(r => [r.left - base.left - el.clientLeft, r.top - base.top - el.clientTop, r.width, r.height].map(Math.round).join(',')).join(';')
      setBoxes(next || null)
    }
    measure()
    const ro = new ResizeObserver(measure) // type size, column width, a late font: the lines move
    ro.observe(el)
    return () => ro.disconnect()
  }, [host, at])
  return boxes
}

function Glow({ boxes, at }) {
  return (
    <AnimatePresence>
      {boxes && (
        <motion.span key={at} aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.22, ease: 'easeOut' } }} transition={{ duration: 0.16, ease: 'easeOut' }}
          style={{ position: 'absolute', inset: 0, zIndex: -1, pointerEvents: 'none' }}>
          {boxes.split(';').map((box, k) => {
            const [x, y, w, h] = box.split(',').map(Number)
            return <span key={k} style={{ position: 'absolute', left: x, top: y, width: w, height: h, borderRadius: 4, background: T.accentSoft, boxShadow: `0 0 0 2px ${T.accentSoft}` }} />
          })}
        </motion.span>
      )}
    </AnimatePresence>
  )
}

const Block = memo(function Block({ bi, b, start, active, dur, tail, hit, marks, dim, typo }) {
  const host = useRef(null)
  const at = active >= 0 ? start + active : -1
  const boxes = useGlow(host, at)
  const glow = <Glow boxes={boxes} at={at} />
  const tool = useMemo(() => (VISUAL_KINDS.has(b.k) ? toolFor(b) : null), [b])
  const marked = marks ? new Set(marks.split(',').filter(Boolean).map(Number)) : null
  const sentences = b.s.map((t, k) => k === active
    ? <ActiveSentence key={k} i={start + k} text={t} dur={dur} tail={tail} words={typo.words} plain={!!boxes} />
    : (
      <span key={k} data-i={start + k}
        style={{
          cursor: 'pointer', borderRadius: 4, padding: '2px 1px', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone',
          boxShadow: k === hit ? `0 0 0 2px ${T.accent}` : 'none',
          borderBottom: marked?.has(k) ? `2px solid ${T.accent}` : undefined,
        }}>{t}{' '}</span>
    ))
  const box = { contentVisibility: 'auto', containIntrinsicSize: 'auto 120px' }
  if (b.k === 'h') return <h2 ref={host} style={{ ...box, ...LIT, fontSize: Math.round(typo.size * 1.2), lineHeight: 1.3, fontWeight: 700, letterSpacing: '-0.015em', color: T.text, margin: '44px 0 14px' }}>{sentences}{glow}</h2>
  if (VISUAL_KINDS.has(b.k)) {
    return (
      <motion.figure initial={false} animate={{ opacity: dim ? 0.4 : 1 }}
        style={{ ...box, margin: '22px 0', padding: '14px 16px', borderRadius: T.r.md, border: `1px solid ${T.border}`, background: T.surface }}>
        <div style={{ ...label, color: T.accent, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name={b.k === 'code' ? 'text' : b.k === 'math' ? 'sparkle' : 'grid'} size={13} />{VISUAL_LABEL[b.k]}{dim ? ' · skipped' : ''}
          {tool && (
            <button type="button" data-tool={tool} data-b={bi}
              style={{ marginLeft: 'auto', height: 28, padding: '0 12px', borderRadius: T.r.pill, border: `1px solid ${T.borderHi}`, background: 'transparent', color: T.text, fontFamily: T.font, fontSize: 12, fontWeight: 600, letterSpacing: 0, textTransform: 'none', cursor: 'pointer' }}>
              {TOOL_LABEL[tool]}
            </button>
          )}
        </div>
        <div ref={host} style={{ ...LIT, fontFamily: typo.font, fontSize: typo.size - 2, lineHeight: typo.leading, color: T.sub }}>{sentences}{glow}</div>
      </motion.figure>
    )
  }
  return (
    <p ref={host} style={{ ...box, ...LIT, fontFamily: typo.font, fontSize: typo.size, lineHeight: typo.leading, color: T.body, margin: `0 0 ${Math.round(typo.size * 1.1)}px`, textAlign: typo.justify ? 'justify' : 'start', hyphens: typo.justify ? 'auto' : 'manual', textWrap: 'pretty' }}>
      {sentences}{glow}
    </p>
  )
})
