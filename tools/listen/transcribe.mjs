// Speech to text with Whisper (base, English) in Node via Transformers.js. Models cache under tools/listen/.cache.
import { pipeline, env } from '@huggingface/transformers'
import { fileURLToPath } from 'node:url'
import { resample } from './signal.mjs'

env.cacheDir = fileURLToPath(new URL('./.cache/models/', import.meta.url))

// The first id that loads wins; the fallback is the earlier community repo of the same model.
const MODELS = ['onnx-community/whisper-base.en', 'Xenova/whisper-base.en']
let loading = null

function load() {
  if (!loading) {
    loading = (async () => {
      const errors = []
      for (const id of MODELS) {
        try { return { model: id, asr: await pipeline('automatic-speech-recognition', id) } } catch (e) { errors.push(`${id}: ${e.message}`) }
      }
      throw new Error('No Whisper model loaded: ' + errors.join(' | '))
    })()
  }
  return loading
}

// pcm at `rate` → { model, text, words: [{text, start, end}] | null, wordTimestampsError }
// Word times are requested first; if the model cannot align words, plain text is returned and the reason is recorded.
export async function transcribe(pcm, rate) {
  const { model, asr } = await load()
  const x = resample(pcm, rate, 16000)
  const chunking = { chunk_length_s: 30, stride_length_s: 5 }
  try {
    const out = await asr(x, { ...chunking, return_timestamps: 'word' })
    return {
      model,
      text: out.text.trim(),
      words: (out.chunks || []).map(c => ({ text: c.text.trim(), start: c.timestamp[0], end: c.timestamp[1] })),
      wordTimestampsError: null,
    }
  } catch (e) {
    const out = await asr(x, chunking)
    return { model, text: out.text.trim(), words: null, wordTimestampsError: e.message }
  }
}
