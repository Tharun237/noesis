// NVIDIA Magpie cloud voices (M10): the customer brings the voice with their own free NVIDIA key.
// A cloud voice produces the same stored audio as a Piper voice; only where the samples come from differs.
import { LANGS } from './lang.js'
import { settings } from './settings.js'
import { isNvidiaKey } from './ai.js'

export const isCloudVoice = (id = '') => typeof id === 'string' && id.startsWith('nv:')

// 'nv:Magpie-Multilingual.HI-IN.Sofia' → { name: 'Sofia', nv: 'hi-IN', lang: 'hi' }.
// The middle part is mapped back to a LANGS key (case-insensitive); unknown codes keep their text.
export function cloudVoiceInfo(id = '') {
  const full = String(id).startsWith('nv:') ? String(id).slice(3) : String(id)
  const parts = full.split('.')
  const code = parts.length >= 2 ? parts[1] : ''
  const name = parts.length >= 3 ? parts.slice(2).join('.') : full
  const found = Object.entries(LANGS).find(([, v]) => v.nv && v.nv.toLowerCase() === String(code).toLowerCase())
  const lang = found ? found[0] : 'en'
  const nv = found ? found[1].nv : code
  return { name, nv, lang }
}

// 16-bit mono PCM WAV → { pcm: Float32Array, rate }. Finds the `data` chunk; does not assume byte 44.
export function parseWav(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const str = o => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3])
  if (bytes.length < 44 || str(0) !== 'RIFF' || str(8) !== 'WAVE') throw new Error('Not a WAV file')
  let rate = 0
  let pcm = null
  let o = 12
  while (o + 8 <= bytes.length) {
    const id = str(o)
    const size = v.getUint32(o + 4, true)
    const body = o + 8
    if (id === 'fmt ') {
      const format = v.getUint16(body, true)
      const channels = v.getUint16(body + 2, true)
      rate = v.getUint32(body + 4, true)
      const bits = v.getUint16(body + 14, true)
      if (format !== 1 || channels !== 1 || bits !== 16) throw new Error('Only 16-bit mono PCM WAV is supported')
    } else if (id === 'data') {
      const n = Math.floor(size / 2)
      pcm = new Float32Array(n)
      for (let i = 0; i < n; i++) pcm[i] = v.getInt16(body + i * 2, true) / 0x8000
      break
    }
    o = body + size + (size % 2)
  }
  if (!pcm || !rate) throw new Error('No audio found in the WAV file')
  return { pcm, rate }
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
let lastStart = 0 // module-level: requests start at least 1.6 s apart (about 40 a minute)

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

// One sentence → { pcm, rate }. Multipart POST; 1.6 s spacing; retries 429/5xx with the ai.js backoff
// and offline with an `online`-event wait. 401/403/404 throw a sentence the customer can act on.
export async function cloudSynthesize(text, voiceId, { signal, onRetry } = {}) {
  const { name, nv } = cloudVoiceInfo(voiceId)
  const full = String(voiceId).startsWith('nv:') ? String(voiceId).slice(3) : String(voiceId)
  void name
  const key = String(settings.get().nvidiaKey || '').trim()
  if (!isNvidiaKey(key)) throw new Error('NVIDIA did not accept the key. Check it in Settings.')
  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) throw signal.reason || new Error('Aborted')
    const gap = 1600 - (Date.now() - lastStart)
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
      return parseWav(await res.arrayBuffer())
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      onRetry?.('offline')
      await waitOnline(signal)
      continue
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 8) {
      const ms = Math.min(60_000, 2000 * 2 ** attempt)
      onRetry?.(Math.max(1, Math.round(ms / 1000)))
      await sleep(ms)
      continue
    }
    if (res.status === 401 || res.status === 403) throw Object.assign(new Error('NVIDIA did not accept the key. Check it in Settings.'), { status: res.status })
    const detail = await res.text().catch(() => '')
    throw Object.assign(new Error(detail.trim().slice(0, 300) || `NVIDIA error ${res.status}`), { status: res.status })
  }
}
