import { memo, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { T, label, eyebrow } from '../theme.js'
import { useStore } from '../lib/store.js'
import { ui, go, openSheet } from '../lib/nav.js'
import { settings } from '../lib/settings.js'
import { library, docDuration, secPerChar, SORTS, reprocess, deleteDoc, patch, exportTranscript, exportAudio, addDocument, addCollection, removeCollection } from '../lib/library.js'
import { player, open as openPlayer, stopIf } from '../lib/player.js'
import { engine } from '../lib/tts.js'
import { voiceName, VOICES } from '../lib/voices.js'
import { activeEngine } from '../lib/engine.js'
import { Icon, LogoWordmark } from './icons.jsx'
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
  const summary = total > 0 && `Your library · ${docs.length} ${docs.length === 1 ? 'document' : 'documents'}${hours ? ` · ${fmtDur(hours)}` : ''}`

  return (
    <div style={{ display: 'flex', minHeight: '100%' }}>
      {wide && <Sidebar />}
      <main style={{ flex: 1, minWidth: 0, padding: wide ? '28px 36px 40px' : '0 0 24px' }}>
        {wide ? <DesktopHeader summary={summary} /> : <MobileHeader summary={summary} />}
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
              <div style={{ padding: '60px 20px', textAlign: 'center', display: 'grid', gap: 14, justifyItems: 'center' }}>
                <div style={{ color: T.sub, fontSize: 14 }}>No documents match.</div>
                <Button onClick={() => ui.set({ query: '', kind: null, progress: null })}>Clear filters</Button>
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
  return <div style={{ padding: '0 8px' }}><LogoWordmark height={Math.round(size * 0.82)} /></div>
}

const FILTER_NAMES = { queue: 'Queue', all: 'All', archived: 'Archived' }

function DesktopHeader({ summary }) {
  const filter = useStore(ui, s => s.filter)
  const query = useStore(ui, s => s.query)
  const view = useStore(settings, s => s.view)
  const collections = useStore(library, s => s.collections)
  const name = FILTER_NAMES[filter] || collections.find(c => c.id === filter)?.name || 'Library'
  return (
    <header style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 26 }}>
      <div style={{ flex: 1, minWidth: 0, visibility: summary ? 'visible' : 'hidden' }}>
        <div style={eyebrow}>{summary}</div>
        <h1 style={{ margin: '12px 0 0', fontSize: 44, fontWeight: 800, letterSpacing: '-0.045em', lineHeight: 1, color: T.text }}>{name}</h1>
      </div>
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
    <Menu trigger={toggle => <IconButton icon="sliders" label="Sort and filter" active={!!(kind || progress)} onClick={toggle} />} items={[
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

function MobileHeader({ summary }) {
  const filter = useStore(ui, s => s.filter)
  const query = useStore(ui, s => s.query)
  const searching = useStore(ui, s => s.searching)
  const collections = useStore(library, s => s.collections)
  const chips = [['queue', 'Queue'], ['all', 'All'], ['archived', 'Archived'], ...collections.map(c => [c.id, c.name])]
  const name = FILTER_NAMES[filter] || collections.find(c => c.id === filter)?.name || 'Library'
  return (
    <div>
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: T.bg, paddingTop: 'env(safe-area-inset-top)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 56, padding: '0 10px 0 12px' }}>
          <div style={{ flex: 1 }}><Wordmark size={24} /></div>
          <SortMenu />
          <AccountChip compact />
        </div>
      </div>
      {summary && (
        <div style={{ padding: '10px 20px 16px' }}>
          <div style={eyebrow}>{summary}</div>
          <h1 style={{ margin: '10px 0 0', fontSize: 34, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.05, color: T.text }}>{name}</h1>
        </div>
      )}
      {searching && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px 12px 16px' }}>
          <div style={{ flex: 1 }}><SearchBox value={query} autoFocus /></div>
          <IconButton icon="close" label="Close search" onClick={() => ui.set({ searching: false, query: '' })} />
        </div>
      )}
      {summary && <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '2px 16px 12px', scrollbarWidth: 'none' }}>
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
      </div>}
    </div>
  )
}

// Documents without a real cover get generated artwork (like album art): a glow in one of the ACS
// hues, picked deterministically from the title so a document looks the same on every device.
const HUES = ['#AAFF00', '#00E5FF', '#00D4A8', '#2288FF', '#6EE7B7']
const hueOf = s => { let h = 0; for (const ch of s) h = (h * 31 + ch.codePointAt(0)) >>> 0; return HUES[h % HUES.length] }

export function Cover({ d, w = 56, h = 74 }) {
  const box = { width: w, height: h, borderRadius: Math.max(T.r.xs, w * 0.06), flexShrink: 0, border: `1px solid ${T.border}` }
  if (d.cover) return <img src={d.cover} alt="" width={w} height={h} style={{ ...box, objectFit: 'cover', display: 'block' }} />
  const hue = hueOf(d.title)
  const big = w >= 80 // room to set the title; smaller covers carry the initial, like a monogram
  const initial = (d.title.match(/[\p{L}\d]/u) || ['N'])[0].toUpperCase()
  return (
    <div aria-hidden style={{
      ...box, position: 'relative', overflow: 'hidden',
      background: `radial-gradient(130% 95% at 15% 0%, ${hue}B3 0%, ${hue}33 42%, transparent 72%), radial-gradient(80% 60% at 100% 100%, ${hue}2E 0%, transparent 70%), #000`,
    }}>
      {w >= 48 && <span style={{ position: 'absolute', top: w * 0.09, left: w * 0.1, fontFamily: T.mono, fontSize: Math.max(7.5, w * 0.1), letterSpacing: '0.14em', color: 'rgba(255,255,255,0.72)' }}>{KIND[d.kind] || 'DOC'}</span>}
      {big ? (
        <span style={{
          position: 'absolute', left: w * 0.1, right: w * 0.08, bottom: w * 0.1, fontFamily: T.serif, fontWeight: 600, fontSize: w * 0.13, lineHeight: 1.15,
          color: T.text, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden', hyphens: 'auto',
        }}>{d.title}</span>
      ) : (
        <span style={{ position: 'absolute', left: w * 0.1, bottom: h * 0.02, fontFamily: T.serif, fontWeight: 600, fontSize: h * (w >= 48 ? 0.5 : 0.56), lineHeight: 1, color: T.text }}>{initial}</span>
      )}
    </div>
  )
}

// One true statement about a document's audio, or nothing. An audio line shows only for the document
// loaded in the player while its gate is closed (Play was pressed and it is not ready yet), using the
// same gate seconds the player shows. Every other card stays silent: routine background work blocks nothing.
export function StatusLine({ d }) {
  const sys = useStore(settings, s => activeEngine(s) === 'system')
  const playId = useStore(player, s => s.id)
  const gate = useStore(player, s => s.gate)
  const engStatus = useStore(engine, s => s.status)
  // Queue order as a stable string: re-renders only when the queue's membership changes, not on progress ticks.
  const qkey = useStore(library, s => s.docs.filter(x => x.status === 'queued' || x.status === 'reading' || x.status === 'narrating' || x.status === 'syncing').sort((a, b) => a.createdAt - b.createdAt).map(x => x.id).join(','))
  if (d.status === 'error') return <span style={{ color: T.danger }}>Could not read this file. Try again from the menu (⋯).{d.error ? <span style={{ color: T.faint }}> · {d.error}</span> : null}</span>
  if (d.status === 'ready') return null
  if (d.status === 'voicing') {
    if (sys) return null // built-in voice: playable as soon as the text is ready
    if (engStatus === 'error' && d.id === playId) return <span style={{ color: T.danger }}>The voice didn't load</span>
    if (d.id !== playId || gate == null) return null
    const when = ` · ready in ${gate < 90 ? 'under 2 min' : gate < 3600 ? `about ${Math.round(gate / 60)} min` : `about ${(gate / 3600).toFixed(1)} h`}`
    return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: T.text }}><Pulse /> Preparing audio{when}</span>
  }
  if (d.status === 'queued') return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: T.text }}><Pulse /> {queuedText(d.id, qkey)}</span>
  const pct = d.prep || 0
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: T.text }}>
      <Pulse /> {d.stage || 'Waiting'}{pct >= 0.01 ? ` · ${Math.floor(pct * 100)}%` : ''}
    </span>
  )
}

const ord = n => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`)
function queuedText(id, qkey) {
  const at = qkey ? qkey.split(',').indexOf(id) : -1
  return at < 0 ? 'Queued' : `Queued, ${ord(at + 1)} in line`
}

const DocCard = memo(function DocCard({ d, playing }) {
  const listened = d.total ? (d.finished ? 1 : d.pos / d.total) : 0
  const dur = d.chars ? fmtDur(docDuration(d)) : null
  const meta = [KIND[d.kind], dur ? (d.vChars > 400 ? dur : `~${dur}`) : null, voiceName(d.voice), MODE[d.mode]].filter(Boolean).join(' · ')
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
            {playing && <Icon name="waves" size={15} style={{ color: T.lime, marginTop: 2 }} />}
            <div style={{
              fontSize: 15, fontWeight: 600, lineHeight: 1.3, color: playing ? T.lime : T.text,
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
    { label: 'Save audio', icon: 'download', disabled: d.status !== 'ready', right: d.status === 'ready' ? '.opus' : 'when fully voiced', onClick: () => exportAudio(d.id) },
    d.status === 'error' && { label: 'Try again', icon: 'refresh', onClick: () => reprocess(d.id) },
    '-',
    { label: 'Delete', icon: 'trash', danger: true, onClick: () => { if (confirm(`Delete "${d.title}" and its audio?`)) { stopIf(d.id); deleteDoc(d.id); if (ui.get().docId === d.id) go('library') } } },
  ]
}

const STATS = [['₹0', 'Free forever'], ['Offline', 'audio'], [String(VOICES.length), 'Natural voices']]
const FEATURES = [
  ['waves', 'Natural voices, on your device', 'Audio is generated locally. No account, no limits, works offline.'],
  ['sparkle', 'Skips the page junk', 'Headers, page numbers, citations and reference lists are removed before listening.'],
  ['file', 'Papers, books, articles', 'PDF, EPUB, Word, web links, Markdown and plain text.'],
]
const rise = i => ({ initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: T.dur.slow, ease: T.ease, delay: i * 0.06 } })

// First run, in the ACS landing language: eyebrow, tight headline, italic subline, mono stats, pill CTAs.
function EmptyState({ wide }) {
  const sample = async () => { const id = await addDocument({ kind: 'text', name: SAMPLE.title, title: SAMPLE.title, text: SAMPLE.text }); go('reader', id) }
  return (
    <div style={{ maxWidth: 880, margin: wide ? '8vh auto 0' : '6vh 0 0', padding: wide ? '0 8px' : '0 24px' }}>
      <motion.div {...rise(0)} style={{ ...eyebrow, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 6, height: 6, borderRadius: 6, background: T.lime }} />
        Listen deeper
        <span style={{ width: 56, height: 1, background: T.borderHi }} />
      </motion.div>
      <motion.h2 {...rise(1)} style={{ margin: '22px 0 0', fontSize: wide ? 76 : 46, lineHeight: 0.98, letterSpacing: '-0.055em', fontWeight: 800, color: T.text }}>
        Listen to<br />anything.
      </motion.h2>
      <motion.div {...rise(2)} style={{ marginTop: 12, fontSize: wide ? 34 : 26, fontStyle: 'italic', fontWeight: 300, letterSpacing: '-0.02em', color: T.sub }}>
        Understand it.
      </motion.div>
      <motion.p {...rise(3)} style={{ color: T.sub, fontSize: wide ? 18 : 16, lineHeight: 1.6, margin: '22px 0 0', maxWidth: 540 }}>
        Papers, books and articles turned into natural audio. Audio is made on your device. AI features are opt-in.
      </motion.p>
      <motion.div {...rise(4)} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', justifyContent: 'start', columnGap: wide ? 56 : 28, rowGap: 6, marginTop: 34 }}>
        {STATS.map(([v]) => <div key={v} style={{ fontFamily: T.mono, fontSize: wide ? 26 : 21, fontWeight: 600, color: T.text }}>{v}</div>)}
        {STATS.map(([v, l]) => <div key={l} style={{ ...eyebrow, fontSize: 10, letterSpacing: '0.18em' }}>{l}</div>)}
      </motion.div>
      <motion.div {...rise(5)} style={{ display: 'flex', flexDirection: wide ? 'row' : 'column', gap: 12, marginTop: 40 }}>
        <Button kind="primary" onClick={() => openSheet('add')} full={!wide} style={{ height: 56, padding: '0 30px', fontSize: 16, fontWeight: 700, borderRadius: wide ? T.r.pill : T.r.lg }}>
          Add a document <Icon name="next" size={16} />
        </Button>
        <Button icon="play" onClick={sample} full={!wide} style={{ height: 56, padding: '0 26px', fontSize: 16, background: 'transparent', borderColor: T.borderHi, borderRadius: wide ? T.r.pill : T.r.lg }}>
          Try a sample
        </Button>
      </motion.div>
      <div style={{ display: 'grid', gridTemplateColumns: wide ? 'repeat(3, 1fr)' : '1fr', gap: 12, margin: '64px 0 24px' }}>
        {FEATURES.map(([icon, title, body], i) => (
          <motion.div key={title} {...rise(6 + i)} style={{ padding: 20, borderRadius: T.r.lg, border: `1px solid ${T.border}`, background: T.surface }}>
            <Icon name={icon} size={20} style={{ color: T.accent }} />
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 16, color: T.text }}>{title}</div>
            <div style={{ fontSize: 13.5, color: T.sub, marginTop: 6, lineHeight: 1.55 }}>{body}</div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
