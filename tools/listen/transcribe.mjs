// Speech to text with Whisper in Node via Transformers.js: base (English only) for English, small
// (multilingual) for every other language. Models cache under tools/listen/.cache.
import { pipeline, env } from '@huggingface/transformers'
import { fileURLToPath } from 'node:url'
import { resample } from './signal.mjs'

env.cacheDir = fileURLToPath(new URL('./.cache/models/', import.meta.url))

// The first id that loads wins; the fallback is the earlier community repo of the same model.
const ENGLISH = ['onnx-community/whisper-base.en', 'Xenova/whisper-base.en']
const MULTI = ['onnx-community/whisper-small', 'Xenova/whisper-small']
const loading = new Map() // 'en' | 'multi' → promise

// Which language a text is written in, as Whisper names it: by script, else English.
export function whisperLanguage(text) {
  const n = re => (String(text).match(re) || []).length
  const scripts = [['hindi', /\p{Script=Devanagari}/gu], ['telugu', /\p{Script=Telugu}/gu], ['arabic', /\p{Script=Arabic}/gu], ['korean', /\p{Script=Hangul}/gu], ['japanese', /[\p{Script=Hiragana}\p{Script=Katakana}]/gu], ['chinese', /\p{Script=Han}/gu]]
  const best = scripts.map(([name, re]) => [name, n(re)]).sort((a, b) => b[1] - a[1])[0]
  return best[1] > n(/\p{Script=Latin}/gu) ? best[0] : 'english'
}

function load(kind) {
  if (!loading.has(kind)) {
    loading.set(kind, (async () => {
      const errors = []
      for (const id of kind === 'en' ? ENGLISH : MULTI) {
        try { return { model: id, asr: await pipeline('automatic-speech-recognition', id) } } catch (e) { errors.push(`${id}: ${e.message}`) }
      }
      throw new Error('No Whisper model loaded: ' + errors.join(' | '))
    })())
  }
  return loading.get(kind)
}

// pcm at `rate` → { model, text, words: [{text, start, end}] | null, wordTimestampsError }
// Word times are requested first; if the model cannot align words, plain text is returned and the reason is recorded.
// `language` is a Whisper language name ('english', 'hindi', 'telugu', …); see whisperLanguage().
export async function transcribe(pcm, rate, language = 'english') {
  const { model, asr } = await load(language === 'english' ? 'en' : 'multi')
  const x = resample(pcm, rate, 16000)
  const chunking = { chunk_length_s: 30, stride_length_s: 5, ...(language === 'english' ? {} : { language, task: 'transcribe' }) }
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
