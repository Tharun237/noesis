import { memo, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { T, label } from '../theme.js'
import { useStore } from '../lib/store.js'
import { ui, go, openSheet } from '../lib/nav.js'
import { settings } from '../lib/settings.js'
import { library, docDuration, secPerChar, SORTS, reprocess, deleteDoc, patch, exportTranscript, exportAudio, addDocument, addCollection, removeCollection, kickVoice } from '../lib/library.js'
import { player, open as openPlayer, stopIf } from '../lib/player.js'
import { engine, loadEngine } from '../lib/tts.js'
import { voiceName } from '../lib/voices.js'
import { activeEngine } from '../lib/engine.js'
import { Icon, Logo } from './icons.jsx'
import { Button, IconButton, Menu, Progress, Pulse, inputStyle, fmtDur } from './kit.jsx'
import { SAMPLE } from './sample.js'
import { AccountChip } from './SyncStatus.jsx'
import { waitSeconds } from '../lib/readiness-math.js'

const KIND = { pdf: 'PDF', epub: 'EPUB', docx: 'DOCX', html: 'WEB', md: 'MD', txt: 'TXT', text: 'TEXT', link: 'LINK' }
const MODE = { long: 'Long summary', short: 'Short summary' }

function useVisibleDocs() {
  const docs = useStore(library, s => s.docs)
  const filter = useStore(ui, s => s.filter)
  const query = useStore(ui, s => s.query)
  const sort = useStore(settings, s => s.sort)
  const kind = useStore(ui, s => s.kind)
  const progress = useStore(ui, s => s.progress)
  return useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = docs.filter(d =>
      (filter === 'all' ? true : filter === 'archived' ? d.archived : filter === 'queue' ? !d.archived : d.collections.includes(filter)) &&
      (!kind || KIND[d.kind] === kind) && (!progress || progressOf(d) === progress) &&
      (!q || d.title.toLowerCase().includes(q) || d.author.toLowerCase().includes(q)))
    return list.sort(SORTS[sort] || SORTS.recent)
  }, [docs, filter, query, sort, kind, progress])
}

export function Library({ wide }) {
  const loaded = useStore(library, s => s.loaded)
  const total = useStore(library, s => s.docs.length)
  const docs = useVisibleDocs()
  const view = useStore(settings, s => s.view)
  const playingId = useStore(player, s => s.id)
  const hours = docs.reduce((a, d) => a + docDuration(d), 0)

  return (
    <div style={{ display: 'flex', minHeight: '100%' }}>
      {wide && <Sidebar />}
      <main style={{ flex: 1, minWidth: 0, padding: wide ? '28px 36px 40px' : '0 0 24px' }}>
        {wide ? <DesktopHeader /> : <MobileHeader />}
        <EngineNotice />
        {loaded && total === 0 ? <EmptyState wide={wide} /> : (
          <>
            <div style={{
              display: 'grid', gap: wide ? 8 : 2, padding: wide ? 0 : '0 8px',
              gridTemplateColumns: wide && view === 'grid' ? 'repeat(auto-fill, minmax(340px, 1fr))' : '1fr',
            }}>
              <AnimatePresence initial={false}>
                {docs.map(d => <DocCard key={d.id} d={d} playing={d.id === playingId} />)}
              </AnimatePresence>
            </div>
            {loaded && docs.length === 0 && (
              <div style={{ padding: '60px 20px', textAlign: 'center', color: T.sub, fontSize: 14 }}>Nothing here yet.</div>
            )}
            {docs.length > 0 && (
              <div style={{ ...label, textTransform: 'none', letterSpacing: 0, padding: wide ? '24px 4px' : '20px 20px', fontSize: 12 }}>
                {docs.length} {docs.length === 1 ? 'doc' : 'docs'} · {fmtDur(hours)} at 1.0x
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function SidebarItem({ id, icon, name, onRemove, filter, count }) {
  return (
    <button type="button" onClick={() => ui.set({ filter: id })}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%', height: 40, padding: '0 12px', border: 'none', borderRadius: T.r.sm,
        background: filter === id ? T.surfaceHi : 'transparent', color: filter === id ? T.text : T.sub, fontFamily: T.font, fontSize: 14,
        fontWeight: filter === id ? 600 : 500, cursor: 'pointer', textAlign: 'left',
      }}>
      <Icon name={icon} size={17} />
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      <span style={{ fontFamily: T.mono, fontSize: 11.5, color: T.faint }}>{count}</span>
      {onRemove && filter === id && (
        <span role="button" tabIndex={0} aria-label={`Delete collection ${name}`} onClick={e => { e.stopPropagation(); onRemove() }} style={{ color: T.faint, display: 'grid' }}>
          <Icon name="close" size={14} />
        </span>
      )}
    </button>
  )
}

function Sidebar() {
  const filter = useStore(ui, s => s.filter)
  const collections = useStore(library, s => s.collections)
  const docs = useStore(library, s => s.docs)
  const [naming, setNaming] = useState(false)
  const count = f => docs.filter(d => (f === 'all' ? true : f === 'archived' ? d.archived : f === 'queue' ? !d.archived : d.collections.includes(f))).length
  return (
    <aside style={{ width: T.sidebarW, flexShrink: 0, borderRight: `1px solid ${T.border}`, padding: '24px 14px', position: 'sticky', top: 0, height: '100dvh', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Wordmark />
      <div style={{ ...label, padding: '28px 12px 8px' }}>Library</div>
      <SidebarItem id="queue" icon="list" name="Queue" filter={filter} count={count('queue')} />
      <SidebarItem id="all" icon="grid" name="All" filter={filter} count={count('all')} />
      <SidebarItem id="archived" icon="archive" name="Archived" filter={filter} count={count('archived')} />
      <div style={{ ...label, padding: '24px 12px 8px' }}>Collections</div>
      {collections.map(c => (
        <SidebarItem key={c.id} id={c.id} icon="folder" name={c.name} filter={filter} count={count(c.id)}
          onRemove={() => { if (confirm(`Delete the collection "${c.name}"? Documents stay in your library.`)) { removeCollection(c.id); ui.set({ filter: 'queue' }) } }} />
      ))}
      {naming ? (
        <input autoFocus placeholder="Collection name" style={{ ...inputStyle, height: 38, fontSize: 14 }}
          onBlur={() => setNaming(false)}
          onKeyDown={e => {
            if (e.key === 'Enter' && e.currentTarget.value.trim()) { ui.set({ filter: addCollection(e.currentTarget.value) }); setNaming(false) }
            if (e.key === 'Escape') setNaming(false)
          }} />
      ) : (
        <button type="button" onClick={() => setNaming(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 12, height: 40, padding: '0 12px', border: 'none', background: 'transparent', color: T.faint, fontFamily: T.font, fontSize: 14, cursor: 'pointer' }}>
          <Icon name="plus" size={17} /> New collection
        </button>
      )}
      <div style={{ flex: 1 }} />
      <div style={{ padding: '0 2px 8px' }}><AccountChip /></div>
      <button type="button" onClick={() => go('settings')}
        style={{ display: 'flex', alignItems: 'center', gap: 12, height: 40, padding: '0 12px', border: 'none', borderRadius: T.r.sm, background: 'transparent', color: T.sub, fontFamily: T.font, fontSize: 14, cursor: 'pointer' }}>
        <Icon name="settings" size={17} /> Settings
      </button>
    </aside>
  )
}

export function Wordmark({ size = 26 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px' }}>
      <Logo size={size} />
      <span style={{ fontSize: size * 0.78, fontWeight: 700, letterSpacing: '-0.03em', color: T.text }}>noesis</span>
    </div>
  )
}

const FILTER_NAMES = { queue: 'Queue', all: 'All', archived: 'Archived' }

function DesktopHeader() {
  const filter = useStore(ui, s => s.filter)
  const query = useStore(ui, s => s.query)
  const view = useStore(settings, s => s.view)
  const collections = useStore(library, s => s.collections)
  const name = FILTER_NAMES[filter] || collections.find(c => c.id === filter)?.name || 'Library'
  return (
    <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
      <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: T.text, flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: T.faint, fontWeight: 500 }}>Library</span>
        <Icon name="next" size={14} style={{ color: T.faint }} />
        {name}
      </h1>
      <SearchBox value={query} width={220} />
      <SortMenu />
      <IconButton icon={view === 'grid' ? 'list' : 'grid'} label={view === 'grid' ? 'List view' : 'Grid view'} onClick={() => settings.set({ view: view === 'grid' ? 'list' : 'grid' })} />
      <Button kind="primary" icon="plus" onClick={() => openSheet('add')}>Add document</Button>
    </header>
  )
}

function SearchBox({ value, width, autoFocus }) {
  return (
    <div style={{ position: 'relative', width }}>
      <Icon name="search" size={16} style={{ position: 'absolute', left: 13, top: 12, color: T.faint }} />
      <input value={value} autoFocus={autoFocus} onChange={e => ui.set({ query: e.target.value })} placeholder="Search library" aria-label="Search library"
        style={{ ...inputStyle, height: 40, paddingLeft: 38, borderRadius: T.r.pill, fontSize: 14 }} />
    </div>
  )
}

const SORT_NAMES = [['recent', 'Recently played'], ['added', 'Date added'], ['title', 'Title'], ['author', 'Author'], ['length', 'Length']]
const PROGRESS_NAMES = [['new', 'Not started'], ['started', 'In progress'], ['done', 'Done']]
export const progressOf = d => (d.finished ? 'done' : d.pos > 0 || d.posF > 0 || d.lastPlayed ? 'started' : 'new')

// Sort is remembered on this device; filters are for this visit.
function SortMenu() {
  const sort = useStore(settings, s => s.sort)
  const kind = useStore(ui, s => s.kind)
  const progress = useStore(ui, s => s.progress)
  const kinds = useStore(library, s => [...new Set(s.docs.map(d => KIND[d.kind]).filter(Boolean))].sort().join())
  const pick = (cur, v, set) => ({ icon: cur === v ? 'check' : undefined, onClick: () => set(cur === v ? null : v) })
  return (
    <Menu trigger={toggle => <IconButton icon="toc" label="Sort and filter" active={!!(kind || progress)} onClick={toggle} />} items={[
      { heading: 'Sort by' },
      ...SORT_NAMES.map(([v, l]) => ({ label: l, icon: sort === v ? 'check' : undefined, onClick: () => settings.set({ sort: v }) })),
      '-',
      { heading: 'Show' },
      ...PROGRESS_NAMES.map(([v, l]) => ({ label: l, ...pick(progress, v, p => ui.set({ progress: p })) })),
      kinds && '-',
      kinds && { heading: 'File type' },
      ...(kinds ? kinds.split(',') : []).map(k => ({ label: k, ...pick(kind, k, x => ui.set({ kind: x })) })),
      (kind || progress) && '-',
      (kind || progress) && { label: 'Clear filters', icon: 'close', onClick: () => ui.set({ kind: null, progress: null }) },
    ]} />
  )
}

function MobileHeader() {
  const filter = useStore(ui, s => s.filter)
  const query = useStore(ui, s => s.query)
  const collections = useStore(library, s => s.collections)
  const [searching, setSearching] = useState(!!query)
  const chips = [['queue', 'Queue'], ['all', 'All'], ['archived', 'Archived'], ...collections.map(c => [c.id, c.name])]
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 20, background: T.bg, paddingTop: 'env(safe-area-inset-top)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 60, padding: '0 10px 0 12px' }}>
        <div style={{ flex: 1 }}><Wordmark size={24} /></div>
        <IconButton icon={searching ? 'close' : 'search'} label="Search" onClick={() => { setSearching(!searching); ui.set({ query: '' }) }} />
        <SortMenu />
        <AccountChip compact />
        <IconButton icon="settings" label="Settings" onClick={() => go('settings')} />
        <IconButton icon="plus" label="Add document" onClick={() => openSheet('add')} style={{ background: T.text, color: T.bg, marginLeft: 4 }} />
      </div>
      {searching && <div style={{ padding: '0 16px 10px' }}><SearchBox value={query} autoFocus /></div>}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '2px 16px 12px', scrollbarWidth: 'none' }}>
        {chips.map(([id, name]) => (
          <button key={id} type="button" onClick={() => ui.set({ filter: id })}
            style={{
              height: 32, padding: '0 14px', borderRadius: T.r.pill, border: `1px solid ${filter === id ? T.text : T.border}`, flexShrink: 0,
              background: filter === id ? T.text : 'transparent', color: filter === id ? T.bg : T.sub, fontFamily: T.font, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>{name}</button>
        ))}
        <button type="button" aria-label="New collection" onClick={() => { const n = prompt('New collection name'); if (n?.trim()) ui.set({ filter: addCollection(n) }) }}
          style={{ height: 32, width: 32, borderRadius: T.r.pill, border: `1px dashed ${T.borderHi}`, background: 'transparent', color: T.sub, display: 'grid', placeItems: 'center', flexShrink: 0, cursor: 'pointer' }}>
          <Icon name="plus" size={15} />
        </button>
      </div>
    </div>
  )
}

export function Cover({ d, w = 56, h = 74 }) {
  if (d.cover) return <img src={d.cover} alt="" width={w} height={h} style={{ width: w, height: h, objectFit: 'cover', borderRadius: T.r.xs, display: 'block', flexShrink: 0, border: `1px solid ${T.border}` }} />
  return (
    <div style={{ width: w, height: h, borderRadius: T.r.xs, background: T.surfaceHi, border: `1px solid ${T.border}`, flexShrink: 0, position: 'relative', overflow: 'hidden' }}>
      <span style={{ position: 'absolute', top: 6, left: 7, fontFamily: T.mono, fontSize: 8.5, letterSpacing: '0.08em', color: T.faint }}>{KIND[d.kind] || 'DOC'}</span>
      <span style={{ position: 'absolute', right: 7, bottom: 2, fontSize: h * 0.5, fontWeight: 700, color: T.surfaceTop, lineHeight: 1 }}>{(d.title.match(/[\p{L}\d]/u) || ['N'])[0].toUpperCase()}</span>
    </div>
  )
}

export function StatusLine({ d }) {
  const now = useStore(library, s => s.voicingNow)
  const sys = useStore(settings, s => activeEngine(s) === 'system')
  if (d.status === 'error') return <span style={{ color: T.danger }}>{d.error || 'Failed'}</span>
  if (d.status === 'ready') return null
  if (sys && d.status === 'voicing') return null // built-in voice: playable as soon as the text is ready
  if (d.status === 'voicing' && now !== d.id) {
    const pct = Math.floor((d.done / Math.max(1, d.total)) * 100)
    return <span style={{ color: T.sub }}>In line for audio{pct ? ` · ${pct}% ready` : ''}</span>
  }
  const pct = d.status === 'voicing' ? d.done / Math.max(1, d.total) : d.prep || 0
  const text = d.status === 'voicing' ? 'Generating audio' : d.stage || 'Waiting'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: T.accent }}>
      <Pulse /> {text}{pct > 0 ? ` · ${Math.floor(pct * 100)}%` : ''}{d.status === 'voicing' && <TimeLeft d={d} />}
    </span>
  )
}

// Card estimate from the document's own counters (the reader computes the exact gate from the listening position).
function TimeLeft({ d }) {
  const r = useStore(settings, s => s.naturalSpeed)
  if (!r || !d.chars) return null
  const per = secPerChar(d)
  const w = waitSeconds(d.vSec || 0, Math.max(0, d.chars - (d.vChars || 0)) * per, r)
  return <span style={{ color: w > 0 ? T.sub : T.ok }}>{w > 0 ? ` · playable in ${w < 90 ? '<2 min' : w < 3600 ? `~${Math.round(w / 60)} min` : `~${(w / 3600).toFixed(1)} h`}` : ' · playable now'}</span>
}

const DocCard = memo(function DocCard({ d, playing }) {
  const listened = d.total ? (d.finished ? 1 : d.pos / d.total) : 0
  const meta = [KIND[d.kind], d.chars ? fmtDur(docDuration(d)) : null, voiceName(d.voice), MODE[d.mode]].filter(Boolean).join(' · ')
  const working = d.status !== 'ready' && d.status !== 'error'
  return (
    <motion.div layout="position" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: T.dur.base, ease: T.ease }}
      style={{ position: 'relative', borderRadius: T.r.md, overflow: 'hidden' }}>
      <div role="button" tabIndex={0} onClick={() => { go('reader', d.id); if (!working || d.status === 'voicing') openPlayer(d.id, { autoplay: false }) }}
        onKeyDown={e => e.key === 'Enter' && e.currentTarget.click()}
        style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 12, cursor: 'pointer', background: playing ? T.surface : 'transparent', borderRadius: T.r.md }}
        onPointerEnter={e => { if (!playing) e.currentTarget.style.background = T.surface }}
        onPointerLeave={e => { if (!playing) e.currentTarget.style.background = 'transparent' }}>
        <Cover d={d} />
        <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 5 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            {playing && <Icon name="waves" size={15} style={{ color: T.accent, marginTop: 2 }} />}
            <div style={{
              fontSize: 15, fontWeight: 600, lineHeight: 1.3, color: playing ? T.accent : T.text,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word',
            }}>{d.title}</div>
          </div>
          <div style={{ fontFamily: T.mono, fontSize: 11.5, color: T.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {d.author ? `${d.author} · ` : ''}{meta}
          </div>
          <div style={{ fontSize: 12, minHeight: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><StatusLine d={d} /></div>
        </div>
        {d.finished && <Icon name="check" size={18} style={{ color: T.ok }} />}
        <div onClick={e => e.stopPropagation()}>
          <Menu trigger={toggle => <IconButton icon="more" label={`More options for ${d.title}`} onClick={toggle} />} items={docMenu(d)} />
        </div>
      </div>
      {listened > 0 && <div style={{ position: 'absolute', left: 12, right: 12, bottom: 0 }}><Progress value={listened} height={2} color={T.faint} track="transparent" /></div>}
      {working && d.status === 'voicing' && <div style={{ position: 'absolute', left: 12, right: 12, bottom: 0 }}><Progress value={d.done / Math.max(1, d.total)} height={2} /></div>}
    </motion.div>
  )
})

export function docMenu(d) {
  return [
    { label: 'Rename', icon: 'edit', onClick: () => { const t = prompt('Rename', d.title); if (t?.trim()) patch(d.id, { title: t.trim(), renamed: true }) } },
    { label: 'Change voice', icon: 'voice', right: voiceName(d.voice), onClick: () => openSheet('voice', { docId: d.id }) },
    { label: 'Add to collection', icon: 'folder', onClick: () => openSheet('collect', { docId: d.id }) },
    { label: d.archived ? 'Move to queue' : 'Archive', icon: 'archive', onClick: () => patch(d.id, { archived: !d.archived }) },
    '-',
    { label: 'Export transcript', icon: 'text', disabled: !d.total, onClick: () => exportTranscript(d.id) },
    { label: 'Save audio', icon: 'download', disabled: d.status !== 'ready', right: d.status === 'ready' ? '.opus' : `${Math.floor((d.done / Math.max(1, d.total)) * 100)}%`, onClick: () => exportAudio(d.id) },
    d.status === 'error' && { label: 'Try again', icon: 'refresh', onClick: () => reprocess(d.id) },
    '-',
    { label: 'Delete', icon: 'trash', danger: true, onClick: () => { if (confirm(`Delete "${d.title}" and its audio?`)) { stopIf(d.id); deleteDoc(d.id); if (ui.get().docId === d.id) go('library') } } },
  ]
}

function EngineNotice() {
  const e = useStore(engine, s => s.status)
  const loaded = useStore(engine, s => s.loaded)
  const total = useStore(engine, s => s.total)
  const error = useStore(engine, s => s.error)
  if (e !== 'loading' && e !== 'error') return null
  const mb = n => (n / 1048576).toFixed(0)
  return (
    <div style={{ margin: '0 16px 16px', padding: 16, borderRadius: T.r.lg, border: `1px solid ${e === 'error' ? T.danger : T.border}`, background: T.surface, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600 }}>
        {e === 'loading' ? <Pulse /> : <Icon name="close" size={16} style={{ color: T.danger }} />}
        <span style={{ flex: 1 }}>{e === 'loading' ? 'Downloading the voice model. One time only, then it works offline.' : 'The voice engine could not start'}</span>
        {e === 'loading' && total > 0 && <span style={{ fontFamily: T.mono, fontSize: 12, color: T.sub }}>{mb(loaded)}/{mb(total)} MB</span>}
        {e === 'error' && <Button onClick={() => loadEngine().then(kickVoice).catch(() => {})} icon="refresh">Retry</Button>}
      </div>
      {e === 'loading' && <Progress value={total ? loaded / total : 0} />}
      {e === 'error' && <div style={{ fontFamily: T.mono, fontSize: 12, color: T.sub }}>{error}</div>}
    </div>
  )
}

function EmptyState({ wide }) {
  const features = [
    ['waves', 'Natural voices, on your device', 'Audio is generated locally. No account, no limits, works offline.'],
    ['sparkle', 'Skips the page junk', 'Headers, page numbers, citations and reference lists are removed before listening.'],
    ['file', 'Papers, books, articles', 'PDF, EPUB, Word, web links, Markdown and plain text.'],
  ]
  return (
    <div style={{ maxWidth: 760, margin: wide ? '6vh auto 0' : '4vh auto 0', padding: '0 20px', textAlign: 'center' }}>
      <motion.h2 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: T.dur.slow, ease: T.ease }}
        style={{ margin: 0, fontSize: wide ? 64 : 42, lineHeight: 1.02, letterSpacing: '-0.045em', fontWeight: 700, color: T.text }}>
        Listen to anything.<br /><span style={{ color: T.accent }}>Understand it.</span>
      </motion.h2>
      <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: T.dur.slow, ease: T.ease, delay: 0.06 }}
        style={{ color: T.sub, fontSize: wide ? 18 : 16, lineHeight: 1.55, margin: '20px auto 30px', maxWidth: 520 }}>
        Turn papers, books and articles into natural audio, generated privately on your own device. Free forever. Open source.
      </motion.p>
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: T.dur.slow, ease: T.ease, delay: 0.12 }}
        style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Button kind="primary" icon="plus" onClick={() => openSheet('add')} style={{ height: 48, padding: '0 24px', fontSize: 15 }}>Add document</Button>
        <Button icon="play" onClick={async () => { const id = await addDocument({ kind: 'text', name: SAMPLE.title, title: SAMPLE.title, text: SAMPLE.text }); go('reader', id) }}
          style={{ height: 48, padding: '0 22px', fontSize: 15 }}>Try a sample</Button>
      </motion.div>
      <div style={{ display: 'grid', gridTemplateColumns: wide ? 'repeat(3, 1fr)' : '1fr', gap: 12, marginTop: 56, textAlign: 'left' }}>
        {features.map(([icon, title, body], i) => (
          <motion.div key={title} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: T.dur.slow, ease: T.ease, delay: 0.18 + i * 0.05 }}
            style={{ padding: 18, borderRadius: T.r.lg, border: `1px solid ${T.border}`, background: T.surface }}>
            <Icon name={icon} size={20} style={{ color: T.accent }} />
            <div style={{ fontSize: 15, fontWeight: 600, marginTop: 14, color: T.text }}>{title}</div>
            <div style={{ fontSize: 13.5, color: T.sub, marginTop: 6, lineHeight: 1.5 }}>{body}</div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
