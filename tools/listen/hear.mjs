// Did this audio say these words? For a WAV from anywhere (a cloud voice, a recording):
//   node tools/listen/hear.mjs file.wav "the text it should say"
// The language is taken from the script of the text. Prints what was heard and the share of words missed.
import { readWav } from './wav.mjs'
import { transcribe, whisperLanguage } from './transcribe.mjs'
import { compare } from './compare.mjs'
import { levels, silences } from './signal.mjs'

const [file, text] = process.argv.slice(2)
if (!file || !text) { console.error('usage: node tools/listen/hear.mjs file.wav "expected text"'); process.exit(2) }
const { pcm, rate } = readWav(file)
const language = whisperLanguage(text)
const tr = await transcribe(pcm, rate, language)
const cmp = compare(text, tr.text)
const lv = levels(pcm)
const si = silences(pcm, rate)
console.log(JSON.stringify({
  seconds: +(pcm.length / rate).toFixed(2), rate, language, model: tr.model,
  heard: tr.text, wer: +(cmp.wer * 100).toFixed(1) + '%',
  substitutions: cmp.substitutions.map(([a, b]) => `${a}>${b}`), missing: cmp.missing, extra: cmp.extra,
  rmsDbfs: +lv.rmsDbfs.toFixed(1), clipped: lv.clipped, longestPauseMs: si.longestPauseMs,
}, null, 1))
