// Focus sounds that sit UNDER a voice: binaural beats (focus, calm) and brown noise.
// The pure helpers are tested in Node. The audio graph is built only inside playing(true), which the caller
// runs from a user gesture, so nothing here touches AudioContext at import time.

export const MODES = ['off', 'focus', 'calm', 'brown']

// One tone per ear. Each ear hears a slightly different frequency; the brain hears the difference as a beat.
const BEATS = {
  focus: { left: 200, right: 214 },
  calm: { left: 200, right: 208 },
}
const MAX_GAIN = 0.25 // these sounds sit under a voice: never louder than this
const RAMP_S = 0.4 // every start, stop and mode change fades over this long: no clicks
const NOISE_S = 4 // length of the looping brown-noise buffer, seconds
const LEAK = 0.02 // leaky integrator coefficient (the usual brown-noise approximation)
const WARM = 4096 // samples used to prime the integrator; 0.98^4096 is negligible

export function beatFrequencies(mode) {
  return Object.hasOwn(BEATS, mode) ? { ...BEATS[mode] } : null
}

// Deterministic uniform values in [0, 1) from a seed (mulberry32).
function uniform(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Brown noise is white noise through a leaky integrator, so low frequencies dominate. The integrator is first
// run over the buffer's own tail, so the state entering sample 0 is the one the buffer ends with: the loop joins
// without a step. Peak-normalised, so every value is in [-1, 1].
export function brownNoise(length, seed) {
  const rand = uniform(seed)
  const white = new Float32Array(length)
  for (let i = 0; i < length; i++) white[i] = rand() * 2 - 1
  const keep = 1 / (1 + LEAK)
  const feed = LEAK / (1 + LEAK)
  let state = 0
  for (let i = Math.max(0, length - WARM); i < length; i++) state = keep * state + feed * white[i]
  const out = new Float32Array(length)
  let peak = 0
  for (let i = 0; i < length; i++) {
    state = keep * state + feed * white[i]
    out[i] = state
    peak = Math.max(peak, Math.abs(state))
  }
  if (peak > 0) for (let i = 0; i < length; i++) out[i] /= peak
  return out
}

// Loudness for a 0..1 slider value: 0 is silent, 1 is MAX_GAIN, and the curve is monotonic.
export function gainFor(volume) {
  if (!(volume > 0)) return 0
  return MAX_GAIN * Math.min(1, volume) ** 2
}

let ctx = null
let graph = null
let wanted = { mode: 'off', volume: 0.5 }
let on = false
let suspendTimer = null

function audioContextClass() {
  if (typeof window === 'undefined') return null
  return window.AudioContext || window.webkitAudioContext || null
}

// Ramp a parameter from where it is now to value over RAMP_S, starting at `at`.
function glide(param, value, at) {
  param.cancelScheduledValues(at)
  param.setValueAtTime(param.value, at)
  param.linearRampToValueAtTime(value, at + RAMP_S)
}

function build(audio) {
  const merger = audio.createChannelMerger(2)
  const left = audio.createOscillator()
  const right = audio.createOscillator()
  left.frequency.value = BEATS.focus.left
  right.frequency.value = BEATS.focus.right
  left.connect(merger, 0, 0)
  right.connect(merger, 0, 1)
  const beat = audio.createGain()
  beat.gain.value = 0
  merger.connect(beat)

  const noiseBuffer = audio.createBuffer(1, Math.round(NOISE_S * audio.sampleRate), audio.sampleRate)
  noiseBuffer.copyToChannel(brownNoise(noiseBuffer.length, 7), 0)
  const source = audio.createBufferSource()
  source.buffer = noiseBuffer
  source.loop = true
  const noise = audio.createGain()
  noise.gain.value = 0
  source.connect(noise)

  const master = audio.createGain()
  master.gain.value = 0
  beat.connect(master)
  noise.connect(master)
  master.connect(audio.destination)

  // Oscillators and the noise loop run from the start; mode changes only move gains, so no restart clicks.
  left.start()
  right.start()
  source.start()
  return { left, right, beat, noise, master }
}

// Drive the graph to the wanted mode and the current on/off state, every change over RAMP_S.
function apply() {
  const at = ctx.currentTime
  const beats = beatFrequencies(wanted.mode)
  if (beats) {
    glide(graph.left.frequency, beats.left, at)
    glide(graph.right.frequency, beats.right, at)
  }
  glide(graph.beat.gain, beats ? 1 : 0, at)
  glide(graph.noise.gain, wanted.mode === 'brown' ? 1 : 0, at)
  glide(graph.master.gain, on ? gainFor(wanted.volume) : 0, at)
}

export const ambient = {
  set(next) {
    if (next.mode !== undefined) {
      if (!MODES.includes(next.mode)) throw new Error(`ambient: unknown mode "${next.mode}"`)
      wanted = { ...wanted, mode: next.mode }
    }
    if (next.volume !== undefined) wanted = { ...wanted, volume: next.volume }
    if (graph) apply()
  },

  playing(yes) {
    on = yes
    if (yes) {
      if (!ctx) {
        const Ctor = audioContextClass()
        if (!Ctor) return
        ctx = new Ctor()
        graph = build(ctx)
      }
      clearTimeout(suspendTimer)
      ctx.resume()
      apply()
      return
    }
    if (!ctx) return
    apply()
    clearTimeout(suspendTimer)
    suspendTimer = setTimeout(() => ctx.suspend(), RAMP_S * 1000)
  },
}
