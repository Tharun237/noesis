// Gemini (bring-your-own-key). Called straight from the browser; the key never touches a Noesis server.
// Docs: https://ai.google.dev/api/generate-content
import { renderPage } from '../ingest/pdf.js'
import { aiText, aiStream, contextChars, splitText, provider } from './ai.js'

const BASE = 'https://generativelanguage.googleapis.com/v1beta'
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function api(path, key, body, signal, onRetry) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(BASE + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'x-goog-api-key': key, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal,
    })
    if (res.ok) return res.json()
    const err = await res.json().catch(() => ({}))
    const msg = err.error?.message || `Gemini error ${res.status}`
    // Free-tier rate limits are normal for long documents: wait as long as Google asks, then retry.
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

export async function listModels(key) {
  const out = []
  let token = ''
  do {
    const r = await api(`/models?pageSize=200${token ? '&pageToken=' + token : ''}`, key)
    out.push(...(r.models || []))
    token = r.nextPageToken
  } while (token)
  return out
    .filter(m => m.supportedGenerationMethods?.includes('generateContent') && /gemini/.test(m.name) && !/tts|image|embedding|live|audio/.test(m.name))
    .map(m => ({ id: m.name.replace(/^models\//, ''), label: m.displayName || m.name }))
}

const BLOCKS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    blocks: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { k: { type: 'STRING', enum: ['h', 'p', 'fig', 'table', 'math', 'code'] }, text: { type: 'STRING' } },
        required: ['k', 'text'],
      },
    },
  },
  required: ['blocks'],
}

const BLOCKS_SHAPE = '{"blocks":[{"k":"h" for a heading, "p" for a paragraph, "fig", "table", "math" or "code","text":"..."}]}'
// A reply that should be { blocks: [...] }, possibly inside a json code fence.
function parseBlocks(raw) {
  let s = String(raw).trim()
  const fence = s.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/)
  if (fence) s = fence[1].trim()
  return JSON.parse(s).blocks.filter(b => b.text?.trim())
}

const NARRATE = `You are preparing a document to be LISTENED to as audio, like a professional audiobook narrator would.
You get some pages as images plus their extracted text layer. Output ONLY the narration for these pages, in reading order, as blocks.

Body text (k="p"): keep the author's exact wording. Only fix extraction damage: broken hyphenation, ligatures, interleaved columns.
Headings (k="h"): section titles only, without numbering like "3.2".
Remove entirely: running headers/footers, page numbers, line numbers, author affiliations and emails, inline citation markers like [12] or "(Smith et al., 2020)" when they interrupt flow (keep names that are the subject of a sentence), footnote markers, URLs, DOIs, copyright boilerplate, the reference list / bibliography.
Figures (k="fig"): "Figure N." then 1-3 sentences describing what it shows and its key takeaway, using the image and caption.
Tables (k="table"): "Table N." then 1-3 sentences on what is compared and the headline result. Never read cells one by one.
Math: inline math is spoken naturally in words inside the sentence ("x squared plus y squared"). Display equations (k="math"): speak them in words; if long, say what the equation expresses instead.
Code (k="code"): one sentence on what the code does.
If the first block continues a sentence from the previous page, start with those words as k="p". If the last sentence continues onto the next page, stop at the last word on these pages.
Never add commentary, never summarise body text, never invent content.`

// AI narration for PDFs: Gemini sees each page as an image (figures, tables, math) plus its text layer.
// Pages go in small windows so any book length works and each response stays well under output limits.
export async function narratePdf({ pdf, pageText, key, model, onProgress, signal, onRetry }) {
  const WINDOW = provider().kind === 'gemini' ? 5 : 2 // other providers take smaller requests: fewer page images at a time
  const out = []
  const failed = []
  for (let start = 1; start <= pdf.numPages; start += WINDOW) {
    const end = Math.min(pdf.numPages, start + WINDOW - 1)
    const parts = [{ text: `${NARRATE}\n\nThese are pages ${start}-${end} of ${pdf.numPages}.` }]
    for (let n = start; n <= end; n++) {
      const img = await renderPage(pdf, n, 1100)
      parts.push({ image: img })
      parts.push({ text: `--- Text layer of page ${n} ---\n${pageText[n - 1] || '(no text layer: scanned page, read it from the image)'}` })
    }
    try {
      const blocks = parseBlocks(await aiText({ parts, json: true, schema: BLOCKS_SCHEMA, shape: BLOCKS_SHAPE, signal, onRetry }))
      onRetry?.(null)
      // Stitch a paragraph that was cut by the window boundary back together.
      const last = out[out.length - 1]
      if (last?.k === 'p' && blocks[0]?.k === 'p' && !/[.!?:"”)]$/.test(last.text.trim())) {
        last.text = last.text.trim() + ' ' + blocks.shift().text.trim()
      }
      out.push(...blocks)
    } catch (e) {
      if (signal?.aborted || e.status === 400 || e.status === 401 || e.status === 403) throw e
      failed.push([start, end]) // keep going; caller falls back to rule-based text for these pages
      out.push({ k: 'gap', from: start, to: end })
    }
    onProgress?.(end / pdf.numPages)
  }
  return { blocks: out, failed }
}

const SUMMARY = {
  long: `Write a detailed spoken summary of this document for someone listening instead of reading.
Aim for roughly 12-15% of the original length (at most about 9000 words). Follow the document's own structure with short section headings (k="h").
Keep the key arguments, evidence, numbers, definitions, examples and conclusions. Explain figures and tables in words. Write for the ear: clear, flowing sentences, no bullet symbols, no markdown.`,
  short: `Write a short spoken summary of this document for someone listening instead of reading.
Aim for about 3-5% of the original length (roughly 300-1500 words). Start with one sentence on what the document is and its main claim, then the key points and conclusions.
Write for the ear: clear, flowing sentences, no bullet symbols, no markdown. Use k="h" only for 2-6 short section headings.`,
}

export async function summarize({ text, title, mode, key, model, signal, onRetry }) {
  // Summaries work with either provider: the prompt and the block output are unchanged,
  // only the door (aiText) picks the provider chosen in Settings.
  // A book larger than the model can read at once is condensed part by part first; the summary is then
  // written from those notes. (Gemini reads a whole book; most other models hold a few dozen pages.)
  const max = contextChars()
  if (text.length > max) {
    const parts = splitText(text, Math.floor(max * 0.8))
    const words = Math.max(80, Math.floor((max * 0.7) / parts.length / 6))
    const notes = []
    for (let i = 0; i < parts.length; i++) {
      notes.push(await aiText({ prompt: `Condense this part (${i + 1} of ${parts.length}) of "${title}" for someone who will not read it: every main point, argument, name and number that matters, in plain paragraphs, in the language of the text. At most ${words} words.\n\n=== PART ===\n${parts[i]}`, signal, onRetry }))
    }
    text = notes.join('\n\n')
  }
  const raw = await aiText({ prompt: `${SUMMARY[mode]}\n\nTitle: ${title}\n\n=== DOCUMENT ===\n${text}`, json: true, schema: BLOCKS_SCHEMA,
    shape: BLOCKS_SHAPE, signal, onRetry })
  return parseBlocks(raw)
}

// ── Ask about this document (streaming) ──────────────────────────────────────────────
const ASK = `You are Noesis, a study companion. The user is LISTENING to the document below and asking about it.
Answer accurately and concisely from the document, naming the section when it helps. If the document does not cover it, say so, then answer from general knowledge and label it as such.
Your answer may be read aloud: write plain, flowing sentences. Avoid tables and heavy markdown; use short lists only when they truly help.
Answer in the language the user asks in.`

// ponytail: very long books are windowed around the listener's position (plus the full outline)
// so each question stays within free-tier token limits; raise MAX_CONTEXT if quotas allow.
const MAX_CONTEXT = 600_000
export function askContext(blocks, starts, at, max = MAX_CONTEXT) {
  const outline = blocks.map((b, bi) => (b.k === 'h' ? `[${starts[bi]}] ${b.s.join(' ')}` : null)).filter(Boolean).join('\n')
  const lines = blocks.map(b => (b.k === 'h' ? `\n## ${b.s.join(' ')}\n` : b.s.join(' ')))
  const full = lines.join('\n')
  if (full.length <= max) return full
  const atBlock = Math.max(0, starts.findLastIndex(s => s <= at))
  let lo = atBlock, hi = atBlock, size = 0
  while (size < max && (lo > 0 || hi < lines.length - 1)) {
    if (hi < lines.length - 1) size += lines[++hi].length
    if (lo > 0 && size < max) size += lines[--lo].length
  }
  return `OUTLINE (whole book):\n${outline}\n\nEXCERPT around the listener's position:\n${lines.slice(lo, hi + 1).join('\n')}`
}

export async function askStream({ key, model, title, context, history, question, nowHearing, onText, signal, onRetry }) {
  // Ask works with either provider: the system prompt, history and question are unchanged,
  // only the door (aiStream) picks Gemini or NVIDIA from Settings.
  const system = `${ASK}\n\nTitle: ${title}\n\n=== DOCUMENT ===\n${context}`
  const messages = [
    ...history.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })),
    { role: 'user', content: nowHearing ? `${question}\n\n(I am currently listening to: "${nowHearing}")` : question },
  ]
  return aiStream({ system, messages, onText, signal, onRetry })
}
