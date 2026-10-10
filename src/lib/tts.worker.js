// Generates speech on this device with Piper voices: text → eSpeak-ng phonemes → phoneme ids → VITS (ONNX) → Opus.
// Messages are processed strictly one at a time.
import * as ort from 'onnxruntime-web/wasm' // CPU build (11 MB): Piper is fast on CPUs; no GPU code to download
import { phonemize } from 'phonemizer'
import { encode } from './encode.js'
import { voiceUrl } from './voices.js'

const CACHE = 'noesis-voices' // voice files, kept for offline use (Settings → Remove downloaded voices)
// The runtime's glue + WASM are served as standalone static files (public/ort, copied by postinstall): its
// helper threads re-load that glue by URL, which fails once it is bundled into this worker — a silent hang.
ort.env.wasm.wasmPaths = new URL('/ort/', self.location.origin).href // absolute: the dev server rewrites root-relative dynamic imports
// One thread. Measured (2026-10-10): multi-threaded ONNX inside a Web Worker never finishes creating the
// session (dev and production builds alike), while one thread runs Piper at 3.6–3.9× real time on a single
// desktop core — enough for phones too — and leaves the other cores to the UI (all-core generation lagged a phone).
// ponytail: single thread; revisit ORT's proxy/threads in a worker if phones measure below 1×.
ort.env.wasm.numThreads = 1

let voice = null // { id, cfg, session }

// Cached fetch, reporting download progress (bytes) for the model file.
async function fetchCached(url, onBytes) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(url)
  if (hit) return hit
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Voice download failed (${res.status})`)
  const total = +res.headers.get('content-length') || 0
  const reader = res.body.getReader()
  const parts = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(value)
    loaded += value.length
    onBytes?.(loaded, total)
  }
  const out = new Response(new Blob(parts))
  await cache.put(url, out.clone())
  return out
}

async function load(id) {
  if (voice?.id === id) return voice
  const url = voiceUrl(id)
  const cfg = await (await fetchCached(url + '.json')).json()
  const model = await (await fetchCached(url, (loaded, total) => postMessage({ type: 'progress', loaded, total }))).arrayBuffer()
  voice = null // release the previous voice before creating the next session
  voice = { id, cfg, session: await ort.InferenceSession.create(model, { executionProviders: ['wasm'] }) }
  return voice
}

// Piper's input (rhasspy/piper): BOS "^", then each phoneme's id followed by the pad "_", then EOS "$".
// Punctuation stays as its own phoneme because Piper uses it for pauses and intonation; the phonemizer
// drops it, so text is split on punctuation and the marks are put back between phonemized chunks.
const PUNCT = /([.,!?;:…—–"“”«»()¡¿])/
async function phonemeIds(text, cfg) {
  const map = cfg.phoneme_id_map
  const ids = [...map['^']]
  const push = ch => { if (map[ch]) ids.push(...map[ch], ...map['_']) }
  for (const part of text.split(PUNCT)) {
    if (!part.trim()) continue
    if (PUNCT.test(part)) { for (const ch of part) push(ch); push(' '); continue }
    for (const ch of (await phonemize(part, cfg.espeak.voice)).join(' ')) push(ch)
  }
  ids.push(...map['$'])
  return ids
}

async function speak({ text, voice: id }) {
  const { session, cfg } = await load(id)
  const ids = await phonemeIds(text, cfg)
  const inf = cfg.inference
  const feeds = {
    input: new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length]),
    input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
    scales: new ort.Tensor('float32', Float32Array.from([inf.noise_scale, inf.length_scale, inf.noise_w]), [3]),
  }
  if (cfg.num_speakers > 1) feeds.sid = new ort.Tensor('int64', BigInt64Array.from([0n]), [1])
  const pcm = (await session.run(feeds)).output.data
  const rate = cfg.audio.sample_rate
  const rec = await encode(pcm, rate)
  rec.dur = pcm.length / rate
  return rec
}

let queue = Promise.resolve()
self.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    try {
      if (data.type === 'load') { await load(data.voice); postMessage({ type: 'ready', id: data.id }) }
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
