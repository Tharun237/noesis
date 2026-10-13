import test from 'node:test'
import assert from 'node:assert/strict'
import { toLines, blocksFromPages } from './pdftext.js'

// One piece of text as pdf.js gives it: where it starts, how tall, how wide.
const item = (str, x, y, { size = 10, width = str.length * 5, hasEOL = false } = {}) => ({ str, width, hasEOL, transform: [size, 0, 0, size, x, y] })
// A line of body text at height y, starting at x.
const line = (text, y, x = 50, o) => item(text, x, y, { width: 300, ...o })
const LONG = 'and it goes on with enough words to be a line of a book'
const read = async pages => (await blocksFromPages(pages.map(toLines))).blocks.map(b => (b.k === 'h' ? '## ' : '') + b.text)

test('a crooked scan: every word carries an end-of-line mark, and the line is still one line', () => {
  // each word a little lower than the last, as on a page scanned at a slant
  const words = ['one', 'of', 'the', 'attendees', 'recalled', 'utter', 'disbelief']
  const items = words.map((w, i) => item(w, 10 + i * 40, 484 - i * 0.3, { width: 30, hasEOL: true }))
  const next = ['guished', 'participant.'].map((w, i) => item(w, 10 + i * 40, 471 - i * 0.3, { width: 30, hasEOL: true }))
  const lines = toLines([...items, ...next])
  assert.deepEqual(lines.map(l => l.text), ['one of the attendees recalled utter disbelief', 'guished participant.'])
})

test('a note number set above the line is not text', () => {
  const lines = toLines([item('raised eyebrows.’', 50, 100, { width: 80 }), item('21', 131, 104, { size: 6, width: 6 }), item(' Wanting to see', 138, 100, { width: 70 })])
  assert.equal(lines[0].text, 'raised eyebrows.’ Wanting to see')
})

test('a title set wide is words, not letters', () => {
  const lines = toLines([item('G R A V I T Y :', 200, 565, { width: 94 }), item('A N', 160, 543, { width: 25 }), item(' ', 188, 543, { width: 1 }), item('I N T R O D U C T I O N', 200, 543, { width: 159 })])
  assert.deepEqual(lines.map(l => l.text), ['GRAVITY:', 'AN INTRODUCTION'])
})

test('a paragraph begins where a line is set in, and a short reply is kept', async () => {
  const end = { width: 120 } // a last line: it stops short of the right edge
  const page = [
    line(`The first paragraph starts here ${LONG}`, 700), line(`${LONG}`, 688), line(`and ends on its third line.`, 676, 50, end),
    line(`“No.”`, 664, 62, { width: 30 }),
    line(`“Yes.”`, 652, 62, { width: 30 }),
    line(`The fourth is set in too ${LONG}`, 640, 62, { width: 288 }), line(`${LONG}`, 628), line(`${LONG}`, 616), line(`and runs on to here.`, 604, 50, end),
    line(`1. A numbered item whose first line is full ${LONG}`, 592, 62, { width: 288 }), line(`${LONG}`, 580), line(`and ends.`, 568, 50, end),
  ]
  assert.deepEqual(await read([page]), [
    `The first paragraph starts here ${LONG} ${LONG} and ends on its third line.`,
    '“No.”',
    '“Yes.”',
    `The fourth is set in too ${LONG} ${LONG} ${LONG} and runs on to here.`,
    `1. A numbered item whose first line is full ${LONG} ${LONG} and ends.`,
  ])
})

test('a paragraph begins after a wider gap, even a small one', async () => {
  const page = [line(`One ${LONG}`, 700), line(`still one.`, 684), line(`Two ${LONG}`, 662), line(`still two.`, 646), line(`and two.`, 630)]
  assert.deepEqual(await read([page]), [`One ${LONG} still one.`, `Two ${LONG} still two. and two.`])
})

test('a sentence that crosses the page is one paragraph, and the running header between is gone', async () => {
  const names = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot']
  const pages = names.map((n, p) => [
    line(`${p + 20} THREE ROADS TO QUANTUM GRAVITY`, 760, 50, { size: 8 }),
    line(`tion of ${n} carries on ${LONG}`, 700), line(`${n} two ${LONG}`, 688), line(`${n} three ${LONG}`, 676), line(`${n} four ${LONG}`, 664), line(`${n} five ${LONG} to the organiza-`, 652),
  ])
  const text = await read(pages)
  assert.equal(text.length, 1)
  assert.ok(!text[0].includes('THREE ROADS'))
  assert.ok(text[0].includes('to the organization of bravo carries on'), text[0]) // the word broken across the page is mended
})

test('a word broken across lines: one word, unless the book writes it with a hyphen', async () => {
  const page = [
    line(`A three-dimensional thing, on a lower floor ${LONG}`, 700), line(`${LONG} that is lower-`, 688), line(`dimensional, an organiza-`, 676), line(`tion of ${LONG}.`, 664),
  ]
  const [text] = await read([page])
  assert.ok(text.includes('lower-dimensional'), text)
  assert.ok(text.includes('an organization of'), text)
})

test('a chapter title in the body’s own size is a heading', async () => {
  const page = [line('PROLOGUE', 700), line(`Mars dominated space ${LONG}`, 670), line(`${LONG}.`, 658), line(`${LONG}.`, 646), line(`${LONG}.`, 634)]
  assert.equal((await read([page]))[0], '## PROLOGUE')
})

test('a drop capital joins the word it begins, wherever the scan put it', async () => {
  // the scan reads the small first line first; the large letter comes with the second line
  const page = [
    line(`HILE MOST OF the audience listened ${LONG}`, 258, 73), item('W', 21, 245, { width: 30 }), item('presentation with incomprehension ' + LONG, 73, 245, { width: 227 }),
    line(`${LONG}.`, 232, 21), line(`${LONG}.`, 219, 21),
  ]
  const [text] = await read([page])
  assert.ok(text.startsWith('WHILE MOST OF the audience'), text)
  assert.ok(!/ W presentation/.test(text), text)
})

test('a footnote is heard after the paragraph it belongs to, not inside the one that crosses the page', async () => {
  const pages = [
    [line(`You might assume that ${LONG}`, 700), line(`${LONG} and the sentence is not`, 688), line('* To be fair, Job had good reason not to be an optimist.', 100, 50, { size: 8 })],
    [line(`finished until here ${LONG}.`, 700), line(`${LONG}.`, 688), line(`${LONG}.`, 676)],
  ]
  const text = await read(pages)
  assert.equal(text.length, 2)
  assert.ok(text[0].includes('is not finished until here'), text[0])
  assert.equal(text[1], 'To be fair, Job had good reason not to be an optimist.')
})
