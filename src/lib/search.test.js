import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tokens, buildIndex, search } from './search.js'

const docs = [
  {
    id: 'a', title: 'The Manhattan Project',
    blocks: [
      { k: 'p', s: ['The first atomic bomb was tested at Trinity in the New Mexico desert in July 1945.'] },
      { k: 'p', s: ['The project built a small town around Los Alamos to house the scientists and their families.'] },
    ],
  },
  {
    id: 'b', title: 'Gardening Notes',
    blocks: [{ k: 'p', s: ['Tomatoes need full sun and steady watering through the hot summer months ahead.'] }],
  },
  {
    id: 'c', title: 'Bread Recipes',
    blocks: [{ k: 'p', s: ['A slow overnight ferment gives the loaf a deeper flavour and a crisper brown crust.'] }],
  },
]

test('the right passage ranks first', () => {
  const hits = search(buildIndex(docs), 'how was the first atomic bomb tested')
  assert.ok(hits.length > 0)
  assert.equal(hits[0].doc, 'a')
  assert.match(hits[0].text, /Trinity/)
})

test('a query with no match returns []', () => {
  assert.deepEqual(search(buildIndex(docs), 'quantum chromodynamics'), [])
})

test('at most 4 passages per document', () => {
  const many = Array.from({ length: 6 }, (_, i) => ({
    k: 'p', s: [`Trinity atomic bomb test desert chapter number ${i} with plenty of extra words here.`],
  }))
  const lib = [
    { id: 'long', title: 'Long Book', blocks: many },
    { id: 'short', title: 'Short Book', blocks: [{ k: 'p', s: ['Trinity atomic bomb test desert epilogue with plenty of extra words here.'] }] },
  ]
  const hits = search(buildIndex(lib), 'Trinity atomic bomb test desert', 12)
  assert.equal(hits.filter(h => h.doc === 'long').length, 4)
  assert.ok(hits.some(h => h.doc === 'short'))
})

test('Telugu and Hindi text is tokenised into words with marks kept inside', () => {
  const te = tokens('అణు బాంబు పరీక్ష')
  assert.deepEqual(te, ['అణు', 'బాంబు', 'పరీక్ష'])
  const hi = tokens('परमाणु बम परीक्षण')
  assert.deepEqual(hi, ['परमाणु', 'बम', 'परीक्षण'])
  const lib = [{ id: 't', title: 'చరిత్ర', blocks: [{ k: 'p', s: ['అణు బాంబు పరీక్ష ఎడారిలో జరిగింది మరియు చరిత్రను మార్చింది.'] }] }]
  assert.equal(search(buildIndex(lib), 'బాంబు పరీక్ష')[0]?.doc, 't')
})
