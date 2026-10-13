// M25: aware listening. The phone microphone measures the room; a tracker turns the loudness into 'noisy',
// 'quiet' and 'speech' events. createTracker is pure: it sees only the (db, tMs) values it is fed, and has no timers.
// The microphone is touched only inside startAwareness, which the caller runs from a user action, so nothing here
// touches Web Audio at import time.

const TICK_MS = 100 // how often the microphone is read
const FFT_SIZE = 2048 // samples per read
const SILENCE_DB = -100
// No echo cancelling, noise suppression or gain control: the level must be the room's real level, and on
// Android echo cancelling is expected to switch the phone into its call audio mode, which would spoil the
// book's own sound (pattern-based assumption, not verified on a phone).
const MIC = { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
const MIC_REFUSED = "Noesis could not use the microphone. Allow it in the browser's site settings."

const DEFAULTS = {
  noisyDb: -38, // the background at or above this is noise
  quietDb: -46, // the background at or below this is quiet again (the gap between the two stops flapping)
  noisyMs: 4000,
  quietMs: 6000,
  speechRiseDb: 14, // a level this far above the background is a voice
  speechMs: 350,
  speechCooldownMs: 4000,
  floorSeconds: 3, // time constant of the background estimate
  adoptMs: 2500, // a rise that lasts longer than this is not a voice: it is the new background
}

// Loudness of a block of samples (-1 to 1) in decibels relative to full scale.
export function levelDb(samples) {
  const n = samples.length
  if (n === 0) return SILENCE_DB
  let sum = 0
  for (let i = 0; i < n; i++) sum += samples[i] * samples[i]
  const rms = Math.sqrt(sum / n)
  return rms > 0 ? 20 * Math.log10(rms) : SILENCE_DB
}

// feed(db, tMs) takes one loudness reading with its time in milliseconds, and returns the events it caused.
// floor() is the background level in dB (null before the first reading); noisy() is true while the room is noisy.
export function createTracker(options = {}) {
  const o = { ...DEFAULTS, ...options }
  let floorDb = null
  let lastMs = 0
  let noisyFrom = null // when the background first reached noisyDb in the current run
  let quietFrom = null // when the background first dropped to quietDb while noisy
  let speechFrom = null // when the level first rose speechRiseDb above the background in the current run
  let lastSpeechMs = -Infinity
  let riseFrom = null // when the level first rose above the background (for adopting a lasting rise)
  let spoke = false // this burst has already been reported
  let loud = false

  return {
    feed(db, tMs) {
      const events = []
      if (floorDb === null) {
        floorDb = db
      } else if (db - floorDb > o.speechRiseDb) {
        // Loud against the background: a voice, unless it lasts. Then the room itself has become louder.
        if (riseFrom === null) riseFrom = tMs
        if (tMs - riseFrom >= o.adoptMs) { floorDb = db; riseFrom = null }
      } else {
        riseFrom = null
        // A voice must not drag the background up, so readings far above it leave the floor alone.
        const weight = 1 - Math.exp(-Math.max(0, tMs - lastMs) / 1000 / o.floorSeconds)
        floorDb += weight * (db - floorDb)
      }
      lastMs = tMs

      if (floorDb >= o.noisyDb) {
        quietFrom = null
        if (noisyFrom === null) noisyFrom = tMs
        if (!loud && tMs - noisyFrom >= o.noisyMs) {
          loud = true
          events.push({ type: 'noisy' })
        }
      } else {
        noisyFrom = null
        if (loud && floorDb <= o.quietDb) {
          if (quietFrom === null) quietFrom = tMs
          if (tMs - quietFrom >= o.quietMs) {
            loud = false
            quietFrom = null
            events.push({ type: 'quiet' })
          }
        } else {
          quietFrom = null
        }
      }

      if (db - floorDb > o.speechRiseDb) {
        if (speechFrom === null) speechFrom = tMs
        if (!spoke && tMs - speechFrom >= o.speechMs && tMs - lastSpeechMs >= o.speechCooldownMs) {
          lastSpeechMs = tMs
          spoke = true
          events.push({ type: 'speech' })
        }
      } else {
        speechFrom = null
        spoke = false
      }
      return events
    },
    floor() {
      return floorDb
    },
    noisy() {
      return loud
    },
  }
}

function audioContextClass() {
  return globalThis.AudioContext || globalThis.webkitAudioContext || null
}

export function awareSupported() {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function'
    && audioContextClass() !== null
}

// Reads the microphone every TICK_MS and feeds the level to a tracker. The microphone is analysed, never played
// back: the analyser is not connected to the speakers. Resolves with { stop }; stop() is safe to call twice.
export async function startAwareness({ onEvent = () => {}, onLevel = () => {} } = {}, options) {
  if (!awareSupported()) throw new Error(MIC_REFUSED)
  const Ctor = audioContextClass()
  const ctx = new Ctor()
  let stream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: MIC })
  } catch {
    ctx.close()
    throw new Error(MIC_REFUSED)
  }
  // A phone starts an audio context asleep until it is told to run: left asleep, the microphone is open and
  // nothing is ever measured, so "slow down when it is noisy" could be on and never do anything.
  await ctx.resume?.().catch(() => {})
  const analyser = ctx.createAnalyser()
  analyser.fftSize = FFT_SIZE
  ctx.createMediaStreamSource(stream).connect(analyser)
  const samples = new Float32Array(analyser.fftSize)
  const tracker = createTracker(options)
  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(samples)
    const db = levelDb(samples)
    onLevel(db)
    for (const event of tracker.feed(db, performance.now())) onEvent(event)
  }, TICK_MS)

  let stopped = false
  return {
    stop() {
      if (stopped) return
      stopped = true
      clearInterval(timer)
      for (const track of stream.getTracks()) track.stop()
      ctx.close()
    },
  }
}
