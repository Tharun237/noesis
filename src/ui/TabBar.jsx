import { motion } from 'motion/react'
import { T } from '../theme.js'
import { useStore } from '../lib/store.js'
import { ui, tab, openSheet } from '../lib/nav.js'
import { Icon } from './icons.jsx'

// Phone tab bar in the ACS style: icon over label, white for the active tab with a short
// indicator bar on top. The mini player docks above it (PlayerBar), like Apple Music.
const TABS = [
  { id: 'library', icon: 'list', label: 'Library', run: () => { tab('library'); ui.set({ searching: false, query: '' }) } },
  { id: 'search', icon: 'search', label: 'Search', run: () => { tab('library'); ui.set({ searching: true }) } },
  { id: 'add', icon: 'plus', label: 'Add', run: () => openSheet('add') },
  { id: 'settings', icon: 'settings', label: 'Settings', run: () => tab('settings') },
]

export function TabBar() {
  const view = useStore(ui, s => s.view)
  const searching = useStore(ui, s => s.searching)
  const sheet = useStore(ui, s => s.sheet)
  const current = sheet === 'add' ? 'add' : view === 'settings' ? 'settings' : searching ? 'search' : 'library'
  return (
    <nav aria-label="Main" style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 32, display: 'flex', background: T.bg, borderTop: `1px solid ${T.border}`,
      height: `calc(${T.tabH}px + env(safe-area-inset-bottom))`, paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {TABS.map(t => {
        const on = t.id === current
        return (
          <button key={t.id} type="button" onClick={t.run} aria-current={on ? 'page' : undefined}
            style={{
              flex: 1, position: 'relative', border: 'none', background: 'transparent', color: on ? T.accent : T.sub, cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, fontFamily: T.font, fontSize: 11.5, fontWeight: 600,
              WebkitTapHighlightColor: 'transparent',
            }}>
            {on && <motion.span layoutId="tab-indicator" transition={T.spring} style={{ position: 'absolute', top: -1, width: 28, height: 3, borderRadius: 3, background: T.accent }} />}
            <motion.span whileTap={{ scale: 0.86 }} transition={T.spring} style={{ display: 'grid' }}><Icon name={t.icon} size={22} /></motion.span>
            {t.label}
          </button>
        )
      })}
    </nav>
  )
}
