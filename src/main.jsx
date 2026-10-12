import '@fontsource-variable/dm-sans'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource-variable/literata'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { ui, openSheet, toast } from './lib/nav.js'
import './lib/ready.js'

// Install prompt: we show our own button instead of the browser's mini-infobar.
addEventListener('beforeinstallprompt', e => { e.preventDefault(); ui.set({ installEvt: e }) })
addEventListener('appinstalled', () => ui.set({ installed: true, installEvt: null }))

// Android "Share → Noesis" (manifest share_target, GET).
const q = new URLSearchParams(location.search)
if (q.has('url') || q.has('text')) {
  const text = q.get('text') || ''
  const url = q.get('url') || text.match(/https?:\/\/\S+/)?.[0]
  history.replaceState({ view: 'library' }, '', '/')
  openSheet('add', { prefill: url ? { tab: 'link', url } : { tab: 'text', text, title: q.get('title') || '' } })
}

// Back from Google sign-in: /#signed-in or /#signin-failed=<reason> (set by /api/auth/callback).
const FAILED = {
  cancelled: 'Sign-in was cancelled.', access_denied: 'Sign-in was cancelled.',
  expired: 'Sign-in took too long. Please try again.', invalid_grant: 'That sign-in had expired or was already used. Please try again.',
  // not the customer's doing, and trying again will not help: say so
  invalid_client: 'Sign-in is set up wrongly on our side: Google refused the server, not your account.',
  redirect_uri_mismatch: 'Sign-in is set up wrongly on our side: Google does not know this address.',
  no_drive: 'Not signed in: Noesis needs the permission to keep your library in your own Google Drive. Sign in again and leave it ticked.',
  no_renewal: 'Google did not finish the sign-in. Please try again.',
}
if (location.hash === '#signed-in' || location.hash.startsWith('#signin-failed')) {
  const failed = location.hash.startsWith('#signin-failed') && decodeURIComponent(location.hash.split('=')[1] || '')
  history.replaceState({ view: 'library' }, '', location.pathname + location.search)
  setTimeout(() => toast(failed ? FAILED[failed] || 'Sign-in failed. Please try again.' : 'Signed in. Your library is now kept in your Google Drive.'), 600)
}

// Desktop "Open with → Noesis" (manifest file_handlers).
if ('launchQueue' in window) {
  window.launchQueue.setConsumer(async params => {
    if (!params.files?.length) return
    openSheet('add', { prefill: { tab: 'file', file: await params.files[0].getFile() } })
  })
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)

// Live updates: new versions install in the background and switch over at a safe moment.
import('./lib/updates.js').then(m => m.startUpdates())
