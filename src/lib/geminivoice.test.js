// Which of a key's Gemini models speak, and in what order they are tried (cloudvoice.js rankSpeechModels).
import { test } from 'node:test'
import assert from 'node:assert/strict'
const kept = new Map()
globalThis.localStorage = { getItem: k => (kept.has(k) ? kept.get(k) : null), setItem: (k, v) => kept.set(k, String(v)), removeItem: k => kept.delete(k) }
const { rankSpeechModels } = await import('./cloudvoice.js')

test('the newest first; the full model before its lighter one; a release before a preview; flash before pro', () => {
  // the speech models Tharun's key listed on 16 October 2026, in the order Google listed them
  const listed = ['gemini-2.5-flash-preview-tts', 'gemini-2.5-pro-preview-tts', 'gemini-3.1-flash-tts-preview', 'gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts']
  assert.deepEqual(rankSpeechModels(listed), ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts', 'gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts', 'gemini-2.5-pro-preview-tts'])
})

test('a model Google adds later is found and goes first, with nothing written in the code', () => {
  assert.equal(rankSpeechModels(['gemini-3.8-flash-tts', 'gemini-4.0-flash-tts'])[0], 'gemini-4.0-flash-tts')
})
