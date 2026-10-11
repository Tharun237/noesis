import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence, MotionConfig } from 'motion/react'
import { T } from './theme.js'
import { useStore, useWidth } from './lib/store.js'
import { ui } from './lib/nav.js'
import { Route } from './lib/route.js'
import { boot } from './lib/library.js'
import { startHistory } from './lib/history.js'
import { player, toggle, nextSentence, prevSentence } from './lib/player.js'
import { Library } from './ui/Library.jsx'
import { Reader } from './ui/Reader.jsx'
import { PlayerBar, playerHeight } from './ui/PlayerBar.jsx'
import { Sheets } from './ui/Sheets.jsx'
import { InstallPrompt } from './ui/InstallPrompt.jsx'
import { TabBar } from './ui/TabBar.jsx'
import { ActivityStrip, useActivity, ACTIVITY_H } from './ui/Activity.jsx'

const Settings = lazy(() => import('./ui/Settings.jsx').then(m => ({ default: m.Settings })))

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
  useEffect(() => { startHistory() }, [])

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

  const full = view === 'reader'
  const dock = playerHeight(wide, full, active) // fixed bars at the bottom; the activity strip, toasts and banners stack above
  const lift = activity ? ACTIVITY_H : 0
  return (
    <MotionConfig reducedMotion="user">
    <div style={{ fontFamily: T.font, color: T.text, background: T.bg, minHeight: '100dvh', WebkitFontSmoothing: 'antialiased' }}>
      <div style={{ paddingBottom: dock + lift }}>
        {/* The old page fades out quickly (ease-in), then the new one rises in (ease-out): one page at a time.
            The leaving page keeps its own route through context, so it never flashes the next page's content. */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={view + (docId || '')} initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.22, ease: T.ease } }}
            exit={{ opacity: 0, transition: { duration: 0.11, ease: 'easeIn' } }}>
            <Route.Provider value={route}>
              {view === 'library' && <Library wide={wide} />}
              {view === 'reader' && <Reader wide={wide} />}
              {view === 'settings' && <Suspense fallback={null}><Settings wide={wide} /></Suspense>}
              <PageScroll view={view} top={libraryScroll} />
            </Route.Provider>
          </motion.div>
        </AnimatePresence>
      </div>
      <PlayerBar wide={wide} full={full} />
      {!wide && !full && <TabBar />}
      <Sheets wide={wide} />
      <ActivityStrip activity={activity} bottom={dock} />
      <InstallPrompt wide={wide} full={full} lift={lift} />
      <AnimatePresence mode="wait">
        {toastMsg && (
          <motion.div key={toastMsg} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12, transition: { duration: 0.12, ease: 'easeIn' } }} transition={T.spring} role="status"
            style={{
              position: 'fixed', left: '50%', bottom: dock + lift + 16, x: '-50%', zIndex: 60, padding: toastAction ? '8px 8px 8px 18px' : '12px 18px',
              borderRadius: T.r.pill, background: T.text, color: T.bg, fontSize: 14, fontWeight: 600, width: 'max-content', maxWidth: 'calc(100vw - 32px)', boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
              display: 'flex', alignItems: 'center', gap: 12, boxSizing: 'border-box',
            }}>
            {/* Long messages truncate; with an action the text wraps to two lines so the wait stays visible. */}
            {toastAction
              ? <span style={{ minWidth: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.4 }}>{toastMsg}</span>
              : <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{toastMsg}</span>}
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
