import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, Suspense } from 'react'
import { later } from './later.jsx'
import { motion, AnimatePresence, useIsPresent } from 'motion/react'
import { leaveCover, arriveCover, coverInFlight } from '../lib/coverflight.js'
import { T, label } from '../theme.js'
import { useStore } from '../lib/store.js'
import { ui, go, goBack, openSheet, tab as showTab } from '../lib/nav.js'
import { library, loadDoc, docDuration, reprocess, readiness, kickVoice, pauseTranslation, resumeTranslation, fetchOriginal, originals } from '../lib/library.js'
import { account, syncState } from '../lib/sync.js'
import { player, open as openPlayer, seekTo, timeline, audioClock, play, pause, nextSentence, prevSentence, setRate, startNow } from '../lib/player.js'
import { toggleMark, setMarkNote } from '../lib/library.js'
import { toast } from '../lib/nav.js'
import { parseCommand, isEcho, speechSupported } from '../lib/voicecmd.js'
import { VoiceControl, VoiceHud } from './VoiceControl.jsx'
import { floatingSupported, openFloating } from '../lib/floating.js'
import { settings } from '../lib/settings.js'
import { hasAiKey } from '../lib/ai.js'
import { useRoute } from '../lib/route.js'
import { pushPanel, popPanel } from '../lib/nav.js'
import { scrollBehavior, whenIdle } from '../lib/motion.js'
import { activeEngine, hasSystemVoice } from '../lib/engine.js'
import { engine, loadEngine, voiceWait } from '../lib/tts.js'
import { waitWords, LONG_WAIT_S } from '../lib/readiness-math.js'
import { askNotify, notifyAsked } from '../lib/ready.js'
import { VISUAL_KINDS } from '../lib/text.js'
import { useLitWord } from './litword.js'
import { Spoken } from './Spoken.jsx'
import { numbersIn, columnsIn } from '../lib/sonify.js'
import { findRef } from '../lib/citations.js'
import { voiceName } from '../lib/voices.js'
import { Icon } from './icons.jsx'
import { Button, IconButton, Menu, Progress, Pulse, Segmented, Sheet, Spinner, Swap, fmtDur, rowIn } from './kit.jsx'
import { figureNews } from '../lib/figstore.js'
import { db } from '../lib/db.js'
import { Cover, StatusLine, docMenu } from './Library.jsx'
import { DocInsight } from './Heard.jsx'
import { usePace } from './usePace.js'
import { atPace } from '../lib/pace.js'
import { Toc, ReadingSettings, Marks, SearchBar, JumpToNow } from './ReaderParts.jsx'
import { FocusView } from './FocusView.jsx'
import { playerHeight } from './PlayerBar.jsx'

// These are only needed once someone opens them: kept out of the first screen, fetched in a quiet moment
// once a document is open (below), so that opening one shows it and not an empty sheet (later.jsx).
const AskPanel = later(() => import('./Ask.jsx').then(m => m.AskPanel))
const Insights = later(() => import('./Insights.jsx').then(m => m.Insights))
const CitationSheet = later(() => import('./Citations.jsx').then(m => m.CitationSheet))
const PagePane = later(() => import('./PagePane.jsx').then(m => m.PagePane))
const BlockTool = later(() => import('./BlockTool.jsx').then(m => m.BlockTool))
const FloatingReader = later(() => import('./FloatingReader.jsx').then(m => m.FloatingReader))
function FloatingLazy() { return <Suspense fallback={null}><FloatingReader /></Suspense> }
// Pages view (and its pdf.js engine) loads only when a PDF listener asks for it.
const PageView = later(() => import('./PageView.jsx').then(m => m.PageView))
// What stands where the pages will be while they are fetched and opened: the shape of a page, not nothing.
const PAGE_SHAPE = 1.414 // tall over wide, A4: only until the real page says its own
const pageGhost = <div aria-hidden style={{ width: '100%', aspectRatio: `1 / ${PAGE_SHAPE}`, borderRadius: T.r.sm, background: T.surface, border: `1px solid ${T.border}` }} />

const VISUAL_LABEL = { fig: 'Figure', table: 'Table', math: 'Equation', code: 'Code' }
const HEADER_H = 57
// The app's name as a speech recogniser tends to write it.
const SEEN_BELOW = 120 // px under the header where the reader's eye is taken to be, for the page beside the text
// Room under the last line. The app already keeps the page clear of the player; adding the player's height
// here as well left more empty page than a sideways phone has screen: scroll to the end of a short document
// and there was nothing on it (found by the random customer).
const END_PAD = 48
const FOCUS_PAD = 20 // px around the Focus stage
const SUBROW_H = 44 // second header row (Text | Pages) on documents that have pages

export function Reader({ wide }) {
  const id = useRoute().docId // the page's own document, also while it is animating out
  const d = useStore(library, s => s.docs.find(x => x.id === id))
  // A document that is no longer there (deleted here or on another device, and then come back to with Back):
  // its place in history becomes the library. It used to be an empty black page (found by the random customer).
  const libraryLoaded = useStore(library, s => s.loaded)
  useEffect(() => { if (libraryLoaded && !d) showTab('library') }, [libraryLoaded, d])
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
  // The sheet on screen and the history entry behind it must never disagree: if navigation changed the entry
  // under an open sheet, the sheet follows it. (Back must always close what is on top.)
  useEffect(() => ui.sub(() => setPanelState(p => (!p || (wide && p === 'ask') || history.state?.panel === p ? p : history.state?.panel || null))), [wide])
  const keyed = useStore(settings, s => hasAiKey(s))
  const [askAuto, setAskAuto] = useState(null) // a one-tap question for the Ask panel: { id, n }
  const quick = qid => { setAskAuto({ id: qid, n: Date.now() }); setPanel('ask') }
  const [voiceState, setVoiceState] = useState('off')
  const [heard, setHeard] = useState('')
  // What the microphone heard, and what was done about it. While the book plays through a loudspeaker the
  // microphone hears the book too: that is told apart by comparing it with what is being read (voicecmd.js),
  // so the listener just says what they want.
  const [done, setDone] = useState(null) // what was done with the last thing heard: { text, ok, at }
  const [saying, setSaying] = useState('') // the words as they are being heard
  const did = (text, ok = true) => setDone({ text, ok, at: Date.now() })
  const onHeard = (said, guesses = [said]) => {
    setHeard(said)
    setSaying(said)
    const p = player.get()
    if (p.playing && p.id === id && doc && isEcho(said, doc.segs.slice(Math.max(0, p.i - 2), p.i + 3).map(x => x.t).join(' '))) return // the book, not the listener
    const c = guesses.map(parseCommand).find(Boolean) // every reading the speech service offered, best first
    if (!c) return did('Not something I can do. Try: pause, go back, next page, slower.', false)
    const at = p.id === id ? p.i : d?.pos || 0
    const goTo = (i, what) => { if (i == null) return did(`There is no ${what}.`, false); onSeek(i); did(`Going to the ${what}`) }
    const pageFrom = (page, step) => { for (let n = page + step, tries = 0; tries < 20; n += step, tries++) { const i = firstOfPage.get(n); if (i != null) return i } return null }
    if (c.cmd === 'play') { p.id === id ? play() : openPlayer(id, { at }).then(play); did('Playing') }
    else if (c.cmd === 'pause') { pause(); did('Paused') }
    else if (c.cmd === 'back') { prevSentence(); did('Back one sentence') }
    else if (c.cmd === 'next') { nextSentence(); did('Next sentence') }
    else if (c.cmd === 'slower') { const r = Math.max(0.5, Math.round((p.rate - 0.1) * 10) / 10); setRate(r); did(`Slower: ${r}×`) }
    else if (c.cmd === 'faster') { const r = Math.min(3, Math.round((p.rate + 0.1) * 10) / 10); setRate(r); did(`Faster: ${r}×`) }
    else if (c.cmd === 'normal') { setRate(1); did('Normal speed: 1×') }
    else if (c.cmd === 'restart') goTo(0, 'beginning')
    else if (c.cmd === 'nextpage' || c.cmd === 'prevpage') {
      const step = c.cmd === 'nextpage' ? 1 : -1
      const page = doc?.blocks[doc.segs[at]?.b]?.p
      if (typeof page === 'number') goTo(pageFrom(page, step), step > 0 ? 'next page' : 'previous page')
      else { step > 0 ? nextSentence() : prevSentence(); did(step > 0 ? 'This document has no pages: next sentence' : 'This document has no pages: back one sentence') }
    }
    else if (c.cmd === 'nextchapter') goTo(headings.find(x => x.i > at)?.i, 'next section')
    else if (c.cmd === 'prevchapter') goTo(headings[headings.findLastIndex(x => x.i <= at) - 1]?.i, 'previous section')
    else if (c.cmd === 'micoff') did('Tap the microphone to stop listening.', false)
    else if (c.cmd === 'bookmark') {
      // The bookmark keeps the last few sentences as its note, so "what was I marking?" has an answer later.
      if (!(d.marks || []).some(x => x.i === at)) toggleMark(id, at)
      if (doc) setMarkNote(id, at, doc.segs.slice(Math.max(0, at - 2), at + 1).map(x => x.t).join(' '))
      did('Bookmarked, with the last few sentences')
    }
    else if (c.cmd === 'explain' || c.cmd === 'recap' || c.cmd === 'skim') { quick(c.cmd); did({ explain: 'Explaining what you just heard', recap: 'Recapping so far', skim: 'Skimming this section' }[c.cmd]) }
    else if (c.cmd === 'ask' && c.arg) { setAskAuto({ q: c.arg, n: Date.now() }); setPanel('ask'); did(`Asking: ${c.arg}`) }
    else did('Not something I can do. Try: pause, go back, next page, slower.', false)
  }
  const float = async () => {
    // Opening the window has to happen inside the tap; only its contents are loaded on demand.
    const win = openFloating(() => <FloatingLazy />)
    // nothing in the player yet: the window shows this document, silent, not "Nothing is playing"
    if (player.get().id == null) openPlayer(id, { autoplay: false })
    await win
  }
  const [searching, setSearching] = useState(false)
  const [hit, setHit] = useState(-1)
  const playId = useStore(player, s => s.id)
  const pi = useStore(player, s => s.i)
  const isPlaying = useStore(player, s => s.playing)
  const rate = usePace(id) // the speed this document is heard at (pace.js): the contents' times and its length
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

  // A PDF has pages on every device: where its file is not on this one yet, it comes from the customer's Drive
  // (library.js fetchOriginal), quietly as the book is opened, so Pages is there when it is chosen.
  const pdf = d?.kind === 'pdf' && !d.from
  const pagesAvailable = pdf && hasSource === true // the side pane only shows a file that is here
  const view = readerView === 'focus' ? 'focus' : pdf && !pdfFail && readerView === 'pages' ? 'pages' : 'text'
  const synced = useStore(syncState, s => s.last > 0) // the folder has been looked at: it is known whether the file is there
  const spare = typeof navigator !== 'undefined' && !!navigator.connection?.saveData // the customer asked to spare data: only when Pages is chosen
  useEffect(() => {
    if (!pdf || hasSource !== false || !synced || (spare && view !== 'pages')) return undefined
    let live = true
    fetchOriginal(id).then(ok => live && ok && setHasSource(true))
    return () => { live = false }
  }, [id, pdf, hasSource, synced, spare, view])
  // The Pages view is fetched while the customer reads, so choosing it never shows an empty frame first.
  useEffect(() => { if (pdf) whenIdle(PageView.fetch) }, [pdf])
  useEffect(() => { whenIdle(() => { AskPanel.fetch(); Insights.fetch(); BlockTool.fetch(); CitationSheet.fetch() }) }, [])
  // "Both": the flowing text with the original page beside it. A wide screen only; elsewhere it is the text.
  // The original page beside the text is a pane the reader opens and closes (wide screens), like Contents on
  // the other side. It is not a view of its own: the text is the same text with or without it.
  useEffect(() => { if (readerView === 'both') settings.set({ readerView: 'text' }) }, [readerView]) // its old name, as a mode
  const [seenAt, setSeenAt] = useState(null) // the sentence at the top of the screen: what the reader is looking at
  // Sentence i belongs to block segs[i].b, so its page is blocks[segs[i].b].p (1-based; older
  // documents prepared before pages were linked have no p).
  const activePage = view === 'pages' && doc && active >= 0 ? (doc.blocks[doc.segs[active]?.b]?.p ?? null) : null
  const firstOfPage = useMemo(() => {
    const m = new Map()
    if (doc) doc.segs.forEach((s, i) => { const p = doc.blocks[s.b]?.p; if (typeof p === 'number' && !m.has(p)) m.set(p, i) })
    return m
  }, [doc])
  const linked = firstOfPage.size > 0
  // Off until the reader asks for it, and offered only when each sentence's page is known: beside a document
  // whose pages are not linked it could only guess the page, and a guess beside the text is noise. (Pages is
  // the view for the original; this is for having a figure in sight while the text is read.)
  const sidePage = useStore(settings, s => !!s.sidePage)
  const canSide = wide && pagesAvailable && !pdfFail && linked
  const sideBySide = canSide && view === 'text' && sidePage
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

  // The page follows the voice. The first time in a document it is put there at once: the reader arrives AT
  // the sentence, instead of arriving at the top and then travelling (and the cover that flies in from the
  // library had its landing place scrolled away from under it).
  const placed = useRef(false)
  useEffect(() => {
    if (view !== 'text') return
    if (active < 0 || Date.now() - userScroll.current < 4000) return
    scrollToSentence(active, !placed.current)
    if (doc) placed.current = true
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
  const [near, watch] = useNearChunks()
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

  // The page beside the text follows the reader's own scrolling (and the voice, while it is reading: below).
  useEffect(() => {
    if (!sideBySide || !doc) return undefined
    let raf = 0
    const look = () => {
      raf = 0
      const col = colRef.current
      if (!col) return
      const r = col.getBoundingClientRect()
      const el = document.elementFromPoint(r.left + r.width / 2, HEADER_H + SUBROW_H + SEEN_BELOW)?.closest('[data-i]')
      if (el) setSeenAt(+el.dataset.i)
    }
    const kick = () => { if (!raf) raf = requestAnimationFrame(look) }
    kick()
    addEventListener('scroll', kick, { passive: true })
    return () => { removeEventListener('scroll', kick); if (raf) cancelAnimationFrame(raf) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sideBySide, doc])

  // A change of view keeps the reader's place. Focus is one screen: it starts at the top. Coming back to the
  // text, the page is already at the sentence that was being read when the text appears: placed before the
  // first paint, not scrolled to afterwards (that was a second movement after the view had arrived).
  const lastView = useRef(view)
  const textScroll = useRef(0) // where the reader has the text scrolled to: remembered while another view is shown
  useEffect(() => {
    const on = () => { if (lastView.current === 'text') textScroll.current = window.scrollY }
    addEventListener('scroll', on, { passive: true })
    return () => removeEventListener('scroll', on)
  }, [])
  useLayoutEffect(() => {
    const from = lastView.current
    lastView.current = view
    if (from === view) return
    if (view === 'focus') { window.scrollTo(0, 0); return }
    if (view !== 'text') return
    // While the voice reads, the text comes back at the sentence being read. Otherwise it comes back where the
    // reader had scrolled it to: they were reading by eye, and that is their place.
    const place = active >= 0 ? active : d?.pos || 0
    if (!(isPlaying && playId === id) && textScroll.current > 0) window.scrollTo(0, textScroll.current)
    else if (place > 0) document.querySelector(`[data-i="${place}"]`)?.scrollIntoView({ block: 'center', behavior: 'auto' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  if (!d) return null
  const onSeek = i => { userScroll.current = 0; playId === id ? seekTo(i) : openPlayer(id, { at: i }) }
  const showToc = wide && tocOpen && headings.length > 1
  const askDocked = wide && panel === 'ask'
  // What is being said, for the page views: they mark the sentence and, inside it, the word.
  const spoken = doc && active >= 0 && active < doc.segs.length ? { text: doc.segs[active].t, dur: doc.durs[active], tail: doc.tails?.[active] || 0, words: typo.words } : null
  // Where "now" is on the original pages: the first marked line of the sentence (not the mark's holder, which
  // is as large as the page: a page half on screen is not the sentence on screen), or its page while the mark
  // is not found yet.
  // the mark of the sentence being read, not the one fading out beside it while they hand over (taken first, it was
  // removed a moment later, and a removed mark counts as off screen: "Back to now" rose at every sentence)
  const nowOnPage = () => document.querySelector(`[data-testid="page-view"] [data-testid="sentence-mark"][data-sentence="${active}"] > div`) || document.querySelector(`[data-testid="page-view"] [data-page="${activePage}"]`)
  const showPane = sideBySide && !askDocked && !!doc // Ask takes the same side of the screen: one at a time
  const pageFor = i => (i == null || i < 0 || !doc || i >= doc.segs.length ? null : doc.blocks[doc.segs[i].b].p ?? null)
  const reading = isPlaying && playId === id
  const panePage = showPane ? (pageFor(reading ? active : seenAt ?? active) ?? pageFor(active) ?? pageFor(d.pos || 0) ?? 1) : null
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
          {wide && <IconButton icon="search" label="Find in document" active={searching} onClick={() => setSearching(!searching)} />}
          {!wide && headings.length > 1 && <IconButton icon="toc" label="Contents" onClick={() => setPanel('toc')} />}
          <IconButton icon="type" label="Reading settings" onClick={() => setPanel('type')} />
          {canSide && view === 'text' && <IconButton icon="file" label={sidePage ? 'Hide the original page' : 'Show the original page beside the text'} active={sidePage} onClick={() => settings.set({ sidePage: !sidePage })} />}
          {speechSupported() && <VoiceControl onState={st => { setVoiceState(st); if (st !== 'listening') { setSaying(''); setDone(null) } }} onHeard={onHeard} onInterim={setSaying} />}
          <IconButton icon="sparkle" label="Ask about this document" active={panel === 'ask'} onClick={() => setPanel(panel === 'ask' ? null : 'ask')} />
          <Menu trigger={t => <IconButton icon="more" label="Document menu" onClick={t} />}
            items={[...(wide ? [] : [{ label: 'Find in document', icon: 'search', onClick: () => setSearching(true) }]),
              { label: 'Bookmarks and notes', icon: 'bookmark', onClick: () => setPanel('marks') },
              { label: 'Hard words', icon: 'list', onClick: () => setPanel('insights') },
              ...(view === 'pages' || sideBySide ? [{ label: 'Invert the page colours', icon: 'eye', right: invertPages ? 'On' : 'Off', onClick: () => settings.set({ invertPages: !invertPages }) }] : []),
              ...(floatingSupported() ? [{ label: 'Float the words over other windows', icon: 'pip', onClick: float }] : []),
              '-',
              ...docMenu(d, { keeping: false })]} />
        </div>
        {d && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: SUBROW_H, padding: `0 ${wide ? 20 : 14}px 10px` }}>
            <div style={{ width: pdf ? 240 : 164, flexShrink: 0 }}>
              <Segmented size="sm" value={view}
                options={[{ value: 'text', label: 'Text' }, ...(pdf ? [{ value: 'pages', label: 'Pages' }] : []), { value: 'focus', label: 'Focus' }]}
                onChange={v => { setPdfFail(false); userScroll.current = 0; settings.set({ readerView: v }) }} />
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

        <article style={{ flex: 1, minWidth: 0, padding: view === 'focus' ? `${FOCUS_PAD}px 20px` : wide ? `48px 32px ${END_PAD}px` : `28px 20px ${END_PAD}px`, marginRight: askDocked ? T.askW : 0 }}>
          {/* When a side panel opens or closes, the text glides to its new place instead of jumping (measured only then). */}
          <motion.div layout={wide ? 'position' : false} layoutDependency={dock} transition={{ layout: T.settle }} style={{ maxWidth: wide ? width : '100%', margin: '0 auto' }}>
            {/* The cover, the title and what is said about the document open the TEXT. Pages are the document
                itself (its first page is its own cover) and Focus is one word: neither repeats them. */}
            {view === 'text' && (
            <div style={{ display: 'flex', gap: 18, alignItems: 'flex-end', marginBottom: 36 }}>
              <motion.div initial={landing ? false : { scale: 0.86, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={T.settle} style={{ flexShrink: 0, transformOrigin: '0 100%' }}>
                <div ref={coverRef} style={{ display: 'flex' }}><Cover d={d} w={wide ? 84 : 64} h={wide ? 112 : 86} /></div>
              </motion.div>
              <div style={{ minWidth: 0, display: 'grid', gap: 8 }}>
                <h1 {...rowIn(0)} style={{ margin: 0, fontSize: wide ? 34 : 26, lineHeight: 1.12, letterSpacing: '-0.025em', fontWeight: 700, color: T.text, wordBreak: 'break-word' }}>{d.title}</h1>
                <div {...rowIn(1)} style={{ fontFamily: T.mono, fontSize: 12, color: T.faint }}>
                  {[d.author, d.chars ? fmtDur(atPace(docDuration(d), rate)) : null, voiceName(d.voice), d.mode !== 'full' ? (d.mode === 'long' ? 'Long summary' : 'Short summary') : d.ai && d.kind === 'pdf' ? 'AI narration' : null].filter(Boolean).join(' · ')}
                </div>
                {playId !== id && (d.status === 'voicing' || d.status === 'ready') && (
                  <div {...rowIn(2)}><Button kind="primary" icon="play" onClick={() => openPlayer(id)}>{d.pos > 0 && !d.finished ? 'Resume' : 'Play'}</Button></div>
                )}
              </div>
            </div>
            )}

            {view === 'text' && <DocInsight d={d} />}
            {d.status !== 'ready' && <Preparing d={d} doc={doc} pos={active >= 0 ? active : d.pos || 0} />}
            {view === 'text' && <WelcomeBack key={d.id} d={d} onRecap={() => quick('recap')} />}
            {view === 'text' && (d.note || (d.scanned && !d.ai)) && <DocNote d={d} />}
            {pdfFail && (
              <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.55, margin: '0 0 24px' }}>This file can't be shown as pages on this device.</div>
            )}

            <div key={view} data-rise="view">
            {view === 'pages' ? (
              <Suspense fallback={pageGhost}>
                {numPages > 0 && doc && !linked && (
                  <div style={{ fontSize: 13, lineHeight: 1.5, color: T.sub, margin: '0 0 16px' }}>These pages are not linked to the voice, so they do not follow it. Add the file again to link them.</div>
                )}
                {hasSource !== true ? <PagesComing id={id} checking={hasSource == null} onHere={() => setHasSource(true)} /> : <PageView key={id} id={id} activePage={activePage} invert={invertPages} userScroll={userScroll}
                  onPages={setNumPages} onVisible={setVisPage}
                  pageSentences={pageSentences} activeSentence={active} onTapSentence={onSeek} spoken={spoken}
                  onTapPage={pg => { const i = firstOfPage.get(pg); if (i != null) onSeek(i) }}
                  onFail={() => { setPdfFail(true); settings.set({ readerView: 'text' }) }} />}
              </Suspense>
            ) : view === 'focus' ? (
              doc && (
                <div style={{ minHeight: `calc(100dvh - ${headH + bottom + FOCUS_PAD * 2}px)`, display: 'grid', alignContent: 'safe center' }}>
                  <FocusView doc={doc} active={active} onSeek={onSeek} playing={isPlaying && playId === id} stickTop={headH} />
                </div>
              )
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
                  return <Chunk key={ci} ci={ci} ch={ch} id={id} doc={doc} typo={typo} skip={skip}
                    mounted={near.has(ci) || hasActive || hasHit}
                    est={heights.current.get(ci) ?? estimateHeight(ch, typo, colRef.current?.clientWidth || (wide ? width : innerWidth - 40))}
                    active={hasActive ? active : -1} dur={hasActive ? doc.durs[active] : 0} tail={hasActive ? (doc.tails?.[active] || 0) : 0} hit={hasHit ? hit : -1}
                    marks={marksBy.get(ci) || ''} onHeight={onHeight} watch={watch} />
                })}
              </div>
            )}
            </div>
          </motion.div>
        </article>

        <AnimatePresence initial={false} mode="popLayout">
        {showPane && (
          <motion.aside key="pane" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24, transition: { duration: 0.12, ease: 'easeIn' } }} transition={{ duration: 0.24, ease: T.ease }}
            style={{ width: T.paneW, flexShrink: 0, position: 'sticky', top: headH, height: `calc(100dvh - ${headH + bottom}px)`, padding: 20, boxSizing: 'border-box', borderLeft: `1px solid ${T.border}` }}>
            <Suspense fallback={null}>
              <PagePane key={id} id={id} page={panePage} invert={invertPages} pageSentences={pageSentences} activeSentence={active} onTapSentence={onSeek} spoken={spoken}
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
      <JumpToNow key={view} active={active} top={headH} bottom={bottom} find={view === 'pages' ? nowOnPage : undefined}
        onJump={() => { userScroll.current = 0; view === 'pages' ? nowOnPage()?.scrollIntoView({ block: 'center', behavior: scrollBehavior() }) : scrollToSentence(active) }} />

      {sheet('toc', 'Contents', <div style={{ padding: '20px 10px 24px' }}><div style={{ ...label, padding: '0 12px 12px' }}>Contents</div>
        <Toc headings={headings} offs={offs} rate={rate} active={active} onSeek={onSeek} onClose={() => setPanel(null)} /></div>, 480)}
      {sheet('type', 'Reading settings', <ReadingSettings wide={wide} />, 460)}
      {sheet('marks', 'Bookmarks and notes', <Marks d={d} doc={doc} offs={offs} rate={rate} onSeek={onSeek} onClose={() => setPanel(null)} />, 520)}
      <VoiceHud state={voiceState} words={saying} done={done} bottom={bottom} playing={isPlaying && playId === id} />
      {sheet('insights', 'Hard words', panel === 'insights' && doc ? <Suspense fallback={null}><Insights doc={doc} title={d.title}
        onSeek={i => { setPanel(null); onSeek(i) }}
        onAsk={word => { setAskAuto({ q: `Explain the word "${word}" as it is used in this document, in two plain sentences.`, n: Date.now() }); setPanel('ask') }} /></Suspense> : null, 560)}
      {sheet('tool', tool?.kind === 'sonify' ? 'Heard as sound' : 'The equation, taken apart', panel === 'tool' && tool && doc?.blocks[tool.bi]
        ? <Suspense fallback={null}><BlockTool key={tool.kind + tool.bi} tool={tool} doc={doc} d={d} onClose={() => setPanel(null)} /></Suspense> : null, 560)}
      {sheet('ask', 'Ask about this document', <div style={{ height: keyed ? '78dvh' : 'auto' }}><AskPanel d={d} doc={doc} onClose={() => setPanel(null)} auto={askAuto} onSeek={onSeek} /></div>)}
    </div>
  )
}

// A hairline under the header that fills as the page is read: where am I in this document. The style sheet
// ties it to the scroll (press.js), so no script runs as the page moves.
function ReadLine() {
  return <div aria-hidden="true" data-readline="" style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 2, background: T.text, opacity: 0.5 }} />
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

// Which chunks are on or near the screen. One observer for the whole book, and every chunk hands itself to
// it when it appears (`watch`) and takes itself back when it goes. The first version looked the chunks up
// once, when the book loaded: after a change of view (Text to Focus and back) the page held new elements
// that nobody was watching, and scrolling showed an empty page (Tharun, 2026-10-12).
function useNearChunks() {
  const [near, setNear] = useState(() => new Set([0, 1]))
  const io = useRef(null)
  const watch = useCallback(el => {
    if (!io.current) {
      io.current = new IntersectionObserver(entries => {
        setNear(prev => {
          let next = prev
          for (const e of entries) {
            const c = +e.target.dataset.c
            if (e.isIntersecting === next.has(c)) continue
            if (next === prev) next = new Set(prev)
            e.isIntersecting ? next.add(c) : next.delete(c)
          }
          return next
        })
      }, { rootMargin: `${AHEAD_PX}px 0px` })
    }
    const o = io.current
    o.observe(el) // the observer reports where a newly watched element is at once
    return () => o.unobserve(el)
  }, [])
  useEffect(() => () => { io.current?.disconnect(); io.current = null }, [])
  return [near, watch]
}

// Far jumps (a chapter away) cut straight there; near ones glide. Gliding across a whole book would build
// and discard every chunk on the way.
function scrollToSentence(i, cut = false) {
  const el = document.querySelector(`[data-i="${i}"]`)
  if (!el) return
  const top = el.getBoundingClientRect().top
  const far = top < -innerHeight * 2 || top > innerHeight * 3
  el.scrollIntoView({ block: 'center', behavior: far || cut ? 'auto' : scrollBehavior() })
}

const Chunk = memo(function Chunk({ ci, ch, id, doc, typo, skip, mounted, est, active, dur, tail, hit, marks, onHeight, watch }) {
  const ref = useRef(null)
  // A figure described while this part is on screen: drawn now (only the Block whose words changed redraws).
  useStore(figureNews, n => n.seen)
  const work = useStore(figureNews, n => (n.work.startsWith(id + '|') ? n.work.slice(id.length + 1) : ''))
  useEffect(() => watch(ref.current), [watch]) // watched from the moment it is on the page, whichever view put it there
  useLayoutEffect(() => { if (mounted && ref.current) onHeight(ci, ref.current.offsetHeight) })
  if (!mounted) return <div ref={ref} data-c={ci} style={{ height: est }} />
  const marked = marks ? new Set(marks.split(',').filter(Boolean).map(Number)) : null
  const out = []
  for (let bi = ch.from; bi < ch.to; bi++) {
    const b = doc.blocks[bi]
    const start = doc.starts[bi]
    const end = start + b.s.length
    let m = ''
    if (marked) for (let k = start; k < end; k++) if (marked.has(k)) m += k - start + ','
    out.push(<Block key={bi} bi={bi} b={b} start={start} active={active >= start && active < end ? active - start : -1} dur={dur} tail={tail}
      hit={hit >= start && hit < end ? hit - start : -1} marks={m} dim={skip && VISUAL_KINDS.has(b.k)} typo={typo} describing={!!work && b.fk === work} />)
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

const offlineErr = e => !navigator.onLine || /failed to fetch|networkerror|load failed|offline|network request failed/i.test(e || '')

const NOTIFY_OVER_S = 60 // a shorter wait is over before a notification would be worth asking for
// What stands between the customer and this document playing, in the app's one set of words for a wait
// (tts.js voiceWait). When nothing does, there is no card: a Play button that works is how "ready" is said.
// Tharun was shown "Ready to play" over a bar a quarter full (the share of the WHOLE book made so far) and
// "The rest is prepared ahead of you", and could not tell what any of it meant (2026-10-12). So: one
// sentence saying what is being waited for, a bar that measures exactly that sentence (or sweeps when the
// length is not known), and one line saying what happens next.
function Preparing({ d, doc, pos }) {
  const eng = useStore(engine)
  const sys = useStore(settings, s => activeEngine(s) === 'system')
  const playId = useStore(player, s => s.id)
  const gate = useStore(player, s => s.gate)
  const started = useStore(player, s => s.id === d.id && s.now) // started before it could play to the end (startNow)
  const textReady = d.status === 'voicing' || d.status === 'ready'
  const [asked, setAsked] = useState(notifyAsked)
  const longest = useRef(0) // the longest wait seen here: what "ready in" is measured against
  if (sys && textReady) return null // the built-in voice speaks straight away: nothing to wait for
  const gated = playId === d.id && gate != null
  const voicing = d.status === 'voicing'
  const failed = voicing && eng.status === 'error'
  const voiceOff = failed && offlineErr(eng.error)
  const engVoice = eng.voice
  const ready = voicing && !failed ? readiness(d, doc, pos) : null
  if (ready?.ready) return null
  // Not playable yet, and the voice itself is not up: that is the wait, before any audio can be made. (It
  // said "ready in about 10 seconds" for seven seconds before a 60 MB download had even begun.)
  // Only this document's own voice is its wait. While the engine fetches or starts ANOTHER document's voice
  // this one is behind it in the line: saying "Downloading the Alba voice" on a Telugu document was wrong.
  const voice = voicing && !failed && eng.voice === d.voice ? voiceWait(eng) : null
  const behind = voicing && !failed && eng.voice !== d.voice && eng.status === 'loading'
  if (ready?.wait != null && ready.sure) longest.current = Math.max(longest.current, ready.wait) // a guessed wait is no yardstick
  const slow = !started && ready?.sure && ready.wait > LONG_WAIT_S // a real wait, measured: worth a way out
  const translating = d.status === 'narrating' && !!d.target && /^Translating/.test(d.stage || '')
  const said = text => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><Pulse color={failed ? T.danger : undefined} />{text}</span>
  // head: what is being waited for · bar: null (none), undefined (no known length) or 0..1 · next: what happens then
  const [head, bar, next] = d.status === 'error' ? [<StatusLine d={d} />, null, null]
    : failed ? [said(voiceOff ? "You're offline" : `The ${voiceName(engVoice)} voice couldn't start`), null, voiceOff ? `The ${voiceName(engVoice)} voice downloads when you are back online.` : null]
    : voice ? [said(voice.progress != null ? `${voice.text} · ${Math.floor(voice.progress * 100)}%` : voice.text), voice.progress, [voice.detail, gated && 'Play starts by itself.'].filter(Boolean).join(' ') || null]
    : behind ? [said('Waiting for another document'), undefined, gated ? 'Its audio is being made first. This one is next, and starts by itself.' : 'Its audio is being made first. Press Play and this one goes first.']
    : started && ready ? [said('Playing while the audio is made'), // the player bar says when a stop ends: once, on every screen d.total ? (d.done || 0) / d.total : undefined,
        'It may stop now and then to catch up, and goes on by itself.']
    : !voice && ready ? [
        said(ready.wait == null || !ready.sure ? 'Making the audio' : `Making the audio · ready in ${waitWords(ready.wait)}`),
        ready.wait == null || !ready.sure || !longest.current ? undefined : 1 - ready.wait / longest.current,
        gated ? 'It is made on your device. Play starts by itself.' : 'It is made on your device. Press Play and it starts by itself when ready.',
      ]
    : d.status === 'paused' ? [<StatusLine d={d} />, d.prep || 0, 'What is translated so far is kept. Resume carries on from there.']
    : translating ? [<StatusLine d={d} />, d.prep >= 0.01 ? d.prep : undefined,
        `${d.eta != null ? `${waitWords(d.eta).replace(/^./, ch => ch.toUpperCase())} left. ` : ''}It carries on if you leave this page.`]
    : [<StatusLine d={d} />, d.prep >= 0.01 ? d.prep : undefined,
        d.status === 'queued' ? 'Starts when the document before it is done.'
        : d.status === 'syncing' ? (d.contentVer ? (d.error || 'It is coming from your other device.') : 'Open Noesis on that device and it arrives here. If it could not be read there, delete it here.')
        : 'The text appears here as it is read.']
  return (
    <div data-rise="0" role="status" style={{ padding: 18, borderRadius: T.r.lg, border: `1px solid ${d.status === 'error' || failed ? T.danger : T.border}`, background: T.surface, display: 'grid', gap: 12, marginBottom: 32 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: failed ? T.danger : T.text }}>{head}</div>
      {bar !== null && <Progress value={bar} unknown={bar === undefined} />}
      {next && <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.5 }}>{next}</div>}
      {/* A long translation is the customer's to stop: a book takes minutes on a phone, and it is their battery. */}
      {translating && <div><Button icon="pause" onClick={() => pauseTranslation(d.id)}>Pause</Button></div>}
      {d.status === 'paused' && <div><Button kind="primary" icon="play" onClick={() => resumeTranslation(d.id)}>Resume</Button></div>}
      {failed && !voiceOff && (
        <div><Button icon="refresh" onClick={() => loadEngine(engVoice).then(kickVoice).catch(() => {})}>Retry</Button></div>
      )}
      {!voice && ready && slow && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 200, fontSize: 13, color: T.sub }}>Don't want to wait? Start now, and it stops now and then to catch up{hasSystemVoice() ? ", or use your device's built-in voice, which never stops" : ''}.</span>
          <Button kind="accent" icon="play" onClick={() => startNow(d.id)}>Start now</Button>
          {hasSystemVoice() && <Button onClick={() => settings.set({ voiceEngine: 'system' })}>Use built-in voice</Button>}
        </div>
      )}
      {!asked && d.status !== 'error' && d.status !== 'paused' && !failed && !voice && !started && !(ready && !(ready.sure && ready.wait > NOTIFY_OVER_S)) && !(translating && !(d.eta > NOTIFY_OVER_S)) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 200, fontSize: 13, color: T.sub }}>Leave it running and get a notification when it's ready.</span>
          <Button icon="bell" onClick={async () => { await askNotify(); setAsked(true) }}>Notify me</Button>
        </div>
      )}
    </div>
  )
}

// Word timing lives in src/lib/words.js so the lock screen can reuse it; the clock is useLitWord (litword.js).
// `wipe` false (justified text, where the page may hyphenate any word): the word lights whole.
// The pages of a PDF whose file is not on this device yet: coming from the customer's Drive, with how much has
// come; or, when they cannot come now, why, and what will bring them. Never a Pages view that is just missing.
const MB = n => `${(n / 1048576).toFixed(n < 10485760 ? 1 : 0)} MB`
function PagesComing({ id, checking, onHere }) {
  const st = useStore(originals, o => o[id]) || null
  const signedIn = useStore(account, a => !!a.user)
  useEffect(() => { // back online: it comes by itself
    if (st?.error !== 'offline') return undefined
    const on = () => fetchOriginal(id).then(ok => ok && onHere())
    addEventListener('online', on)
    return () => removeEventListener('online', on)
  }, [id, st?.error, onHere])
  if (checking || (!st && signedIn)) return pageGhost // looking on this device, or the folder is still being looked at
  const coming = st && !st.error && !st.done
  const words = coming ? 'Getting the pages from your Google Drive'
    : st?.error === 'notYet' ? 'These pages are still on the device this was added on. They come here once Noesis has been open there, online.'
    : st?.error === 'offline' ? 'These pages come from your Google Drive. They will come when you are online.'
    : !signedIn || st?.error === 'away' ? 'These pages are on the device this was added on. Sign in there and here with the same account to have them on both.'
    : `The pages could not be fetched from your Google Drive. ${st?.error || ''}`
  const retry = st?.error && !['notYet', 'offline', 'away'].includes(st.error) && signedIn
  return (
    <div style={{ width: '100%', aspectRatio: `1 / ${PAGE_SHAPE}`, borderRadius: T.r.sm, background: T.surface, border: `1px solid ${T.border}`, display: 'grid', placeItems: 'center', padding: 24, boxSizing: 'border-box' }}>
      <div data-fade="" style={{ width: 'min(100%, 320px)', display: 'grid', gap: 12, textAlign: 'center', justifyItems: 'center' }}>
        {coming && <Spinner size={18} color={T.sub} />}
        <div style={{ fontSize: 15, lineHeight: 1.5, color: coming ? T.text : T.sub }}><Swap>{words}</Swap></div>
        {coming && st.of > 0 && (
          <div style={{ width: '100%', display: 'grid', gap: 8 }}>
            <Progress value={st.got / st.of} />
            <div style={{ fontSize: 12, color: T.sub, fontVariantNumeric: 'tabular-nums' }}>{MB(st.got)} of {MB(st.of)}</div>
          </div>
        )}
        {retry && <Button onClick={() => fetchOriginal(id).then(ok => ok && onHere())}>Try again</Button>}
      </div>
    </div>
  )
}

function ActiveSentence({ i, text, dur, tail, words, plain, wipe, cut }) {
  const { ws, starts, lit, ms, shown: showWords } = useLitWord(text, dur, tail, words)
  const brk = cut ? starts.findIndex(s => s >= cut) : -1 // a figure's description starts on its own line, spoken or not
  return (
    <span data-i={i} style={{ cursor: 'pointer', borderRadius: 4, padding: '2px 1px', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone', background: plain ? 'transparent' : T.accentSoft, color: T.text, boxShadow: plain ? 'none' : `0 0 0 2px ${T.accentSoft}` }}>
      {showWords ? <Spoken ws={ws} lit={lit} ms={ms} ahead={T.body} wipe={wipe} brk={brk} /> : cut ? <>{text.slice(0, cut).trimEnd()}<br />{text.slice(cut)}</> : text}{' '}
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

const Block = memo(function Block({ bi, b, start, active, dur, tail, hit, marks, dim, typo, describing }) {
  const host = useRef(null)
  const at = active >= 0 ? start + active : -1
  const boxes = useGlow(host, at)
  const lit = useRef(false) // has the light ever been on this paragraph? Most never: they carry nothing for it.
  if (at >= 0) lit.current = true
  const glow = lit.current ? <Glow boxes={boxes} at={at} /> : null
  const tool = useMemo(() => (VISUAL_KINDS.has(b.k) ? toolFor(b) : null), [b])
  const marked = marks ? new Set(marks.split(',').filter(Boolean).map(Number)) : null
  const sentences = b.s.map((t, k) => k === active
    ? <ActiveSentence key={k} i={start + k} text={t} dur={dur} tail={tail} words={typo.words} plain={!!boxes} wipe={!typo.justify} cut={k === b.s.length - 1 ? b.cut : 0} />
    : (
      <span key={k} data-i={start + k}
        style={{
          cursor: 'pointer', borderRadius: 4, padding: '2px 1px', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone',
          boxShadow: k === hit ? `0 0 0 2px ${T.accent}` : 'none',
          borderBottom: marked?.has(k) ? `2px solid ${T.accent}` : undefined,
        }}>{k === b.s.length - 1 && b.cut ? <>{t.slice(0, b.cut).trimEnd()}<br />{b.ai === 2 ? <span data-fade="">{t.slice(b.cut)}</span> : t.slice(b.cut)}</> : t}{' '}</span>
    ))
  const box = { contentVisibility: 'auto', containIntrinsicSize: 'auto 120px' }
  if (b.k === 'h') return <h2 ref={host} style={{ ...box, ...LIT, fontSize: Math.round(typo.size * 1.2), lineHeight: 1.3, fontWeight: 700, letterSpacing: '-0.015em', color: T.text, margin: '44px 0 14px' }}>{sentences}{glow}</h2>
  if (VISUAL_KINDS.has(b.k)) {
    return (
      <motion.figure initial={false} animate={{ opacity: dim ? 0.4 : 1 }}
        style={{ ...box, margin: '22px 0', padding: '14px 16px', borderRadius: T.r.md, border: `1px solid ${T.border}`, background: T.surface }}>
        <div style={{ ...label, color: T.accent, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name={b.k === 'code' ? 'text' : b.k === 'math' ? 'sparkle' : 'grid'} size={13} />{VISUAL_LABEL[b.k]}{(describing || b.ai) && <Swap>{describing ? '· describing' : '· described by AI'}</Swap>}{describing && <Spinner size={12} />}{dim ? ' · skipped' : ''}
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
