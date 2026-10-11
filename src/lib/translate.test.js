// M8: pure translation helpers — chunking, prompt building, reply parsing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chunkBlocks, buildPrompt, parseReply } from './translate.js'

test('chunkBlocks groups block indexes within maxChars without splitting a block', () => {
  const blocks = [
    { k: 'p', text: 'a'.repeat(100) },
    { k: 'p', text: 'b'.repeat(100) },
    { k: 'p', text: 'c'.repeat(100) },
  ]
  assert.deepEqual(chunkBlocks(blocks, 250), [[0, 1], [2]])
})

test('chunkBlocks never sends code, math, table or fig blocks', () => {
  const blocks = [
    { k: 'p', text: 'Hello world' },
    { k: 'code', text: 'print("hi")' },
    { k: 'math', text: 'x^2' },
    { k: 'table', text: 'a b c' },
    { k: 'fig', text: 'A chart' },
    { k: 'h', text: 'A heading' },
  ]
  assert.deepEqual(chunkBlocks(blocks), [[0, 5]])
})

test('chunkBlocks gives an oversized single block its own chunk', () => {
  const blocks = [{ k: 'p', text: 'x'.repeat(7000) }, { k: 'p', text: 'tiny' }]
  assert.deepEqual(chunkBlocks(blocks), [[0], [1]])
})

test('chunkBlocks skips empty blocks and returns [] for nothing translatable', () => {
  assert.deepEqual(chunkBlocks([{ k: 'p', text: '   ' }, { k: 'code', text: 'x' }]), [])
  assert.deepEqual(chunkBlocks([]), [])
})

test('buildPrompt names the language, states the item count, and carries the texts', () => {
  const texts = ['Hello world.', 'Second sentence here.']
  const p = buildPrompt(texts, 'Telugu')
  assert.ok(p.includes('Telugu'), 'language name appears')
  assert.ok(p.includes(String(texts.length)), 'item count appears')
  assert.ok(/return ONLY a JSON array of strings/i.test(p), 'return contract appears')
  assert.ok(p.includes('cannot\npronounce') || p.includes('cannot pronounce'), 'voice limitation appears')
  assert.ok(p.includes('keep numbers as digits'), 'numbers rule appears')
  assert.deepEqual(JSON.parse(p.slice(p.indexOf('['))), texts)
})

test('buildPrompt writes the listening and naming rules into the instruction', () => {
  const p = buildPrompt(['Hi.'], 'Hindi')
  assert.ok(p.includes('for listening aloud'), 'listening rule appears')
  assert.ok(p.includes("people's names, place names and technical terms"), 'naming rule appears')
  assert.ok(p.includes('do not add, remove, merge or explain anything'), 'fidelity rule appears')
})

test('parseReply parses a plain JSON array', () => {
  assert.deepEqual(parseReply('["అ", "ఆ"]', 2), ['అ', 'ఆ'])
})

test('parseReply accepts a reply wrapped in a json fence', () => {
  assert.deepEqual(parseReply('```json\n["one", "two"]\n```', 2), ['one', 'two'])
})

test('parseReply throws the exact message on a count mismatch', () => {
  assert.throws(() => parseReply('["only"]', 2), new Error('The translation came back with 1 items instead of 2.'))
})

test('parseReply throws the exact message on invalid JSON', () => {
  assert.throws(() => parseReply('not json at all', 3), new Error('The translation came back with 0 items instead of 3.'))
})
