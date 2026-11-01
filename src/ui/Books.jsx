// The Books tab: free books to explore (lib/books.js). Its home is shelves of covers to swipe; a search, a category
// or a language turns it into one list; a book opens its own page (BookPage below), where the customer decides what
// to do with it. Browsing never adds anything.
//
// A search or a list is a history entry (nav.js pushPanel): Back closes it before it leaves Books. What is being
// looked at is kept outside the page (`looking`), so a trip into a book and back returns to the same list.
import { useEffect, useMemo, useState } from 'react'
import { T, label } from '../theme.js'
import { createStore, useStore } from '../lib/store.js'
import { go, goBack, pushPanel, popPanel, toast } from '../lib/nav.js'
import { useRoute } from '../lib/route.js'
import { library } from '../lib/library.js'
import { books, loadHome, ask, warm, known, coverUrl, pageUrl, aboutOf, docOfBook, listen, addToLibrary, remove, SOURCE } from '../lib/books.js'
import { Icon } from './icons.jsx'
import { Button, IconButton, Spinner, inputStyle } from './kit.jsx'
import { hueOf } from './bookcolour.js'
import { Sidebar } from './Library.jsx'
import { whenIdle } from '../lib/motion.js'

const PAGE = 60 // books in a list before "Show more"
const SLOW_MS = 500 // a wait shorter than this shows nothing turning
const PANEL = 'books:list'
// Built only as it is seen (measured on a phone 12 times slower than this laptop: the whole home at once, 9 shelves
// of 24 covers, a category list and the languages, froze it for 4 seconds): a shelf starts with the covers the eye
// reaches and takes the rest when it is first swiped; the page starts with its first shelves and builds the others
// while the customer looks, a couple at a time.
const SHELF_FIRST = 8
const HOME_FIRST = 3
const HOME_STEP = 2
const CATEGORIES_FIRST = 12 // the largest; the rest on asking (73 rows built at once took 0.8 s on that phone)

// { q: what is typed, list: { kind: 'category' | 'language', code, name } | null, homeY: the shelves' scroll,
//   built: how many parts of the home are built }
const looking = createStore({ q: '', list: null, homeY: 0, built: HOME_FIRST })

let names = null
const languageName = code => {
  try { names ??= new Intl.DisplayNames(['en'], { type: 'language' }); return names.of(code) || code } catch { return code }
}

// A cover: Gutenberg's own picture of it, over the book's own flat colour and title (seen while the picture
// arrives, and kept where a book has none).
export function BookCover({ book, w }) {
  const h = Math.round(w * 1.5)
  return (
    <div aria-hidden style={{ position: 'relative', width: w, height: h, flexShrink: 0, borderRadius: Math.max(T.r.xs, w * 0.04), overflow: 'hidden', border: `1px solid ${T.border}`, background: `color-mix(in srgb, ${hueOf(book.t)} 30%, #0b0b0b)` }}>
      <span style={{ position: 'absolute', left: w * 0.1, right: w * 0.08, bottom: w * 0.1, fontFamily: T.serif, fontWeight: 600, fontSize: Math.max(11, w * 0.12), lineHeight: 1.15, color: T.text, display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden', hyphens: 'auto' }}>{book.t}</span>
      {/* arrives whole, as a fade over the title card, never drawn in strips from the top; one the browser already
          has is simply there (a fade from nothing, every time a page came back, read as a flicker in the film) */}
      <img src={coverUrl(book.id)} alt="" loading="lazy" decoding="async" width={w} height={h}
        ref={el => { if (el?.complete && el.naturalWidth) el.style.opacity = 1 }}
        onLoad={e => { e.currentTarget.style.opacity = 1 }} onError={e => { e.currentTarget.style.display = 'none' }}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0, transition: `opacity ${T.dur.base}s cubic-bezier(${T.ease.join(', ')})` }} />
    </div>
  )
}

const open = book => go('book', String(book.id))

function BookTile({ book, w, note }) {
  return (
    <button type="button" data-press="" onClick={() => open(book)} aria-label={`${book.t}, ${book.a}`}
      style={{ '--press': T.tap.card, width: w, flexShrink: 0, scrollSnapAlign: 'start', display: 'grid', gap: 8, padding: 0, border: 'none', background: 'transparent', color: T.text, textAlign: 'left', cursor: 'pointer', fontFamily: T.font }}>
      <BookCover book={book} w={w} />
      <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{book.t}</span>
        <span style={{ fontSize: 13, color: T.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{note || book.a}</span>
      </span>
    </button>
  )
}

function Shelf({ title, count, list, wide, onAll }) {
  const w = wide ? 132 : 112
  const [all, setAll] = useState(false)
  const shown = all ? list : list.slice(0, SHELF_FIRST)
  return (
    <section style={{ display: 'grid', gap: 14, contentVisibility: 'auto', containIntrinsicSize: `auto ${Math.round(w * 1.5) + 110}px` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: wide ? 0 : '0 20px' }}>
        <h2 style={{ margin: 0, flex: 1, minWidth: 0, fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em', color: T.text }}>{title}</h2>
        {onAll && (
          <button type="button" onClick={onAll} style={{ minHeight: 44, padding: '0 2px', border: 'none', background: 'transparent', color: T.sub, fontFamily: T.font, fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {count ? `All ${count.toLocaleString('en-IN')}` : 'See all'}
          </button>
        )}
      </div>
      <div onScroll={all ? undefined : () => setAll(true)} style={{ display: 'flex', gap: wide ? 20 : 14, overflowX: 'auto', scrollSnapType: 'x mandatory', scrollPaddingInline: wide ? 0 : 20, padding: wide ? '0 0 6px' : '0 20px 6px', scrollbarWidth: 'none' }}>
        {shown.map(x => <BookTile key={x.book.id} book={x.book} note={x.note} w={w} />)}
      </div>
    </section>
  )
}

function BookRow({ book }) {
  return (
    <button type="button" data-press="" onClick={() => open(book)}
      style={{ '--press': T.tap.row, display: 'flex', alignItems: 'center', gap: 14, width: '100%', minHeight: 44, padding: '8px 0', border: 'none', background: 'transparent', color: T.text, textAlign: 'left', cursor: 'pointer', fontFamily: T.font }}>
      <BookCover book={book} w={52} />
      <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 3 }}>
        <span style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{book.t}</span>
        <span style={{ fontSize: 14, color: T.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[book.a, book.l !== 'en' ? languageName(book.l) : null].filter(Boolean).join(' · ')}</span>
      </span>
    </button>
  )
}

// One list: what a search found, or every book of a category or a language: the most read first, then the best known.
function BookList({ q, list }) {
  const [shown, setShown] = useState({ books: [], total: 0, more: 0, done: false })
  const [slow, setSlow] = useState(false)
  const [error, setError] = useState(null)
  useEffect(() => {
    let live = true
    setError(null)
    const t = setTimeout(() => live && setSlow(true), SLOW_MS)
    const question = q ? { find: q, limit: PAGE * (shown.more + 1) } : list.kind === 'category' ? { category: list.code, limit: PAGE * (shown.more + 1) } : { language: list.code, limit: PAGE * (shown.more + 1) }
    // typing: the answer to the last word typed, not every word on the way
    const wait = setTimeout(() => ask(question).then(r => live && setShown(s => ({ ...s, books: r.books, total: r.total ?? r.books.length, done: true }))).catch(e => live && setError(e.message)).finally(() => { clearTimeout(t); if (live) setSlow(false) }), q ? 120 : 0)
    return () => { live = false; clearTimeout(t); clearTimeout(wait) }
  }, [q, list?.kind, list?.code, shown.more]) // eslint-disable-line react-hooks/exhaustive-deps
  if (error) return <p style={{ margin: 0, padding: '24px 0', fontSize: 15, color: T.sub }}>{error}</p>
  if (!shown.done) return slow ? <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '24px 0', color: T.sub, fontSize: 15 }}><Spinner size={16} /> Looking through the books</div> : null
  if (!shown.books.length) return <p style={{ margin: 0, padding: '24px 0', fontSize: 15, lineHeight: 1.5, color: T.sub }}>No free book matches “{q}”. Try the author's last name, or fewer words.</p>
  const more = q ? shown.books.length === PAGE * (shown.more + 1) : shown.books.length < shown.total
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      {list && <div style={{ fontSize: 14, color: T.sub, paddingBottom: 6 }}>{shown.total.toLocaleString('en-IN')} {shown.total === 1 ? 'book' : 'books'}</div>}
      {shown.books.map(b => <BookRow key={b.id} book={b} />)}
      {more && <div style={{ paddingTop: 12 }}><Button onClick={() => setShown(s => ({ ...s, more: s.more + 1 }))}>Show more</Button></div>}
    </div>
  )
}

// The books this customer is trying: played from Books, not added.
function useTrying() {
  const docs = useStore(library, s => s.docs)
  return useMemo(() => docs.filter(d => d.trial && d.src).sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0))
    .map(d => { const id = Number(d.src.split(':')[1]); return { book: known.get(id) || { id, t: d.title, a: d.author }, note: d.total ? `${Math.round(((d.pos || 0) / d.total) * 100)}% done` : 'Getting the book' } }), [docs])
}

function Home({ home, wide }) {
  const trying = useTrying()
  const [allCategories, setAllCategories] = useState(false)
  // how much of the page is built: kept outside it, so coming back from a book builds at once what was there
  const built = useStore(looking, s => s.built)
  const parts = home.shelves.length + 1 // the shelves, then the categories and languages
  useEffect(() => {
    if (built >= parts) return undefined
    const id = whenIdle(() => looking.set({ built: built + HOME_STEP }))
    return () => (typeof cancelIdleCallback === 'function' ? cancelIdleCallback(id) : clearTimeout(id))
  }, [built, parts])
  const byId = useMemo(() => new Map(home.books.map(b => [b.id, b])), [home])
  const shelfOf = ids => ids.map(id => byId.get(id)).filter(Boolean).map(book => ({ book }))
  const show = list => { looking.set({ list, homeY: window.scrollY }); pushPanel(PANEL); window.scrollTo(0, 0) }
  const pad = wide ? 0 : 20
  return (
    <div style={{ display: 'grid', gap: wide ? 44 : 36 }}>
      {trying.length > 0 && <Shelf title="Listening to" list={trying} wide={wide} />}
      {home.shelves.slice(0, built).map((s, i) => (
        <Shelf key={s.name} title={s.name} count={s.count} list={shelfOf(s.ids)} wide={wide}
          onAll={i ? () => show({ kind: 'category', code: home.categories.findIndex(c => c.name === s.name), name: s.name }) : null} />
      ))}
      {built >= parts && <>
      <section style={{ display: 'grid', gap: 10, padding: `0 ${pad}px` }}>
        <h2 style={{ margin: 0, fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em' }}>Every category</h2>
        <div style={{ display: 'grid', gridTemplateColumns: wide ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)', columnGap: 28 }}>
          {home.categories.slice(0, allCategories ? undefined : CATEGORIES_FIRST).map((c, code) => (
            <button key={c.name} type="button" data-press="" onClick={() => show({ kind: 'category', code, name: c.name })}
              style={{ '--press': T.tap.row, display: 'flex', alignItems: 'center', gap: 10, minHeight: 48, padding: 0, border: 'none', borderBottom: `1px solid ${T.border}`, background: 'transparent', color: T.text, fontFamily: T.font, fontSize: 15.5, textAlign: 'left', cursor: 'pointer' }}>
              <span style={{ flex: 1, minWidth: 0 }}>{c.name}</span>
              <span style={{ fontSize: 13.5, color: T.faint, fontVariantNumeric: 'tabular-nums' }}>{c.count.toLocaleString('en-IN')}</span>
              <Icon name="next1" size={15} style={{ color: T.faint }} />
            </button>
          ))}
        </div>
        {!allCategories && home.categories.length > CATEGORIES_FIRST && <div style={{ paddingTop: 6 }}><Button onClick={() => setAllCategories(true)}>Show all {home.categories.length}</Button></div>}
      </section>
      <section style={{ display: 'grid', gap: 14, padding: `0 ${pad}px` }}>
        <h2 style={{ margin: 0, fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em' }}>Languages</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {home.languages.map(l => (
            <button key={l.code} type="button" data-press="" onClick={() => show({ kind: 'language', code: l.code, name: languageName(l.code) })}
              style={{ '--press': T.tap.control, minHeight: 44, padding: '0 16px', borderRadius: T.r.pill, border: `1px solid ${T.borderHi}`, background: 'transparent', color: T.text, fontFamily: T.font, fontSize: 14.5, fontWeight: 600, cursor: 'pointer' }}>
              {languageName(l.code)} <span style={{ color: T.faint, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{l.count.toLocaleString('en-IN')}</span>
            </button>
          ))}
        </div>
      </section>
      <p style={{ margin: 0, padding: `0 ${pad}px`, fontSize: 13.5, lineHeight: 1.6, color: T.faint, maxWidth: 640 }}>
        From the catalogue of <a href="https://www.gutenberg.org" target="_blank" rel="noopener noreferrer" style={{ color: T.sub, textUnderlineOffset: 3 }}>{SOURCE}</a>, {home.built}. Only books whose authors, translators and illustrators all died more than {home.term} years ago are here, so every one is free to use in India and almost every country.
      </p>
      </>}
    </div>
  )
}

export function Books({ wide }) {
  const home = useStore(books, s => s.home)
  const error = useStore(books, s => s.error)
  const q = useStore(looking, s => s.q)
  const list = useStore(looking, s => s.list)
  useEffect(() => { loadHome().then(h => h && warm()) }, [])
  // Back closes the list or the search; arriving back from a book with one open gives it its entry again.
  useEffect(() => {
    const st = looking.get()
    if ((st.q || st.list) && history.state?.panel !== PANEL) pushPanel(PANEL)
    const onPop = () => { if (history.state?.panel !== PANEL && (looking.get().q || looking.get().list)) { const y = looking.get().homeY; looking.set({ q: '', list: null }); requestAnimationFrame(() => window.scrollTo(0, y)) } }
    addEventListener('popstate', onPop)
    return () => removeEventListener('popstate', onPop)
  }, [])
  // A search is a Back step while there is one: typing opens it, emptying the box closes it (it used to stay, and
  // the next Back did nothing).
  const type = v => {
    const searching = !!looking.get().q.trim()
    if (v.trim() && !searching && !looking.get().list) { looking.set({ homeY: window.scrollY }); pushPanel(PANEL) }
    looking.set({ q: v, list: null })
    if (!v.trim() && searching && history.state?.panel === PANEL) popPanel()
  }
  const pad = wide ? 0 : 20
  const listing = !!(q.trim() || list)
  const body = (
    <main style={{ flex: 1, minWidth: 0, padding: wide ? '28px 36px 48px' : '0 0 32px', display: 'grid', gap: wide ? 28 : 22, alignContent: 'start', maxWidth: wide ? 1180 : undefined }}>
      <header style={{ display: 'grid', gap: 6, padding: wide ? 0 : `${16}px ${pad}px 0` }}>
        {list ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: -10 }}>
            <IconButton icon="back" label="All books" onClick={popPanel} />
            <h1 style={{ margin: 0, minWidth: 0, fontSize: wide ? 34 : 28, lineHeight: 1.1, letterSpacing: '-0.035em', fontWeight: 800 }}>{list.name}</h1>
          </div>
        ) : (
          <>
            <h1 style={{ margin: 0, fontSize: wide ? 44 : 34, lineHeight: 1, letterSpacing: '-0.04em', fontWeight: 800 }}>Books</h1>
            <div style={{ fontSize: 15, color: T.sub }}>{home ? `${home.count.toLocaleString('en-IN')} free books, free to use in India and almost every country` : ' '}</div>
          </>
        )}
      </header>
      {!list && (
        <div style={{ position: 'relative', padding: `0 ${pad}px`, maxWidth: wide ? 520 : undefined }}>
          <Icon name="search" size={17} style={{ position: 'absolute', left: pad + 14, top: '50%', transform: 'translateY(-50%)', color: T.faint, pointerEvents: 'none' }} />
          <input value={q} onChange={e => type(e.target.value)} placeholder="Title or author" aria-label="Search free books" type="search" enterKeyHint="search"
            style={{ ...inputStyle, height: 46, paddingLeft: 40, fontSize: 16 }} />
        </div>
      )}
      <div style={{ padding: listing ? `0 ${pad}px` : 0 }}>
        {error && !home ? (
          <div style={{ display: 'grid', gap: 14, justifyItems: 'start', padding: `0 ${pad}px` }}>
            <p style={{ margin: 0, fontSize: 15, color: T.sub }}>{error}</p>
            <Button onClick={() => loadHome()}>Try again</Button>
          </div>
        ) : !home ? null : listing ? <BookList key={list ? `${list.kind}:${list.code}` : 'find'} q={q.trim()} list={list} /> : <Home home={home} wide={wide} />}
      </div>
    </main>
  )
  return wide ? <div style={{ display: 'flex', minHeight: '100%' }}><Sidebar />{body}</div> : body
}

// ── one book ─────────────────────────────────────────────────────────────────────────────────────────────────
export function BookPage({ wide }) {
  const id = Number(useRoute().docId)
  const [book, setBook] = useState(() => known.get(id) || null)
  const [about, setAbout] = useState(null)
  useEffect(() => {
    let live = true
    if (!book) ask({ ids: [id] }).then(r => live && setBook(r.books[0] || false)).catch(() => live && setBook(false))
    aboutOf(id).then(a => live && setAbout(a))
    return () => { live = false }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  const docs = useStore(library, s => s.docs)
  const d = docOfBook(docs, id)
  const term = useStore(books, s => s.home?.term) // the years after the last death that make a book free (tools/books.mjs)
  const top = (
    <div style={{ display: 'flex', alignItems: 'center', height: 56, padding: wide ? '0 24px' : '0 6px' }}>
      <IconButton icon="back" label="Back" onClick={goBack} />
    </div>
  )
  if (book === false) return <>{top}<p style={{ margin: 0, padding: '24px', color: T.sub }}>This book isn't in the free catalogue any more.</p></>
  if (!book) return top
  const actions = d && !d.trial
    ? [<Button key="o" kind="primary" icon="book" onClick={() => go('reader', d.id)}>Open</Button>]
    : [
        <Button key="l" kind="primary" icon="play" onClick={() => listen(book)}>{d ? 'Continue listening' : 'Listen'}</Button>,
        <Button key="a" icon="plus" onClick={() => addToLibrary(book)}>Add to library</Button>,
      ]
  const w = wide ? 220 : 168
  return (
    <div>
      {top}
      <article style={{ maxWidth: 980, margin: '0 auto', padding: wide ? '8px 48px 64px' : '4px 20px 48px', display: 'grid', gridTemplateColumns: wide ? `${w}px minmax(0, 1fr)` : 'minmax(0, 1fr)', columnGap: 48, rowGap: 24, alignItems: 'start', justifyItems: wide ? 'stretch' : 'center' }}>
        <BookCover book={book} w={w} />
        <div style={{ display: 'grid', gap: 18, textAlign: wide ? 'left' : 'center', justifyItems: wide ? 'start' : 'center', minWidth: 0, width: '100%' }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <h1 style={{ margin: 0, fontSize: wide ? 38 : 28, lineHeight: 1.1, letterSpacing: '-0.035em', fontWeight: 800, overflowWrap: 'anywhere', textWrap: 'balance' }}>{book.t}</h1>
            {book.s && <div style={{ fontSize: 17, lineHeight: 1.4, color: T.sub }}>{book.s}</div>}
            <div style={{ fontSize: 17, color: T.text }}>{book.a}{book.y && <span style={{ color: T.faint }}> · {book.y}</span>}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: wide ? 'row' : 'column', gap: 10, width: wide ? 'auto' : '100%', maxWidth: wide ? undefined : 360 }}>
            {actions.map(a => <div key={a.key} style={{ display: 'grid' }}>{a}</div>)}
          </div>
          {d && (
            <div style={{ fontSize: 14, lineHeight: 1.5, color: T.sub }}>
              {d.trial ? <>You're trying this book: it isn't in your library. <button type="button" onClick={() => { remove(d); toast(`${book.t} was removed.`) }} style={{ minHeight: 44, padding: 0, border: 'none', background: 'transparent', color: T.text, fontFamily: T.font, fontSize: 14, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer' }}>Remove it</button></> : 'In your library.'}
            </div>
          )}
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: 18, rowGap: 10, textAlign: 'left', fontSize: 15, maxWidth: 640, width: '100%' }}>
            {about?.s.length > 0 && <><dt style={label}>About</dt><dd style={{ margin: 0, color: T.text, lineHeight: 1.5 }}>{about.s.join(' · ')}</dd></>}
            {about?.c.length > 0 && <><dt style={label}>Shelves</dt><dd style={{ margin: 0, color: T.text, lineHeight: 1.5 }}>{about.c.join(' · ')}</dd></>}
            <dt style={label}>Language</dt><dd style={{ margin: 0, color: T.text }}>{languageName(book.l)}</dd>
            {term && <><dt style={label}>Free to use</dt><dd style={{ margin: 0, color: T.text }}>Everyone who made it died more than {term} years ago, so it's free in India and almost every country.</dd></>}
            <dt style={label}>From</dt><dd style={{ margin: 0 }}><a href={pageUrl(book.id)} target="_blank" rel="noopener noreferrer" style={{ color: T.text, textUnderlineOffset: 3 }}>{SOURCE}</a></dd>
          </dl>
        </div>
      </article>
    </div>
  )
}
