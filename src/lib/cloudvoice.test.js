// M10: pure parts of the NVIDIA cloud voice client.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isCloudVoice, cloudVoiceInfo, parseWav, baseVoices } from './cloudvoice.js'

test('isCloudVoice: the nv: prefix', () => {
  assert.equal(isCloudVoice('nv:Magpie-Multilingual.HI-IN.Sofia'), true)
  assert.equal(isCloudVoice('en_GB-alba-medium'), false)
  assert.equal(isCloudVoice(''), false)
  assert.equal(isCloudVoice(null), false)
})

test('cloudVoiceInfo parses the NVIDIA name back to a language', () => {
  assert.deepEqual(cloudVoiceInfo('nv:Magpie-Multilingual.HI-IN.Sofia'), { name: 'Sofia', nv: 'hi-IN', lang: 'hi' })
  assert.deepEqual(cloudVoiceInfo('nv:Magpie-Multilingual.EN-US.Mia'), { name: 'Mia', nv: 'en-US', lang: 'en' })
  assert.deepEqual(cloudVoiceInfo('nv:Magpie-Multilingual.PT-BR.Rafael'), { name: 'Rafael', nv: 'pt-BR', lang: 'pt' })
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
