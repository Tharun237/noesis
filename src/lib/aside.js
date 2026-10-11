// Speaking a short text aside from the book: an answer, an explanation, one part of an equation. The book
// pauses for it. Used by the Ask panel and by the tools on equations.
import { pause } from './player.js'
import { detectLang } from './lang.js'
import { voicesFor, defaultVoiceFor } from './voices.js'
import { synthesize, recordToBlob } from './tts.js'
import { sentences } from './text.js'

// An answer is spoken by a voice of the language it is written in: the document's own voice when that
// matches, otherwise the first voice of that language (an English answer about a Telugu book, say).
export const voiceForText = (text, d) => {
  const lang = detectLang(text)
  return voicesFor(lang).some(v => v.id === d.voice) ? d.voice : defaultVoiceFor(lang) || d.voice
}

// Answers can be listened to in the document's own voice, so the user never has to switch to reading.
// `onState(true)` at the first sound, `onState(false)` when it ends or is replaced by another.
const voiceOut = typeof Audio === 'function' ? new Audio() : null
let speakToken = 0
export async function speak(text, voice, onState = () => {}) {
  const my = ++speakToken
  pause()
  try {
    for (const s of sentences(text.replace(/[*#_`>]/g, ''))) {
      const url = URL.createObjectURL(recordToBlob(await synthesize(s, voice)))
      if (my !== speakToken) return URL.revokeObjectURL(url)
      voiceOut.src = url
      await voiceOut.play()
      if (my === speakToken) onState(true) // first sound: no longer preparing
      await new Promise(r => { voiceOut.onended = r; voiceOut.onpause = r })
      URL.revokeObjectURL(url)
      if (my !== speakToken) return
    }
  } finally {
    if (my === speakToken) onState(false)
  }
}
export const stopSpeaking = () => { speakToken++; voiceOut.pause() }
