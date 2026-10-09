// Runs Kokoro-82M entirely on this device. Messages are processed strictly one at a time.
import { KokoroTTS } from 'kokoro-js'
import { packPackets, wav } from './audio-format.js'

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX'
const OPUS = { codec: 'opus', numberOfChannels: 1, bitrate: 32000 }

let tts = null
let device = null
let opusOk = null

async function pickDevice(pref, mobile) {
  if (pref === 'wasm') return 'wasm'
  // WebGPU wants the fp32 weights (~330 MB). On phones the 90 MB q8/WASM build is the better default.
  if (pref === 'auto' && mobile) return 'wasm'
  try { if (navigator.gpu && (await navigator.gpu.requestAdapter())) return 'webgpu' } catch { /* no adapter */ }
  return 'wasm'
}

async function load({ pref, mobile }) {
  const progress = new Map()
  const progress_callback = p => {
    if (p.status !== 'progress' || !p.total) return
    progress.set(p.file, [p.loaded, p.total])
    let a = 0, b = 0
    for (const [l, t] of progress.values()) { a += l; b += t }
    postMessage({ type: 'progress', loaded: a, total: b })
  }
  device = await pickDevice(pref, mobile)
  try {
    tts = await KokoroTTS.from_pretrained(MODEL, { dtype: device === 'webgpu' ? 'fp32' : 'q8', device, progress_callback })
  } catch (e) {
    if (device !== 'webgpu') throw e
    device = 'wasm' // WebGPU adapter present but unusable (driver/blocklist) → fall back, don't fail.
    tts = await KokoroTTS.from_pretrained(MODEL, { dtype: 'q8', device, progress_callback })
  }
  return { device }
}

async function encode(pcm, rate) {
  if (opusOk === null) {
    opusOk = typeof AudioEncoder !== 'undefined' &&
      !!(await AudioEncoder.isConfigSupported({ ...OPUS, sampleRate: rate }).catch(() => null))?.supported
  }
  if (!opusOk) return { codec: 'wav', bytes: wav(pcm, rate) }
  const packets = []
  const frames = []
  let failure = null
  const enc = new AudioEncoder({
    output: chunk => {
      const b = new Uint8Array(chunk.byteLength)
      chunk.copyTo(b)
      packets.push(b)
      frames.push(Math.round(((chunk.duration ?? 20000) * 48000) / 1e6))
    },
    error: e => { failure = e },
  })
  enc.configure({ ...OPUS, sampleRate: rate })
  enc.encode(new AudioData({ format: 'f32', sampleRate: rate, numberOfFrames: pcm.length, numberOfChannels: 1, timestamp: 0, data: pcm }))
  await enc.flush()
  enc.close()
  if (failure) throw failure
  return { codec: 'opus', rate, ...packPackets(packets, frames) }
}

async function speak({ text, voice }) {
  const out = await tts.generate(text, { voice })
  const pcm = out.audio
  const rate = out.sampling_rate
  const rec = await encode(pcm, rate)
  rec.dur = pcm.length / rate
  return rec
}

let queue = Promise.resolve()
self.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    try {
      if (data.type === 'init') postMessage({ type: 'ready', id: data.id, ...(await load(data)) })
      else if (data.type === 'speak') {
        const rec = await speak(data)
        const transfer = [rec.data?.buffer, rec.bytes?.buffer].filter(Boolean)
        postMessage({ type: 'audio', id: data.id, rec }, transfer)
      }
    } catch (e) {
      postMessage({ type: 'error', id: data.id, message: String(e?.message || e) })
    }
  })
}
