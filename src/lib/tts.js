import { createStore } from './store.js'
import { settings } from './settings.js'
import { muxOggOpus, unpackPackets } from './audio-format.js'

// The on-device voice engine (Piper, tts.worker.js). The worker starts on first use; each voice is one
// download, cached on the device. status: idle | loading (downloading/opening `voice`) | ready | error
export const engine = createStore({ status: 'idle', voice: null, loaded: 0, total: 0, error: null })

let worker = null
let loading = null // { voice, promise } — concurrent callers share one load
let seq = 0
const pending = new Map()

function call(msg) {
  if (!worker) {
    worker = new Worker(new URL('./tts.worker.js', import.meta.url), { type: 'module' })
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') return engine.set({ loaded: data.loaded, total: data.total })
      const p = pending.get(data.id)
      if (!p) return
      pending.delete(data.id)
      data.type === 'error' ? p.reject(new Error(data.message)) : p.resolve(data)
    }
    // A worker that fails to start (bad import, unsupported browser) must fail loudly, not hang forever.
    worker.onerror = e => {
      const err = new Error(e.message || 'The voice engine could not start')
      for (const p of pending.values()) p.reject(err)
      pending.clear()
    }
  }
  const id = ++seq
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    worker.postMessage({ ...msg, id })
  })
}

export function loadEngine(voice = settings.get().voice) {
  const s = engine.get()
  if (s.status === 'ready' && s.voice === voice) return Promise.resolve()
  if (loading?.voice === voice) return loading.promise
  engine.set({ status: 'loading', voice, loaded: 0, total: 0, error: null })
  const promise = call({ type: 'load', voice })
    .then(() => { if (loading?.voice === voice) { loading = null; engine.set({ status: 'ready' }) } })
    .catch(e => { if (loading?.voice === voice) loading = null; engine.set({ status: 'error', error: e.message }); throw e })
  loading = { voice, promise }
  return promise
}

export async function synthesize(text, voice) {
  await loadEngine(voice)
  return (await call({ type: 'speak', text, voice })).rec
}

// Stored record → playable Blob.
export function recordToBlob(rec) {
  if (rec.codec === 'wav') return new Blob([rec.bytes], { type: 'audio/wav' })
  const { packets, frames } = unpackPackets(rec)
  return new Blob([muxOggOpus(packets, frames, { inputRate: rec.rate })], { type: 'audio/ogg; codecs=opus' })
}
