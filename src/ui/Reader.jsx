import { memo, useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { T, label } from '../theme.js'
import { useStore } from '../lib/store.js'
import { ui, openSheet } from '../lib/nav.js'
import { library, loadDoc, docDuration } from '../lib/library.js'
import { player, open as openPlayer, seekTo } from '../lib/player.js'
import { settings } from '../lib/settings.js'
import { VISUAL_KINDS } from '../lib/text.js'
import { voiceName } from '../lib/voices.js'
import { Icon } from './icons.jsx'
import { Button, IconButton, Menu, Progress, Pulse, Sheet, fmtDur } from './kit.jsx'
import { engine } from '../lib/tts.js'
import { Cover, StatusLine, docMenu } from './Library.jsx'

const VISUAL_LABEL = { fig: 'Figure', table: 'Table', math: 'Equation', code: 'Code' }

export function Reader({ wide }) {
  const id = useStore(ui, s => s.docId)
  const d = useStore(library, s => s.docs.find(x => x.id === id))
  const status = d?.status
  const total = d?.total
  const [doc, setDoc] = useState(null)
  const [toc, setToc] = useState(false)
  const playId = useStore(player, s => s.id)
  const pi = useStore(player, s => s.i)
  const skip = useStore(settings, s => s.skipVisuals)
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

  if (!d) return null
  const onSeek = i => (playId === id ? seekTo(i) : openPlayer(id, { at: i }))
  const headings = doc ? doc.blocks.map((b, bi) => b.k === 'h' && { text: b.s.join(' '), i: doc.starts[bi] }).filter(Boolean) : []

  return (
    <div onWheel={() => { userScroll.current = Date.now() }} onTouchMove={() => { userScroll.current = Date.now() }} style={{ minHeight: '100%' }}>
      <header style={{
        position: 'sticky', top: 0, zIndex: 20, background: T.bg, borderBottom: `1px solid ${T.border}`,
        display: 'flex', alignItems: 'center', gap: 6, padding: `calc(env(safe-area-inset-top) + 8px) ${wide ? 20 : 8}px 8px`,
      }}>
        <IconButton icon="back" label="Back to library" onClick={() => history.back()} />
        <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: T.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.title}</div>
        {headings.length > 1 && <IconButton icon="toc" label="Contents" onClick={() => setToc(true)} />}
        <Menu trigger={t => <IconButton icon="more" label="Document menu" onClick={t} />} items={docMenu(d)} />
      </header>

      <article style={{ maxWidth: T.readerW, margin: '0 auto', padding: wide ? '48px 32px 160px' : '28px 20px 200px' }}>
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
        {d.note && <div style={{ fontSize: 13, color: T.sub, margin: '0 0 24px', padding: '12px 14px', borderRadius: T.r.md, border: `1px solid ${T.border}` }}>{d.note}</div>}

        {doc && (
          <div onClick={e => { const el = e.target.closest('[data-i]'); if (el) onSeek(+el.dataset.i) }}>
            {doc.blocks.map((b, bi) => {
              const start = doc.starts[bi]
              const inBlock = active >= start && active < start + b.s.length ? active - start : -1
              return <Block key={bi} b={b} start={start} active={inBlock} dim={skip && VISUAL_KINDS.has(b.k)} />
            })}
          </div>
        )}
      </article>

      <Sheet open={toc} onClose={() => setToc(false)} wide={wide} title="Contents" width={480}>
        <div style={{ padding: '20px 12px 24px' }}>
          <div style={{ ...label, padding: '0 12px 12px' }}>Contents</div>
          {headings.map(h => (
            <button key={h.i} type="button" onClick={() => { setToc(false); userScroll.current = 0; onSeek(h.i) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '12px', border: 'none', borderRadius: T.r.sm, cursor: 'pointer',
                background: active >= h.i && !headings.some(x => x.i > h.i && x.i <= active) ? T.surfaceHi : 'transparent',
                color: T.text, fontFamily: T.font, fontSize: 15,
              }}>{h.text}</button>
          ))}
        </div>
      </Sheet>
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

const Block = memo(function Block({ b, start, active, dim }) {
  const sentences = b.s.map((t, k) => (
    <span key={k} data-i={start + k}
      style={{
        cursor: 'pointer', borderRadius: 4, padding: '2px 1px', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone',
        background: k === active ? T.accentSoft : 'transparent', color: k === active ? T.text : undefined,
        boxShadow: k === active ? `0 0 0 2px ${T.accentSoft}` : 'none',
      }}>{t}{' '}</span>
  ))
  const box = { contentVisibility: 'auto', containIntrinsicSize: 'auto 120px' }
  if (b.k === 'h') return <h2 style={{ ...box, fontSize: 22, lineHeight: 1.3, fontWeight: 700, letterSpacing: '-0.015em', color: T.text, margin: '44px 0 14px' }}>{sentences}</h2>
  if (VISUAL_KINDS.has(b.k)) {
    return (
      <motion.figure initial={false} animate={{ opacity: dim ? 0.4 : 1 }}
        style={{ ...box, margin: '22px 0', padding: '14px 16px', borderRadius: T.r.md, border: `1px solid ${T.border}`, background: T.surface }}>
        <div style={{ ...label, color: T.accent, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name={b.k === 'code' ? 'text' : b.k === 'math' ? 'sparkle' : 'grid'} size={13} />{VISUAL_LABEL[b.k]}{dim ? ' · skipped' : ''}
        </div>
        <div style={{ fontSize: 16, lineHeight: 1.65, color: T.sub }}>{sentences}</div>
      </motion.figure>
    )
  }
  return <p style={{ ...box, fontSize: 18, lineHeight: 1.75, color: T.body, margin: '0 0 20px', textWrap: 'pretty' }}>{sentences}</p>
})
