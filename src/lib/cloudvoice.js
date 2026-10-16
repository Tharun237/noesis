// Cloud voices: NVIDIA Magpie (M10, through Noesis's relay), Google Gemini (with the customer's own Gemini key,
// straight from the browser to Google) and the customer's own OpenAI-protocol voice service (M11, also direct).
// A cloud voice produces the same stored audio as a Piper voice; only where the samples come from differs.
import { LANGS } from './lang.js'
import { countUse } from './usage.js'
import { gapOf, paced } from './voiceplan.js'
import { settings } from './settings.js'
import { isNvidiaKey, cleanBase, hostOf } from './ai.js'

export const NV_TRUTH = "Made online by NVIDIA: the text travels through Noesis's relay to NVIDIA. The audio is kept on this device and plays offline."

export const GM_TRUTH = 'Made online by Google Gemini, with your own Gemini key: the text goes straight from this device to Google. The audio is kept on this device and plays offline.'

export const isCloudVoice = (id = '') => typeof id === 'string' && (id.startsWith('nv:') || id.startsWith('oa:') || id.startsWith('gm:'))

// Gemini's prebuilt voices (ai.google.dev/gemini-api/docs/speech-generation, read 16 October 2026). Each speaks
// whatever language the text is in (130+), so they are offered for every document.
export const GEMINI_VOICES = ['Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede', 'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar', 'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi', 'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat']

// 'nv:Magpie-Multilingual.HI-IN.Sofia' → { name: 'Sofia', nv: 'hi-IN', lang: 'hi' }.
// The middle part is mapped back to a LANGS key (case-insensitive); unknown codes keep their text.
// 'oa:nova' → { name: 'nova', lang: null }: a custom voice has no language of its own.
export function cloudVoiceInfo(id = '') {
  if (String(id).startsWith('oa:')) return { name: String(id).slice(3), lang: null }
  if (String(id).startsWith('gm:')) return { name: String(id).slice(3), lang: null }
  const full = String(id).startsWith('nv:') ? String(id).slice(3) : String(id)
  const parts = full.split('.')
  const code = parts.length >= 2 ? parts[1] : ''
  const name = parts.length >= 3 ? parts.slice(2).join('.') : full
  const found = Object.entries(LANGS).find(([, v]) => v.nv && v.nv.toLowerCase() === String(code).toLowerCase())
  const lang = found ? found[0] : 'en'
  const nv = found ? found[1].nv : code
  return { name, nv, lang }
}

// WAV → { pcm: Float32Array, rate }. Finds the `data` chunk; does not assume byte 44.
// Accepts mono and stereo (channels are averaged), 8/16/24/32-bit PCM and 32-bit float
// (format tags 1 and 3). Anything else throws with 'This audio format is not supported: …'.
export function parseWav(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const str = o => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3])
  if (bytes.length < 44 || str(0) !== 'RIFF' || str(8) !== 'WAVE') throw new Error('Not a WAV file')
  let fmt = null
  let dataAt = -1
  let dataSize = 0
  let o = 12
  while (o + 8 <= bytes.length) {
    const id = str(o)
    const size = v.getUint32(o + 4, true)
    const body = o + 8
    if (id === 'fmt ') {
      if (size < 16) throw new Error('This audio format is not supported: the format chunk is too short')
      fmt = {
        format: v.getUint16(body, true),
        channels: v.getUint16(body + 2, true),
        rate: v.getUint32(body + 4, true),
        bits: v.getUint16(body + 14, true),
      }
    } else if (id === 'data' && dataAt < 0) {
      dataAt = body
      dataSize = size
    }
    o = body + size + (size % 2)
  }
  if (!fmt || dataAt < 0 || !fmt.rate) throw new Error('No audio found in the WAV file')
  const { format, channels, bits } = fmt
  const ok = (format === 1 && (bits === 8 || bits === 16 || bits === 24 || bits === 32)) || (format === 3 && bits === 32)
  if (!ok || channels < 1) throw new Error(`This audio format is not supported: format ${format}, ${channels} channel(s), ${bits}-bit`)
  const step = (bits / 8) * channels
  const n = Math.floor(Math.min(dataSize, bytes.length - dataAt) / step)
  if (n <= 0) throw new Error('No audio found in the WAV file')
  const pcm = new Float32Array(n)
  for (let f = 0; f < n; f++) {
    let sum = 0
    for (let c = 0; c < channels; c++) {
      const at = dataAt + f * step + c * (bits / 8)
      let s = 0
      if (format === 3) s = v.getFloat32(at, true)
      else if (bits === 8) s = (bytes[at] - 128) / 128 // 8-bit PCM is unsigned
      else if (bits === 16) s = v.getInt16(at, true) / 0x8000
      else if (bits === 24) {
        let w = bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16)
        if (w >= 0x800000) w -= 0x1000000
        s = w / 0x800000
      } else s = v.getInt32(at, true) / 0x80000000
      sum += s
    }
    pcm[f] = sum / channels
  }
  return { pcm, rate: fmt.rate }
}

// Float32 samples → 16-bit mono PCM WAV bytes (what the Test button plays). Pure.
export function encodeWav(pcm, rate) {
  const n = pcm.length
  const out = new Uint8Array(44 + n * 2)
  const v = new DataView(out.buffer)
  const str = (at, s) => { for (let i = 0; i < s.length; i++) out[at + i] = s.charCodeAt(i) }
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE')
  str(12, 'fmt '); v.setUint32(16, 16, true)
  v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true)
  v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true)
  return out
}

// 'alloy, nova ,, ' → ['alloy', 'nova']. Pure.
export function parseVoiceNames(str = '') {
  const out = []
  for (const part of String(str ?? '').split(',')) {
    const n = part.trim()
    if (n && !out.includes(n)) out.push(n)
  }
  return out
}

// The host of the customer's own voice service ('api.openai.com'), '' when no address is set.
export function ownHost(base) {
  try {
    return hostOf(base === undefined ? String(settings.get().voiceBase || '') : String(base))
  } catch { return '' }
}

// The exact truth line for a cloud voice, with the real host for a custom voice.
export function cloudTruth(id, host) {
  if (String(id).startsWith('gm:')) return GM_TRUTH
  if (String(id).startsWith('oa:')) {
    const h = host || ownHost()
    return `Made online by ${h || 'your voice service'}: the text goes straight from this device to that address. The audio is kept on this device and plays offline.`
  }
  return NV_TRUTH
}

// The exact request the browser sends for one sentence of a custom voice (OpenAI speech protocol):
// POST {address}/audio/speech with { model, voice, input, response_format: 'wav' },
// Authorization only when a key is set. Pure: the caller passes base/model/key explicitly.
export function buildOwnRequest(text, voiceName, base, model, key = '') {
  const clean = cleanBase(base)
  const m = String(model || '').trim()
  const voice = String(voiceName || '').trim()
  if (!clean || !m || !voice) throw Object.assign(new Error('Enter the address, model and at least one voice in Settings → Voice.'), { status: 400 })
  return {
    url: `${clean}/audio/speech`,
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(String(key || '').trim() ? { authorization: `Bearer ${String(key).trim()}` } : {}) },
    body: JSON.stringify({ model: m, voice, input: String(text), response_format: 'wav' }),
  }
}

// What a failed Test means for the customer, in words they can act on. Pure.
export function explainVoiceError(err, host = '', online = true) {
  const h = host || 'The voice service'
  if (err instanceof TypeError || /failed to fetch|networkerror|load failed|network request failed/i.test(String(err?.message || ''))) {
    if (!online) return 'No connection. Your voice service setting is saved. Test again when online.'
    return `Couldn't reach ${h} from the browser. Check the address; some services do not accept requests from a web page.`
  }
  return String(err?.message || `${h} had a problem. Try again in a moment.`)
}

// One request to the customer's own service, no retries: what the Test button sends.
// A fetch-level network failure stays a TypeError so callers can tell it from a refusal.
export async function fetchOwnSpeech(text, voiceId, { signal } = {}) {
  const s = settings.get()
  const base = cleanBase(String(s.voiceBase || ''))
  const model = String(s.voiceModel || '').trim()
  const key = String(s.voiceKey || '').trim()
  const name = String(voiceId).startsWith('oa:') ? String(voiceId).slice(3) : String(voiceId)
  const host = hostOf(base) || 'The voice service'
  const req = buildOwnRequest(text, name, base, model, key)
  const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body, signal })
  if (res.ok) return parseWav(await res.arrayBuffer())
  if (res.status === 401 || res.status === 403) throw Object.assign(new Error(`${host} did not accept the key. Check it in Settings.`), { status: res.status })
  if (res.status === 429) throw Object.assign(new Error(`${host} is limiting requests. Try again in a moment.`), { status: res.status })
  if (res.status >= 500) throw Object.assign(new Error(`${host} had a problem (error ${res.status}). Try again in a moment.`), { status: res.status })
  const detail = await res.text().catch(() => '')
  throw Object.assign(new Error(detail.trim().slice(0, 300) || `${host} error ${res.status}`), { status: res.status })
}

// The list_voices reply holds one key (comma-joined language list) with { voices: [names] }.
// Keeps only names with exactly three dot-separated parts (drops emotion variants like …Mia.Calm).
export function baseVoices(listReply) {
  const out = {}
  const first = Object.values(listReply || {})[0]
  const names = first?.voices || []
  for (const full of names) {
    if (typeof full !== 'string' || full.split('.').length !== 3) continue
    const { lang } = cloudVoiceInfo('nv:' + full)
    if (!LANGS[lang]) continue
    ;(out[lang] ||= []).push(full)
  }
  return out
}

const DAY = 24 * 60 * 60 * 1000

// GET /api/nvidia-tts/list_voices with the saved NVIDIA key; stores the result in settings.
export async function loadCloudVoices({ force = false } = {}) {
  const key = String(settings.get().nvidiaKey || '').trim()
  if (!isNvidiaKey(key)) return {}
  const s = settings.get()
  if (!force && s.nvidiaVoicesAt && Date.now() - s.nvidiaVoicesAt < DAY && Object.keys(s.nvidiaVoices || {}).length) {
    return s.nvidiaVoices
  }
  const res = await fetch('/api/nvidia-tts/list_voices', { headers: { authorization: `Bearer ${key}` } })
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw Object.assign(new Error('NVIDIA did not accept the key. Check it in Settings.'), { status: res.status })
    const detail = await res.text().catch(() => '')
    throw Object.assign(new Error(detail.trim().slice(0, 200) || `NVIDIA error ${res.status}`), { status: res.status })
  }
  const voices = baseVoices(await res.json().catch(() => ({})))
  settings.set({ nvidiaVoices: voices, nvidiaVoicesAt: Date.now() })
  return voices
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
const retryMs = attempt => Math.min(60_000, 2000 * 2 ** attempt)
let lastStart = 0 // module-level: NVIDIA requests start at least 1.6 s apart (about 40 a minute)

function waitOnline(signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason || new Error('Aborted'))
    const done = () => { cleanup(); resolve() }
    const onAbort = () => { cleanup(); reject(signal.reason || new Error('Aborted')) }
    const cleanup = () => {
      clearTimeout(t)
      try { globalThis.window?.removeEventListener('online', done) } catch { /* non-browser */ }
      try { globalThis.removeEventListener?.('online', done) } catch { /* non-browser */ }
      signal?.removeEventListener('abort', onAbort)
    }
    const t = setTimeout(done, 15_000)
    try {
      globalThis.window?.addEventListener('online', done, { once: true })
      globalThis.addEventListener?.('online', done, { once: true })
    } catch { /* non-browser: the timeout resolves */ }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

// One sentence → { pcm, rate }. Picks the provider from the prefix: `nv:` is the NVIDIA relay
// (multipart POST, 1.6 s spacing); `oa:` is the customer's own service (JSON POST straight from
// the browser, no spacing imposed — its limits are unknown). Retry/offline logic is shared:
// 429 and 5xx wait and retry with `onRetry(seconds)`; a network failure or `navigator.onLine === false`
// reports `onRetry('offline')` and waits; a browser block (fetch TypeError while online) reports the
// pre-worded 'Couldn't reach …' message for the stage. 401/403/404 throw a sentence the customer can act on.
export async function cloudSynthesize(text, voiceId, { signal, onRetry } = {}) {
  if (String(voiceId).startsWith('gm:')) return geminiSynthesize(text, String(voiceId).slice(3), { signal, onRetry })
  if (String(voiceId).startsWith('oa:')) {
    for (let attempt = 0; ; attempt++) {
      if (signal?.aborted) throw signal.reason || new Error('Aborted')
      try {
        const r = await fetchOwnSpeech(text, voiceId, { signal })
        onRetry?.(null)
        return r
      } catch (e) {
        if (signal?.aborted) throw e
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false
        if (e instanceof TypeError || offline) {
          if (e instanceof TypeError && !offline) {
            const host = ownHost() || 'The voice service'
            onRetry?.(`Couldn't reach ${host} from the browser. Check the address; some services do not accept requests from a web page.`)
          } else {
            onRetry?.('offline')
          }
          await waitOnline(signal)
          continue
        }
        const status = e?.status
        if ((status === 429 || status >= 500) && attempt < 8) {
          const ms = retryMs(attempt)
          onRetry?.(Math.max(1, Math.round(ms / 1000)))
          await sleep(ms)
          continue
        }
        throw e
      }
    }
  }
  const { name, nv } = cloudVoiceInfo(voiceId)
  const full = String(voiceId).startsWith('nv:') ? String(voiceId).slice(3) : String(voiceId)
  void name
  const key = String(settings.get().nvidiaKey || '').trim()
  if (!isNvidiaKey(key)) throw new Error('NVIDIA did not accept the key. Check it in Settings.')
  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) throw signal.reason || new Error('Aborted')
    const gap = gapOf('nvidia') - (Date.now() - lastStart) // learnt from NVIDIA's own answers (voiceplan.js)
    if (gap > 0) await sleep(gap)
    lastStart = Date.now()
    const form = new FormData()
    form.append('text', String(text))
    form.append('language', nv)
    form.append('voice', full)
    form.append('encoding', 'LINEAR_PCM')
    form.append('sample_rate_hz', '22050')
    let res
    try {
      res = await fetch('/api/nvidia-tts/synthesize', { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: form, signal })
    } catch (e) {
      if (signal?.aborted) throw e
      if (e instanceof TypeError || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
        onRetry?.('offline')
        await waitOnline(signal)
        continue
      }
      throw e
    }
    if (res.ok) {
      onRetry?.(null)
      paced('nvidia', 'ok')
      countUse('voice', 'made')
      return parseWav(await res.arrayBuffer())
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      onRetry?.('offline')
      await waitOnline(signal)
      continue
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 8) {
      const told = (+res.headers.get('retry-after') || 0) * 1000 // the service's own word on how long, when it gives one
      const ms = Math.max(retryMs(attempt), told)
      if (res.status === 429) paced('nvidia', 'limited', told) // and asked less often from now on
      countUse('voice', res.status === 429 ? 'limited' : 'failed', { waited: res.status === 429 ? ms : 0 }) // how often NVIDIA asks for patience (usage.js)
      onRetry?.(Math.max(1, Math.round(ms / 1000)))
      await sleep(ms)
      continue
    }
    if (res.status === 401 || res.status === 403) throw Object.assign(new Error('NVIDIA did not accept the key. Check it in Settings.'), { status: res.status })
    const detail = await res.text().catch(() => '')
    throw Object.assign(new Error(detail.trim().slice(0, 300) || `NVIDIA error ${res.status}`), { status: res.status })
  }
}

// ── Gemini ────────────────────────────────────────────────────────────────────────────────────────────────────────
// One request: the text and a voice to Gemini's speech models (the Interactions API, as Google documents it, read
// 16 October 2026); a WAV comes back (24 kHz mono 16-bit). WHICH models is not written here: they are read from
// Google's own list for this key (geminiModels), so a new one is found and a retired one dropped by themselves.
// The one that last answered goes first (servicePlans.gemini.model); one this key cannot reach is passed over.
const GM_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions'
const GM_LIST = 'https://generativelanguage.googleapis.com/v1beta/models'
let gmStart = 0
const gmPlan = () => settings.get().servicePlans?.gemini || {}
const setGmPlan = change => settings.set({ servicePlans: { ...(settings.get().servicePlans || {}), gemini: { ...gmPlan(), ...change } } })

// The key's models that speak, from Google's list (once a day): newest version first, the full model before its
// lighter one, a release before a preview, the faster flash before pro (listening needs speed). → model names.
export const rankSpeechModels = names => [...names].sort((a, b) => {
  const ver = n => parseFloat((/gemini-(\d+(?:\.\d+)?)/.exec(n) || [])[1] || 0)
  const cost = n => (/lite/.test(n) ? 2 : 0) + (/pro/.test(n) ? 1 : 0) + (/preview/.test(n) ? 0.5 : 0)
  return ver(b) - ver(a) || cost(a) - cost(b) || a.localeCompare(b)
})
async function geminiModels(key, signal) {
  const plan = gmPlan()
  if (plan.models?.length && Date.now() - (plan.listedAt || 0) < DAY) return plan.models
  const found = []
  let token
  do {
    const res = await fetch(`${GM_LIST}?pageSize=200${token ? '&pageToken=' + token : ''}`, { headers: { 'x-goog-api-key': key }, signal })
    if (!res.ok) { if (plan.models?.length) return plan.models; throw Object.assign(new Error(res.status === 400 || res.status === 403 ? 'Gemini did not accept the key. Check it in Settings → AI.' : `Gemini error ${res.status}`), { status: res.status === 400 || res.status === 403 ? 401 : res.status }) }
    const out = await res.json()
    for (const m of out.models || []) if (/-tts/.test(m.name) && (m.supportedGenerationMethods || []).includes('generateContent')) found.push(m.name.replace(/^models\//, ''))
    token = out.nextPageToken
  } while (token)
  const models = rankSpeechModels(found)
  setGmPlan({ models, listedAt: Date.now() })
  return models
}

export async function geminiSpeech(text, voice, { signal } = {}) {
  const key = String(settings.get().geminiKey || '').trim()
  if (key.length < 20) throw Object.assign(new Error('Gemini did not accept the key. Check it in Settings → AI.'), { status: 401 })
  const listed = await geminiModels(key, signal)
  const learnt = gmPlan().model
  const spent = gmPlan().spent || {} // model → when its daily allowance comes back
  const fresh = listed.filter(m => !(spent[m] > Date.now()))
  if (!fresh.length) throw dailySpent(Math.min(...listed.map(m => spent[m] || Infinity)))
  const models = learnt && fresh.includes(learnt) ? [learnt, ...fresh.filter(m => m !== learnt)] : fresh
  let last = null
  for (const model of models) {
    const res = await fetch(GM_URL, {
      method: 'POST', signal,
      headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({ model, input: [{ type: 'user_input', content: [{ type: 'text', text: String(text) }] }], response_format: { type: 'audio' }, generation_config: { speech_config: [{ voice }] } }),
    })
    if (res.status === 404) { last = res; continue } // this model is not for this key, or retired: the next
    if (!res.ok) {
      const got = await res.json().catch(() => ({}))
      const err = (Array.isArray(got) ? got[0] : got)?.error || {} // this endpoint answers with a list: [{ error }]
      const msg = String(err.message || '')
      // Google says which limit and when it comes back: "limit: 10 requests per day on Free Tier. Please retry in
      // 11h54m20s" (16 October 2026). A DAY's allowance used up is not a moment's wait: this model is set aside until
      // then and the next of the key's models is asked at once (each has its own allowance).
      if (res.status === 429 && /per day/i.test(msg)) {
        setGmPlan({ spent: { ...(gmPlan().spent || {}), [model]: Date.now() + retryIn(msg, 3600_000) } })
        last = res
        continue
      }
      // A voice name Google no longer knows: dropped from the list (the names come from its documentation; there is
      // no list to read), and said as a voice that is not available, so the book asks for another
      if (res.status === 400 && /voice/i.test(msg) && !/api key/i.test(msg)) {
        setGmPlan({ gone: [...new Set([...(gmPlan().gone || []), voice])] })
        throw Object.assign(new Error('This voice is not available now.'), { status: 404 })
      }
      // Gemini refuses a wrong key with 400 (reason API_KEY_INVALID): that is the key, not this sentence
      if ((res.status === 400 || res.status === 403) && ((err.details || []).some(x => /API_KEY/.test(x.reason || '')) || /api key/i.test(msg))) throw Object.assign(new Error('Gemini did not accept the key. Check it in Settings → AI.'), { status: 401 })
      throw Object.assign(new Error(msg || `Gemini error ${res.status}`), { status: res.status, retryAfter: (+res.headers.get('retry-after') || 0) * 1000 })
    }
    const body = await res.json()
    const audio = (body.steps || []).filter(x => x.type === 'model_output').flatMap(x => x.content || []).filter(c => c.type === 'audio').pop()
    if (!audio?.data) throw Object.assign(new Error('Gemini gave no audio for this text.'), { status: 400 })
    if (learnt !== model) setGmPlan({ model })
    const bin = atob(audio.data)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return parseWav(bytes.buffer)
  }
  if (last?.status === 429) throw dailySpent(Math.min(...listed.map(m => gmPlan().spent?.[m] || Infinity)))
  throw Object.assign(new Error('This voice is not available now.'), { status: last?.status || 404 })
}

// "Please retry in 11h54m20s" → ms (fallback when it says nothing)
export function retryIn(msg, fallback) {
  const m = /retry in ((?:\d+h)?(?:\d+m)?(?:[\d.]+s)?)/i.exec(msg)
  if (!m || !m[1]) return fallback
  const n = u => +((new RegExp('([\\d.]+)' + u)).exec(m[1]) || [0, 0])[1]
  return ((n('h') * 60 + n('m')) * 60 + n('s')) * 1000 || fallback
}
const clock = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
// Every speech model of this key has used up today's free allowance: nothing is asked until the first comes back.
function dailySpent(until) {
  const back = Number.isFinite(until) ? until : Date.now() + 3600_000
  return Object.assign(new Error(`Gemini's free daily limit for its voices is used up until ${clock(back)}. Choose another voice to keep listening; this one goes on by itself after that.`), { status: 429, until: back })
}

// The same care as NVIDIA's: paced by what Google says (voiceplan.js), waiting out a "too many" or a busy moment,
// and waiting for the network rather than failing.
async function geminiSynthesize(text, voice, { signal, onRetry } = {}) {
  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) throw signal.reason || new Error('Aborted')
    const gap = gapOf('gemini') - (Date.now() - gmStart)
    if (gap > 0) await sleep(gap)
    gmStart = Date.now()
    try {
      const r = await geminiSpeech(text, voice, { signal })
      onRetry?.(null)
      paced('gemini', 'ok')
      countUse('gemini', 'made')
      return r
    } catch (e) {
      if (signal?.aborted) throw e
      if (e instanceof TypeError || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
        onRetry?.('offline')
        await waitOnline(signal)
        continue
      }
      if (e.until) { countUse('gemini', 'limited'); throw e } // the day's allowance: no point waiting here (voiceOne waits)
      if ((e.status === 429 || e.status >= 500) && attempt < 8) {
        const ms = Math.max(retryMs(attempt), e.retryAfter || 0)
        if (e.status === 429) paced('gemini', 'limited', e.retryAfter || 0)
        countUse('gemini', e.status === 429 ? 'limited' : 'failed', { waited: e.status === 429 ? ms : 0 })
        onRetry?.(Math.max(1, Math.round(ms / 1000)))
        await sleep(ms)
        continue
      }
      throw e
    }
  }
}
