// Which translators a document needs (localtranslate.js route), and that the list of them is whole.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { route, routeBytes } from './localtranslate.js'
import MODELS from './translators.json' with { type: 'json' }
import { LANGS } from './lang.js'

test('from or to English is one translator; between two other languages it goes through English', () => {
  assert.deepEqual(route('en', 'te').map(m => m.from + m.to), ['ente'])
  assert.deepEqual(route('hi', 'en').map(m => m.from + m.to), ['hien'])
  assert.deepEqual(route('hi', 'te').map(m => m.from + m.to), ['hien', 'ente'])
})

test('the same language needs nothing; an unknown one cannot be done', () => {
  assert.deepEqual(route('te', 'te'), [])
  assert.equal(route('en', 'xx'), null)
  assert.equal(route('xx', 'te'), null)
})

test('every language Noesis offers can be translated to and from English on the device', () => {
  for (const code of Object.keys(LANGS)) {
    if (code === 'en') continue
    assert.ok(route('en', code)?.length === 1, `en to ${code}`)
    assert.ok(route(code, 'en')?.length === 1, `${code} to en`)
  }
})

test('each translator lists a model, a word list and its vocabulary, with a size and a checksum for every file', () => {
  for (const m of Object.values(MODELS)) {
    const kinds = m.files.map(f => f.type).sort().join()
    assert.ok(kinds === 'lex,model,vocab' || kinds === 'lex,model,srcvocab,trgvocab' || kinds === 'lex,model,srcvocab,trgvocab,vocab', `${m.from}${m.to}: ${kinds}`)
    for (const f of m.files) assert.ok(f.size > 0 && /^[0-9a-f]{64}$/.test(f.sha256) && f.parts === Math.max(1, Math.ceil(f.size / (20 * 1024 * 1024))), f.name)
    assert.equal(m.size, routeBytes([m]))
  }
})
