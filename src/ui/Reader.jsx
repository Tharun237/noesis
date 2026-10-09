import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { T, label } from '../theme.js'
import { useStore } from '../lib/store.js'
import { ui, go } from '../lib/nav.js'
import { library, loadDoc, docDuration, reprocess } from '../lib/library.js'
import { player, open as openPlayer, seekTo, timeline, audioClock } from '../lib/player.js'
import { settings } from '../lib/settings.js'
import { engine } from '../lib/tts.js'
import { VISUAL_KINDS } from '../lib/text.js'
import { voiceName } from '../lib/voices.js'
import { Icon } from './icons.jsx'
import { Button, IconButton, Menu, Progress, Pulse, Sheet, fmtDur } from './kit.jsx'
import { Cover, StatusLine, docMenu } from './Library.jsx'
import { Toc, ReadingSettings, Marks, SearchBar, JumpToNow } from './ReaderParts.jsx'
import { AskPanel } from './Ask.jsx'
import { playerHeight } from './PlayerBar.jsx'

const VISUAL_LABEL = { fig: 'Figure', table: 'Table', math: 'Equation', code: 'Code' }
const HEADER_H = 57

export function Reader({ wide }) {
  const id = useStore(ui, s => s.docId)
  const d = useStore(library, s => s.docs.find(x => x.id === id))
  const status = d?.status
  const total = d?.total
  const [doc, setDoc] = useState(null)
  const [panel, setPanel] = useState(null) // toc | type | marks | ask
  const [searching, setSearching] = useState(false)
  const [hit, setHit] = useState(-1)
  const playId = useStore(player, s => s.id)
  const pi = useStore(player, s => s.i)
  const rate = useStore(player, s => s.rate)
  const skip = useStore(settings, s => s.skipVisuals)
  const tocOpen = useStore(settings, s => s.tocOpen)
  const font = useStore(settings, s => s.readFont)
  const size = useStore(settings, s => s.readSize)
  const leading = useStore(settings, s => s.readLeading)
  const width = useStore(settings, s => s.readWidth)
  const justify = useStore(settings, s => s.justify)
  const words = useStore(settings, s => s.wordHighlight)
  const active = playId === id ? pi : -1
  const userScroll = useRef(0)

  // (Re)load the listening text whenever the document gets (re)prepared.
  useEffect(() => {
    let live = true
    setDoc(null)
    if (id && total) loadDoc(id).then(c => live && setDoc(c))
    return () => { live = false }
  }, [id, total, status === 'voicing' || status === 'ready'])

  useEffect(() => {
    if (active < 0 || Date.now() - userScroll.current < 4000) return
    document.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [active, doc])

  useEffect(() => {
    if (hit >= 0) document.querySelector(`[data-i="${hit}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [hit])

  const typo = useMemo(() => ({ font: font === 'serif' ? T.serif : T.font, size, leading, justify, words }), [font, size, leading, justify, words])
  const offs = useMemo(() => (doc && d ? timeline(d, doc) : null), [doc, d?.done, d?.vSec]) // eslint-disable-line react-hooks/exhaustive-deps
  const headings = useMemo(() => (doc ? doc.blocks.map((b, bi) => b.k === 'h' && { text: b.s.join(' '), i: doc.starts[bi] }).filter(Boolean) : []), [doc])
  const markSet = useMemo(() => new Set((d?.marks || []).map(m => m.i)), [d?.marks])

  if (!d) return null
  const onSeek = i => { userScroll.current = 0; playId === id ? seekTo(i) : openPlayer(id, { at: i }) }
  const showToc = wide && tocOpen && headings.length > 1
  const askDocked = wide && panel === 'ask'
  const bottom = playerHeight(wide, true, !!playId)
  const sheet = (name, title, body, w) => (
    <Sheet open={panel === name && !(name === 'ask' && wide)} onClose={() => setPanel(null)} wide={wide} title={title} width={w}>{body}</Sheet>
  )

  return (
    <div onWheel={() => { userScroll.current = Date.now() }} onTouchMove={() => { userScroll.current = Date.now() }} style={{ minHeight: '100%' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 20, background: T.bg, borderBottom: `1px solid ${T.border}`, paddingTop: 'env(safe-area-inset-top)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: HEADER_H - 1, padding: `0 ${wide ? 16 : 6}px` }}>
          <IconButton icon="back" label="Back to library" onClick={() => history.back()} />
          {wide && headings.length > 1 && <IconButton icon="toc" label={tocOpen ? 'Hide contents' : 'Show contents'} active={tocOpen} onClick={() => settings.set({ tocOpen: !tocOpen })} />}
          <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: T.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '0 6px' }}>{d.title}</div>
          <IconButton icon="search" label="Find in document" active={searching} onClick={() => setSearching(!searching)} />
          {!wide && headings.length > 1 && <IconButton icon="toc" label="Contents" onClick={() => setPanel('toc')} />}
          <IconButton icon="type" label="Reading settings" onClick={() => setPanel('type')} />
          {wide && <IconButton icon="bookmark" label="Bookmarks & notes" onClick={() => setPanel('marks')} />}
          <IconButton icon="sparkle" label="Ask about this document" active={panel === 'ask'} onClick={() => setPanel(panel === 'ask' ? null : 'ask')} />
          <Menu trigger={t => <IconButton icon="more" label="Document menu" onClick={t} />}
            items={[...(wide ? [] : [{ label: 'Bookmarks & notes', icon: 'bookmark', onClick: () => setPanel('marks') }, '-']), ...docMenu(d)]} />
        </div>
        {searching && <SearchBar doc={doc} onHit={setHit} onClose={() => setSearching(false)} />}
      </header>

      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        {showToc && (
          <aside style={{ width: T.tocW, flexShrink: 0, position: 'sticky', top: HEADER_H, height: `calc(100dvh - ${HEADER_H + bottom}px)`, overflowY: 'auto', padding: '20px 10px 20px 14px', borderRight: `1px solid ${T.border}` }}>
            <div style={{ ...label, padding: '0 12px 10px' }}>Contents</div>
            <Toc headings={headings} offs={offs} rate={rate} active={active} onSeek={onSeek} />
          </aside>
        )}

        <article style={{ flex: 1, minWidth: 0, padding: wide ? `48px 32px ${120 + bottom}px` : `28px 20px ${100 + bottom}px`, marginRight: askDocked ? T.askW : 0 }}>
          <div style={{ maxWidth: wide ? width : '100%', margin: '0 auto' }}>
            <div style={{ display: 'flex', gap: 18, alignItems: 'flex-end', marginBottom: 36 }}>
              <Cover d={d} w={wide ? 84 : 64} h={wide ? 112 : 86} />
              <div style={{ minWidth: 0, display: 'grid', gap: 8 }}>
                <h1 style={{ margin: 0, fontSize: wide ? 34 : 26, lineHeight: 1.12, letterSpacing: '-0.025em', fontWeight: 700, color: T.text, wordBreak: 'break-word' }}>{d.title}</h1>
                <div style={{ fontFamily: T.mono, fontSize: 12, color: T.faint }}>
                  {[d.author, d.chars ? fmtDur(docDuration(d)) : null, voiceName(d.voice), d.mode !== 'full' ? (d.mode === 'long' ? 'Long summary' : 'Short summary') : d.ai ? 'AI narration' : null].filter(Boolean).join(' · ')}
                </div>
                {playId !== id && (d.status === 'voicing' || d.status === 'ready') && (
                  <div><Button kind="primary" icon="play" onClick={() => openPlayer(id)}>{d.pos > 0 && !d.finished ? 'Resume' : 'Play'}</Button></div>
                )}
              </div>
            </div>

            {d.status !== 'ready' && <Preparing d={d} />}
            {(d.note || (d.scanned && !d.ai)) && <DocNote d={d} />}

            {doc && (
              <div onClick={e => { if (window.getSelection()?.toString()) return; const el = e.target.closest('[data-i]'); if (el) onSeek(+el.dataset.i) }}>
                {doc.blocks.map((b, bi) => {
                  const start = doc.starts[bi]
                  const end = start + b.s.length
                  const inBlock = active >= start && active < end ? active - start : -1
                  const hitHere = hit >= start && hit < end ? hit - start : -1
                  let marks = ''
                  for (let k = start; k < end; k++) if (markSet.has(k)) marks += k - start + ','
                  return <Block key={bi} b={b} start={start} active={inBlock} dur={inBlock >= 0 ? doc.durs[active] : 0} hit={hitHere} marks={marks}
                    dim={skip && VISUAL_KINDS.has(b.k)} typo={typo} />
                })}
              </div>
            )}
          </div>
        </article>
      </div>

      <AnimatePresence>
        {askDocked && (
          <motion.aside key="ask" initial={{ x: T.askW }} animate={{ x: 0 }} exit={{ x: T.askW }} transition={T.spring}
            style={{ position: 'fixed', top: HEADER_H, right: 0, bottom, width: T.askW, zIndex: 18, background: T.bg, borderLeft: `1px solid ${T.border}` }}>
            <AskPanel d={d} doc={doc} onClose={() => setPanel(null)} />
          </motion.aside>
        )}
      </AnimatePresence>

      <JumpToNow active={active} bottom={bottom} onJump={() => { userScroll.current = 0; document.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }} />

      {sheet('toc', 'Contents', <div style={{ padding: '20px 10px 24px' }}><div style={{ ...label, padding: '0 12px 12px' }}>Contents</div>
        <Toc headings={headings} offs={offs} rate={rate} active={active} onSeek={onSeek} onClose={() => setPanel(null)} /></div>, 480)}
      {sheet('type', 'Reading settings', <ReadingSettings wide={wide} />, 460)}
      {sheet('marks', 'Bookmarks & notes', <Marks d={d} doc={doc} offs={offs} rate={rate} onSeek={onSeek} onClose={() => setPanel(null)} />, 520)}
      {sheet('ask', 'Ask about this document', <div style={{ height: '78dvh' }}><AskPanel d={d} doc={doc} onClose={() => setPanel(null)} /></div>)}
    </div>
  )
}

// Notes about how a document was prepared; scanned books get a one-tap path to AI narration.
function DocNote({ d }) {
  const keyed = useStore(settings, s => s.geminiKey.trim().length > 20)
  const offerAi = d.scanned && !d.ai && d.status !== 'queued' && d.status !== 'reading' && d.status !== 'narrating'
  return (
    <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.55, margin: '0 0 24px', padding: '12px 14px', borderRadius: T.r.md, border: `1px solid ${T.border}`, display: 'grid', gap: 10 }}>
      {d.note && <div>{d.note}</div>}
      {offerAi && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 200 }}>For the cleanest read, AI narration reads the page images directly instead of the scan's text layer.</span>
          {keyed
            ? <Button kind="accent" icon="sparkle" onClick={() => reprocess(d.id, { ai: true })}>Use AI narration</Button>
            : <Button icon="settings" onClick={() => go('settings')}>Add a free Gemini key</Button>}
        </div>
      )}
    </div>
  )
}

function Preparing({ d }) {
  const eng = useStore(engine, s => s.status)
  const loaded = useStore(engine, s => s.loaded)
  const total = useStore(engine, s => s.total)
  const downloading = d.status === 'voicing' && eng !== 'ready'
  const pct = downloading ? (total ? loaded / total : 0) : d.status === 'voicing' ? d.done / Math.max(1, d.total) : d.prep || 0
  return (
    <div style={{ padding: 18, borderRadius: T.r.lg, border: `1px solid ${d.status === 'error' || eng === 'error' ? T.danger : T.border}`, background: T.surface, display: 'grid', gap: 12, marginBottom: 32 }}>
      <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
        {downloading
          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: eng === 'error' ? T.danger : T.accent }}>
              <Pulse color={eng === 'error' ? T.danger : T.accent} />
              {eng === 'error' ? 'The voice engine could not start' : `Downloading the voice model${total ? ` · ${Math.floor(pct * 100)}%` : ''}`}
            </span>
          : <StatusLine d={d} />}
      </div>
      {d.status !== 'error' && <Progress value={pct} />}
      <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.5 }}>
        {downloading
          ? eng === 'error' ? 'Check your connection, then retry from Settings.' : 'One time only. After this, Noesis voices documents offline on this device.'
          : d.status === 'voicing'
            ? 'You can press play now. Audio is generated ahead of where you are listening, and saved for offline use.'
            : d.status === 'error' ? 'Use the menu above to try again.' : 'Preparing the text. This page fills in when it is ready.'}
      </div>
    </div>
  )
}

// Word timing is estimated from the sentence's real duration, weighted by word length plus
// punctuation pauses. Kokoro doesn't emit word timestamps; this tracks speech closely in practice.
function wordWeights(text) {
  const ws = text.split(' ')
  const w = ws.map(x => x.length + 1 + (/[,;:—–]$/.test(x) ? 4 : /[.!?…]["”')]?$/.test(x) ? 6 : 0))
  const sum = w.reduce((a, b) => a + b, 0)
  let acc = 0
  return { ws, ends: w.map(x => (acc += x) / sum) }
}

function ActiveSentence({ i, text, dur, words }) {
  const { ws, ends } = useMemo(() => wordWeights(text), [text])
  const [w, setW] = useState(-1)
  useEffect(() => {
    if (!words || !dur) return
    let raf
    const tick = () => {
      const f = (audioClock() - 0.06) / Math.max(0.2, dur - 0.18) // Kokoro adds ~60 ms lead-in and ~120 ms tail
      setW(f <= 0 ? 0 : ends.findIndex(e => e >= f))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [words, dur, ends])
  return (
    <span data-i={i} style={{ cursor: 'pointer', borderRadius: 4, padding: '2px 1px', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone', background: T.accentSoft, color: T.text, boxShadow: `0 0 0 2px ${T.accentSoft}` }}>
      {words && dur ? ws.map((x, k) => <span key={k} style={{ color: k === w ? T.accent : undefined }}>{x}{k < ws.length - 1 ? ' ' : ''}</span>) : text}{' '}
    </span>
  )
}

const Block = memo(function Block({ b, start, active, dur, hit, marks, dim, typo }) {
  const marked = marks ? new Set(marks.split(',').filter(Boolean).map(Number)) : null
  const sentences = b.s.map((t, k) => k === active
    ? <ActiveSentence key={k} i={start + k} text={t} dur={dur} words={typo.words} />
    : (
      <span key={k} data-i={start + k}
        style={{
          cursor: 'pointer', borderRadius: 4, padding: '2px 1px', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone',
          boxShadow: k === hit ? `0 0 0 2px ${T.accent}` : 'none',
          borderBottom: marked?.has(k) ? `2px solid ${T.accent}` : undefined,
        }}>{t}{' '}</span>
    ))
  const box = { contentVisibility: 'auto', containIntrinsicSize: 'auto 120px' }
  if (b.k === 'h') return <h2 style={{ ...box, fontSize: Math.round(typo.size * 1.2), lineHeight: 1.3, fontWeight: 700, letterSpacing: '-0.015em', color: T.text, margin: '44px 0 14px' }}>{sentences}</h2>
  if (VISUAL_KINDS.has(b.k)) {
    return (
      <motion.figure initial={false} animate={{ opacity: dim ? 0.4 : 1 }}
        style={{ ...box, margin: '22px 0', padding: '14px 16px', borderRadius: T.r.md, border: `1px solid ${T.border}`, background: T.surface }}>
        <div style={{ ...label, color: T.accent, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name={b.k === 'code' ? 'text' : b.k === 'math' ? 'sparkle' : 'grid'} size={13} />{VISUAL_LABEL[b.k]}{dim ? ' · skipped' : ''}
        </div>
        <div style={{ fontFamily: typo.font, fontSize: typo.size - 2, lineHeight: typo.leading, color: T.sub }}>{sentences}</div>
      </motion.figure>
    )
  }
  return (
    <p style={{ ...box, fontFamily: typo.font, fontSize: typo.size, lineHeight: typo.leading, color: T.body, margin: `0 0 ${Math.round(typo.size * 1.1)}px`, textAlign: typo.justify ? 'justify' : 'start', hyphens: typo.justify ? 'auto' : 'manual', textWrap: 'pretty' }}>
      {sentences}
    </p>
  )
})
