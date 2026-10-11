// M10: pure parts of the NVIDIA cloud voice client. M11: the customer's own voice service.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isCloudVoice, cloudVoiceInfo, parseWav, baseVoices, parseVoiceNames,
  buildOwnRequest, encodeWav, explainVoiceError, cloudTruth, NV_TRUTH,
} from './cloudvoice.js'

test('isCloudVoice: the nv: prefix', () => {
  assert.equal(isCloudVoice('nv:Magpie-Multilingual.HI-IN.Sofia'), true)
  assert.equal(isCloudVoice('en_GB-alba-medium'), false)
  assert.equal(isCloudVoice(''), false)
  assert.equal(isCloudVoice(null), false)
})

test('isCloudVoice: the oa: prefix', () => {
  assert.equal(isCloudVoice('oa:nova'), true)
  assert.equal(isCloudVoice('oa:alloy'), true)
  assert.equal(isCloudVoice('oa:'), true)
  assert.equal(isCloudVoice('o:nova'), false)
})

test('cloudVoiceInfo parses the NVIDIA name back to a language', () => {
  assert.deepEqual(cloudVoiceInfo('nv:Magpie-Multilingual.HI-IN.Sofia'), { name: 'Sofia', nv: 'hi-IN', lang: 'hi' })
  assert.deepEqual(cloudVoiceInfo('nv:Magpie-Multilingual.EN-US.Mia'), { name: 'Mia', nv: 'en-US', lang: 'en' })
  assert.deepEqual(cloudVoiceInfo('nv:Magpie-Multilingual.PT-BR.Rafael'), { name: 'Rafael', nv: 'pt-BR', lang: 'pt' })
})

test('cloudVoiceInfo: a custom voice has no language of its own', () => {
  assert.deepEqual(cloudVoiceInfo('oa:nova'), { name: 'nova', lang: null })
  assert.deepEqual(cloudVoiceInfo('oa:alloy'), { name: 'alloy', lang: null })
})

function wavWithExtra(samples, rate = 22050) {
  // RIFF WAVE with an extra JUNK chunk before fmt/data so `data` does not start at byte 44.
  const dataBytes = samples.length * 2
  const out = new Uint8Array(12 + 8 + 4 + 8 + 16 + 8 + dataBytes)
  const v = new DataView(out.buffer)
  const str = (o, s) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i) }
  str(0, 'RIFF'); v.setUint32(4, out.length - 8, true); str(8, 'WAVE')
  let o = 12
  str(o, 'JUNK'); v.setUint32(o + 4, 4, true); o += 8 + 4
  str(o, 'fmt '); v.setUint32(o + 4, 16, true)
  v.setUint16(o + 8, 1, true); v.setUint16(o + 10, 1, true)
  v.setUint32(o + 12, rate, true); v.setUint32(o + 16, rate * 2, true)
  v.setUint16(o + 20, 2, true); v.setUint16(o + 22, 16, true)
  o += 8 + 16
  str(o, 'data'); v.setUint32(o + 4, dataBytes, true)
  for (let i = 0; i < samples.length; i++) v.setInt16(o + 8 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true)
  return out.buffer
}

test('parseWav finds the data chunk and returns samples and rate', () => {
  const { pcm, rate } = parseWav(wavWithExtra([0, 0.5, -0.5, 1, -1]))
  assert.equal(rate, 22050)
  assert.ok(pcm instanceof Float32Array)
  assert.equal(pcm.length, 5)
  assert.ok(Math.abs(pcm[1] - 0.5) < 0.001 && Math.abs(pcm[2] + 0.5) < 0.001)
})

// frames: [[channel samples]...] in -1..1 (raw values for 32-bit float).
function makeWav({ format = 1, channels = 1, bits = 16, rate = 22050, frames }) {
  const step = (bits / 8) * channels
  const dataBytes = frames.length * step
  const out = new Uint8Array(44 + dataBytes)
  const v = new DataView(out.buffer)
  const str = (o, s) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i) }
  str(0, 'RIFF'); v.setUint32(4, 36 + dataBytes, true); str(8, 'WAVE')
  str(12, 'fmt '); v.setUint32(16, 16, true)
  v.setUint16(20, format, true); v.setUint16(22, channels, true)
  v.setUint32(24, rate, true); v.setUint32(28, rate * step, true)
  v.setUint16(32, step, true); v.setUint16(34, bits, true)
  str(36, 'data'); v.setUint32(40, dataBytes, true)
  frames.forEach((fr, f) => {
    fr.forEach((s, c) => {
      const at = 44 + f * step + c * (bits / 8)
      if (format === 3) v.setFloat32(at, s, true)
      else if (bits === 8) out[at] = Math.max(0, Math.min(255, Math.round(((s + 1) / 2) * 255)))
      else if (bits === 16) v.setInt16(at, Math.max(-1, Math.min(1, s)) * 0x7fff, true)
      else if (bits === 24) {
        let w = Math.round(Math.max(-1, Math.min(1, s)) * 0x7fffff)
        if (w < 0) w += 0x1000000
        out[at] = w & 0xff; out[at + 1] = (w >> 8) & 0xff; out[at + 2] = (w >> 16) & 0xff
      } else v.setInt32(at, Math.max(-1, Math.min(1, s)) * 0x7fffffff, true)
    })
  })
  return out.buffer
}

test('parseWav averages stereo channels', () => {
  const { pcm, rate } = parseWav(makeWav({ channels: 2, frames: [[0.5, -0.5], [1, 1], [-1, 0]] }))
  assert.equal(rate, 22050)
  assert.equal(pcm.length, 3)
  assert.ok(Math.abs(pcm[0]) < 0.001 && Math.abs(pcm[1] - 1) < 0.001 && Math.abs(pcm[2] + 0.5) < 0.001)
})

test('parseWav reads 8-bit PCM', () => {
  const { pcm } = parseWav(makeWav({ bits: 8, frames: [[0], [0.5], [-0.5], [1], [-1]] }))
  assert.equal(pcm.length, 5)
  for (let i = 0; i < 5; i++) assert.ok(Math.abs(pcm[i] - [0, 0.5, -0.5, 1, -1][i]) < 0.02)
})

test('parseWav reads 24-bit PCM', () => {
  const { pcm } = parseWav(makeWav({ bits: 24, frames: [[0], [0.5], [-0.5], [1], [-1]] }))
  assert.equal(pcm.length, 5)
  for (let i = 0; i < 5; i++) assert.ok(Math.abs(pcm[i] - [0, 0.5, -0.5, 1, -1][i]) < 0.001)
})

test('parseWav reads 32-bit PCM', () => {
  const { pcm } = parseWav(makeWav({ bits: 32, frames: [[0], [0.25], [-0.75]] }))
  assert.equal(pcm.length, 3)
  assert.ok(Math.abs(pcm[1] - 0.25) < 0.001 && Math.abs(pcm[2] + 0.75) < 0.001)
})

test('parseWav reads 32-bit float', () => {
  const { pcm, rate } = parseWav(makeWav({ format: 3, bits: 32, rate: 16000, frames: [[0.1], [-0.9], [0.99]] }))
  assert.equal(rate, 16000)
  assert.equal(pcm.length, 3)
  assert.ok(Math.abs(pcm[0] - 0.1) < 1e-6 && Math.abs(pcm[1] + 0.9) < 1e-6 && Math.abs(pcm[2] - 0.99) < 1e-6)
})

test('parseWav rejects anything else with the supported-format error', () => {
  assert.throws(() => parseWav(makeWav({ format: 6, bits: 8, frames: [[0]] })), /This audio format is not supported/)
  assert.throws(() => parseWav(makeWav({ format: 7, bits: 8, frames: [[0]] })), /This audio format is not supported/)
  assert.throws(() => parseWav(makeWav({ format: 3, bits: 64, frames: [[0]] })), /This audio format is not supported/)
})

test('encodeWav round-trips through parseWav', () => {
  const { pcm, rate } = parseWav(encodeWav(new Float32Array([0, 0.5, -0.5]), 22050).buffer)
  assert.equal(rate, 22050)
  assert.equal(pcm.length, 3)
  assert.ok(Math.abs(pcm[1] - 0.5) < 0.001 && Math.abs(pcm[2] + 0.5) < 0.001)
})

test('baseVoices groups three-part names by language and drops emotion variants', () => {
  const reply = {
    'en-US,es-US,hi-IN': { voices: [
      'Magpie-Multilingual.EN-US.Mia',
      'Magpie-Multilingual.EN-US.Mia.Calm',
      'Magpie-Multilingual.HI-IN.Sofia',
      'Magpie-Multilingual.HI-IN.Leo',
      'two.parts',
    ] },
  }
  assert.deepEqual(baseVoices(reply), {
    en: ['Magpie-Multilingual.EN-US.Mia'],
    hi: ['Magpie-Multilingual.HI-IN.Sofia', 'Magpie-Multilingual.HI-IN.Leo'],
  })
  assert.deepEqual(baseVoices({}), {})
})

test('parseVoiceNames splits commas, trims and drops empties', () => {
  assert.deepEqual(parseVoiceNames('alloy, nova'), ['alloy', 'nova'])
  assert.deepEqual(parseVoiceNames(' alloy ,,nova , alloy '), ['alloy', 'nova'])
  assert.deepEqual(parseVoiceNames(''), [])
  assert.deepEqual(parseVoiceNames(null), [])
})

test('buildOwnRequest: the exact request for one sentence', () => {
  const req = buildOwnRequest('Hello.', 'nova', 'https://api.openai.com/v1/', 'tts-1', 'sk-test')
  assert.equal(req.url, 'https://api.openai.com/v1/audio/speech')
  assert.equal(req.method, 'POST')
  assert.deepEqual(req.headers, { 'content-type': 'application/json', authorization: 'Bearer sk-test' })
  assert.deepEqual(JSON.parse(req.body), { model: 'tts-1', voice: 'nova', input: 'Hello.', response_format: 'wav' })
})

test('buildOwnRequest: no Authorization header without a key', () => {
  const req = buildOwnRequest('Hi.', 'alloy', 'http://localhost:8880/v1', 'local-model', '')
  assert.equal(req.url, 'http://localhost:8880/v1/audio/speech')
  assert.deepEqual(req.headers, { 'content-type': 'application/json' })
  assert.deepEqual(JSON.parse(req.body), { model: 'local-model', voice: 'alloy', input: 'Hi.', response_format: 'wav' })
})

test('explainVoiceError says plainly why the Test did not answer', () => {
  assert.equal(
    explainVoiceError(new TypeError('fetch failed'), 'api.openai.com', true),
    "Couldn't reach api.openai.com from the browser. Check the address; some services do not accept requests from a web page.",
  )
  assert.equal(
    explainVoiceError(new TypeError('fetch failed'), 'api.openai.com', false),
    'No connection. Your voice service setting is saved. Test again when online.',
  )
  assert.equal(
    explainVoiceError(Object.assign(new Error('api.openai.com did not accept the key. Check it in Settings.'), { status: 401 }), 'api.openai.com', true),
    'api.openai.com did not accept the key. Check it in Settings.',
  )
})

test('cloudTruth: NVIDIA exactly, custom with the real host', () => {
  assert.equal(cloudTruth('nv:Magpie-Multilingual.EN-US.Mia'), NV_TRUTH)
  assert.equal(
    cloudTruth('oa:nova', 'api.openai.com'),
    'Made online by api.openai.com: the text goes straight from this device to that address. The audio is kept on this device and plays offline.',
  )
})
