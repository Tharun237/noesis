// M7: Telugu/Hindi documents are voiced with eSpeak-ng phonemes. Pure — runs in Node tests.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LANGS, detectLang } from './lang.js'

test('plain English is en', () => {
  assert.equal(detectLang('Hello there. This is a plain English document with several sentences.'), 'en')
})

test('plain Hindi is hi', () => {
  assert.equal(detectLang('नमस्ते, यह एक परीक्षण है। आप कैसे हैं? यह हिंदी में एक लंबा वाक्य है।'), 'hi')
})

test('plain Telugu is te', () => {
  assert.equal(detectLang('నమస్కారం, ఇది ఒక పరీక్ష. మీరు ఎలా ఉన్నారు? ఇది తెలుగులో ఒక పొడవైన వాక్యం.'), 'te')
})

test('English with one Hindi sentence stays en', () => {
  const english = 'This is an English paper. '.repeat(20)
  assert.equal(detectLang(`${english} यह एक हिंदी वाक्य है।`), 'en')
})

test('Telugu with English names and numbers stays te', () => {
  const telugu = 'నమస్కారం, ఇది ఒక పరీక్ష. మీరు ఎలా ఉన్నారు? '.repeat(6)
  assert.equal(detectLang(`${telugu} John Smith 2024 Hyderabad.`), 'te')
})

test('empty text is en', () => {
  assert.equal(detectLang(''), 'en')
  assert.equal(detectLang(null), 'en')
  assert.equal(detectLang('1234 ... !!!'), 'en')
})

test('LANGS holds English, Hindi and Telugu locales', () => {
  assert.deepEqual(Object.keys(LANGS), ['en', 'hi', 'te'])
  assert.equal(LANGS.hi.locale, 'hi')
  assert.equal(LANGS.te.locale, 'te')
})
