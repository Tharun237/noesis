import { test } from 'node:test'
import assert from 'node:assert/strict'
import { candidates, conceptMap, layout } from './concepts.js'

const keys = list => list.map(c => c.key)

test('names are found mid-sentence but not at a sentence start', () => {
  const found = candidates('Fermi wrote a letter. The letter went to Enrico Fermi in Rome.')
  assert.ok(keys(found).includes('enrico fermi'))
  assert.ok(keys(found).includes('rome'))
  assert.ok(!keys(found).includes('fermi'), 'a capital at the start of a sentence is not evidence of a name')
  assert.ok(!keys(found).includes('the'))
})

test('a word of 7+ letters needs 3 occurrences, a shorter word never qualifies', () => {
  assert.equal(candidates('Photosynthesis is slow. Photosynthesis again.').find(c => c.key === 'photosynthesis'), undefined)
  const three = candidates('Photosynthesis is slow. Photosynthesis again. Photosynthesis, finally.')
  assert.equal(three.find(c => c.key === 'photosynthesis').count, 3)
  assert.equal(candidates('carbon carbon carbon.').find(c => c.key === 'carbon'), undefined)
})

test('the stop list drops calendar words, The, However, Chapter and Figure', () => {
  const found = keys(candidates('We left on Monday. Later we read Chapter Two of The Manhattan Project. However, Figure One is clear.'))
  for (const dropped of ['monday', 'chapter', 'the', 'however', 'figure']) assert.ok(!found.includes(dropped), dropped)
  assert.ok(found.includes('manhattan project'), 'a stop word breaks a run instead of joining it')
})

test('the most common written form is the label, the count covers every form', () => {
  const [c] = candidates('Visit Los Alamos. Go to Los Alamos. Then LOS ALAMOS again.').filter(x => x.key === 'los alamos')
  assert.equal(c.label, 'Los Alamos')
  assert.equal(c.count, 3)
})

test('languages without capitals yield only the long-word rule', () => {
  const te = 'విజ్ఞానశాస్త్రం అంటే ఏమిటి. విజ్ఞానశాస్త్రం చాలా ముఖ్యం. విజ్ఞానశాస్త్రం ఎక్కడ?'
  const found = candidates(te)
  assert.equal(found.length, 1)
  assert.equal(found[0].count, 3)
})

test('a concept shared by two documents outranks one in a single document, and links count shared concepts', () => {
  const docs = [
    { id: 'a', title: 'A', text: 'We met Enrico Fermi. We met Enrico Fermi. We met Enrico Fermi. We met Enrico Fermi. Also Rome.' },
    { id: 'b', title: 'B', text: 'Visit Rome in May. Rome again.' },
    { id: 'c', title: 'C', text: 'Rome is old.' },
  ]
  const map = conceptMap(docs)
  assert.equal(map.concepts[0].key, 'rome')
  assert.deepEqual(map.concepts[0].docs, [{ id: 'a', count: 1 }, { id: 'b', count: 1 }])
  assert.deepEqual(map.links, [{ a: 'a', b: 'b', shared: 1 }])
  assert.equal(conceptMap(docs, { maxConcepts: 1 }).concepts.length, 1)
})

test('layout is deterministic, inside the box, and keeps 34 px between concepts', () => {
  const docs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  const concepts = [
    { key: 'x', docs: [{ id: 'a' }, { id: 'b' }] },
    { key: 'y', docs: [{ id: 'a' }, { id: 'b' }] },
    { key: 'z', docs: [{ id: 'c' }] },
  ]
  const box = { width: 400, height: 300 }
  const one = layout(concepts, docs, box)
  assert.deepEqual(layout(concepts, docs, box), one)
  assert.ok(Math.abs(one.docs[0].x - 200) < 1e-9 && Math.abs(one.docs[0].y - 36) < 1e-9, 'first document at the top')
  for (const p of [...one.docs, ...one.concepts]) {
    assert.ok(p.x >= 0 && p.x <= 400 && p.y >= 0 && p.y <= 300)
  }
  for (let i = 0; i < one.concepts.length; i++) for (let j = i + 1; j < one.concepts.length; j++) {
    const a = one.concepts[i]
    const b = one.concepts[j]
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 34 - 1e-9, `${a.key} and ${b.key} too close`)
  }
})
