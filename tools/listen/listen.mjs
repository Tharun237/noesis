#!/usr/bin/env node
// Listening test for Noesis voices. For each voice: generate the audio in the live app, measure it the way a careful
// listener would, transcribe it, and compare the words with the text.
//   node tools/listen/listen.mjs --voice en_US-ljspeech-medium [--voice ...] [--text "..."] [--all]
// Writes tools/listen/out/<voice>/ (sentence WAVs, stretch.wav), out/report.json and out/report.md.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { capture } from './capture.mjs'
import { writeWav } from './wav.mjs'
import * as sig from './signal.mjs'
import { transcribe, whisperLanguage } from './transcribe.mjs'
import { compare } from './compare.mjs'
import { VOICES } from '../../src/lib/voices.js'

const OUT = fileURLToPath(new URL('./out/', import.meta.url))

// Six sentences: a question, a number, a name, a long sentence with commas, and two short ones.
export const DEFAULT_TEXT = [
  'Welcome to the listening test.',
  'Did the harbour fund grow by 3.5 percent last year?',
  'Ananya Rao, who leads the team, wrote that the new library, the faster engine, and the quieter room all changed how people listen to long documents.',
  'Tharun Gundu checked every sentence by ear before the release.',
  'The fish arrived fresh at dawn, packed in ice.',
  'Thanks.',
].join(' ')

function parseArgs(argv) {
  const voices = []
  let text = DEFAULT_TEXT
  let all = false
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--voice') voices.push(argv[++i])
    else if (argv[i] === '--text') text = argv[++i]
    else if (argv[i] === '--all') all = true
    else throw new Error(`unknown argument: ${argv[i]}`)
  }
  if (all) voices.push(...VOICES.map(v => v.id))
  if (!voices.length) throw new Error('give at least one --voice <id> (or --all)')
  for (const v of voices) if (!VOICES.some(x => x.id === v)) throw new Error(`unknown voice "${v}". Known: ${VOICES.map(x => x.id).join(', ')}`)
  return { voices: [...new Set(voices)], text }
}

async function measure(voice, text) {
  const dir = join(OUT, voice)
  mkdirSync(dir, { recursive: true })
  const t0 = Date.now()
  const cap = await capture({ text, voice, onStatus: s => process.stderr.write(`  [${voice}] ${s}\n`) })
  const st = cap.stretch

  const sentences = cap.sentences.map((s, i) => {
    const file = join(dir, `s${String(i + 1).padStart(2, '0')}.wav`)
    writeWav(file, s.pcm, s.rate)
    return { index: i + 1, text: s.text, seconds: +(s.pcm.length / s.rate).toFixed(2), levels: sig.levels(s.pcm), silences: sig.silences(s.pcm, s.rate), pitch: sig.pitch(s.pcm, s.rate), file }
  })
  writeWav(join(dir, 'stretch.wav'), st.pcm, st.rate)

  const metrics = {
    seconds: +(st.pcm.length / st.rate).toFixed(2),
    levels: sig.levels(st.pcm),
    silences: sig.silences(st.pcm, st.rate),
    joins: sig.joins(st.pcm, st.rate, st.starts),
    pitch: sig.pitch(st.pcm, st.rate),
    roominess: sig.roominess(st.pcm, st.rate),
    brightness: sig.brightness(st.pcm, st.rate),
  }
  const tr = await transcribe(st.pcm, st.rate, whisperLanguage(text))
  const cmp = compare(text, tr.text)
  return {
    voice,
    ok: true,
    ms: Date.now() - t0,
    stretchFramesTotal: st.framesTotal,
    stretchDecodedSamples: st.decodedSamples,
    pageErrors: cap.pageErrors,
    metrics,
    transcript: { model: tr.model, text: tr.text, wordTimestampsError: tr.wordTimestampsError },
    compare: cmp,
    sentences,
    file: join(dir, 'stretch.wav'),
  }
}

const f1 = x => (x === null || x === undefined ? '-' : x.toFixed(1))
const f2 = x => (x === null || x === undefined ? '-' : x.toFixed(2))

// One row per voice; the full detail lives in report.md and report.json.
function summary(r) {
  if (!r.ok) return { voice: r.voice, error: r.error }
  const m = r.metrics, c = r.compare
  const gaps = m.joins.map(j => j.gapMs), clicks = m.joins.map(j => j.clickRatio)
  const misheard = [...c.substitutions.map(([a, b]) => `${a}>${b}`), ...c.missing.map(w => `-${w}`), ...c.extra.map(w => `+${w}`)]
  return {
    voice: r.voice,
    wer: `${(c.wer * 100).toFixed(1)}%`,
    misheard: misheard.join(' ') || 'none',
    rmsDbfs: f1(m.levels.rmsDbfs),
    clipped: m.levels.clipped,
    worstClick: f2(clicks.length ? Math.max(...clicks) : null),
    gapMaxMs: gaps.length ? Math.max(...gaps) : '-',
    gapMinMs: gaps.length ? Math.min(...gaps) : '-',
    flaggedJoins: m.joins.filter(j => j.flagged).length,
    pitchSd: f2(m.pitch.semitoneSd),
    roominessMs: f1(m.roominess.medianMs),
    brightness: f2(m.brightness),
  }
}

function printTable(rows) {
  const cols = [
    ['voice', r => r.voice], ['WER', r => r.wer ?? 'ERROR'], ['misheard', r => (r.misheard || '').slice(0, 34)],
    ['RMS dBFS', r => r.rmsDbfs], ['clipped', r => r.clipped], ['worst join click', r => r.worstClick],
    ['gap max ms', r => r.gapMaxMs], ['gap min ms', r => r.gapMinMs], ['flagged joins', r => r.flaggedJoins],
    ['pitch dev st', r => r.pitchSd], ['roominess ms', r => r.roominessMs], ['brightness', r => r.brightness],
  ]
  const cells = rows.map(r => (r.error ? [r.voice, 'ERROR', ...cols.slice(2).map(() => '')] : cols.map(([, f]) => String(f(r)))))
  const widths = cols.map(([h], i) => Math.max(h.length, ...cells.map(c => c[i].length)))
  const line = cells2 => cells2.map((c, i) => c.padEnd(widths[i])).join('  ')
  console.log(line(cols.map(([h]) => h)))
  console.log(widths.map(w => '-'.repeat(w)).join('  '))
  for (const c of cells) console.log(line(c))
  for (const r of rows.filter(x => x.error)) console.log(`\n${r.voice} failed: ${r.error}`)
}

function markdown(results, text) {
  const rows = results.map(summary)
  const out = ['# Noesis listening report', '', `Text (${text.length} characters):`, '', `> ${text}`, '']
  out.push('| voice | WER | misheard | RMS dBFS | clipped | worst join click | gap max ms | gap min ms | flagged joins | pitch dev st | roominess ms | brightness |')
  out.push('|---|---|---|---|---|---|---|---|---|---|---|---|')
  for (const r of rows) out.push(r.error ? `| ${r.voice} | ERROR: ${r.error} | | | | | | | | | | |` : `| ${r.voice} | ${r.wer} | ${r.misheard} | ${r.rmsDbfs} | ${r.clipped} | ${r.worstClick} | ${r.gapMaxMs} | ${r.gapMinMs} | ${r.flaggedJoins} | ${r.pitchSd} | ${r.roominessMs} | ${r.brightness} |`)
  for (const r of results.filter(x => x.ok)) {
    const m = r.metrics
    out.push('', `## ${r.voice}`, '', `Transcript (${r.transcript.model}): ${r.transcript.text}`, '')
    out.push(`Stretch: ${m.seconds} s. Silence: lead ${m.silences.leadingMs} ms, tail ${m.silences.trailingMs} ms, longest internal pause ${m.silences.longestPauseMs} ms.`)
    out.push(`Pitch median ${m.pitch.medianHz} Hz. Levels: peak ${f1(m.levels.peakDbfs)} dBFS, DC ${m.levels.dc.toExponential(1)}.`)
    out.push('', '| boundary (s) | gap ms | click ratio | flagged |', '|---|---|---|---|')
    for (const j of m.joins) out.push(`| ${j.atSec} | ${j.gapMs} | ${j.clickRatio.toFixed(2)} | ${j.flagged ? (j.gapFlag ? 'gap' : '') + (j.clickFlag ? ' click' : '') : ''} |`)
    out.push('', '| # | seconds | RMS dBFS | clipped | lead ms | tail ms | pitch dev st |', '|---|---|---|---|---|---|---|')
    for (const s of r.sentences) out.push(`| ${s.index} | ${s.seconds} | ${f1(s.levels.rmsDbfs)} | ${s.levels.clipped} | ${s.silences.leadingMs} | ${s.silences.trailingMs} | ${f2(s.pitch.semitoneSd)} |`)
  }
  return out.join('\n') + '\n'
}

async function main() {
  const { voices, text } = parseArgs(process.argv.slice(2))
  mkdirSync(OUT, { recursive: true })
  const results = []
  for (const voice of voices) {
    console.error(`\n== ${voice}`)
    try {
      results.push(await measure(voice, text))
    } catch (e) {
      console.error(`  ${voice} FAILED: ${e.message}`)
      results.push({ voice, ok: false, error: e.message })
    }
  }
  console.log()
  printTable(results.map(summary))
  writeFileSync(join(OUT, 'report.json'), JSON.stringify({ text, generatedAt: new Date().toISOString(), results }, null, 2))
  writeFileSync(join(OUT, 'report.md'), markdown(results, text))
  console.log(`\nReports: ${join(OUT, 'report.md')} and report.json`)
  process.exitCode = results.every(r => r.ok) ? 0 : 1
}

main().catch(e => { console.error(e); process.exitCode = 1 })
