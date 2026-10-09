// node --test src/lib/   — checks the pure core: text cleanup, segmentation, Ogg muxing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanText, sentences, spokenMath, toListening } from './text.js'
import { oggCrc, muxOggOpus, packPackets, unpackPackets } from './audio-format.js'

test('cleanText strips citations, urls, ligatures; expands abbreviations', () => {
  assert.equal(cleanText('Transformers [12, 14] are ﬁne (Vaswani et al., 2017). See https://x.y/z'), 'Transformers are fine. See')
  assert.equal(cleanText('Many models, e.g. BERT, work.'), 'Many models, for example, BERT, work.')
  assert.equal(cleanText('As shown in Fig. 3 and Eq. (2).'), 'As shown in Figure 3 and Equation (2).')
})

test('sentences splits, merges stubs, and caps length for the TTS model', () => {
  assert.deepEqual(sentences('Hello there. How are you? Fine.'), ['Hello there.', 'How are you?', 'Fine.'])
  const long = Array.from({ length: 80 }, (_, i) => `clause ${i},`).join(' ') + ' end.'
  for (const s of sentences(long)) assert.ok(s.length <= 364, `too long: ${s.length}`)
})

test('spokenMath reads common LaTeX aloud', () => {
  assert.equal(spokenMath('E = mc^2'), 'E equals mc squared')
  assert.equal(spokenMath('\\frac{a}{b} \\leq \\alpha'), 'a over b is at most alpha')
})

test('toListening drops empty blocks and keeps kinds', () => {
  const out = toListening([{ k: 'h', text: 'Introduction.' }, { k: 'p', text: '[3]' }, { k: 'p', text: 'One. Two words here.' }])
  assert.deepEqual(out, [{ k: 'h', s: ['Introduction'] }, { k: 'p', s: ['One.', 'Two words here.'] }])
})

test('Ogg CRC matches the CRC-32 (poly 04C11DB7, init 0) check value', () => {
  assert.equal(oggCrc(new TextEncoder().encode('123456789')), 0x89a1897f)
})

test('muxOggOpus writes valid pages with correct final granule', () => {
  const packets = Array.from({ length: 600 }, (_, i) => new Uint8Array(80).fill(i & 0xff))
  const frames = packets.map(() => 960)
  const ogg = muxOggOpus(packets, frames)
  let o = 0, pages = 0, lastGranule = 0n, eos = false
  while (o < ogg.length) {
    assert.equal(String.fromCharCode(...ogg.subarray(o, o + 4)), 'OggS')
    const v = new DataView(ogg.buffer, o)
    const n = ogg[o + 26]
    const len = 27 + n + ogg.subarray(o + 27, o + 27 + n).reduce((a, b) => a + b, 0)
    const copy = ogg.slice(o, o + len)
    copy.fill(0, 22, 26)
    assert.equal(oggCrc(copy), v.getUint32(22, true), `bad CRC on page ${pages}`)
    lastGranule = v.getBigInt64(6, true)
    eos = (ogg[o + 5] & 4) !== 0
    o += len
    pages++
  }
  assert.equal(o, ogg.length)
  assert.equal(lastGranule, 600n * 960n)
  assert.ok(eos)
  const rt = unpackPackets(packPackets(packets, frames))
  assert.equal(rt.packets.length, 600)
  assert.deepEqual(rt.packets[5], packets[5])
})
