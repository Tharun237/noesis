import '@fontsource-variable/dm-sans'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource-variable/literata'
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { useStore } from './lib/store.js'
import { account } from './lib/sync.js'
import { T } from './theme.js'
import { Pulse } from './ui/kit.jsx'
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
const ARRIVING = 'noesis.arriving'
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
  if (failed) setTimeout(() => toast(FAILED[failed] || 'Sign-in failed. Please try again.'), 600)
  else sessionStorage.setItem(ARRIVING, '1')
}

// Just back from Google: the account's own library may be on another shelf of this device (lib/shelf.js), in
// which case the page starts once more on it. Until that is known, say what is happening instead of showing
// a library (or the welcome page) that is about to be replaced.
const arriving = () => sessionStorage.getItem(ARRIVING) === '1'
const greet = () => {
  if (!arriving() || !account.get().checked) return
  sessionStorage.removeItem(ARRIVING)
  if (account.get().user) toast('Signed in. Your library is kept in your Google Drive.')
}
account.sub(greet)
setTimeout(() => sessionStorage.removeItem(ARRIVING), 8000) // never hold the app back for long if the server does not answer
function Start() {
  const checked = useStore(account, a => a.checked)
  const [waited, setWaited] = useState(false)
  useEffect(() => { const t = setTimeout(() => setWaited(true), 8000); return () => clearTimeout(t) }, [])
  if (arriving() && !checked && !waited) {
    return <div role="status" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: T.bg, color: T.sub, fontFamily: T.font, fontSize: 15 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><Pulse />Opening your library</span></div>
  }
  return <App />
}

// Desktop "Open with → Noesis" (manifest file_handlers).
if ('launchQueue' in window) {
  window.launchQueue.setConsumer(async params => {
    if (!params.files?.length) return
    openSheet('add', { prefill: { tab: 'file', file: await params.files[0].getFile() } })
  })
}

createRoot(document.getElementById('root')).render(<StrictMode><Start /></StrictMode>)

// Live updates: new versions install in the background and switch over at a safe moment.
import('./lib/updates.js').then(m => m.startUpdates())
