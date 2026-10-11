// One door for AI text (M9): every text feature (translation, summaries, Ask) goes
// through here, so it works with the customer's chosen provider (Gemini or NVIDIA).
// AI narration (page images) stays in src/lib/gemini.js — it is Gemini-only.
import { settings } from './settings.js'

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const sleep = ms => new Promise(r => setTimeout(r, ms))

// ── pure helpers (node-tested in ai.test.js) ──────────────────────────────────
export const isGeminiKey = (key = '') => String(key).trim().length > 20
export const isNvidiaKey = (key = '') => {
  const k = String(key).trim()
  return k.startsWith('nvapi-') && k.length > 20
}

// Parse one buffer of an OpenAI server-sent-event stream (NVIDIA with stream: true).
// Pure: the caller keeps `rest` and prepends it to the next chunk. Returns the text
// pieces found, the incomplete trailing line to carry over, and whether [DONE] arrived.
// Lines that are not `data:` JSON (keep-alives, comments, truncated JSON) are skipped.
export function parseNvidiaSse(buf) {
  const s = String(buf)
  const endsWithNewline = s.endsWith('\n')
  const parts = s.split('\n')
  const complete = endsWithNewline ? parts.slice(0, -1) : parts.slice(0, -1)
  const rest = endsWithNewline ? '' : parts[parts.length - 1]
  const texts = []
  let done = false
  for (let line of complete) {
    if (line.endsWith('\r')) line = line.slice(0, -1)
    const t = line.trim()
    if (!t || !t.startsWith('data:')) continue
    const payload = t.slice(5).trim()
    if (payload === '[DONE]') { done = true; continue }
    let j
    try { j = JSON.parse(payload) } catch { continue }
    const c = j.choices?.[0]?.delta?.content
    if (c) texts.push(c)
  }
  return { texts, rest, done }
}

// ── provider state ────────────────────────────────────────────────────────────
export const providerName = () => (settings.get().aiProvider === 'nvidia' ? 'NVIDIA' : 'Gemini')

// A usable key for the CHOSEN provider. Gemini: today's rule. NVIDIA: an nvapi- key
// plus a chosen model (no default is invented — the customer picks one).
export function hasAiKey() {
  const s = settings.get()
  if (s.aiProvider === 'nvidia') return isNvidiaKey(s.nvidiaKey) && String(s.nvidiaModel || '').trim().length > 0
  return isGeminiKey(s.geminiKey)
}

// ── text (one reply) ──────────────────────────────────────────────────────────
async function geminiText({ prompt, system, json, signal, onRetry }) {
  const s = settings.get()
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    generationConfig: { temperature: 0.2, ...(json ? { responseMimeType: 'application/json' } : {}) },
  }
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${GEMINI_BASE}/models/${s.geminiModel}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': s.geminiKey, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
    if (res.ok) {
      onRetry?.(null)
      const r = await res.json()
      const text = r.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('')
      if (!text) throw new Error('Gemini returned no text')
      return text
    }
    const err = await res.json().catch(() => ({}))
    const msg = err.error?.message || `Gemini error ${res.status}`
    if ((res.status === 429 || res.status >= 500) && attempt < 8) {
      const retry = err.error?.details?.find(d => d.retryDelay)?.retryDelay
      const ms = retry ? parseFloat(retry) * 1000 + 500 : Math.min(60_000, 2000 * 2 ** attempt)
      onRetry?.(Math.max(1, Math.round(ms / 1000)))
      await sleep(ms)
      continue
    }
    throw Object.assign(new Error(msg), { status: res.status })
  }
}

async function nvidiaText({ prompt, system, json, signal, onRetry }) {
  const s = settings.get()
  const sys = json ? (system ? `${system}\n\nReply with JSON only.` : 'Reply with JSON only.') : (system || '')
  const body = {
    model: s.nvidiaModel,
    messages: [...(sys ? [{ role: 'system', content: sys }] : []), { role: 'user', content: prompt }],
    temperature: 0.2,
    stream: false,
  }
  for (let attempt = 0; ; attempt++) {
    const res = await fetch('/api/nvidia/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${String(s.nvidiaKey).trim()}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
    if (res.ok) {
      onRetry?.(null)
      const r = await res.json()
      const text = r.choices?.[0]?.message?.content || ''
      if (!text.trim()) throw new Error('NVIDIA returned no text')
      return text
    }
    const err = await res.json().catch(() => ({}))
    const msg = err.error?.message || err.detail || err.title || err.message || `NVIDIA error ${res.status}`
    if ((res.status === 429 || res.status >= 500) && attempt < 8) {
      const ms = Math.min(60_000, 2000 * 2 ** attempt)
      onRetry?.(Math.max(1, Math.round(ms / 1000)))
      await sleep(ms)
      continue
    }
    throw Object.assign(new Error(msg), { status: res.status })
  }
}

// One AI reply as a string. `json` means the caller will parse JSON: Gemini answers
// with a JSON mime type; NVIDIA gets a "Reply with JSON only." system instruction
// (no response-format parameter — not every model has it).
export async function aiText(opts) {
  return settings.get().aiProvider === 'nvidia' ? nvidiaText(opts) : geminiText(opts)
}

// ── streaming (Ask) ───────────────────────────────────────────────────────────
async function geminiStream({ system, messages, onText, signal, onRetry }) {
  const s = settings.get()
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    generationConfig: { temperature: 0.4 },
  })
  let res
  for (let attempt = 0; ; attempt++) {
    res = await fetch(`${GEMINI_BASE}/models/${s.geminiModel}:streamGenerateContent?alt=sse`, {
      method: 'POST', headers: { 'x-goog-api-key': s.geminiKey, 'content-type': 'application/json' }, body, signal,
    })
    if (res.ok) break
    const err = await res.json().catch(() => ({}))
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      const retry = err.error?.details?.find(d => d.retryDelay)?.retryDelay
      const ms = retry ? parseFloat(retry) * 1000 + 500 : 2000 * 2 ** attempt
      onRetry?.(Math.max(1, Math.round(ms / 1000)))
      await sleep(ms)
      continue
    }
    throw Object.assign(new Error(err.error?.message || `Gemini error ${res.status}`), { status: res.status })
  }
  onRetry?.(null)
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += value.replace(/\r/g, '')
    for (let k; (k = buf.indexOf('\n\n')) >= 0;) {
      const event = buf.slice(0, k)
      buf = buf.slice(k + 2)
      for (const line of event.split('\n')) {
        if (!line.startsWith('data:')) continue
        const j = JSON.parse(line.slice(5))
        const t = j.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('')
        if (t) onText(t)
      }
    }
  }
}

async function nvidiaStream({ system, messages, onText, signal, onRetry }) {
  const s = settings.get()
  const body = JSON.stringify({
    model: s.nvidiaModel,
    messages: [
      { role: 'system', content: system },
      ...messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
    ],
    temperature: 0.4,
    stream: true,
  })
  let res
  for (let attempt = 0; ; attempt++) {
    res = await fetch('/api/nvidia/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${String(s.nvidiaKey).trim()}`, 'content-type': 'application/json' },
      body, signal,
    })
    if (res.ok) break
    const err = await res.json().catch(() => ({}))
    const msg = err.error?.message || err.detail || err.title || err.message || `NVIDIA error ${res.status}`
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      const ms = 2000 * 2 ** attempt
      onRetry?.(Math.max(1, Math.round(ms / 1000)))
      await sleep(ms)
      continue
    }
    throw Object.assign(new Error(msg), { status: res.status })
  }
  onRetry?.(null)
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (value) buf += typeof value === 'string' ? value : decoder.decode(value, { stream: true })
    const r = parseNvidiaSse(buf)
    buf = r.rest
    for (const t of r.texts) onText(t)
    if (r.done) break
    if (done) break
  }
}

// Ask-style streaming. `system` is the instruction with the document; `messages` are
// [{ role: 'user' | 'assistant', content }] (history plus the new question).
export async function aiStream(opts) {
  return settings.get().aiProvider === 'nvidia' ? nvidiaStream(opts) : geminiStream(opts)
}

// ── models ────────────────────────────────────────────────────────────────────
// [{ id, name }] for the CHOSEN provider. NVIDIA: the ids its own key returns.
export async function listAiModels() {
  const s = settings.get()
  if (s.aiProvider === 'nvidia') {
    const res = await fetch('/api/nvidia/models', {
      headers: { authorization: `Bearer ${String(s.nvidiaKey).trim()}` },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw Object.assign(
        new Error(err.error?.message || err.detail || err.title || err.message || `NVIDIA error ${res.status}`),
        { status: res.status },
      )
    }
    const r = await res.json()
    return (r.data || []).map(m => ({ id: m.id, name: m.id }))
  }
  const { listModels } = await import('./gemini.js')
  return (await listModels(s.geminiKey.trim())).map(m => ({ id: m.id, name: m.label || m.id }))
}
