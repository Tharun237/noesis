// What tools/books.mjs decides about a book: who it is by, and whether it is free to use in India and almost every
// country (every named person died more than 70 years before the year asked about).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { personOf, freeEverywhere, parseCsv } from './books.mjs'

test('a person: name, role, life, as Gutenberg writes them', () => {
  assert.deepEqual(personOf('Austen, Jane, 1775-1817'), { name: 'Jane Austen', role: '', died: 1817, life: '1775–1817' })
  assert.equal(personOf('Tolstoy, Leo, graf, 1828-1910 [Translator]').role, 'Translator')
  assert.equal(personOf('Tolstoy, Leo, graf, 1828-1910 [Translator]').died, 1910)
  assert.equal(personOf('Homer, 751? BCE-651? BCE').died, -651)
  assert.equal(personOf('Pliny, the Elder, 23-79').name, 'Pliny the Elder')
  for (const unknown of ['Various', 'Twain, Mark', 'Someone, Alive, 1950-', 'Active, Painter, active 1896-1918']) assert.equal(personOf(unknown).died, null, unknown)
})

test('free everywhere: every named person dead more than 70 years; anyone unknown keeps the book out', () => {
  const p = died => ({ died })
  assert.equal(freeEverywhere([p(1955)], 2026), true)
  assert.equal(freeEverywhere([p(1956)], 2026), false, 'life + 70 not over until the year after')
  assert.equal(freeEverywhere([p(1817), p(1960)], 2026), false, 'a translator still protected keeps the book out')
  assert.equal(freeEverywhere([p(1817), p(null)], 2026), false)
  assert.equal(freeEverywhere([], 2026), false)
})

test('the catalogue CSV: commas, doubled quotes and line breaks inside a field', () => {
  assert.deepEqual(parseCsv('a,b\r\n1,"x, ""y""\r\nz"\r\n'), [['a', 'b'], ['1', 'x, "y"\r\nz']])
})
