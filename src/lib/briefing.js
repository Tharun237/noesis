// One audio briefing from several documents, in two steps so it works with
// small-context models: (a) condense each chosen document on its own into
// notes; (b) write the briefing from the notes only.
import { splitText, contextChars, aiText } from './ai.js'
import { db } from './db.js'
import { getDoc, addDocument } from './library.js'

export const PARTS = [
  'What each one says',
  'Where they agree',
  'Where they disagree',
  'Shared methods and ideas',
  'What to read first and why',
]

// "Briefing: A + 2 more". A long first title is cut at 60 characters with an ellipsis.
export function briefingTitle(titles) {
  const first = String(titles[0] ?? 'Untitled')
  const short = first.length > 60 ? first.slice(0, 60).trimEnd() + '…' : first
  return `Briefing: ${short} + ${titles.length - 1} more`
}

// Condense one document (or one part of it) into notes for the briefing.
export function notesPrompt(title, text, words) {
  return `Condense this document into notes for someone who will hear a briefing and never read it.\n` +
    `Document: "${title}"\n` +
    `Keep every main point, argument, name and number that matters, in plain paragraphs, in the language of the text. At most ${words} words.\n` +
    `Write plain flowing prose for listening: no tables, no bullet lists, no bold.\n` +
    `\n=== DOCUMENT: ${title} ===\n${text}`
}

// Write the briefing from the per-document notes only.
export function briefingPrompt(items) {
  const docs = items.map((it, i) => `${i + 1}. "${it.title}"\n${it.notes}`).join('\n\n')
  return `You are making one spoken briefing from several documents. The listener will hear it, not read it.\n` +
    `Write plain flowing prose for listening: clear sentences, no tables, no bullet lists, no bold.\n` +
    `Use ## exactly for the section headings below, and no other headings.\n` +
    `\nDocuments and their notes:\n${docs}\n` +
    `\nWrite the briefing with these sections, in this order, using exactly these headings:\n` +
    PARTS.map(p => `## ${p}`).join('\n') + `\n` +
    `\nIn "What each one says", write one short paragraph per document, naming the document by its title.\n` +
    `"Where they agree" gathers the claims the documents share. ` +
    `"Where they disagree" gathers where they contradict each other. ` +
    `"Shared methods and ideas" gathers methods, ideas and evidence they have in common. ` +
    `"What to read first and why" says which document to start with and why.\n` +
    `If a part has nothing to say, leave it out entirely: do not write its heading and do not pad it with filler.`
}

const blockText = b => (Array.isArray(b.s) ? b.s.join(' ') : String(b.text || ''))

// Condense the chosen documents and add the briefing as a new ordinary document.
// Stages through onStage: { step: 'reading', n, total, title }, { step: 'writing' },
// and { step: 'waiting', seconds } while a quota retry waits. → the new document's id.
export async function makeBriefing(ids, { onStage, signal } = {}) {
  const max = contextChars()
  const perDocWords = Math.max(200, Math.min(600, Math.floor(((max * 0.6) / ids.length / 6))))
  const wait = v => onStage?.({ step: 'waiting', seconds: v })
  const items = []
  for (let i = 0; i < ids.length; i++) {
    const meta = getDoc(ids[i])
    const title = meta?.title || 'Untitled'
    onStage?.({ step: 'reading', n: i + 1, total: ids.length, title })
    const stored = await db.getDoc(ids[i])
    const text = (stored?.blocks || []).map(b => (b.k === 'h' ? `\n## ${blockText(b)}\n` : blockText(b))).join('\n').trim()
    if (!text) throw new Error(`"${title}" has no text yet.`)
    signal?.throwIfAborted?.()
    let notes
    if (text.length > max) {
      // Longer than the context: condensed part by part first, exactly as
      // `summarize` in src/lib/gemini.js does.
      const parts = splitText(text, Math.floor(max * 0.8))
      const words = Math.max(80, Math.floor(((max * 0.7) / parts.length / 6)))
      const bits = []
      for (const part of parts) {
        signal?.throwIfAborted?.()
        bits.push(await aiText({ prompt: notesPrompt(title, part, words), signal, onRetry: wait }))
      }
      notes = bits.join('\n\n')
      if (notes.length > perDocWords * 6) {
        signal?.throwIfAborted?.()
        notes = await aiText({ prompt: notesPrompt(title, notes, perDocWords), signal, onRetry: wait })
      }
    } else {
      notes = await aiText({ prompt: notesPrompt(title, text, perDocWords), signal, onRetry: wait })
    }
    items.push({ title, notes })
  }
  onStage?.({ step: 'writing' })
  signal?.throwIfAborted?.()
  const briefing = await aiText({ prompt: briefingPrompt(items), signal, onRetry: wait })
  signal?.throwIfAborted?.()
  const name = briefingTitle(items.map(it => it.title))
  // The same source shape as a pasted text in src/ui/Sheets.jsx `AddForm`: Markdown
  // (`## Title`) so the headings come out as headings in the reader (see src/ingest/text.js).
  const kind = /^\s{0,3}#{1,6}\s/m.test(briefing) ? 'md' : 'text'
  return addDocument({ kind, name, title: name, text: briefing }, { title: name, renamed: true, mode: 'full' })
}
