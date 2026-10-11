// M22: equation exploder helpers. Prompt building and reply parsing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { equationPrompt, parseEquation } from './equation.js'

const FAIL = 'The explanation came back in a form that could not be read.'
const clean = {
  purpose: 'Gives the energy of a body from its mass.',
  parts: [{ term: 'E', meaning: 'the energy' }, { term: 'm', meaning: 'the mass' }],
  inWords: 'E equals m times c squared.',
}
const cleanJson = JSON.stringify(clean)

test('equationPrompt carries the equation text', () => {
  const p = equationPrompt('E = mc^2', 'Einstein wrote it down.')
  assert.ok(p.includes('Equation: E = mc^2'), 'equation appears')
})

test('equationPrompt carries up to 600 characters of context and no more', () => {
  const p = equationPrompt('x = 1', 'x'.repeat(1000))
  assert.ok(p.includes('x'.repeat(600)), 'the first 600 characters appear')
  assert.ok(!p.includes('x'.repeat(601)), 'nothing past 600 characters appears')
})

test('equationPrompt states the JSON shape, the part rules and the answer language', () => {
  const p = equationPrompt('a + b', 'Some sentence.')
  assert.ok(p.includes('Reply with JSON only'), 'JSON only rule appears')
  assert.ok(p.includes('{"purpose": "...", "parts": [{"term": "...", "meaning": "..."}], "inWords": "..."}'), 'shape appears')
  assert.ok(p.includes('2 to 10'), 'part count rule appears')
  assert.ok(p.includes('Answer in the language of the context.'), 'language rule appears')
})

test('equationPrompt without context still asks for the parts and leaves out the context line', () => {
  const p = equationPrompt('a + b', '')
  assert.ok(p.includes('Equation: a + b'), 'equation appears')
  assert.ok(!p.includes('Context (the sentences around it)'), 'no context line')
  assert.ok(p.includes('Answer in plain English.'), 'fallback language rule appears')
})

test('parseEquation reads a clean reply', () => {
  assert.deepEqual(parseEquation(cleanJson), clean)
})

test('parseEquation reads a reply wrapped in a json fence', () => {
  assert.deepEqual(parseEquation('```json\n' + cleanJson + '\n```'), clean)
})

test('parseEquation ignores chatter before and after the object', () => {
  assert.deepEqual(parseEquation('Here you go: ' + cleanJson + ' Hope this helps.'), clean)
})

test('parseEquation trims the strings', () => {
  const reply = JSON.stringify({ purpose: '  P  ', parts: [{ term: ' E ', meaning: '  energy  ' }], inWords: '  words ' })
  assert.deepEqual(parseEquation(reply), { purpose: 'P', parts: [{ term: 'E', meaning: 'energy' }], inWords: 'words' })
})

test('parseEquation drops parts with an empty term or an empty meaning', () => {
  const reply = JSON.stringify({
    purpose: 'P',
    parts: [{ term: '', meaning: 'no symbol' }, { term: 'x', meaning: '' }, { term: 'y' }, null, { term: 'z', meaning: 'kept' }],
    inWords: 'W',
  })
  assert.deepEqual(parseEquation(reply).parts, [{ term: 'z', meaning: 'kept' }])
})

test('parseEquation keeps at most 10 parts, in order', () => {
  const parts = Array.from({ length: 12 }, (_, i) => ({ term: 't' + i, meaning: 'm' + i }))
  const out = parseEquation(JSON.stringify({ purpose: 'P', parts, inWords: 'W' })).parts
  assert.equal(out.length, 10)
  assert.equal(out[0].term, 't0')
  assert.equal(out[9].term, 't9')
})

test('parseEquation throws the exact message when there is no object', () => {
  assert.throws(() => parseEquation('Sorry, I cannot do that.'), new Error(FAIL))
})

test('parseEquation throws the exact message on an object that is not JSON', () => {
  assert.throws(() => parseEquation('{purpose: nope}'), new Error(FAIL))
})

test('parseEquation throws the exact message when no part is usable', () => {
  assert.throws(() => parseEquation(JSON.stringify({ purpose: 'P', parts: [], inWords: 'W' })), new Error(FAIL))
  assert.throws(() => parseEquation(JSON.stringify({ purpose: 'P', inWords: 'W' })), new Error(FAIL))
  assert.throws(() => parseEquation(JSON.stringify({ purpose: 'P', parts: [{ term: '', meaning: '' }] })), new Error(FAIL))
})
