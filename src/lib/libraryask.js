import { library, loadDoc, patch } from './library.js'
import { db } from './db.js'
import { pause } from './text.js'
import { hasAiKey, contextChars, aiStream } from './ai.js'
import { go } from './nav.js'
import { buildIndex, search } from './search.js'

// In-memory index over the stored text of every voiced/ready document.
// Rebuilt only when the set of document ids or their contentVer values changed.
let cachedKey = null
let cachedIndex = null

export async function loadLibraryIndex({ onProgress } = {}) {
  const eligible = library.get().docs.filter(d => d.status === 'voicing' || d.status === 'ready')
  const total = eligible.length
  const key = eligible.map(d => `${d.id}:${d.contentVer || 0}`).sort().join('|')
  if (cachedIndex && key === cachedKey) {
    onProgress?.(total, total)
    return cachedIndex
  }
  const docs = []
  let done = 0
  for (const d of eligible) {
    const stored = await db.getDoc(d.id)
    docs.push({ id: d.id, title: d.title, blocks: stored?.blocks || [] })
    done++
    onProgress?.(done, total)
    await pause()
  }
  cachedIndex = buildIndex(docs)
  cachedKey = key
  return cachedIndex
}

export const SYSTEM =
  'Answer ONLY from the numbered passages below. ' +
  'After each statement give the number(s) of the passage(s) it comes from in square brackets like [1] or [2]. ' +
  'If the passages do not answer the question, say so plainly. ' +
  'Use plain flowing sentences. ' +
  'Answer in the language of the question.'

export function buildUserMessage(question, passages) {
  return `${String(question).trim()}\n\nPassages:\n${passages.map((p, i) => `[${i + 1}] (${p.title}) ${p.text}`).join('\n')}`
}

export async function askLibrary(question, { onStage, onPassages, onText, signal, onProgress } = {}) {
  onStage?.('reading')
  const index = await loadLibraryIndex({ onProgress: onProgress ?? ((done, total) => onStage?.('reading', done, total)) })
  const ranked = search(index, String(question || ''), 12)
  if (!ranked.length) {
    onPassages?.([])
    return { passages: [] }
  }
  // The model sees the top passages only, within half of the provider's context budget.
  const budget = Math.floor(contextChars() / 2)
  const selected = []
  let used = 0
  for (const p of ranked) {
    if (!selected.length) {
      const first = p.text.length > budget ? { ...p, text: p.text.slice(0, budget) } : p
      selected.push(first)
      used += first.text.length
    } else if (used + p.text.length <= budget) {
      selected.push(p)
      used += p.text.length
    }
  }
  const display = selected.map((p, i) => ({ doc: p.doc, title: p.title, block: p.block, text: p.text.slice(0, 300), n: i + 1 }))
  onPassages?.(display)
  if (!hasAiKey()) return { passages: display }
  onStage?.('asking')
  await aiStream({ system: SYSTEM, messages: [{ role: 'user', content: buildUserMessage(question, selected) }], onText, signal })
  return { passages: display }
}

// Open a passage in the reader at that passage (playback not started).
export async function openPassage(p) {
  const c = await loadDoc(p.doc)
  patch(p.doc, { pos: c?.starts?.[p.block] ?? 0 })
  go('reader', p.doc)
}
