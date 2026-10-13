// Live updates without app stores. Every deploy is a new service worker; this decides WHEN to switch.
// Rule: never interrupt listening or document processing. Switch at a safe moment:
//   · right after launch, before the user has done anything, or
//   · when the app goes to the background with nothing playing or being prepared.
// Checks for new versions on launch, every 30 minutes, and whenever the app comes back to the foreground.
//
// That is the automatic way, and it is the way that should always work. Tharun, 13 October 2026: "sometimes
// the app is not updating itself ... the automating thing should always exist and should be working super
// good, but in case things don't go as planned there should be a manual update option as well." So:
//   · the app knows what the newest build IS without asking its own service worker (/version.json, written by
//     the build, never cached): "is there something newer" no longer depends on the thing that may be stuck;
//   · a version that is ready but waiting for a safe moment says so (a line the customer can act on), where
//     it used to wait unseen: the phone looked "not updated" and nothing told its owner why or what to do;
//   · Settings, About has "Check for updates" (updateNow below): it takes the waiting version, or fetches it,
//     and if the service worker cannot deliver it, puts the service worker aside and loads the new build
//     straight from the network;
//   · a launch that finds the SAME newer build its last launch failed to get does that by itself.
import { registerSW } from 'virtual:pwa-register'
import { player } from './player.js'
import { library } from './library.js'
import { ui, toast } from './nav.js'
import { createStore } from './store.js'
import { shouldSwitch, newerBuild } from './update-policy.js'

const CHECK_EVERY = 30 * 60 * 1000
const FLAG = 'noesis.updated'
const STUCK = 'noesis.update.stuck' // the newer build a launch saw and did not get
const ANSWER_MS = 8000 // how long the question "what is the newest build" may go unanswered
const ARRIVE_MS = 30_000 // how long a version asked for by hand is waited for before the direct way is taken
const ALREADY_MS = 4000 // at launch: a version that was already waiting says so within this
const startedAt = Date.now()
let interacted = false
let apply = null

// status: idle | checking | getting | ready | current | unreachable. latest: the newest build's stamp, once known.
export const updateState = createStore({ status: 'idle', latest: null })

addEventListener('pointerdown', () => { interacted = true }, { once: true, capture: true })
addEventListener('keydown', () => { interacted = true }, { once: true, capture: true })

const safeNow = () => shouldSwitch({
  playing: player.get().playing,
  // 'syncing' (a document coming from another device) is not counted: it picks up again when the app opens,
  // and one that waits for hours on the other device would keep this one on an old version all that time.
  preparing: library.get().docs.some(d => ['reading', 'narrating'].includes(d.status)),
  sheetOpen: !!ui.get().sheet,
  interacted,
  sinceLaunch: Date.now() - startedAt,
  hidden: document.visibilityState === 'hidden',
})

function maybeApply() {
  if (!apply || !safeNow()) return false
  sessionStorage.setItem(FLAG, '1')
  apply(true) // activate the waiting service worker, then reload into the new version
  return true
}

// The newest build there is, from the server and not from any cache: null when it cannot be asked.
export async function latestBuild() {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(ANSWER_MS) })
    if (!res.ok) return null
    const { build } = await res.json()
    return typeof build === 'string' ? build : null
  } catch { return null }
}

// The service worker could not deliver the new build: it is put aside and the build is loaded straight from
// the network. Only once the new page has been fetched (a device that has just lost its connection must not be
// left with no app at all). The library, the audio and the voices are kept elsewhere and are not touched.
async function loadDirectly() {
  const page = await fetch(`/?t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(ANSWER_MS) }).catch(() => null)
  if (!page?.ok) return false
  for (const reg of await navigator.serviceWorker?.getRegistrations().catch(() => []) || []) await reg.unregister().catch(() => {})
  for (const name of await caches.keys().catch(() => [])) if (name.includes('precache')) await caches.delete(name).catch(() => {})
  sessionStorage.setItem(FLAG, '1')
  location.reload()
  return true
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
      updateState.set({ status: 'ready' })
      // Not a safe moment (the customer is in the middle of something): it waits, and says that it is there.
      if (!maybeApply() && document.visibilityState === 'visible') toast('A new version of Noesis is ready', { label: 'Update now', run: applyUpdateNow })
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
  void atLaunch()
}

// What the newest build is, asked once at launch. If it is the one the LAST launch already saw and did not
// get, the service worker has had its chance: at a safe moment the build is loaded directly.
async function atLaunch() {
  const latest = await latestBuild()
  if (!latest) return
  updateState.set({ latest })
  const stuck = (() => { try { return localStorage.getItem(STUCK) } catch { return null } })()
  if (!newerBuild(latest, __APP_BUILD__)) { try { localStorage.removeItem(STUCK) } catch { /* no storage */ } return }
  try { localStorage.setItem(STUCK, latest) } catch { /* no storage */ }
  if (stuck !== latest) return // the first launch to see it: the ordinary way is under way
  await new Promise(r => setTimeout(r, ALREADY_MS))
  if (!apply && safeNow()) await loadDirectly()
}

// "Update now", wherever it is offered: the version that is waiting is taken at once.
export const applyUpdateNow = () => { if (apply) { sessionStorage.setItem(FLAG, '1'); apply(true) } }

// "Check for updates" in Settings: the customer asked, so it does not wait for a safe moment. It ends in the
// new version (the page loads again) or in a status that says why not.
export async function updateNow() {
  if (apply) return applyUpdateNow()
  updateState.set({ status: 'checking' })
  const latest = await latestBuild()
  if (!latest) return updateState.set({ status: 'unreachable' })
  if (!newerBuild(latest, __APP_BUILD__)) return updateState.set({ status: 'current', latest })
  updateState.set({ status: 'getting', latest })
  const reg = await navigator.serviceWorker?.getRegistration().catch(() => null)
  const asked = reg ? await reg.update().then(() => true, () => false) : false
  // the service worker is fetching it: taken as soon as it has arrived
  for (const until = Date.now() + ARRIVE_MS; asked && !apply && Date.now() < until;) await new Promise(r => setTimeout(r, 300))
  if (apply) return applyUpdateNow()
  if (!(await loadDirectly())) updateState.set({ status: 'unreachable', latest })
}
