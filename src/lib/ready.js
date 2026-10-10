// "Your document is ready": a toast with Play, plus a system notification when the app is in the
// background (like Paper2Audio's "Notify me"). Ready = it can play to the end without stalling:
//   built-in voice → the text is prepared;  natural voice → the readiness gate opens from the listening position.
import { library, loadDoc, readiness, onSegment } from './library.js'
import { activeEngine } from './engine.js'
import { ui, go, toast } from './nav.js'

const PREP = new Set(['queued', 'reading', 'narrating', 'syncing'])
const waiting = new Set() // docs seen not-ready in this session; only these get announced (not every doc at boot)

export const canNotify = () => typeof Notification !== 'undefined' && 'serviceWorker' in navigator
export const notifyAsked = () => !canNotify() || Notification.permission !== 'default'
export const askNotify = () => canNotify() && Notification.requestPermission()

async function announce(d) {
  waiting.delete(d.id)
  if (document.visibilityState === 'hidden') {
    if (!canNotify() || Notification.permission !== 'granted') return
    const reg = await navigator.serviceWorker.ready
    return reg.showNotification('Ready to listen', { body: d.title, tag: `ready-${d.id}`, icon: '/pwa-192x192.png', data: { id: d.id } })
  }
  const { view, docId } = ui.get()
  if (view === 'reader' && docId === d.id) return // the reader already shows it and starts by itself
  toast(`Ready to listen: ${d.title}`, { label: 'Open', run: () => go('reader', d.id) })
}

async function check(d) {
  if (!waiting.has(d.id) || PREP.has(d.status) || d.status === 'error') return
  if (activeEngine() === 'system' || d.status === 'ready') return announce(d)
  const c = await loadDoc(d.id)
  if (readiness(d, c, d.pos || 0).ready && waiting.has(d.id)) announce(d)
}

library.sub(() => {
  for (const d of library.get().docs) {
    if (PREP.has(d.status) || (d.status === 'voicing' && activeEngine() === 'natural' && !waiting.has(d.id) && d.done === 0)) waiting.add(d.id)
    else if (waiting.has(d.id) && (activeEngine() === 'system' || d.status !== 'voicing')) check(d)
  }
})
onSegment(id => { const d = library.get().docs.find(x => x.id === id); if (d) check(d) })

// Tapping the notification (handled in public/notify-sw.js) opens the document.
navigator.serviceWorker?.addEventListener('message', e => { if (e.data?.open) go('reader', e.data.open) })
if (location.hash.startsWith('#open=')) {
  const id = decodeURIComponent(location.hash.slice(6))
  history.replaceState(history.state, '', location.pathname + location.search)
  setTimeout(() => go('reader', id), 0)
}
