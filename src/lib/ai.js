// One door for AI text: translation, summaries and Ask all go through here, so they work with whichever
// provider the customer brings. Reading page images (AI narration) stays in src/lib/gemini.js: Gemini only.
//
// Two kinds of provider:
//   gemini  — Google's own API, called straight from the browser.
//   openai  — anything that speaks the OpenAI chat-completions protocol. NVIDIA is one (through Noesis's
//             relay, because NVIDIA refuses browser requests); "Other" is any address the customer types
//             (OpenRouter, Groq, OpenAI, a local Ollama…), called straight from the browser.
import { settings } from './settings.js'

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const sleep = ms => new Promise(r => setTimeout(r, ms))

// ── pure helpers (node-tested in ai.test.js) ──────────────────────────────────
export const isGeminiKey = (key = '') => String(key).trim().length > 20
export const isNvidiaKey = (key = '') => {
  const k = String(key).trim()
  return k.startsWith('nvapi-') && k.length > 20
}

// "https://openrouter.ai/api/v1/" → "https://openrouter.ai/api/v1"; '' when it is not an http(s) address.
export function cleanBase(url = '') {
  const u = String(url).trim().replace(/\/+$/, '').replace(/\/chat\/completions$/, '')
  return /^https?:\/\/[^\s/]+/i.test(u) ? u : ''
}
export const hostOf = url => (cleanBase(url).match(/^https?:\/\/([^/:]+)/i) || [])[1] || ''

// Reasoning models put their thinking in <think>…</think> before the answer; it must never be spoken or parsed.
export const stripThinking = text => String(text).replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^[\s\S]*<\/think>/, '').trim()

// The same for a stream of pieces, where a tag can be split across two pieces. Returns a function that takes
// a piece and gives back the part the listener may see; .flush() gives whatever was held back at the end.
export function thinkFilter() {
  const OPEN = '<think>', CLOSE = '</think>'
  let buf = ''
  let inside = false
  const held = tag => { for (let n = Math.min(tag.length - 1, buf.length); n > 0; n--) if (tag.startsWith(buf.slice(-n))) return n; return 0 }
  const push = piece => {
    buf += piece
    let out = ''
    for (;;) {
      const k = buf.indexOf(inside ? CLOSE : OPEN)
      if (k >= 0) {
        if (!inside) out += buf.slice(0, k)
        buf = buf.slice(k + (inside ? CLOSE : OPEN).length)
        inside = !inside
        continue
      }
      const keep = held(inside ? CLOSE : OPEN) // a tag may be arriving in halves
      if (!inside) out += buf.slice(0, buf.length - keep)
      buf = buf.slice(buf.length - keep)
      return out
    }
  }
  push.flush = () => { const t = inside ? '' : buf; buf = ''; return t }
  return push
}

// A long text cut into pieces of at most `max` characters, at paragraph ends where it can (a single
// paragraph longer than `max` is cut at a sentence end, else hard).
export function splitText(text, max) {
  const out = []
  let cur = ''
  const push = piece => {
    if (cur && cur.length + piece.length + 1 > max) { out.push(cur); cur = '' }
    cur = cur ? cur + '\n' + piece : piece
  }
  for (const para of String(text).split('\n')) {
    if (para.length <= max) { push(para); continue }
    for (let rest = para; rest;) {
      let cut = rest.length <= max ? rest.length : rest.lastIndexOf('. ', max) + 1
      if (cut <= max * 0.5) cut = Math.min(rest.length, max)
      push(rest.slice(0, cut).trim())
      rest = rest.slice(cut)
    }
  }
  if (cur) out.push(cur)
  return out
}

// What an OpenAI-style error means for the customer, in words they can act on.
export function explainError(status, detail, name) {
  if (status === 401 || status === 403) return `${name} did not accept the key. Check it in Settings.`
  if (status === 404 || status === 410) return `This model is not available for your ${name} account. Choose another in Settings.`
  if (status === 400 && /multimodal|image|vision/i.test(detail || '')) return 'This model cannot read page images. Choose another in Settings.'
  return detail || `${name} error ${status}`
}

// Parse one buffer of an OpenAI server-sent-event stream. Pure: the caller keeps `rest` and prepends it to
// the next chunk. Returns the text pieces found, the incomplete trailing line, and whether [DONE] arrived.
// Lines that are not `data:` JSON (keep-alives, comments) are skipped.
export function parseSse(buf) {
  const parts = String(buf).split('\n')
  const rest = parts.pop()
  const texts = []
  let done = false
  for (const raw of parts) {
    const t = raw.trim()
    if (!t.startsWith('data:')) continue
    const payload = t.slice(5).trim()
    if (payload === '[DONE]') { done = true; continue }
    let j
    try { j = JSON.parse(payload) } catch { continue } // not JSON: a keep-alive or comment line, by the protocol
    const c = j.choices?.[0]?.delta?.content
    if (c) texts.push(c)
  }
  return { texts, rest, done }
}

// ── the chosen provider ───────────────────────────────────────────────────────
export const PROVIDERS = [
  { id: 'gemini', label: 'Gemini' },
  { id: 'nvidia', label: 'NVIDIA' },
  { id: 'custom', label: 'Other' },
]

export function provider(s = settings.get()) {
  if (s.aiProvider === 'nvidia') return { id: 'nvidia', kind: 'openai', name: 'NVIDIA', base: '/api/nvidia', key: String(s.nvidiaKey || '').trim(), model: s.nvidiaModel || '' }
  if (s.aiProvider === 'custom') return { id: 'custom', kind: 'openai', name: hostOf(s.customBase) || 'your provider', base: cleanBase(s.customBase), key: String(s.customKey || '').trim(), model: String(s.customModel || '').trim() }
  return { id: 'gemini', kind: 'gemini', name: 'Gemini', key: String(s.geminiKey || '').trim(), model: s.geminiModel }
}
export const providerName = () => provider().name
// How much of a book fits in one question. Gemini reads a whole book; most other models hold far less, and
// a question that overflows fails outright, so they get a window around the listener's place.
export const contextChars = () => (provider().kind === 'gemini' ? 600_000 : 60_000)

// Enough to make a request with the CHOSEN provider: a key, and (NVIDIA, other) a model, which chooseModel picks
// from the ones the key answers when the customer has not.
export function hasAiKey(s = settings.get()) {
  const p = provider(s)
  if (p.id === 'gemini') return isGeminiKey(p.key)
  if (p.id === 'nvidia') return isNvidiaKey(p.key) && !!p.model
  return !!p.base && !!p.model // a local server needs no key
}

// ── requests ──────────────────────────────────────────────────────────────────
// Retries 429 and 5xx with backoff, telling the caller how long the wait is (null when clear).
async function withRetry(send, { tries, onRetry, delayOf }) {
  for (let attempt = 0; ; attempt++) {
    const res = await send()
    if (res.ok) { onRetry?.(null); return res }
    const err = await res.json().catch(() => ({})) // an error body that is not JSON still has a status
    if ((res.status === 429 || res.status >= 500) && attempt < tries) {
      const ms = delayOf?.(err) ?? Math.min(60_000, 2000 * 2 ** attempt)
      onRetry?.(Math.max(1, Math.round(ms / 1000)))
      await sleep(ms)
      // The wait is over and the question goes again: the countdown is no longer true. It stayed on screen ("retrying
      // in about 2 s") for the whole of the next request, a minute and more on a busy free account (15 October 2026).
      onRetry?.(null)
      continue
    }
    throw Object.assign(new Error('request failed'), { status: res.status, body: err })
  }
}

const geminiDelay = err => { const r = err.error?.details?.find(d => d.retryDelay)?.retryDelay; return r ? parseFloat(r) * 1000 + 500 : null }
const geminiFail = e => (e.body ? Object.assign(new Error(e.body.error?.message || `Gemini error ${e.status}`), { status: e.status }) : e)

function openaiFail(e, p) {
  if (e.body) {
    const b = e.body
    return Object.assign(new Error(explainError(e.status, b.error?.message || b.detail || b.title || b.message || (typeof b.error === 'string' ? b.error : ''), p.name)), { status: e.status })
  }
  // fetch itself failed: for an address the customer typed, the usual cause is that the provider refuses web pages
  if (e instanceof TypeError && p.id === 'custom') return new Error(`Couldn't reach ${p.name} from the browser. Check the address; some providers do not accept requests from a web page.`)
  return e
}

const openaiHeaders = p => ({ 'content-type': 'application/json', ...(p.key ? { authorization: `Bearer ${p.key}` } : {}) })

// Models that think in private before answering, and can be told not to. Nemotron 3 Super thought for 12 s and
// more before its first word of a two-line translation, minutes on a long one; told not to, it answered in 0.5 s
// with the same Hindi (measured on NVIDIA, 15 October 2026). Only where it was measured to work: Step 5 told the
// same rambled, Nemotron 3 Nano Omni gave no answer, gpt-oss ignores it.
const NO_THINKING = /nemotron-3-super|nemotron-3\.5-lightning/i
const quick = p => (p.id === 'nvidia' && NO_THINKING.test(p.model) ? { chat_template_kwargs: { enable_thinking: false } } : {})

// One reply as a string.
//   parts  — instead of `prompt`: [{ text } | { image: 'data:image/jpeg;base64,…' }] in order, for a model
//            that reads page images.
//   json   — the caller will parse JSON. Gemini is told by mime type (and `schema` when given); an OpenAI-style
//            provider is told in words, with `shape` describing the JSON, since not every model has a JSON mode.
export async function aiText({ prompt, parts, system, json, schema, shape, signal, onRetry }) {
  const p = provider()
  const pieces = parts || [{ text: prompt }]
  if (p.kind === 'gemini') {
    const body = JSON.stringify({
      contents: [{ role: 'user', parts: pieces.map(x => (x.image ? { inline_data: { mime_type: x.image.slice(5, x.image.indexOf(';')), data: x.image.slice(x.image.indexOf(',') + 1) } } : { text: x.text })) }],
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      generationConfig: { temperature: 0.2, ...(json ? { responseMimeType: 'application/json', ...(schema ? { responseSchema: schema } : {}) } : {}) },
    })
    const res = await withRetry(() => fetch(`${GEMINI_BASE}/models/${p.model}:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': p.key, 'content-type': 'application/json' }, body, signal }),
      { tries: 8, onRetry, delayOf: geminiDelay }).catch(e => { throw geminiFail(e) })
    const r = await res.json()
    const text = r.candidates?.[0]?.content?.parts?.map(x => x.text || '').join('')
    if (!text) throw new Error(r.promptFeedback?.blockReason ? `Gemini declined: ${r.promptFeedback.blockReason}` : 'Gemini returned no text')
    return text
  }
  const sys = [system, json ? `Reply with JSON only${shape ? `, in exactly this shape: ${shape}` : ''}. No explanation, no code fence.` : ''].filter(Boolean).join('\n\n')
  // Streamed, as Ask is: the answer starts flowing at once. Waited for whole, a long answer from a busy free
  // account took more than the 100 s the site's relay (Cloudflare) holds a silent line open: cut off (HTTP 524),
  // asked again, cut off again, while the screen blamed the quota (15 October 2026).
  const body = JSON.stringify({ model: p.model, temperature: 0.2, stream: true, ...quick(p), messages: [...(sys ? [{ role: 'system', content: sys }] : []), { role: 'user', content: parts ? pieces.map(x => (x.image ? { type: 'image_url', image_url: { url: x.image } } : { type: 'text', text: x.text })) : prompt }] })
  const res = await withRetry(() => fetch(`${p.base}/chat/completions`, { method: 'POST', headers: openaiHeaders(p), body, signal }), { tries: 8, onRetry })
    .catch(e => { throw openaiFail(e, p) })
  let whole = ''
  if (/event-stream/i.test(res.headers.get('content-type') || '')) {
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
    for (let buf = ''; ;) {
      const { done, value } = await reader.read()
      const r = parseSse(buf + (value || '') + (done ? '\n' : ''))
      buf = r.rest
      whole += r.texts.join('')
      if (r.done || done) break
    }
  } else whole = (await res.json()).choices?.[0]?.message?.content || '' // a provider that answers in one piece anyway
  const text = stripThinking(whole)
  if (!text) throw new Error(`${p.name} returned no text`)
  return text
}

// Ask-style streaming. `system` is the instruction with the document; `messages` are
// [{ role: 'user' | 'assistant', content }] (history plus the new question).
export async function aiStream({ system, messages, onText, signal, onRetry }) {
  const p = provider()
  if (p.kind === 'gemini') {
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: { temperature: 0.4 },
    })
    const res = await withRetry(() => fetch(`${GEMINI_BASE}/models/${p.model}:streamGenerateContent?alt=sse`, { method: 'POST', headers: { 'x-goog-api-key': p.key, 'content-type': 'application/json' }, body, signal }),
      { tries: 3, onRetry, delayOf: geminiDelay }).catch(e => { throw geminiFail(e) })
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
          const t = JSON.parse(line.slice(5)).candidates?.[0]?.content?.parts?.map(x => x.text || '').join('')
          if (t) onText(t)
        }
      }
    }
    return
  }
  const body = JSON.stringify({ model: p.model, temperature: 0.4, stream: true, ...quick(p), messages: [{ role: 'system', content: system }, ...messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))] })
  const res = await withRetry(() => fetch(`${p.base}/chat/completions`, { method: 'POST', headers: openaiHeaders(p), body, signal }), { tries: 3, onRetry })
    .catch(e => { throw openaiFail(e, p) })
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buf = ''
  const visible = thinkFilter() // a reasoning model streams <think>…</think> first: not for the listener
  for (;;) {
    const { done, value } = await reader.read()
    const r = parseSse(buf + (value || '') + (done ? '\n' : ''))
    buf = r.rest
    for (const piece of r.texts) { const t = visible(piece); if (t) onText(t) }
    if (r.done || done) { const t = visible.flush(); if (t) onText(t) }
    if (r.done || done) break
  }
}

// [{ id, name }] the chosen provider's key can see. For an OpenAI-style provider this is what its /models
// returns: NOT a promise that each one works (measured on NVIDIA: listed models that answer 404).
export async function listAiModels() {
  const p = provider()
  if (p.kind === 'gemini') {
    const { listModels } = await import('./gemini.js')
    return (await listModels(p.key)).map(m => ({ id: m.id, name: m.label || m.id }))
  }
  const res = await fetch(`${p.base}/models`, { headers: openaiHeaders(p) }).catch(e => { throw openaiFail(e, p) })
  if (!res.ok) throw openaiFail({ status: res.status, body: await res.json().catch(() => ({})) }, p)
  return ((await res.json()).data || []).map(m => ({ id: m.id, name: m.id })).sort((a, b) => a.id.localeCompare(b.id))
}

// A question a model answers in a few words. (Measured: one NVIDIA model returns an empty reply to
// "Reply with the single word: ready" yet translates well, so the check asks something ordinary.)
const CHECK_QUESTION = 'What is two plus two? Answer in one short sentence.'

// Does the chosen model answer, and how fast? One tiny request. → { seconds } or throws with the reason.
export async function testModel() {
  const t0 = performance.now()
  await aiText({ prompt: CHECK_QUESTION })
  return { seconds: (performance.now() - t0) / 1000 }
}

// A key is saved but no model is chosen: what every place says then, instead of "add a key".
export function keyWithoutModel(s = settings.get()) {
  const p = provider(s)
  return p.kind === 'openai' && !p.model && (p.id === 'nvidia' ? isNvidiaKey(p.key) : !!p.base)
}

// Which model to use, from the ones the key answers. "No default is invented" (M9) stays true: nothing is chosen
// by a name written here; a name only decides the order among models that really answered this key. Saved, the
// key did nothing ("even though the key exists and is saved, the entire Noesis doesn't recognise it", Tharun,
// 15 October 2026: 81 models listed, 12 answering, none chosen).
// Not for talking with or writing: these answer, but as a guard, a reader of pages, a translator, a drawer.
const NOT_FOR_TALK = /guard|safety|parse|translate|embed|rerank|reward|diffusion|vision|vlm|ocr|retriev|clip|code|coder|laguna|kosmos|deplot|paligemma|vila|neva/i
// Of those that talk, the ones that reason and write best come first; ties and the rest go fastest first.
const LIKED = [/nemotron-3-super/i, /gpt-oss-120b/i, /llama-3\.3-70b/i, /nemotron.*ultra/i, /deepseek/i, /qwen/i, /gpt-oss/i, /nemotron-3\.5/i, /nemotron/i, /step-/i, /kimi/i, /mistral/i, /llama/i]
export function rankModels(ids, seconds = {}) {
  const like = id => { const k = LIKED.findIndex(r => r.test(id)); return k < 0 ? LIKED.length : k }
  return ids.filter(id => !NOT_FOR_TALK.test(id)).sort((a, b) => like(a) - like(b) || (seconds[a] ?? 99) - (seconds[b] ?? 99))
}
const PROBE = 6 // models asked, best first, when the key has not been checked: the first that answers is chosen
let choosing = null
export function chooseModel() {
  choosing ||= (async () => {
    const s = settings.get(), p = provider(s)
    if (!keyWithoutModel(s)) return null
    const checked = s.modelChecks?.[p.id] || []
    const secs = Object.fromEntries(checked.map(c => [c.id, c.s]))
    let pick = rankModels(checked.map(c => c.id), secs)[0] // a check already made: no request at all
    if (!pick) {
      const found = await checkModels(rankModels((await listAiModels()).map(m => m.id)).slice(0, PROBE))
      pick = rankModels(found.map(f => f.id), Object.fromEntries(found.map(f => [f.id, f.s])))[0]
    }
    if (pick && keyWithoutModel()) settings.set({ [p.id === 'nvidia' ? 'nvidiaModel' : 'customModel']: pick })
    return pick || null
  })().catch(() => null).finally(() => { choosing = null })
  return choosing
}

// Which of the listed models answer, and how fast. A provider's list is not a list of models that work
// (measured on a free NVIDIA account: 10 of 45 chat models answered), so the customer should not have to
// find out one by one. One tiny request each, in turn, slow enough for a free account's limit; a model
// slower than 12 s counts as not usable. onProgress({ checked, total, working }) → [{ id, s }], fastest first.
const CHECK_TIMEOUT_MS = 12_000
const CHECK_GAP_MS = 1_600 // under 40 requests a minute
export async function checkModels(ids, { onProgress, signal } = {}) {
  const p = provider()
  const working = []
  for (let i = 0, again = false; i < ids.length && !signal?.aborted; i++) {
    const t0 = performance.now()
    const res = await fetch(`${p.base}/chat/completions`, {
      method: 'POST', headers: openaiHeaders(p), signal: AbortSignal.any([AbortSignal.timeout(CHECK_TIMEOUT_MS), ...(signal ? [signal] : [])]),
      body: JSON.stringify({ model: ids[i], max_tokens: 40, temperature: 0, stream: false, messages: [{ role: 'user', content: CHECK_QUESTION }] }),
    }).catch(() => null) // unreachable, refused, or slower than the limit: all mean "not usable now"
    if (res?.status === 429 && !again) { again = true; i--; await sleep(20_000); continue } // the account's limit: wait, ask once more
    again = false
    // Answering means words came back: the reply itself, or the thinking of a reasoning model that ran out of room.
    const m = res?.ok ? (await res.json().catch(() => null))?.choices?.[0]?.message : null
    if (m && (m.content || m.reasoning_content || m.reasoning)) working.push({ id: ids[i], s: Math.round((performance.now() - t0) / 100) / 10 })
    onProgress?.({ checked: i + 1, total: ids.length, working: working.length })
    await sleep(CHECK_GAP_MS)
  }
  return working.sort((a, b) => a.s - b.s)
}
