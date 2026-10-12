import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { later } from './ui/later.jsx'
import { motion, AnimatePresence, MotionConfig } from 'motion/react'
import { T } from './theme.js'
import { useStore, useWidth } from './lib/store.js'
import { ui } from './lib/nav.js'
import { settings } from './lib/settings.js'
import { reducedMotion, whenIdle } from './lib/motion.js'
import { Route } from './lib/route.js'
import { boot } from './lib/library.js'
import { startHistory } from './lib/history.js'
import { startExtras } from './lib/extras.js'
import { player, toggle, nextSentence, prevSentence } from './lib/player.js'
import { Library, useEmptyLibrary } from './ui/Library.jsx'
import { Reader } from './ui/Reader.jsx'
import { PlayerBar, playerHeight } from './ui/PlayerBar.jsx'
import { InstallPrompt } from './ui/InstallPrompt.jsx'
import { TabBar } from './ui/TabBar.jsx'
import { ActivityStrip, useActivity, ACTIVITY_H } from './ui/Activity.jsx'

// The sheets (Add a document, voices, languages and the rest) load just after the first screen, in their own file.
const Sheets = lazy(() => import('./ui/Sheets.jsx').then(m => ({ default: m.Sheets })))
const Settings = later(() => import('./ui/Settings.jsx').then(m => m.Settings))

// A page moves the way the customer is going. Going deeper, the new page arrives from the right and the old
// one leaves to the left; going back (the Back button, Android's back gesture) it is the mirror image, so
// the screen follows the thumb. Between tabs there is no direction: a short rise. `custom` carries the
// direction to the page that is leaving, which can no longer receive props (motion.dev, AnimatePresence).
const PAGE_TRAVEL = 18 // % of the screen's width a page travels as it arrives
const PAGE = {
  // Going in, the new page comes from the right; coming back, from the left; a tab change rises. Far enough
  // and long enough to be seen as a move (the first version was 28 px in a quarter of a second: a flicker).
  // The move is written as ONE `transform`, which the browser's compositor runs by itself: it stays smooth
  // while the new page is still being built. (Written as separate x and y it is animated by script, frame
  // by frame, on the thread that is busy building: measured, that is what stuttered on a phone.) At rest
  // the transform is taken off again, or the page would trap everything fixed inside it (sheets, "Back to now").
  enter: dir => (reducedMotion() ? { opacity: 0 } : { opacity: 0, transform: dir ? `translate(${dir * PAGE_TRAVEL}%, 0px)` : `translate(0%, ${T.enter.y}px)` }),
  show: { opacity: 1, transform: 'translate(0%, 0px)', pointerEvents: 'auto', transition: { duration: 0.44, ease: T.enter.ease }, transitionEnd: { transform: 'none' } },
  // A page that is leaving takes no more taps. A fast customer could press a button on it as it faded; the
  // page was then brought back with a sheet that history knew nothing about (found by the random customer).
  exit: dir => ({ opacity: 0, ...(dir && !reducedMotion() ? { transform: ['translate(0%, 0px)', `translate(${dir * -PAGE_TRAVEL / 2}%, 0px)`] } : {}), pointerEvents: 'none', transition: { duration: 0.14, ease: 'easeIn' } }),
}

export default function App() {
  const wide = useWidth() >= T.split
  const view = useStore(ui, s => s.view)
  const docId = useStore(ui, s => s.docId)
  const active = useStore(player, s => !!s.id)
  const toastMsg = useStore(ui, s => s.toast)
  const toastAction = useStore(ui, s => s.toastAction)
  const libraryScroll = useRef(0)
  const activity = useActivity()

  useEffect(() => { boot() }, [])
  useEffect(() => { startHistory(); startExtras() }, [])
  // Settings is fetched in a quiet moment after the app has started: the first tap on its tab then shows
  // Settings, not an empty screen while it loads (filmed by e2e/film.mjs: a third of a second of black).
  useEffect(() => { whenIdle(Settings.fetch) }, [])

  useEffect(() => {
    const onKey = e => {
      if (e.target.closest?.('input, textarea, select, [role=dialog]') || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.code === 'Space' && player.get().id) { e.preventDefault(); toggle() }
      else if (e.key === 'ArrowRight' && player.get().id) nextSentence()
      else if (e.key === 'ArrowLeft' && player.get().id) prevSentence()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Keep the library scroll position across visits to the reader. It is recorded while the library is the
  // live page, and put back when the library page arrives again (PageScroll, below), not while the old page
  // is still fading out.
  useEffect(() => {
    const onScroll = () => { if (ui.get().view === 'library') libraryScroll.current = window.scrollY }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  const route = useMemo(() => ({ view, docId }), [view, docId])
  // Which way the customer is travelling: deeper (1), back (-1), or sideways between tabs (0). Read from
  // the depth the navigation code keeps in each history entry.
  const trip = useRef({ key: view + (docId || ''), depth: history.state?.depth || 0, dir: 0 })
  if (trip.current.key !== view + (docId || '')) {
    const depth = history.state?.depth || 0
    trip.current = { key: view + (docId || ''), depth, dir: Math.sign(depth - trip.current.depth) }
  }
  const dir = trip.current.dir

  const full = view === 'reader'
  const landing = useEmptyLibrary() && view === 'library' // nothing to list yet: the landing page, with no bars of the app around it
  const dock = landing ? 0 : playerHeight(wide, full, active) // fixed bars at the bottom; the activity strip, toasts and banners stack above
  const lift = activity ? ACTIVITY_H : 0
  return (
    <MotionConfig reducedMotion="never" transition={{ duration: T.dur.fast, ease: T.ease }}>
    <div style={{ fontFamily: T.font, color: T.text, background: T.bg, minHeight: '100dvh', WebkitFontSmoothing: 'antialiased' }}>
      {/* A page slides a little as it arrives or leaves. `clip` keeps that from widening the screen (on a
          phone a wider page makes the whole view rescale and every fixed bar jump); unlike `hidden` it does
          not create a scroll box, so sticky headers keep working. */}
      <div style={{ paddingBottom: `calc(${dock + lift}px + var(--prompt, 0px))`, overflowX: 'clip', '--dock': `${dock + lift}px` }}>
        {/* The old page fades out quickly (ease-in), then the new one rises in (ease-out): one page at a time.
            The leaving page keeps its own route through context, so it never flashes the next page's content. */}
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div key={view + (docId || '')} data-screen="" custom={dir} variants={PAGE} initial="enter" animate="show" exit="exit">
            <Route.Provider value={route}>
              {/* First, so the page is at its scroll position before anything on it measures where it is. */}
              <PageScroll view={view} top={libraryScroll} />
              {view === 'library' && <Library wide={wide} />}
              {view === 'reader' && <Reader wide={wide} />}
              {view === 'settings' && <Suspense fallback={null}><Settings wide={wide} /></Suspense>}
            </Route.Provider>
          </motion.div>
        </AnimatePresence>
      </div>
      <PlayerBar wide={wide} full={full} />
      {!wide && !full && !landing && <TabBar />}
      <Suspense fallback={null}><Sheets wide={wide} /></Suspense>
      <ActivityStrip activity={activity} bottom={dock} />
      <InstallPrompt wide={wide} full={full} lift={lift} />
      <AnimatePresence mode="wait">
        {toastMsg && (
          <motion.div key={toastMsg} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12, transition: { duration: 0.12, ease: 'easeIn' } }} transition={T.spring} role="status"
            style={{
              position: 'fixed', left: '50%', bottom: dock + lift + 16, x: '-50%', zIndex: 60, padding: toastAction ? '8px 8px 8px 18px' : '12px 18px',
              borderRadius: T.r.lg, background: T.text, color: T.bg, fontSize: 14, fontWeight: 600, width: 'max-content', maxWidth: 'calc(100vw - 32px)', boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
              display: 'flex', alignItems: 'center', gap: 12, boxSizing: 'border-box',
            }}>
            {/* A message is never cut off mid-sentence: it may run to two lines. */}
            <span style={{ minWidth: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.4 }}>{toastMsg}</span>
            {toastAction && (
              <button type="button" onClick={() => { toastAction.run(); ui.set({ toast: null, toastAction: null }) }}
                style={{ height: 32, padding: '0 14px', borderRadius: T.r.pill, border: 'none', background: T.bg, color: T.text, fontFamily: T.font, fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                {toastAction.label}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </MotionConfig>
  )
}

// Runs when a page arrives (after the old one has left): the library returns to where it was, anything
// else starts at its top. It sits after the page's content so the content is laid out when it runs.
function PageScroll({ view, top }) {
  useLayoutEffect(() => { window.scrollTo(0, view === 'library' ? top.current : 0) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}
