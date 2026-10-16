import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { T } from '../theme.js'
import { useStore } from '../lib/store.js'
import { ui, toast } from '../lib/nav.js'
import { player } from '../lib/player.js'
import { Logo } from './icons.jsx'
import { Button, IconButton } from './kit.jsx'
import { playerHeight } from './PlayerBar.jsx'

// "Get the app" banner, like ACS: shown to browser visitors, never inside the installed app.
// Chromium (Android, desktop Chrome/Edge): opens the browser's real install dialog.
// iOS Safari has no install API: explain Share → Add to Home Screen instead.
const DISMISS_KEY = 'noesis.install.dismissed'
const SNOOZE = 14 * 24 * 3600 * 1000
const DELAY = 4000

const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
const iosSafari = () => {
  const ua = navigator.userAgent
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
}
const snoozed = () => { try { return Date.now() - +localStorage.getItem(DISMISS_KEY) < SNOOZE } catch { return false } }

const CARD_SPACE = 104 // px of the page's bottom the card covers, with its margin
export function InstallPrompt({ wide, full, lift = 0 }) {
  const evt = useStore(ui, s => s.installEvt)
  const installed = useStore(ui, s => s.installed)
  const sheet = useStore(ui, s => s.sheet)
  const active = useStore(player, s => !!s.id)
  const [ready, setReady] = useState(false)
  const [hidden, setHidden] = useState(() => standalone() || snoozed())

  useEffect(() => { const t = setTimeout(() => setReady(true), DELAY); return () => clearTimeout(t) }, [])
  useEffect(() => {
    // The browser says it has STARTED adding the app: on some phones it then cannot (a browser on a Xiaomi phone
    // without permission to add home-screen icons says "Installing…" and nothing appears), and "Noesis is
    // installed" was shown over its "Installing Noesis…" for an app that never came (Tharun, Edge, 16 October 2026).
    const on = () => { setHidden(true); toast("Adding Noesis to your apps. If it doesn't appear, see Settings → About.") }
    addEventListener('appinstalled', on)
    return () => removeEventListener('appinstalled', on)
  }, [])

  const ios = iosSafari()
  const show = ready && !hidden && !installed && !sheet && (evt || ios)
  // The card sits over the bottom of the page. While it shows, the page is that much longer (App reads
  // --prompt), so the last row of the library can be scrolled clear of it instead of living under it.
  useEffect(() => {
    document.documentElement.style.setProperty('--prompt', show ? `${CARD_SPACE}px` : '0px')
    return () => document.documentElement.style.setProperty('--prompt', '0px')
  }, [show])
  const dismiss = () => { try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch { /* private mode */ } setHidden(true) }
  const install = async () => {
    evt.prompt()
    const { outcome } = await evt.userChoice
    ui.set({ installEvt: null })
    if (outcome !== 'accepted') dismiss()
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div key="install" role="dialog" aria-label="Install Noesis"
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={T.spring}
          style={{
            position: 'fixed', zIndex: 45, left: 12, right: 12, margin: '0 auto', maxWidth: 440,
            bottom: `calc(${playerHeight(wide, full, active) + lift + 14}px + env(safe-area-inset-bottom))`,
            display: 'flex', alignItems: 'center', gap: 14, padding: '14px 12px 14px 14px', borderRadius: T.r.lg,
            background: T.bg, border: `1px solid ${T.borderHi}`, boxShadow: '0 18px 50px rgba(0,0,0,0.85)',
          }}>
          <Logo size={44} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>Get the Noesis app</div>
            <div style={{ fontSize: 12.5, color: T.sub, marginTop: 3, lineHeight: 1.45 }}>
              {ios
                ? <>Tap <ShareGlyph /> then <b style={{ color: T.text }}>Add to Home Screen</b>.</>
                : 'No app store. Works offline and updates itself.'}
            </div>
          </div>
          {!ios && <Button kind="primary" onClick={install} style={{ height: 36, padding: '0 16px' }}>Install</Button>}
          <IconButton icon="close" label="Not now" onClick={dismiss} size={34} iconSize={16} style={{ color: T.faint }} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function ShareGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Share" style={{ verticalAlign: '-2px' }}>
      <path d="M12 3v12M8 7l4-4 4 4M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" />
    </svg>
  )
}
