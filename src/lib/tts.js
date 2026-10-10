import { createStore } from './store.js'
import { settings } from './settings.js'
import { muxOggOpus, unpackPackets } from './audio-format.js'

export const engine = createStore({ status: 'idle', loaded: 0, total: 0, device: null, error: null })

let worker = null
let ready = null
let seq = 0
const pending = new Map()

const isMobile = () => navigator.userAgentData?.mobile ?? /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)

function call(msg) {
  const id = ++seq
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    worker.postMessage({ ...msg, id })
  })
}

export function loadEngine() {
  if (ready) return ready
  worker = new Worker(new URL('./tts.worker.js', import.meta.url), { type: 'module' })
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') return engine.set({ loaded: data.loaded, total: data.total })
    const p = pending.get(data.id)
    if (!p) return
    pending.delete(data.id)
    data.type === 'error' ? p.reject(new Error(data.message)) : p.resolve(data)
  }
  engine.set({ status: 'loading', error: null })
  ready = call({ type: 'init', pref: settings.get().engine, mobile: isMobile() })
    .then(r => { engine.set({ status: 'ready', device: r.device }); settings.set({ naturalSpeed: settings.get().speeds[r.device] || 0 }); return r })
    .catch(e => {
      engine.set({ status: 'error', error: e.message })
      worker.terminate()
      ready = null
      throw e
    })
  return ready
}

export async function synthesize(text, voice) {
  await loadEngine()
  return (await call({ type: 'speak', text, voice })).rec
}

// Stored record → playable Blob.
export function recordToBlob(rec) {
  if (rec.codec === 'wav') return new Blob([rec.bytes], { type: 'audio/wav' })
  const { packets, frames } = unpackPackets(rec)
  return new Blob([muxOggOpus(packets, frames, { inputRate: rec.rate })], { type: 'audio/ogg; codecs=opus' })
}
