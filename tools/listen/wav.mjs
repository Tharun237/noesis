// 16-bit mono PCM WAV, no dependencies. Writing clamps to -1..1; reading accepts only 16-bit mono.
import { readFileSync, writeFileSync } from 'node:fs'

export function writeWav(path, pcm, rate) {
  const b = Buffer.alloc(44 + pcm.length * 2)
  b.write('RIFF', 0); b.writeUInt32LE(36 + pcm.length * 2, 4); b.write('WAVE', 8)
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22)
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34)
  b.write('data', 36); b.writeUInt32LE(pcm.length * 2, 40)
  for (let i = 0; i < pcm.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, pcm[i])) * 32767), 44 + i * 2)
  writeFileSync(path, b)
}

export function readWav(path) {
  const b = readFileSync(path)
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`${path}: not a WAV file`)
  let fmt = null, data = null
  for (let off = 12; off + 8 <= b.length;) {
    const id = b.toString('ascii', off, off + 4), size = b.readUInt32LE(off + 4), body = off + 8
    if (id === 'fmt ') fmt = { channels: b.readUInt16LE(body + 2), rate: b.readUInt32LE(body + 4), bits: b.readUInt16LE(body + 14) }
    if (id === 'data') data = { start: body, size: Math.min(size, b.length - body) }
    off = body + size + (size & 1)
  }
  if (!fmt || !data) throw new Error(`${path}: missing fmt or data chunk`)
  if (fmt.bits !== 16 || fmt.channels !== 1) throw new Error(`${path}: only 16-bit mono WAV is supported (got ${fmt.bits}-bit, ${fmt.channels} channel(s))`)
  const pcm = new Float32Array(data.size >> 1)
  for (let i = 0; i < pcm.length; i++) pcm[i] = b.readInt16LE(data.start + i * 2) / 32768
  return { pcm, rate: fmt.rate }
}
