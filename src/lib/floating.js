// M18 floating reader: a Document Picture-in-Picture window that holds the reader outside the app.
// Only Chrome and Edge on a computer have it; everywhere else the floating reader does not appear.
import { createRoot } from 'react-dom/client'
import { T } from '../theme.js'

export function floatingSupported() {
  return typeof window !== 'undefined' && 'documentPictureInPicture' in window
}

export function floatingSize(screenWidth) {
  return { width: Math.max(260, Math.min(420, screenWidth - 40)), height: 190 }
}

export function baseCss(T) {
  return `html, body { margin: 0; height: 100%; background: ${T.bg}; color: ${T.text}; font-family: ${T.font}; }\n* { box-sizing: border-box; }`
}

// Must be called from a user gesture (requestWindow needs one). render() returns the React element to mount.
export async function openFloating(render) {
  const pip = await window.documentPictureInPicture.requestWindow(floatingSize(window.screen.width))
  for (const link of document.head.querySelectorAll('link[rel="stylesheet"], link[as="font"]')) {
    pip.document.head.appendChild(link.cloneNode(true))
  }
  const style = pip.document.createElement('style')
  style.textContent = baseCss(T)
  pip.document.head.appendChild(style)
  const div = pip.document.createElement('div')
  div.style.height = '100%'
  pip.document.body.appendChild(div)
  const root = createRoot(div)
  root.render(render())
  pip.addEventListener('pagehide', () => root.unmount())
  return { close: () => pip.close(), window: pip }
}
