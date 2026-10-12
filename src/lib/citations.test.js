// Citations: finding the marks, cutting a reference list into entries, matching one to the other.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { citesIn, splitRefs, takeRefs, findRef, paperId, paperUrl, summaryOf, withoutEmptyRefHeading } from './citations.js'

test('citesIn reads numbered marks, lists and short ranges, each once', () => {
  assert.deepEqual(citesIn('As shown [12], and again [3, 5] and [7-9]; see [12].'), ['12', '3', '5', '7', '8', '9'])
  assert.deepEqual(citesIn('Pages [3-400] are not a run of citations.'), ['3', '400'])
})

test('citesIn reads author and year, in parentheses and in the sentence', () => {
  assert.deepEqual(citesIn('It works (Smith et al., 2020; Lee, 2019).'), ['smith2020', 'lee2019'])
  assert.deepEqual(citesIn('Vaswani et al. (2017) and Lee and Kim (2019b) disagree (see Brown, 2001).'), ['brown2001', 'vaswani2017', 'lee2019'])
  assert.deepEqual(citesIn('Nothing is cited here (not even once).'), [])
})

test('splitRefs cuts a numbered list at each number and joins wrapped lines', () => {
  const refs = splitRefs(['[1] A. Vaswani et al. Attention is all you need.', 'NeurIPS, 2017. arXiv:1706.03762', '[2] Y. LeCun, Y. Bengio. Deep learn-', 'ing. Nature, 2015.'])
  assert.deepEqual(refs, [
    { n: 1, text: 'A. Vaswani et al. Attention is all you need. NeurIPS, 2017. arXiv:1706.03762' },
    { n: 2, text: 'Y. LeCun, Y. Bengio. Deep learning. Nature, 2015.' },
  ])
})

test('splitRefs cuts an author and year list where a new surname begins', () => {
  const refs = splitRefs(['Brown, T. (2001). A study of things. Journal of', 'Things, 4, 1-9.', 'Smith, J., & Lee, K. (2020). Another study. Press.'])
  assert.deepEqual(refs.map(r => r.text), ['Brown, T. (2001). A study of things. Journal of Things, 4, 1-9.', 'Smith, J., & Lee, K. (2020). Another study. Press.'])
})

test('takeRefs lifts the reference section out of the blocks', () => {
  const blocks = [{ k: 'h', text: 'Intro' }, { k: 'p', text: 'Body [1].' }, { k: 'h', text: 'References' },
    { k: 'p', text: '[1] A. Author. A long enough title. 2020.' }, { k: 'p', text: '[2] B. Author. Another long title. 2021.' }, { k: 'h', text: 'Appendix' }, { k: 'p', text: 'More.' }]
  const out = takeRefs(blocks)
  assert.deepEqual(out.blocks.map(b => b.text), ['Intro', 'Body [1].', 'Appendix', 'More.'])
  assert.deepEqual(out.refs.map(r => r.n), [1, 2])
  assert.equal(takeRefs([{ k: 'p', text: 'No list here.' }]).refs.length, 0)
})

test('findRef matches by number, by place in an unnumbered list, and by author and year', () => {
  const numbered = [{ n: 1, text: 'First entry, 2019.' }, { n: 3, text: 'Third entry, 2020.' }]
  assert.equal(findRef(numbered, '3').text, 'Third entry, 2020.')
  assert.equal(findRef(numbered, '2'), null)
  const plain = [{ text: 'Brown, T. (2001). A study.' }, { text: 'Smith, J. (2020). Another.' }]
  assert.equal(findRef(plain, '2').text, 'Smith, J. (2020). Another.')
  assert.equal(findRef(plain, 'brown2001').text, 'Brown, T. (2001). A study.')
  assert.equal(findRef(plain, 'brown2020'), null)
  assert.equal(findRef([], '1'), null)
})

test('paperId finds a DOI or an arXiv number, and paperUrl points at it or at a search', () => {
  assert.equal(paperId('LeCun. Deep learning. Nature. https://doi.org/10.1038/nature14539.'), '10.1038/nature14539')
  assert.equal(paperId('Vaswani et al. Attention is all you need. arXiv:1706.03762, 2017'), '10.48550/arXiv.1706.03762')
  assert.equal(paperId('Brown, T. (2001). A study of things.'), null)
  assert.equal(paperUrl('doi:10.1038/nature14539'), 'https://doi.org/10.1038/nature14539')
  assert.equal(paperUrl('Brown, T. A study'), 'https://scholar.google.com/scholar?q=Brown%2C%20T.%20A%20study')
})

test('summaryOf rebuilds the text from word positions and keeps the first sentences', () => {
  const inverted = { The: [0], model: [1], 'works.': [2], It: [3], 'is': [4], 'fast.': [5], More: [6], 'follows.': [7] }
  assert.equal(summaryOf(inverted), 'The model works. It is fast.')
  assert.equal(summaryOf(null), '')
})

test('a References heading with nothing under it is dropped, one with text under it is kept', () => {
  assert.deepEqual(withoutEmptyRefHeading([{ k: 'p', text: 'Body.' }, { k: 'h', text: 'References' }]).map(b => b.text), ['Body.'])
  assert.deepEqual(withoutEmptyRefHeading([{ k: 'h', text: 'References' }, { k: 'h', text: 'Notes' }, { k: 'p', text: 'A note.' }]).map(b => b.text), ['Notes', 'A note.'])
  assert.equal(withoutEmptyRefHeading([{ k: 'h', text: 'References' }, { k: 'p', text: 'Kept.' }]).length, 2)
})
