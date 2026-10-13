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

// Every size in the floating window, from the window's own: Focus at the scale of a window that floats.
// From the bottom up: the three buttons, two lines of the sentence, and the word gets all the height that is left.
export function floatingLayout(w, h) {
  const pad = Math.round(Math.max(8, Math.min(16, w * 0.03)))
  const controls = 30
  const capFont = Math.round(Math.max(12, Math.min(18, w * 0.034)))
  const capLine = Math.round(capFont * 1.4)
  const capH = capLine * 2
  const stageH = Math.max(36, h - pad * 2 - controls - capH)
  const word = Math.round(Math.max(18, Math.min(stageH * 0.58, w * 0.14)))
  // how many letters the two lines hold, with room to spare: a piece of the sentence must never need a third
  const letters = Math.max(20, Math.floor(((w - pad * 2) / (capFont * 0.52)) * 2 * 0.82))
  return { pad, controls, capFont, capLine, capH, stageH, word, letters }
}

// A sentence longer than two lines is shown a piece at a time, like a caption: [[from, to), ...] over its words,
// each piece as many whole words as fit in `letters`.
// The pieces are evened out: filled to the brim, the last piece of a sentence was two words left over.
export function captionGroups(words, letters) {
  const cut = room => {
    const out = []
    let from = 0, used = 0
    words.forEach((w, k) => {
      const more = w.length + (k > from ? 1 : 0)
      if (k > from && used + more > room) { out.push([from, k]); from = k; used = w.length } else used += more
    })
    if (words.length) out.push([from, words.length])
    return out
  }
  const full = cut(letters)
  if (full.length < 2) return full
  // the same number of pieces, each as short as that number allows
  const total = words.join(' ').length
  for (let room = Math.ceil(total / full.length); room < letters; room += 2) { const even = cut(room); if (even.length === full.length) return even }
  return full
}

export function baseCss(T) {
  return `html, body { margin: 0; height: 100%; background: ${T.bg}; color: ${T.text}; font-family: ${T.font}; }\n* { box-sizing: border-box; }`
}

// Must be called from a user gesture (requestWindow needs one). render() returns the React element to mount.
export async function openFloating(render) {
  const pip = await window.documentPictureInPicture.requestWindow(floatingSize(window.screen.width))
  for (const link of document.head.querySelectorAll('link[rel="stylesheet"], link[as="font"], style')) {
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
