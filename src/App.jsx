import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { T } from './theme.js'
import { useStore, useWidth } from './lib/store.js'
import { ui } from './lib/nav.js'
import { boot } from './lib/library.js'
import { player, toggle, nextSentence, prevSentence } from './lib/player.js'
import { Library } from './ui/Library.jsx'
import { Reader } from './ui/Reader.jsx'
import { Settings } from './ui/Settings.jsx'
import { PlayerBar, playerHeight } from './ui/PlayerBar.jsx'
import { Sheets } from './ui/Sheets.jsx'

export default function App() {
  const wide = useWidth() >= T.split
  const view = useStore(ui, s => s.view)
  const docId = useStore(ui, s => s.docId)
  const active = useStore(player, s => !!s.id)
  const toastMsg = useStore(ui, s => s.toast)
  const libraryScroll = useRef(0)

  useEffect(() => { boot() }, [])

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

  // Keep the library scroll position across visits to the reader.
  useEffect(() => {
    if (view === 'library') requestAnimationFrame(() => window.scrollTo(0, libraryScroll.current))
    else window.scrollTo(0, 0)
    const onScroll = () => { if (ui.get().view === 'library') libraryScroll.current = window.scrollY }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [view, docId])

  const full = view === 'reader'
  return (
    <div style={{ fontFamily: T.font, color: T.text, background: T.bg, minHeight: '100dvh', WebkitFontSmoothing: 'antialiased' }}>
      <div style={{ paddingBottom: playerHeight(wide, full, active) }}>
        {/* Enter-only page transition: an exit phase (AnimatePresence mode="wait") can strand the old page mid-exit. */}
        <motion.div key={view + (docId || '')} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: T.dur.base, ease: T.ease }}>
          {view === 'library' && <Library wide={wide} />}
          {view === 'reader' && <Reader wide={wide} />}
          {view === 'settings' && <Settings wide={wide} />}
        </motion.div>
      </div>
      <PlayerBar wide={wide} full={full} />
      <Sheets wide={wide} />
      <AnimatePresence>
        {toastMsg && (
          <motion.div key={toastMsg} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={T.spring} role="status"
            style={{
              position: 'fixed', left: '50%', bottom: playerHeight(wide, full, active) + 16, x: '-50%', zIndex: 60, padding: '12px 18px',
              borderRadius: T.r.pill, background: T.text, color: T.bg, fontSize: 14, fontWeight: 600, maxWidth: 'calc(100vw - 32px)', boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
            }}>{toastMsg}</motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
