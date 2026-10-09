// node --test src/ingest/   — OCR repair against real errors seen in an Internet Archive scan.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import nspell from 'nspell'
import { createRepair } from './ocrfix.js'

const dir = new URL('../../node_modules/dictionary-en/', import.meta.url)
const speller = nspell(readFileSync(new URL('index.aff', dir)), readFileSync(new URL('index.dic', dir)))

test('fixes classic OCR confusions, keeps case', () => {
  const { fixWord } = createRepair(speller)
  assert.equal(fixWord('Pretace'), 'Preface')
  assert.equal(fixWord('mineteen'), 'nineteen')
  assert.equal(fixWord('Attiliate'), 'Affiliate')
  assert.equal(fixWord('rnodern'), 'modern')
  assert.equal(fixWord('clistance'), 'distance')
  assert.equal(fixWord('PRETACE'), 'PREFACE')
})

test('leaves real words and unknown names alone', () => {
  const { fixWord } = createRepair(speller)
  assert.equal(fixWord('preface'), null)
  assert.equal(fixWord('Weinberg'), null)
  assert.equal(fixWord('Sakharov'), null)
})

test('repairs a line: lone 1 → I, stray scan glyphs removed', () => {
  const { repairText } = createRepair(speller)
  assert.equal(repairText('He said, "1 didn\'t know you had a daughter."').text, 'He said, "I didn\'t know you had a daughter."')
  assert.equal(repairText('CHAPTER ONE |] Traction Channels').text, 'CHAPTER ONE Traction Channels')
  assert.equal(repairText('We found 1 result in 1969.').text, 'We found 1 result in 1969.')
})

test('drops lines that are mostly non-words, keeps prose', () => {
  const { repair } = createRepair(speller)
  const out = repair([
    { k: 'p', text: "A 'A reas:r \" \" 7 7 7 ae '" },
    { k: 'p', text: 'Traction is growth. The pursuit of traction is what defines a startup.' },
  ])
  assert.equal(out.length, 1)
  assert.match(out[0].text, /^Traction is growth/)
})

test('unknownRate separates a scan from clean text', () => {
  const { unknownRate } = createRepair(speller)
  const clean = [{ k: 'p', text: 'The experiment showed a large reduction in failures versus the baseline condition across every trial we ran.' }]
  const scan = [{ k: 'p', text: 'tbe expcriment shovved a large rcduction in failurcs vcrsus tlie baseline conditiou across evcry trial' }]
  assert.ok(unknownRate(clean) < 0.03, `clean ${unknownRate(clean)}`)
  assert.ok(unknownRate(scan) > 0.2, `scan ${unknownRate(scan)}`)
})

test('never rewrites parts of domains, emails or paths (Half.com’s stays)', () => {
  const { repairText } = createRepair(speller)
  assert.equal(repairText('Half.com’s growth came from Archives.com’s users.').text, 'Half.com’s growth came from Archives.com’s users.')
  assert.equal(repairText('Write to team@rnodern.io today.').text, 'Write to team@rnodern.io today.')
})
