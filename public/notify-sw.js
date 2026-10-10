// Imported into the Workbox service worker (vite.config.js → workbox.importScripts).
// Tapping a "Ready to listen" notification focuses Noesis and opens that document.
self.addEventListener('notificationclick', e => {
  e.notification.close()
  const id = e.notification.data?.id
  if (!id) return
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const win = list[0]
    if (!win) return self.clients.openWindow(`/#open=${encodeURIComponent(id)}`)
    win.postMessage({ open: id })
    return win.focus()
  }))
})
