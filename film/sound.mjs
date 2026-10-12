// The film's sound, made here from arithmetic: nothing recorded, nothing licensed from anyone. A slow bed of
// chords that changes with the scenes and resolves at the end, a low thump under each big word as it lands,
// a breath of air across each change of scene, a small click for each thing that switches, and a tone that
// rides the mood line as it is played. And one thing that is not arithmetic: in the reading scene, Noesis's
// own voice (film/voice.ogg, made by the app's on-device engine) says the sentence that is on screen.
//
//   node film/sound.mjs        writes film/sound.wav (render.mjs calls this and joins it to the picture)
//
// The times are the film's own (film/intro.html): move a scene there, move it here.
import { spawnSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const RATE = 48000
const SECONDS = 30
const N = RATE * SECONDS
const here = name => fileURLToPath(new URL(`./${name}`, import.meta.url))
export const VOICE_AT = 8.05 // when the voice begins, in the reading scene

const HITS = [1.0, 3.55, 3.91, 4.27, 13.85, 16.8, 20.8, 24.7, 27.7, 28.0] // a big word, or the name, lands
const AIRS = [3.3, 7.7, 13.5, 16.5, 20.5, 24.5, 27.1] // one scene gives way to the next
const CLICKS = [14.45, 14.73, 15.01, 18.25, 19.45, 21.95, 22.85, 23.75] // a number arrives, the pill slides, the language changes
const MOOD = [25.0, 27.1] // the mood line is played
// the bed: [from, to, notes in Hz]. D minor to begin, opening out, home on D major.
const CHORDS = [
  [0, 7.9, [73.42, 110, 174.61, 261.63, 329.63]],
  [7.5, 13.7, [58.27, 116.54, 174.61, 293.66]], // thin under the voice
  [13.3, 20.7, [87.31, 130.81, 220, 329.63]],
  [20.3, 24.7, [65.41, 130.81, 196, 329.63, 493.88]],
  [24.3, 27.3, [55, 110, 164.81, 261.63, 392]],
  [26.9, 30, [73.42, 110, 185, 220, 293.66, 329.63]],
]

export function makeSound(out = here('sound.wav')) {
  const L = new Float32Array(N)
  const R = new Float32Array(N)
  const add = (i, l, r = l) => { if (i >= 0 && i < N) { L[i] += l; R[i] += r } }

  // the voice first, so the bed can make room for it
  let voiceEnd = VOICE_AT
  if (existsSync(here('voice.ogg'))) {
    const pcm = spawnSync('ffmpeg', ['-loglevel', 'error', '-i', here('voice.ogg'), '-f', 'f32le', '-ar', String(RATE), '-ac', '1', '-'], { maxBuffer: 1 << 28 }).stdout
    const v = new Float32Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 4))
    const at = Math.round(VOICE_AT * RATE)
    for (let i = 0; i < v.length; i++) add(at + i, v[i] * 0.95)
    voiceEnd = VOICE_AT + v.length / RATE
  }
  const duck = t => { const a = Math.min(1, Math.max(0, (t - VOICE_AT + 0.4) / 0.4)); const b = Math.min(1, Math.max(0, (voiceEnd + 0.5 - t) / 0.5)); return 1 - 0.6 * Math.min(a, b) }

  for (const [from, to, notes] of CHORDS) {
    const a = Math.round(from * RATE)
    const len = Math.round((to - from) * RATE)
    for (let i = 0; i < len; i++) {
      const t = i / RATE
      const env = Math.min(1, t / 1.3) * Math.min(1, (to - from - t) / 1.4)
      if (env <= 0) continue
      let l = 0
      let r = 0
      notes.forEach((f, n) => {
        const w = 2 * Math.PI * t
        const slow = 1 + 0.12 * Math.sin(w * (0.11 + n * 0.03)) // each note breathes at its own pace
        l += slow * (Math.sin(w * f * 0.999) + 0.25 * Math.sin(w * f * 2))
        r += slow * (Math.sin(w * f * 1.001) + 0.25 * Math.sin(w * f * 2.003))
      })
      const g = (0.034 / Math.sqrt(notes.length / 4)) * env * env * duck(from + t)
      add(a + i, l * g, r * g)
    }
  }
  for (const at of HITS) {
    const a = Math.round(at * RATE)
    let phase = 0
    for (let i = 0; i < RATE * 0.7; i++) {
      const t = i / RATE
      phase += (2 * Math.PI * (44 + 70 * Math.exp(-t * 22))) / RATE
      add(a + i, Math.sin(phase) * Math.exp(-t * 6.5) * 0.42 * Math.min(1, t / 0.004))
    }
  }
  let seed = 7
  const noise = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2147483648 - 1 }
  AIRS.forEach((at, k) => {
    const a = Math.round((at - 0.45) * RATE)
    const len = Math.round(0.95 * RATE)
    let low = 0
    let lower = 0
    for (let i = 0; i < len; i++) {
      const x = i / len
      const env = Math.sin(Math.PI * x) ** 2
      // The air opens and closes, and stays soft: noise through two gentle filters, so only its low breath is
      // left. (Through one wide filter it was a harsh hiss across the whole range: seen in the sound's picture,
      // film/sound-picture.png, which is how a sound is checked by someone who cannot hear it.)
      const cut = 0.004 + 0.04 * env
      low += cut * (noise() - low)
      lower += cut * (low - lower)
      const pan = k % 2 ? x : 1 - x // it crosses the room, one way then the other
      add(a + i, lower * env * 2.2 * (1 - 0.6 * pan), lower * env * 2.2 * (0.4 + 0.6 * pan))
    }
  })
  for (const at of CLICKS) {
    const a = Math.round(at * RATE)
    let phase = 0
    for (let i = 0; i < RATE * 0.16; i++) {
      const t = i / RATE
      phase += (2 * Math.PI * (540 + 420 * Math.min(1, t / 0.06))) / RATE
      add(a + i, Math.sin(phase) * Math.exp(-t * 34) * 0.13)
    }
  }
  { // the tone that rides the mood line: higher where the writing is brighter
    const a = Math.round(MOOD[0] * RATE)
    const len = Math.round((MOOD[1] - MOOD[0]) * RATE)
    let phase = 0
    for (let i = 0; i < len; i++) {
      const x = i / len
      const y = Math.sin(2 * Math.PI * 1.55 * x + 0.6) * (0.55 + 0.45 * x)
      phase += (2 * Math.PI * 392 * 2 ** (0.42 * y)) / RATE
      const env = Math.min(1, x / 0.12) * Math.min(1, (1 - x) / 0.15)
      add(a + i, (Math.sin(phase) + 0.3 * Math.sin(2 * phase)) * env * 0.05)
    }
  }
  // one gentle ceiling over all of it, in and out softly
  const wav = Buffer.alloc(44 + N * 4)
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + N * 4, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22)
  wav.writeUInt32LE(RATE, 24); wav.writeUInt32LE(RATE * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(N * 4, 40)
  for (let i = 0; i < N; i++) {
    const t = i / RATE
    const edge = Math.min(1, t / 0.25) * Math.min(1, (SECONDS - t) / 1.3)
    wav.writeInt16LE(Math.round(Math.tanh(L[i] * 1.5) * edge * 30000), 44 + i * 4)
    wav.writeInt16LE(Math.round(Math.tanh(R[i] * 1.5) * edge * 30000), 46 + i * 4)
  }
  writeFileSync(out, wav)
  return { out, voiceEnd }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(makeSound())
