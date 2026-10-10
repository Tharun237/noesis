// Float32 PCM → stored audio record (Opus via WebCodecs, muxed later; WAV where Opus encoding is
// unavailable). Runs in the voice worker.
import { packPackets, wav } from './audio-format.js'

const OPUS = { codec: 'opus', numberOfChannels: 1, bitrate: 32000 }
const opusOk = new Map() // sample rate → supported (Piper voices are 16 or 22.05 kHz)

export async function encode(pcm, rate) {
  if (!opusOk.has(rate)) {
    opusOk.set(rate, typeof AudioEncoder !== 'undefined' &&
      !!(await AudioEncoder.isConfigSupported({ ...OPUS, sampleRate: rate }).catch(() => null))?.supported)
  }
  if (!opusOk.get(rate)) return { codec: 'wav', bytes: wav(pcm, rate) }
  const packets = []
  const frames = []
  let failure = null
  const enc = new AudioEncoder({
    output: chunk => {
      const b = new Uint8Array(chunk.byteLength)
      chunk.copyTo(b)
      packets.push(b)
      frames.push(Math.round(((chunk.duration ?? 20000) * 48000) / 1e6))
    },
    error: e => { failure = e },
  })
  enc.configure({ ...OPUS, sampleRate: rate })
  enc.encode(new AudioData({ format: 'f32', sampleRate: rate, numberOfFrames: pcm.length, numberOfChannels: 1, timestamp: 0, data: pcm }))
  await enc.flush()
  enc.close()
  if (failure) throw failure
  return { codec: 'opus', rate, ...packPackets(packets, frames) }
}
