import { createStore } from './store.js'
import { settings } from './settings.js'
import { muxOggOpus, unpackPackets } from './audio-format.js'
import { isCloudVoice, cloudSynthesize } from './cloudvoice.js'
import { countUse } from './usage.js'
import { voiceName } from './voices.js'

// The on-device voice engine (Piper, tts.worker.js). The worker starts on first use; each voice is one
// download, cached on the device. status: idle | loading (downloading/opening `voice`) | ready | error
// A cloud voice (nv:…) needs no download: loadEngine reads ready for it at once.
export const engine = createStore({ status: 'idle', voice: null, loaded: 0, total: 0, opening: false, error: null })

// What the customer is waiting for when a voice is not ready yet, in the ONE set of words the app has for it.
// The reader, the island above the player and the voice list all say this sentence, so the same wait never
// has two names (it had five: "Preparing the voice", "Getting the voice ready", "Preparing audio"...).
// The app's words for its waits:  Downloading the <name> voice  (from the network, once per device)
//                                 Starting the <name> voice     (opening it from this device)
//                                 Making the audio              (this device speaking the text into sound)
//                                 Reading the document          (turning the file into text)
// → null | { text, download, progress? (0..1; absent = no known length), mb?, detail? }
export function voiceWait(e = engine.get()) {
  if (e.status !== 'loading') return null
  const name = voiceName(e.voice)
  if (!(e.total > 0) || e.opening) return { text: `Starting the ${name} voice`, download: false }
  const part = e.loaded / e.total
  return { text: `Downloading the ${name} voice`, download: true, progress: part >= 0.01 ? part : undefined, mb: Math.round(e.total / 1048576), detail: `One time, ${Math.round(e.total / 1048576)} MB. After this it works offline.` }
}

let worker = null
let loading = null // { voice, promise } — concurrent callers share one load
let seq = 0
const pending = new Map()

function call(msg) {
  if (!worker) {
    worker = new Worker(new URL('./tts.worker.js', import.meta.url), { type: 'module' })
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') return engine.set({ loaded: data.loaded, total: data.total })
      if (data.type === 'opening') return engine.set({ opening: true })
      const p = pending.get(data.id)
      if (!p) return
      pending.delete(data.id)
      data.type === 'error' ? p.reject(new Error(data.message)) : p.resolve(data)
    }
    // A worker that fails to start (bad import, unsupported browser) must fail loudly, not hang forever.
    // It is also thrown away: a dead engine was kept, so every later request (Retry included) was sent to it
    // and waited for ever. The next request starts a new one.
    worker.onerror = e => {
      const err = new Error(e.message || 'The voice engine could not start')
      for (const p of pending.values()) p.reject(err)
      pending.clear()
      try { worker.terminate() } catch { /* already gone */ }
      worker = null
      loading = null
      engine.set({ status: 'error', error: err.message })
    }
  }
  const id = ++seq
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    worker.postMessage({ ...msg, id })
  })
}

export function loadEngine(voice = settings.get().voice) {
  if (isCloudVoice(voice)) {
    loading = null
    engine.set({ status: 'ready', voice, loaded: 0, total: 0, opening: false, error: null })
    return Promise.resolve()
  }
  const s = engine.get()
  if (s.status === 'ready' && s.voice === voice) return Promise.resolve()
  if (loading?.voice === voice) return loading.promise
  engine.set({ status: 'loading', voice, loaded: 0, total: 0, opening: false, error: null })
  const promise = call({ type: 'load', voice })
    .then(() => { if (loading?.voice === voice) { loading = null; engine.set({ status: 'ready' }) } })
    .catch(e => { if (loading?.voice === voice) loading = null; engine.set({ status: 'error', error: e.message }); throw e })
  loading = { voice, promise }
  return promise
}

// A run of sentences of one paragraph, given to an online voice as one (so it carries its feeling across each full
// stop) and cut back into its sentences where it paused between them (split.js). → one record per sentence, or
// null when the cuts could not be trusted: the caller then makes them one by one.
export async function synthesizeRun(texts, voice, pauses, tone = settings.get().voiceTone || 'natural', opts = {}) {
  await loadEngine(voice)
  const { pcm, rate } = await cloudSynthesize(texts.join(' '), voice, { signal: opts.signal, onRetry: opts.onRetry })
  const recs = (await call({ type: 'encodeRun', pcm, rate, lengths: texts.map(t => t.length), pauses, tone })).recs
  if (recs && voice.startsWith('nv:')) countUse('voice', 'said', { n: texts.length }) // sentences, beside the requests (usage.js)
  return recs
}

export async function synthesize(text, voice, pause = 'sentence', tone = settings.get().voiceTone || 'natural', opts = {}) {
  await loadEngine(voice)
  if (isCloudVoice(voice)) {
    const { pcm, rate } = await cloudSynthesize(text, voice, { signal: opts.signal, onRetry: opts.onRetry })
    if (voice.startsWith('nv:')) countUse('voice', 'said')
    return (await call({ type: 'encode', pcm, rate, pause, tone })).rec
  }
  return (await call({ type: 'speak', text, voice, pause, tone })).rec
}

// Stored record → playable Blob.
export function recordToBlob(rec) {
  if (rec.codec === 'wav') return new Blob([rec.bytes], { type: 'audio/wav' })
  const { packets, frames } = unpackPackets(rec)
  return new Blob([muxOggOpus(packets, frames, { inputRate: rec.rate })], { type: 'audio/ogg; codecs=opus' })
}
