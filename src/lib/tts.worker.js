// Generates speech on this device with Piper voices: text → eSpeak-ng phonemes → phoneme ids → VITS (ONNX) → Opus.
// Messages are processed strictly one at a time.
import * as ort from 'onnxruntime-web/wasm' // CPU build (11 MB): Piper is fast on CPUs; no GPU code to download
import { phonemize } from 'phonemizer'
import { encode } from './encode.js'
import { voiceUrl } from './voices.js'
import { ipaChars } from './ipa.js'
import { padTail, trailingSeconds, speechSeconds } from './pause.js'
import { sentenceCuts } from './split.js'
import { applyTone } from './tone.js'

const PAUSE_MS = { sentence: 260, paragraph: 480, heading: 650 }

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

// Small cached fetch (voice config).
async function fetchCached(url) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(url)
  if (hit) return hit
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Voice download failed (${res.status})`)
  await cache.put(url, res.clone())
  return res
}

// The voice model (~63 MB), as bytes. Downloading streams one copy to the cache while the other fills a single
// preallocated buffer: holding the chunks, a Blob and its copy at once tripled memory use on phones.
// Progress is reported at most ~8 times a second.
async function fetchModel(url) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(url)
  if (hit) return hit.arrayBuffer()
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Voice download failed (${res.status})`)
  const total = +res.headers.get('content-length') || 0
  const stored = cache.put(url, res.clone())
  const reader = res.body.getReader()
  let buf = new Uint8Array(total || 80 << 20)
  let loaded = 0
  let told = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (loaded + value.length > buf.length) { const grown = new Uint8Array(Math.max(buf.length * 2, loaded + value.length)); grown.set(buf); buf = grown }
    buf.set(value, loaded)
    loaded += value.length
    if (performance.now() - told > 120) { told = performance.now(); postMessage({ type: 'progress', loaded, total }) }
  }
  postMessage({ type: 'progress', loaded, total: total || loaded })
  await stored
  return loaded === buf.length ? buf.buffer : buf.slice(0, loaded).buffer
}

async function load(id) {
  if (voice?.id === id) return voice
  const url = voiceUrl(id)
  // A file that is kept but cannot be used (a hotel's sign-in page that came back instead of the voice, a
  // download cut short) is thrown away before the error is reported: kept, every retry would read the same bad
  // file from this device and fail the same way for ever.
  const forget = async what => { try { await (await caches.open(CACHE)).delete(what) } catch { /* nothing kept */ } }
  let cfg
  try { cfg = await (await fetchCached(url + '.json')).json() } catch (e) { await forget(url + '.json'); throw e }
  const model = await fetchModel(url)
  postMessage({ type: 'opening' }) // downloaded; the engine now builds the voice (a few seconds on a phone)
  voice = null // release the previous voice before creating the next session
  let session
  try { session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'] }) } catch (e) { await forget(url); throw e }
  voice = { id, cfg, session }
  return voice
}

// Piper's input (rhasspy/piper): BOS "^", then each phoneme's id followed by the pad "_", then EOS "$".
// Punctuation stays as its own phoneme because Piper uses it for pauses and intonation; the phonemizer
// drops it, so text is split on punctuation and the marks are put back between phonemized chunks.
// The dandas । ॥ end Hindi sentences; the voice maps hold no danda, so they use the id of ".".
const PUNCT = /([.,!?;:…—–"“”«»()¡¿।॥])/

// eSpeak-ng (for non-English voices) loads lazily, once, from the standalone static files
// (public/espeak, copied by postinstall): like ORT's glue, it re-loads its data file by URL,
// so it is imported by absolute URL, not bundled into this worker.
let espeakSpeech = null
let espeakLang = null
async function espeakIpa(text, voice) {
  if (!espeakSpeech) {
    const url = new URL('/espeak/espeak-ng.js', self.location.origin).href // absolute: the dev server rewrites root-relative dynamic imports
    const mod = await import(/* @vite-ignore */ url)
    const created = await mod.default({ locateFile: path => new URL('/espeak/' + path, self.location.origin).href })
    espeakSpeech = new created.eSpeakNGWorker()
  }
  if (espeakLang !== voice) {
    const rc = espeakSpeech.set_voice(voice, '', 0, 0, 0)
    if (rc !== 0) throw new Error(`eSpeak has no voice for language ${voice} (code ${rc})`)
    espeakLang = voice
  }
  return espeakSpeech.synthesize_ipa(text).ipa
}

async function phonemeIds(text, cfg) {
  const map = cfg.phoneme_id_map
  const ids = [...map['^']]
  const push = ch => { if (map[ch]) ids.push(...map[ch], ...map['_']) }
  const pushPunct = ch => {
    if (ch === '।' || ch === '॥') { if (map['.']) ids.push(...map['.'], ...map['_']) }
    else push(ch)
  }
  const espeakVoice = cfg.espeak?.voice || ''
  const useEspeak = !espeakVoice.startsWith('en')
  for (const part of text.split(PUNCT)) {
    if (!part.trim()) continue
    if (PUNCT.test(part)) { for (const ch of part) pushPunct(ch); push(' '); continue }
    const phones = useEspeak ? ipaChars(await espeakIpa(part, espeakVoice)) : (await phonemize(part, espeakVoice)).join(' ')
    for (const ch of phones) push(ch)
  }
  ids.push(...map['$'])
  return ids
}

async function speak({ text, voice: id, pause = 'sentence', tone = 'natural' }) {
  const { pcm, rate } = await infer(text, id)
  return finish(pcm, rate, pause, tone)
}

async function infer(text, id) {
  const { session, cfg } = await load(id)
  const ids = await phonemeIds(text, cfg)
  const inf = cfg.inference
  const feeds = {
    input: new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length]),
    input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
    scales: new ort.Tensor('float32', Float32Array.from([inf.noise_scale, inf.length_scale, inf.noise_w]), [3]),
  }
  if (cfg.num_speakers > 1) feeds.sid = new ort.Tensor('int64', BigInt64Array.from([0n]), [1])
  return { pcm: (await session.run(feeds)).output.data, rate: cfg.audio.sample_rate }
}

// A run of sentences spoken as one and cut back into its sentences (split.js): one record each, or null.
async function cutRun(pcm, rate, lengths, pauses, tone) {
  const cuts = sentenceCuts(pcm, rate, lengths)
  if (!cuts) return null
  const recs = []
  for (let k = 0; k < lengths.length; k++) recs.push(await finish(pcm.subarray(cuts[k], cuts[k + 1]), rate, pauses[k], tone))
  return recs
}

// The tail every voice shares: natural pause → trailing silence → tone → encoding.
// Cloud voices arrive as samples and run exactly this; on-device voices run it after inference.
async function finish(pcm, rate, pause = 'sentence', tone = 'natural') {
  const padded = padTail(pcm, rate, PAUSE_MS[pause] ?? PAUSE_MS.sentence)
  const tail = trailingSeconds(padded, rate)
  const shaped = applyTone(padded, rate, tone)
  const rec = await encode(shaped, rate)
  rec.dur = shaped.length / rate
  rec.tail = tail
  rec.speech = speechSeconds(pcm, rate) // how long it speaks, without its quiet (voiceplan.js)
  return rec
}

let queue = Promise.resolve()
self.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    try {
      if (data.type === 'load') { await load(data.voice); postMessage({ type: 'ready', id: data.id }) }
      else if (data.type === 'encode') {
        const rec = await finish(data.pcm, data.rate, data.pause, data.tone)
        const transfer = [rec.data?.buffer, rec.bytes?.buffer].filter(Boolean)
        postMessage({ type: 'audio', id: data.id, rec }, transfer)
      }
      else if (data.type === 'encodeRun' || data.type === 'speakRun') { // a run of sentences spoken as one, cut back into its sentences
        const { pcm, rate } = data.type === 'speakRun' ? await infer(data.texts.join(' '), data.voice) : data
        const recs = await cutRun(pcm, rate, data.texts ? data.texts.map(t => t.length) : data.lengths, data.pauses, data.tone)
        postMessage({ type: 'audio', id: data.id, recs }, (recs || []).flatMap(rec => [rec.data?.buffer, rec.bytes?.buffer]).filter(Boolean))
      }
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
