// Minimal Ogg Opus muxer (RFC 3533 + RFC 7845) and WAV writer.
// Why: WebCodecs gives raw Opus packets; <audio> needs a container. 32 kbps Opus stores a
// 5-hour book in ~70 MB instead of ~860 MB as 16-bit WAV — the difference between fitting on a phone or not.

const CRC_TABLE = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let r = i << 24
  for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1
  CRC_TABLE[i] = r >>> 0
}

// Ogg CRC: poly 0x04C11DB7, init 0, no reflection, no final xor.
export function oggCrc(bytes) {
  let c = 0
  for (let i = 0; i < bytes.length; i++) c = ((c << 8) ^ CRC_TABLE[((c >>> 24) ^ bytes[i]) & 0xff]) >>> 0
  return c
}

function page(packets, { granule, serial, seq, bos = false, eos = false }) {
  const lacing = []
  for (const p of packets) {
    let n = p.length
    while (n >= 255) { lacing.push(255); n -= 255 }
    lacing.push(n)
  }
  const bodyLen = packets.reduce((a, p) => a + p.length, 0)
  const out = new Uint8Array(27 + lacing.length + bodyLen)
  const v = new DataView(out.buffer)
  out.set([0x4f, 0x67, 0x67, 0x53], 0) // "OggS"
  out[4] = 0
  out[5] = (bos ? 2 : 0) | (eos ? 4 : 0)
  v.setBigInt64(6, BigInt(granule), true)
  v.setUint32(14, serial, true)
  v.setUint32(18, seq, true)
  out[26] = lacing.length
  out.set(lacing, 27)
  let o = 27 + lacing.length
  for (const p of packets) { out.set(p, o); o += p.length }
  v.setUint32(22, oggCrc(out), true)
  return out
}

const PRE_SKIP = 312 // libopus encoder lookahead at 48 kHz

// packets: Uint8Array[] of raw Opus packets; frames48: samples-at-48kHz each packet decodes to.
export function muxOggOpus(packets, frames48, { inputRate = 24000, serial = 0x4e6f6573 } = {}) {
  const head = new Uint8Array(19)
  const hv = new DataView(head.buffer)
  head.set(new TextEncoder().encode('OpusHead'), 0)
  head[8] = 1 // version
  head[9] = 1 // mono
  hv.setUint16(10, PRE_SKIP, true)
  hv.setUint32(12, inputRate, true)
  const vendor = new TextEncoder().encode('noesis')
  const tags = new Uint8Array(8 + 4 + vendor.length + 4)
  tags.set(new TextEncoder().encode('OpusTags'), 0)
  new DataView(tags.buffer).setUint32(8, vendor.length, true)
  tags.set(vendor, 12)

  const pages = [page([head], { granule: 0, serial, seq: 0, bos: true }), page([tags], { granule: 0, serial, seq: 1 })]
  let seq = 2
  let granule = 0
  let batch = []
  let segs = 0
  for (let i = 0; i < packets.length; i++) {
    const need = Math.floor(packets[i].length / 255) + 1
    if (batch.length && segs + need > 255) {
      pages.push(page(batch, { granule, serial, seq: seq++ }))
      batch = []
      segs = 0
    }
    batch.push(packets[i])
    segs += need
    granule += frames48[i]
  }
  pages.push(page(batch, { granule, serial, seq: seq++, eos: true }))

  const total = pages.reduce((a, p) => a + p.length, 0)
  const out = new Uint8Array(total)
  let o = 0
  for (const p of pages) { out.set(p, o); o += p.length }
  return out
}

// Packets are stored concatenated with a length table so IndexedDB holds one compact record per sentence.
export function packPackets(packets, frames48) {
  const lens = new Uint32Array(packets.length)
  const frames = Uint16Array.from(frames48)
  let total = 0
  packets.forEach((p, i) => { lens[i] = p.length; total += p.length })
  const data = new Uint8Array(total)
  let o = 0
  for (const p of packets) { data.set(p, o); o += p.length }
  return { data, lens, frames }
}

export function unpackPackets({ data, lens, frames }) {
  const packets = []
  let o = 0
  for (const n of lens) { packets.push(data.subarray(o, o + n)); o += n }
  return { packets, frames: Array.from(frames) }
}

export function wav(pcm, rate) {
  const out = new Uint8Array(44 + pcm.length * 2)
  const v = new DataView(out.buffer)
  const str = (o, s) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i) }
  str(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE')
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, pcm.length * 2, true)
  for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true)
  return out
}
