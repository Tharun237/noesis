// node --test src/ingest/ — clean PDF metadata titles and authors.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanMeta } from './meta.js'

test('real junk metadata from a phone: indd title and numeric author', () => {
  const out = cleanMeta(
    { title: '491602_1_En_Print.indd', author: '0015220' },
    { fileName: 'Antimatter.pdf', firstHeading: 'Antimatter' },
  )
  assert.equal(out.title, 'Antimatter')
  assert.equal(out.author, '')
})

test('real junk title falls back to the file name when there is no heading', () => {
  const out = cleanMeta(
    { title: '491602_1_En_Print.indd', author: '0015220' },
    { fileName: 'Antimatter.pdf', firstHeading: '' },
  )
  assert.equal(out.title, 'Antimatter')
  assert.equal(out.author, '')
})

test('a good title and author are kept', () => {
  const out = cleanMeta(
    { title: 'Antimatter', author: 'John Doe' },
    { fileName: 'Antimatter.pdf', firstHeading: 'Antimatter' },
  )
  assert.equal(out.title, 'Antimatter')
  assert.equal(out.author, 'John Doe')
})

test('Microsoft Word prefix is stripped: "Microsoft Word - Thesis final.docx" → "Thesis final"', () => {
  const out = cleanMeta(
    { title: 'Microsoft Word - Thesis final.docx', author: '' },
    { fileName: 'thesis.pdf', firstHeading: '' },
  )
  assert.equal(out.title, 'Thesis final')
})

test('underscore title uses the heading: "paper_v3_FINAL" → "Attention Is All You Need"', () => {
  const out = cleanMeta(
    { title: 'paper_v3_FINAL', author: '' },
    { fileName: 'paper_v3_FINAL.pdf', firstHeading: 'Attention Is All You Need' },
  )
  assert.equal(out.title, 'Attention Is All You Need')
})

test('tool author becomes empty: "Adobe InDesign 16.0" → ""', () => {
  const out = cleanMeta(
    { title: 'Some Book', author: 'Adobe InDesign 16.0' },
    { fileName: 'book.pdf', firstHeading: '' },
  )
  assert.equal(out.author, '')
})

test('placeholder titles fall back', () => {
  assert.equal(cleanMeta({ title: 'Untitled', author: '' }, { fileName: 'my-book.pdf', firstHeading: '' }).title, 'my book')
  assert.equal(cleanMeta({ title: 'document', author: '' }, { fileName: 'my-book.pdf', firstHeading: '' }).title, 'my book')
})

test('file name underscores and dashes become spaces', () => {
  const out = cleanMeta({ title: '', author: '' }, { fileName: 'my-great_book.pdf', firstHeading: '' })
  assert.equal(out.title, 'my great book')
})
