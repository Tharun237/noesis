import { T } from '../theme.js'
import { useStore } from '../lib/store.js'
import { ui, tab, openSearch, closeSearch } from '../lib/nav.js'
import { Icon } from './icons.jsx'

// Phone tab bar in the ACS style: icon over label, white for the active tab with a short
// indicator bar on top. The mini player docks above it (PlayerBar), like Apple Music.
const TABS = [
  { id: 'library', icon: 'list', label: 'Library', run: () => { if (ui.get().searching) closeSearch(); else tab('library') } },
  { id: 'search', icon: 'search', label: 'Search', run: () => { tab('library'); openSearch() } },
  { id: 'settings', icon: 'settings', label: 'Settings', run: () => tab('settings') },
]

export function TabBar() {
  const view = useStore(ui, s => s.view)
  const searching = useStore(ui, s => s.searching)
  const current = view === 'settings' ? 'settings' : searching ? 'search' : 'library'
  return (
    <nav aria-label="Main" style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 32, display: 'flex', background: T.bg, borderTop: `1px solid ${T.border}`,
      height: `calc(${T.tabH}px + env(safe-area-inset-bottom))`, paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {/* One bar that slides to the tab that was chosen (press.js, data-slide): its track is a tab wide. */}
      <span aria-hidden data-slide="" style={{ position: 'absolute', top: -1, left: 0, width: `${100 / TABS.length}%`, display: 'flex', justifyContent: 'center', pointerEvents: 'none', transform: `translateX(${TABS.findIndex(t => t.id === current) * 100}%)` }}>
        <span style={{ width: 28, height: 3, borderRadius: 3, background: T.accent }} />
      </span>
      {TABS.map(t => {
        const on = t.id === current
        return (
          <button key={t.id} type="button" onClick={t.run} aria-current={on ? 'page' : undefined} data-press="" data-slide-ink=""
            style={{
              '--press': 1, // the tab itself stays put; its icon makes the movement (press.js)
              flex: 1, position: 'relative', border: 'none', background: 'transparent', color: on ? T.accent : T.sub, cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, fontFamily: T.font, fontSize: 11.5, fontWeight: 600,
              WebkitTapHighlightColor: 'transparent',
            }}>
            <Icon name={t.icon} size={22} />
            {t.label}
          </button>
        )
      })}
    </nav>
  )
}
