import '@fontsource-variable/dm-sans'
import '@fontsource-variable/jetbrains-mono'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { ui, openSheet } from './lib/nav.js'

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

// Desktop "Open with → Noesis" (manifest file_handlers).
if ('launchQueue' in window) {
  window.launchQueue.setConsumer(async params => {
    if (!params.files?.length) return
    openSheet('add', { prefill: { tab: 'file', file: await params.files[0].getFile() } })
  })
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)
