// Translation into another listening language (M8). Pure helpers run in Node tests;
// translateBlocks sends each chunk through the AI door (src/lib/ai.js), so it works
// with either provider (Gemini or NVIDIA).
import { LANGS } from './lang.js'
import { aiText } from './ai.js'

// Block kinds that are descriptions of non-text (figures, tables, equations, code):
// they are kept unchanged and never sent for translation.
const SKIP = new Set(['code', 'math', 'table', 'fig'])

// Block indexes grouped into chunks of at most maxChars characters. A chunk never
// splits a block; skipped kinds never appear. Pure.
export function chunkBlocks(blocks, maxChars = 6000) {
  const chunks = []
  let cur = []
  let size = 0
  blocks.forEach((b, i) => {
    if (!b || SKIP.has(b.k) || !(b.text || '').trim()) return
    const len = (b.text || '').length
    if (cur.length && size + len > maxChars) { chunks.push(cur); cur = []; size = 0 }
    cur.push(i)
    size += len
  })
  if (cur.length) chunks.push(cur)
  return chunks
}

// The instruction plus a JSON array of the texts. Pure.
export function buildPrompt(texts, languageName) {
  return `Translate each item below into natural, fluent ${languageName} for listening aloud. The listener hears this read by a voice, so write for the ear: clear, flowing sentences.

The items are a JSON array of ${texts.length} strings. Return ONLY a JSON array of strings with exactly the same number of items (${texts.length}) in the same order — no fences, no commentary, no extra keys.

Write people's names, place names and technical terms in ${languageName} script the way a ${languageName} speaker would say them (the voice cannot pronounce Latin letters well); keep numbers as digits; do not add, remove, merge or explain anything.

=== ITEMS ===
${JSON.stringify(texts)}`
}

// The model's reply back into strings. Accepts a reply wrapped in a ```json fence.
// Pure.
export function parseReply(text, expected) {
  let s = String(text).trim()
  const fence = s.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/)
  if (fence) s = fence[1].trim()
  let parsed
  try {
    parsed = JSON.parse(s)
  } catch {
    throw new Error(`The translation came back with 0 items instead of ${expected}.`)
  }
  if (!Array.isArray(parsed) || parsed.some(x => typeof x !== 'string')) {
    throw new Error(`The translation came back with ${Array.isArray(parsed) ? parsed.length : 0} items instead of ${expected}.`)
  }
  if (parsed.length !== expected) {
    throw new Error(`The translation came back with ${parsed.length} items instead of ${expected}.`)
  }
  return parsed
}

// One AI request per chunk through the provider door: same prompt, same JSON-array
// contract, same onRetry (seconds to wait, null when clear) for either provider.
async function requestTexts({ prompt, signal, onRetry }) {
  return aiText({ prompt, json: true, signal, onRetry })
}

// New blocks: one output block per input block, same order, same kind and page;
// skipped kinds keep their text. One request per chunk, in order. A chunk whose
// reply fails parseReply is retried once as two halves; a second failure throws.
// onProgress(done / total) counts characters translated. saved (Map chunkIndex →
// strings) skips finished chunks; onChunk(index, strings) reports each chunk.
export async function translateBlocks(blocks, target, opts = {}) {
  const { onProgress, signal, onRetry, saved, onChunk } = opts
  const languageName = LANGS[target]?.name || target
  const chunks = chunkBlocks(blocks)
  const total = chunks.flat().reduce((a, i) => a + (blocks[i].text || '').length, 0)
  if (!chunks.length) return blocks.map(b => ({ ...b }))
  const results = new Array(chunks.length)
  let done = 0
  for (let ci = 0; ci < chunks.length; ci++) {
    const idx = chunks[ci]
    const texts = idx.map(i => blocks[i].text)
    const prev = saved?.get?.(ci)
    let strings
    if (Array.isArray(prev) && prev.length === idx.length && prev.every(x => typeof x === 'string')) {
      strings = prev
    } else {
      const raw = await requestTexts({ prompt: buildPrompt(texts, languageName), signal, onRetry })
      try {
        strings = parseReply(raw, texts.length)
      } catch (e) {
        if (idx.length < 2) throw e
        const mid = Math.ceil(idx.length / 2)
        const first = await requestTexts({ prompt: buildPrompt(texts.slice(0, mid), languageName), signal, onRetry })
        const second = await requestTexts({ prompt: buildPrompt(texts.slice(mid), languageName), signal, onRetry })
        strings = [...parseReply(first, mid), ...parseReply(second, texts.length - mid)]
      }
    }
    results[ci] = strings
    await onChunk?.(ci, strings)
    done += idx.reduce((a, i) => a + (blocks[i].text || '').length, 0)
    onProgress?.(total ? done / total : 1)
  }
  const byBlock = new Map()
  chunks.forEach((idx, ci) => idx.forEach((bi, k) => byBlock.set(bi, results[ci][k])))
  return blocks.map((b, i) => (byBlock.has(i) ? { ...b, text: byBlock.get(i) } : { ...b }))
}
