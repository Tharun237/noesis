// Pure parts of the AI provider door.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isGeminiKey, isNvidiaKey, parseSse, cleanBase, hostOf, stripThinking, thinkFilter, explainError, provider, hasAiKey } from './ai.js'

test('isGeminiKey keeps the old rule: trimmed key longer than 20 characters', () => {
  assert.equal(isGeminiKey('  ' + 'x'.repeat(21) + '  '), true)
  assert.equal(isGeminiKey('short'), false)
})

test('isNvidiaKey needs the nvapi- prefix and more than 20 characters', () => {
  assert.equal(isNvidiaKey('  nvapi-' + 'x'.repeat(20) + '  '), true)
  assert.equal(isNvidiaKey('nvapi-short'), false)
  assert.equal(isNvidiaKey('x'.repeat(30)), false)
})

test('cleanBase and hostOf: an address a customer types', () => {
  assert.equal(cleanBase(' https://openrouter.ai/api/v1/ '), 'https://openrouter.ai/api/v1')
  assert.equal(cleanBase('http://localhost:11434/v1/chat/completions'), 'http://localhost:11434/v1')
  assert.equal(cleanBase('openrouter.ai'), '')
  assert.equal(hostOf('https://api.groq.com/openai/v1'), 'api.groq.com')
  assert.equal(hostOf('http://localhost:11434/v1'), 'localhost')
})

test('provider and hasAiKey follow the chosen provider; a local server needs no key', () => {
  const base = { geminiKey: '', geminiModel: 'gemini-flash-latest', nvidiaKey: '', nvidiaModel: '', customBase: '', customKey: '', customModel: '' }
  assert.equal(hasAiKey({ ...base, aiProvider: 'gemini', geminiKey: 'x'.repeat(30) }), true)
  assert.equal(hasAiKey({ ...base, aiProvider: 'nvidia', nvidiaKey: 'nvapi-' + 'x'.repeat(30) }), false) // no model chosen
  assert.equal(hasAiKey({ ...base, aiProvider: 'nvidia', nvidiaKey: 'nvapi-' + 'x'.repeat(30), nvidiaModel: 'a/b' }), true)
  assert.equal(hasAiKey({ ...base, aiProvider: 'custom', customBase: 'http://localhost:11434/v1', customModel: 'llama' }), true)
  assert.equal(hasAiKey({ ...base, aiProvider: 'custom', customBase: 'nonsense', customModel: 'llama' }), false)
  const p = provider({ ...base, aiProvider: 'custom', customBase: 'https://openrouter.ai/api/v1/', customModel: 'm' })
  assert.deepEqual([p.kind, p.name, p.base], ['openai', 'openrouter.ai', 'https://openrouter.ai/api/v1'])
  assert.equal(provider({ ...base, aiProvider: 'nvidia' }).base, '/api/nvidia')
})

test('explainError: words a customer can act on', () => {
  assert.match(explainError(404, 'Function not found for account', 'NVIDIA'), /not available for your NVIDIA account/)
  assert.match(explainError(410, 'end of life', 'NVIDIA'), /not available/)
  assert.match(explainError(401, '', 'openrouter.ai'), /did not accept the key/)
  assert.equal(explainError(500, 'boom', 'NVIDIA'), 'boom')
  assert.equal(explainError(500, '', 'NVIDIA'), 'NVIDIA error 500')
})

test('stripThinking removes a reasoning block, closed or with the opening tag cut off', () => {
  assert.equal(stripThinking('<think>let me see</think>\n["a"]'), '["a"]')
  assert.equal(stripThinking('still thinking</think> answer'), 'answer')
  assert.equal(stripThinking('plain'), 'plain')
})

test('thinkFilter hides thinking in a stream, even when a tag arrives in halves', () => {
  const run = pieces => { const f = thinkFilter(); return pieces.map(f).join('') + f.flush() }
  assert.equal(run(['<think>hm', 'm</think>Hello', ' there']), 'Hello there')
  assert.equal(run(['Hi <thi', 'nk>secret</thi', 'nk> you']), 'Hi  you')
  assert.equal(run(['a < b', ' and c <']), 'a < b and c <')
  assert.equal(run(['<think>never closed']), '')
})

test('parseSse collects content, carries a half line, sees [DONE], skips what is not JSON', () => {
  const one = parseSse('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: {"choices":[{"delta":{"content":" there"}}]}\n\n')
  assert.deepEqual([one.texts, one.rest, one.done], [['Hello', ' there'], '', false])
  const full = 'data: {"choices":[{"delta":{"content":"hello"}}]}'
  const a = parseSse(full.slice(0, 20))
  assert.deepEqual([a.texts, a.rest], [[], full.slice(0, 20)])
  assert.deepEqual(parseSse(a.rest + full.slice(20) + '\n').texts, ['hello'])
  const d = parseSse(': keep-alive\ndata: not json\ndata: {"choices":[{"delta":{"content":"x"}}]}\r\ndata: [DONE]\n')
  assert.deepEqual([d.texts, d.done], [['x'], true])
})
