// Live updates without app stores. Every deploy is a new service worker; this decides WHEN to switch.
// Rule: never interrupt listening or document processing. Switch at a safe moment:
//   · right after launch, before the user has done anything, or
//   · when the app goes to the background with nothing playing or being prepared.
// Checks for new versions on launch, every 30 minutes, and whenever the app comes back to the foreground.
import { registerSW } from 'virtual:pwa-register'
import { player } from './player.js'
import { library } from './library.js'
import { ui, toast } from './nav.js'
import { shouldSwitch } from './update-policy.js'

const CHECK_EVERY = 30 * 60 * 1000
const FLAG = 'noesis.updated'
const startedAt = Date.now()
let interacted = false
let apply = null

addEventListener('pointerdown', () => { interacted = true }, { once: true, capture: true })
addEventListener('keydown', () => { interacted = true }, { once: true, capture: true })

function maybeApply() {
  if (!apply) return
  const ok = shouldSwitch({
    playing: player.get().playing,
    preparing: library.get().docs.some(d => ['reading', 'narrating', 'syncing'].includes(d.status)),
    sheetOpen: !!ui.get().sheet,
    interacted,
    sinceLaunch: Date.now() - startedAt,
    hidden: document.visibilityState === 'hidden',
  })
  if (ok) {
    sessionStorage.setItem(FLAG, '1')
    apply(true) // activate the waiting service worker, then reload into the new version
  }
}

export function startUpdates() {
  if (sessionStorage.getItem(FLAG)) {
    sessionStorage.removeItem(FLAG)
    setTimeout(() => toast(`Noesis updated to ${__APP_VERSION__}`), 900)
  }
  apply = null
  const update = registerSW({
    immediate: true,
    onNeedRefresh() {
      apply = update
      ui.set({ updateReady: true })
      maybeApply()
    },
    onRegisteredSW(_url, reg) {
      if (!reg) return
      // Check on every launch explicitly: the browser's own on-navigation check is not guaranteed to run.
      reg.update().catch(() => {})
      setInterval(() => reg.update().catch(() => {}), CHECK_EVERY)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {})
      })
    },
  })
  document.addEventListener('visibilitychange', maybeApply)
  player.sub(maybeApply)
}

// For an explicit "Update now" in Settings.
export const applyUpdateNow = () => { if (apply) { sessionStorage.setItem(FLAG, '1'); apply(true) } }
