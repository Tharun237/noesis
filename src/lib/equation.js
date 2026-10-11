// Equation exploder (M22): one AI call takes an equation apart into plain parts. The prompt and the reply
// parser are pure (node-tested in equation.test.js); explainEquation sends through the AI door (src/lib/ai.js),
// so it works with whichever provider the customer chose.
import { aiText } from './ai.js'

const CONTEXT_MAX = 600
const MAX_PARTS = 10
const SHAPE = '{"purpose": "...", "parts": [{"term": "...", "meaning": "..."}], "inWords": "..."}'
const FAIL = 'The explanation came back in a form that could not be read.'

const clean = v => (typeof v === 'string' ? v.trim() : '')

// The instruction for one equation. `context` is the sentences around it, cut to 600 characters.
export function equationPrompt(equationText, context = '') {
  const ctx = String(context).slice(0, CONTEXT_MAX).trim()
  return [
    `Take this equation apart for a listener, not a mathematician. Reply with JSON only, in exactly this shape: ${SHAPE}`,
    '',
    'purpose: one or two plain sentences on what the equation is for.',
    'parts: each symbol or term, in the order they appear in the equation, 2 to 10 of them. term is written exactly as in the equation. meaning is one plain sentence. Never read symbols out one by one.',
    'inWords: the whole equation said aloud as one sentence.',
    ctx ? 'Answer in the language of the context.' : 'Answer in plain English.',
    '',
    `Equation: ${String(equationText).trim()}`,
    ...(ctx ? ['', `Context (the sentences around it): ${ctx}`] : []),
  ].join('\n')
}

// The reply as { purpose, parts, inWords }. Takes the outermost { ... }, so a json fence or words around it are fine.
export function parseEquation(reply) {
  const text = String(reply)
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error(FAIL)
  let obj
  try { obj = JSON.parse(text.slice(start, end + 1)) } catch { throw new Error(FAIL) }
  const parts = (Array.isArray(obj.parts) ? obj.parts : [])
    .map(p => ({ term: clean(p && p.term), meaning: clean(p && p.meaning) }))
    .filter(p => p.term && p.meaning)
    .slice(0, MAX_PARTS)
  if (parts.length === 0) throw new Error(FAIL)
  return { purpose: clean(obj.purpose), parts, inWords: clean(obj.inWords) }
}

// The parts of one equation, from the customer's own AI. Rejects with the AI's message or the parse message.
export async function explainEquation(equationText, context = '', { signal } = {}) {
  const reply = await aiText({ prompt: equationPrompt(equationText, context), json: true, shape: SHAPE, signal })
  return parseEquation(reply)
}
