// Pure parts of the AI provider door.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isGeminiKey, isNvidiaKey, parseSse, cleanBase, hostOf, stripThinking, thinkFilter, explainError, provider, hasAiKey, splitText, rankModels, readStream } from './ai.js'

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

test('splitText: pieces within the limit, cut at paragraph ends, nothing lost', () => {
  const paras = Array.from({ length: 12 }, (_, i) => `Paragraph ${i}. ` + 'word '.repeat(30).trim() + '.')
  const text = paras.join('\n')
  const parts = splitText(text, 400)
  assert.ok(parts.length > 3 && parts.every(p => p.length <= 400))
  assert.equal(parts.join('\n'), text)
  const long = 'A sentence that is here. '.repeat(40).trim()
  const cut = splitText(long, 200)
  assert.ok(cut.every(p => p.length <= 200) && cut.every(p => p.endsWith('.')))
  assert.equal(cut.join(' '), long)
  assert.deepEqual(splitText('short', 100), ['short'])
})

test('a model is chosen from what the key answers: one to talk with, the best of them first', () => {
  // what a real free NVIDIA key answered on 15 October 2026 (13 of 81 listed), with seconds
  const answered = { 'google/diffusiongemma-26b-a4b-it': 0.5, 'meta/llama-3.2-11b-vision-instruct': 0.4, 'meta/muse-glimmer-30b': 7.3,
    'nvidia/llama-3.1-nemotron-safety-guard-8b-v3': 0.4, 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning': 1.2, 'nvidia/nemotron-3-super-120b-a12b': 0.9,
    'nvidia/nemotron-3.5-content-safety': 1.8, 'nvidia/nemotron-3.5-lightning-30b-a3b': 1.9, 'nvidia/nemotron-parse-2.0': 0.4,
    'nvidia/riva-translate-4b-instruct-v2': 0.9, 'openai/gpt-oss-20b': 0.7, 'poolside/laguna-xs-2.1': 4.4, 'stepfun-ai/step-5-preview': 0.9 }
  const ranked = rankModels(Object.keys(answered), answered)
  assert.equal(ranked[0], 'nvidia/nemotron-3-super-120b-a12b')
  for (const no of ['safety', 'parse', 'translate', 'diffusion', 'vision', 'laguna']) assert.ok(!ranked.some(id => id.includes(no)), no)
  assert.ok(ranked.includes('openai/gpt-oss-20b') && ranked.includes('stepfun-ai/step-5-preview'))
  assert.deepEqual(rankModels([]), [])
})

test('a streamed answer that goes silent part way is ended, not waited on for ever', async () => {
  const sse = text => new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}` + String.fromCharCode(10, 10))
  const stream = (chunks, close) => new Response(new ReadableStream({ start(c) { for (const x of chunks) c.enqueue(x); if (close) c.close() } }))
  const got = []
  await readStream(stream([sse('Hello'), sse(' world'), new TextEncoder().encode('data: [DONE]' + String.fromCharCode(10))], true), t => got.push(t), 200)
  assert.equal(got.join(''), 'Hello world')
  const part = []
  await assert.rejects(readStream(stream([sse('Half an ans')], false), t => part.push(t), 50), e => e.stalled === true)
  assert.equal(part.join(''), 'Half an ans') // what came before the silence was handed on
})
