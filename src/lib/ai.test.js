// M9: pure parts of the AI provider door — key checks and the NVIDIA SSE parser.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isGeminiKey, isNvidiaKey, parseNvidiaSse } from './ai.js'

test('isGeminiKey keeps today\'s rule: trimmed key longer than 20 characters', () => {
  assert.equal(isGeminiKey('x'.repeat(21)), true)
  assert.equal(isGeminiKey('  ' + 'x'.repeat(21) + '  '), true)
  assert.equal(isGeminiKey('short'), false)
  assert.equal(isGeminiKey(''), false)
})

test('isNvidiaKey needs the nvapi- prefix and more than 20 characters', () => {
  assert.equal(isNvidiaKey('nvapi-' + 'x'.repeat(20)), true)
  assert.equal(isNvidiaKey('  nvapi-' + 'x'.repeat(20) + '  '), true)
  assert.equal(isNvidiaKey('nvapi-short'), false)
  assert.equal(isNvidiaKey('x'.repeat(30)), false)
  assert.equal(isNvidiaKey(''), false)
})

test('parseNvidiaSse collects content from data lines in one buffer', () => {
  const buf = 'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: {"choices":[{"delta":{"content":" there"}}]}\n\n'
  const r = parseNvidiaSse(buf)
  assert.deepEqual(r.texts, ['Hello', ' there'])
  assert.equal(r.rest, '')
  assert.equal(r.done, false)
})

test('parseNvidiaSse keeps a chunk ending mid-line as rest for the next chunk', () => {
  const full = '{"choices":[{"delta":{"content":"hello"}}]}'
  const cut = 20
  const first = parseNvidiaSse('data: ' + full.slice(0, cut))
  assert.deepEqual(first.texts, [])
  assert.equal(first.done, false)
  assert.ok(first.rest.length > 0)
  const second = parseNvidiaSse(first.rest + full.slice(cut) + '\n\n')
  assert.deepEqual(second.texts, ['hello'])
  assert.equal(second.rest, '')
})

test('parseNvidiaSse ends at data: [DONE]', () => {
  const r = parseNvidiaSse('data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\n')
  assert.deepEqual(r.texts, ['hi'])
  assert.equal(r.done, true)
})

test('parseNvidiaSse skips lines that are not JSON', () => {
  const r = parseNvidiaSse(': keep-alive\n\ndata: not json at all\n\ndata: {"choices":[{"delta":{}}]}\n\n')
  assert.deepEqual(r.texts, [])
  assert.equal(r.done, false)
  assert.equal(r.rest, '')
})
