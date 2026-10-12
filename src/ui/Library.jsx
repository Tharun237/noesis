import { hueOf } from './bookcolour.js'
import { DocBar, LibraryGlance } from './Heard.jsx'
import { onShelf } from '../lib/shelf.js'
import { memo, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { later } from './later.jsx'
import { motion, AnimatePresence } from 'motion/react'
import { leaveCover, arriveCover, coverInFlight } from '../lib/coverflight.js'
import { T, label, eyebrow } from '../theme.js'
import { useStore } from '../lib/store.js'
import { ui, go, openSheet, closeSearch, tab } from '../lib/nav.js'
import { settings } from '../lib/settings.js'
import { library, docDuration, secPerChar, SORTS, reprocess, deleteDoc, patch, exportTranscript, exportAudio, addCollection, removeCollection } from '../lib/library.js'
import { player, open as openPlayer, stopIf } from '../lib/player.js'
import { historyStore, hasEntries } from '../lib/history.js'
import { engine } from '../lib/tts.js'
import { voiceName } from '../lib/voices.js'
import { activeEngine } from '../lib/engine.js'
import { Icon, LogoWordmark } from './icons.jsx'
import { Button, IconButton, Menu, Pulse, inputStyle, fmtDur, Swap } from './kit.jsx'
import { AccountChip } from './SyncStatus.jsx'
import { waitSeconds, waitWords } from '../lib/readiness-math.js'

const KIND = { pdf: 'PDF', epub: 'EPUB', docx: 'DOCX', html: 'WEB', md: 'MD', txt: 'TXT', text: 'TEXT', link: 'LINK' }
const MODE = { long: 'Long summary', short: 'Short summary' }

// What the customer's AI can do across the whole library, behind one button: the header stays the same
// width on a phone however many of these there are.
// The large title scrolls away with the list; its name then appears in the bar, tied to the scroll itself by
// the style sheet (press.js: no script runs while scrolling), so the customer always knows which shelf they are on.
function BarTitle({ name }) {
  return <span aria-hidden data-bartitle="" style={{ fontSize: 15, fontWeight: 700, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
}

function LibraryAi({ hasBriefing }) {
  return (
    <Menu trigger={t => <IconButton icon="sparkle" label="Ask your library" onClick={t} />}
      items={[
        { label: 'Ask your library', icon: 'sparkle', onClick: () => openSheet('libraryask') },
        ...(hasBriefing ? [{ label: 'Make a briefing', icon: 'text', onClick: () => openSheet('briefing') }, { label: 'Concept map', icon: 'grid', onClick: () => openSheet('conceptmap') }] : []),
        { label: 'Your listening', icon: 'waves', onClick: () => openSheet('listening') },
      ]} />
  )
}

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

// An empty library is not a list with nothing in it: it is the landing page, with none of the library's own
// bars around it. Whether there is a library is known only once it has been read from the device, so the
// answer from last time is kept: a new visitor's landing page is fetched straight away, and nobody is shown
// the wrong one of the two first.
const Landing = later(() => import('./Landing.jsx').then(m => m.Landing))
const HAD_DOCS = onShelf('noesis.had-docs')
const hadDocs = (() => { try { return localStorage.getItem(HAD_DOCS) === '1' } catch { return false } })()
if (!hadDocs || ui.get().welcome) Landing.fetch()
// Is there nothing to list? Before the library has been read: what it was last time. (The app's bottom bars
// belong to a library: they go when there is none.)
export const useEmptyLibrary = () => useStore(library, s => (s.loaded ? s.docs.length === 0 : !hadDocs))

export function Library({ wide }) {
  const loaded = useStore(library, s => s.loaded)
  const total = useStore(library, s => s.docs.length)
  const welcome = useStore(ui, s => s.welcome)
  useEffect(() => { if (loaded) try { localStorage.setItem(HAD_DOCS, total ? '1' : '0') } catch { /* no storage: asked again next time */ } }, [loaded, total])
  const docs = useVisibleDocs()
  const view = useStore(settings, s => s.view)
  const playingId = useStore(player, s => s.id)
  const query = useStore(ui, s => s.query)
  const hours = docs.reduce((a, d) => a + docDuration(d), 0)
  const summary = total > 0 && `Your library · ${docs.length} ${docs.length === 1 ? 'document' : 'documents'}${hours ? ` · ${fmtDur(hours)}` : ''}`

  const order = useMemo(() => docs.map(d => d.id).join(), [docs])
  // the landing page: for an empty library, or asked for by its own address
  if (welcome || (loaded ? total === 0 : !hadDocs)) return loaded || welcome ? <Suspense fallback={null}><Landing wide={wide} hasLibrary={total > 0} /></Suspense> : null
  return (
    <div style={{ display: 'flex', minHeight: '100%' }}>
      {wide && <Sidebar />}
      <main style={{ flex: 1, minWidth: 0, padding: wide ? '28px 36px 40px' : '0 0 24px' }}>
        {wide ? <DesktopHeader summary={summary} /> : <MobileHeader summary={summary} />}
        {/* the customer's listening, where they already are: not a screen to go and visit */}
        {!query && docs.length > 0 && <LibraryGlance docs={docs} wide={wide} />}
        <>
            <div style={{
              display: 'grid', gap: wide ? 8 : 2, padding: wide ? 0 : '0 8px', position: 'relative',
              gridTemplateColumns: wide && view === 'grid' ? 'repeat(auto-fill, minmax(340px, 1fr))' : '1fr',
            }}>
              <AnimatePresence mode="popLayout">
                {docs.map((d, i) => <DocCard key={d.id} d={d} i={i} order={order} glide={wide} playing={d.id === playingId} />)}
              </AnimatePresence>
            </div>
            {loaded && docs.length === 0 && (
              <div style={{ padding: '60px 20px', textAlign: 'center', display: 'grid', gap: 14, justifyItems: 'center' }}>
                <div style={{ color: T.sub, fontSize: 14 }}>No documents match.</div>
                <Button onClick={() => ui.set({ query: '', kind: null, progress: null })}>Clear filters</Button>
              </div>
            )}
        </>
      </main>
    </div>
  )
}

function SidebarItem({ id, icon, name, onRemove, filter, count }) {
  return (
    <button type="button" onClick={() => ui.set({ filter: id })}
      style={{
        position: 'relative', isolation: 'isolate', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 12, width: '100%', height: 40, padding: '0 12px', border: 'none', borderRadius: T.r.sm,
        background: 'transparent', color: filter === id ? T.text : T.sub, fontFamily: T.font, fontSize: 14,
        fontWeight: filter === id ? 600 : 500, cursor: 'pointer', textAlign: 'left',
      }}>
      {/* The marker is one object: it slides to the shelf that was chosen. The sidebar is its root (layoutRoot):
          measured against the page, it would fly whenever the list's scroll changed with the shelf. */}
      {filter === id && <motion.span layoutId="side-pill" layoutDependency={filter} transition={T.spring} style={{ position: 'absolute', inset: 0, zIndex: -1, borderRadius: T.r.sm, background: T.surfaceHi }} />}
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
    <motion.aside layoutRoot style={{ width: T.sidebarW, flexShrink: 0, borderRight: `1px solid ${T.border}`, padding: '24px 14px', position: 'sticky', top: 0, height: 'calc(100dvh - var(--dock, 0px))', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Wordmark reveal={docs.length === 0} />
      <div style={{ ...label, padding: '28px 12px 8px' }}>Library</div>
      <SidebarItem id="queue" icon="list" name="Queue" filter={filter} count={count('queue')} />
      <SidebarItem id="all" icon="grid" name="All" filter={filter} count={count('all')} />
      <SidebarItem id="archived" icon="archive" name="Archived" filter={filter} count={count('archived')} />
      <div style={{ ...label, padding: '24px 12px 8px' }}>Collections</div>
      {/* A long list of collections scrolls here, so the account and Settings below never leave the screen. */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
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
      </div>
      <div style={{ padding: '0 2px 8px' }}><AccountChip /></div>
      <button type="button" onClick={() => go('settings')}
        style={{ display: 'flex', alignItems: 'center', gap: 12, height: 40, padding: '0 12px', border: 'none', borderRadius: T.r.sm, background: 'transparent', color: T.sub, fontFamily: T.font, fontSize: 14, cursor: 'pointer' }}>
        <Icon name="settings" size={17} /> Settings
      </button>
    </motion.aside>
  )
}

// On the very first screen (an empty library) the wordmark is revealed from left to right, once: a cover the
// colour of the page slides off it. Afterwards it is simply there.
let revealed = false
export function Wordmark({ size = 26, reveal = false }) {
  const [draw] = useState(() => { const first = reveal && !revealed; revealed = true; return first })
  return (
    <div style={{ padding: '0 8px' }}>
      <div style={{ position: 'relative', overflow: 'hidden' }}>
        <LogoWordmark height={Math.round(size * 0.82)} />
        {draw && <motion.span aria-hidden="true" initial={{ x: 0 }} animate={{ x: '102%' }} transition={{ duration: 0.9, ease: T.ease, delay: 0.2 }} style={{ position: 'absolute', inset: 0, background: T.bg }} />}
      </div>
    </div>
  )
}

const FILTER_NAMES = { queue: 'Queue', all: 'All', archived: 'Archived' }

function DesktopHeader({ summary }) {
  const filter = useStore(ui, s => s.filter)
  const query = useStore(ui, s => s.query)
  const view = useStore(settings, s => s.view)
  const collections = useStore(library, s => s.collections)
  const hasDocs = useStore(library, s => s.docs.length > 0)
  const hasBriefing = useStore(library, s => s.docs.length >= 2)
  const hasHistory = useStore(historyStore, s => hasEntries(s.log))
  const name = FILTER_NAMES[filter] || collections.find(c => c.id === filter)?.name || 'Library'
  return (
    <header style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 26 }}>
      <div style={{ flex: 1, minWidth: 0, visibility: summary ? 'visible' : 'hidden' }}>
        <div style={eyebrow}>{summary}</div>
        <h1 style={{ margin: '12px 0 0', fontSize: 44, fontWeight: 800, letterSpacing: '-0.045em', lineHeight: 1, color: T.text }}><Swap>{name}</Swap></h1>
      </div>
      <SearchBox value={query} width={220} />
      <SortMenu />
      <IconButton icon={view === 'grid' ? 'list' : 'grid'} label={view === 'grid' ? 'List view' : 'Grid view'} onClick={() => settings.set({ view: view === 'grid' ? 'list' : 'grid' })} />
      {(hasDocs || hasHistory) && <LibraryAi hasBriefing={hasBriefing} />}
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
  const hasDocs = useStore(library, s => s.docs.length > 0)
  const hasBriefing = useStore(library, s => s.docs.length >= 2)
  const hasHistory = useStore(historyStore, s => hasEntries(s.log))
  const chips = [['queue', 'Queue'], ['all', 'All'], ['archived', 'Archived'], ...collections.map(c => [c.id, c.name])]
  const name = FILTER_NAMES[filter] || collections.find(c => c.id === filter)?.name || 'Library'
  return (
    <div>
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: T.bg, paddingTop: 'env(safe-area-inset-top)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 56, padding: '0 10px 0 12px' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <Wordmark size={24} reveal={!hasDocs} />
            <BarTitle name={name} />
          </div>
          {(hasDocs || hasHistory) && <LibraryAi hasBriefing={hasBriefing} />}
          <SortMenu />
          {/* Adding is an action, not a place: a button here, not a tab below. */}
          <IconButton icon="plus" label="Add" onClick={() => openSheet('add')} size={34} iconSize={18} style={{ background: T.text, color: T.bg, margin: '0 4px 0 2px' }} />
        </div>
      </div>
      {summary && (
        <div style={{ padding: '10px 20px 16px' }}>
          <div style={eyebrow}>{summary}</div>
          <h1 style={{ margin: '10px 0 0', fontSize: 34, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.05, color: T.text }}><Swap>{name}</Swap></h1>
        </div>
      )}
      <AnimatePresence initial={false}>
        {searching && (
          <motion.div key="search" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6, transition: { duration: 0.1, ease: 'easeIn' } }}
            transition={{ duration: 0.18, ease: T.ease }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px 12px 16px' }}>
            <div style={{ flex: 1 }}><SearchBox value={query} autoFocus /></div>
            <IconButton icon="close" label="Close search" onClick={closeSearch} />
          </motion.div>
        )}
      </AnimatePresence>
      {summary && <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '2px 16px 12px', scrollbarWidth: 'none' }}>
        {chips.map(([id, name]) => (
          <button key={id} type="button" onClick={() => ui.set({ filter: id })} data-press=""
            style={{
              position: 'relative', height: 32, padding: '0 14px', borderRadius: T.r.pill, border: `1px solid ${T.border}`, flexShrink: 0,
              background: 'transparent', color: filter === id ? T.bg : T.sub, fontFamily: T.font, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
            {/* The white pill is one object: it slides to the shelf that was chosen, so the eye follows the choice. */}
            {filter === id && <motion.span layoutId="shelf-pill" layoutDependency={filter} transition={T.spring} style={{ position: 'absolute', inset: -1, borderRadius: T.r.pill, background: T.text }} />}
            <span style={{ position: 'relative' }}>{name}</span>
          </button>
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

const COVER_W = 56 // a card's cover; its progress line is the same width
// A plain picture. (The two players used to share theirs as one moving object: it travelled two pixels, and
// to do it the whole new page was measured on every change of page. At a slow phone's speed that measuring
// was the largest single cost of opening a book: e2e/feel.mjs, 2026-10-12.)
export function Cover({ d, w = COVER_W, h = 74 }) {
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
  if (d.status === 'paused') return <span style={{ color: T.sub }}>{d.stage || 'Paused'}{d.prep >= 0.01 ? ` · ${Math.floor(d.prep * 100)}%` : ''}</span>
  if (d.status === 'voicing') {
    if (sys) return null // built-in voice: playable as soon as the text is ready
    if (engStatus === 'error' && d.id === playId) return <span style={{ color: T.danger }}>The voice didn't load</span>
    if (d.id !== playId || gate == null) return null
    return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: T.text }}><Pulse /> Making the audio · ready in {waitWords(gate)}</span>
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

const DocCard = memo(function DocCard({ d, i, order, glide, playing, ref }) {
  const dur = d.chars ? fmtDur(docDuration(d)) : null
  const meta = [KIND[d.kind], dur ? (d.vChars > 400 ? dur : `~${dur}`) : null, voiceName(d.voice), MODE[d.mode]].filter(Boolean).join(' · ')
  const working = d.status !== 'ready' && d.status !== 'error'
  // The cover is one object: it leaves with the tap and flies home when the reader is left (coverflight.js).
  const cover = useRef(null)
  useLayoutEffect(() => { arriveCover(d.id, cover.current) }, [d.id])
  // The card whose cover is flying home stands still: its cover must land where the card already is.
  const [landing] = useState(() => coverInFlight(d.id))
  return (
    // On a computer a card glides to its new place when the list is sorted or filtered. On a phone it does not:
    // every card would be measured each time the library is come to, and that was felt (e2e/feel.mjs).
    <motion.div ref={ref} layout={glide ? 'position' : false} layoutDependency={order} initial={false}
      exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.16, ease: 'easeIn' } }}
      transition={{ layout: T.settle }}
      style={{ position: 'relative', borderRadius: T.r.md, overflow: 'hidden' }}>
      <div role="button" tabIndex={0} data-press="" data-rise={landing ? undefined : String(Math.min(i, T.enter.held))} onClick={() => { leaveCover(d.id, cover.current); go('reader', d.id); if (!working || d.status === 'voicing') openPlayer(d.id, { autoplay: false }) }}
        onKeyDown={e => e.key === 'Enter' && e.currentTarget.click()}
        style={{ '--press': T.tap.card, display: 'flex', alignItems: 'center', gap: 14, padding: 12, cursor: 'pointer', background: playing ? T.surface : 'transparent', borderRadius: T.r.md }}
        onPointerEnter={e => { if (!playing) e.currentTarget.style.background = T.surface }}
        onPointerLeave={e => { if (!playing) e.currentTarget.style.background = 'transparent' }}>
        <div ref={cover} style={{ display: 'flex', flexShrink: 0 }}><Cover d={d} /></div>
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
          {/* The status changes in place (queued, reading, preparing, ready): one line fades into the next. */}
          <div key={d.status} data-fade="" style={{ fontSize: 12, minHeight: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><StatusLine d={d} /></div>
          {/* how far, how much of it today, how much is left: drawn, in the document's own colour (Heard.jsx) */}
          <DocBar d={d} />
        </div>
        {d.finished && <Icon name="check" size={18} style={{ color: T.ok }} />}
        <div onClick={e => e.stopPropagation()}>
          <Menu trigger={toggle => <IconButton icon="more" label={`More options for ${d.title}`} onClick={toggle} />} items={docMenu(d)} />
        </div>
      </div>
    </motion.div>
  )
})

// One menu for a document: how it is heard | where it is kept | take it out | delete. On its card in the
// library, all of it. In the reader, where the document is being read and not filed, the keeping is left
// out (`keeping: false`): twelve rows had become a list to read rather than a menu to use.
export function docMenu(d, { keeping = true } = {}) {
  return [
    { label: 'Change voice', icon: 'voice', right: voiceName(d.voice), onClick: () => openSheet('voice', { docId: d.id }) },
    { label: 'Listen in another language', icon: 'globe', onClick: () => openSheet('language', { docId: d.id }) },
    '-',
    ...(keeping ? [
      { label: 'Rename', icon: 'edit', onClick: () => { const t = prompt('Rename', d.title); if (t?.trim()) patch(d.id, { title: t.trim(), renamed: true }) } },
      { label: 'Add to collection', icon: 'folder', onClick: () => openSheet('collect', { docId: d.id }) },
      { label: d.archived ? 'Move to queue' : 'Archive', icon: 'archive', onClick: () => patch(d.id, { archived: !d.archived }) },
      '-',
    ] : []),
    { label: 'Export transcript', doing: 'Writing the transcript', icon: 'text', disabled: !d.total, onClick: () => exportTranscript(d.id) },
    { label: 'Save audio', icon: 'download', disabled: d.status !== 'ready', right: d.status === 'ready' ? (typeof AudioEncoder === 'undefined' ? '.wav' : '.opus') : 'not yet', doing: 'Putting the audio into one file', onClick: () => exportAudio(d.id) },
    d.status === 'error' && { label: 'Try again', icon: 'refresh', onClick: () => reprocess(d.id) },
    ...(keeping ? [
      '-',
      { label: 'Delete', icon: 'trash', danger: true, onClick: () => { if (confirm(`Delete "${d.title}" and its audio?`)) { stopIf(d.id); deleteDoc(d.id); if (ui.get().docId === d.id) tab('library') } } },
    ] : []),
  ]
}
