// Pasted and Markdown text: when a paste counts as Markdown, and what a table keeps.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { looksMarkdown, readMarkdown } from './text.js'
import { toListening } from '../lib/text.js'

test('looksMarkdown: a heading, a table, a display equation or a code fence', () => {
  assert.equal(looksMarkdown('# Title\n\nText.'), true)
  assert.equal(looksMarkdown('Intro.\n\n| A | B |\n|---|---|\n| 1 | 2 |'), true)
  assert.equal(looksMarkdown('Intro.\n\n$$E = mc^2$$\n\nMore.'), true)
  assert.equal(looksMarkdown('Intro.\n\n```\ncode\n```'), true)
})

test('looksMarkdown: plain prose stays plain, even with a stray # or |', () => {
  assert.equal(looksMarkdown('We are #1 in the region. Costs were $5 | $6 last year.'), false)
  assert.equal(looksMarkdown('A line.\n\nAnother line with a | in it.'), false)
})

test('a Markdown table is spoken as a description and keeps its cells, header first', () => {
  const blocks = readMarkdown('| Year | Sales |\n|------|-------|\n| 2019 | 1,200 |\n| 2020 | 1,800 |')
  assert.deepEqual(blocks, [{ k: 'table', text: 'A table with 2 rows, with columns Year, Sales.', data: [['Year', 'Sales'], ['2019', '1,200'], ['2020', '1,800']] }])
  assert.deepEqual(toListening(blocks), [{ k: 'table', s: ['A table with 2 rows, with columns Year, Sales.'], d: [['Year', 'Sales'], ['2019', '1,200'], ['2020', '1,800']] }])
})
