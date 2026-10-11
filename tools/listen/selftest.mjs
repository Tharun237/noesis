// Proves each listening metric responds to what it claims, on synthetic audio generated here (no network, no app).
// Run: node tools/listen/selftest.mjs   Exit 0 = every check passed; one PASS/FAIL line per check.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as sig from './signal.mjs'
import { compare } from './compare.mjs'
import { writeWav, readWav } from './wav.mjs'

const RATE = 48000

// Deterministic PRNG (mulberry32), so every run measures the same signal.
function mulberry32(a) {
  return () => {
    a |= 0; a = a + 0x6d2b79f5 | 0
    let t = Math.imul(a ^ a >>> 15, 1 | a)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

// A voice-like test signal: a 10-harmonic tone in `count` bursts of `burst` s, separated by `gap` s of silence.
// f0(t) gives pitch in Hz (phase-continuous). `starts` follows the app's convention: [0, start of burst 1, ..., end],
// so the sentence boundaries are the starts of bursts 1..count-1.
function synth({ count = 4, burst = 0.8, gap = 0.3, f0 = () => 150, gain = 0.2, lead = 0.2, trail = 0.2 } = {}) {
  const total = Math.round((lead + count * burst + (count - 1) * gap + trail) * RATE)
  const x = new Float32Array(total)
  const bursts = []
  for (let b = 0; b < count; b++) {
    const s = Math.round((lead + b * (burst + gap)) * RATE)
    bursts.push([s, s + Math.round(burst * RATE)])
  }
  let phase = 0
  for (const [s, e] of bursts) {
    for (let i = s; i < e; i++) {
      phase = (phase + 2 * Math.PI * f0(i / RATE) / RATE) % (2 * Math.PI)
      let v = 0
      for (let h = 1; h <= 10; h++) v += Math.sin(h * phase) / h
      const fade = Math.min(1, (i - s) / (0.01 * RATE), (e - 1 - i) / (0.01 * RATE))
      x[i] = gain * fade * v / 2.93
    }
  }
  return { x, bursts, starts: [0, ...bursts.slice(1).map(([s]) => s / RATE), total / RATE] }
}

function sine(freq, amp, seconds) {
  const x = new Float32Array(Math.round(seconds * RATE))
  for (let i = 0; i < x.length; i++) x[i] = amp * Math.sin(2 * Math.PI * freq * i / RATE)
  return x
}

// Convolution through the FFT (both inputs zero-padded to a power of two). Output is trimmed to x.length.
function convolve(x, h) {
  let n = 1
  while (n < x.length + h.length) n <<= 1
  const ar = new Float64Array(n), ai = new Float64Array(n), br = new Float64Array(n), bi = new Float64Array(n)
  ar.set(x); br.set(h)
  sig.fft(ar, ai); sig.fft(br, bi)
  for (let i = 0; i < n; i++) {
    const r = ar[i] * br[i] - ai[i] * bi[i]
    ai[i] = ar[i] * bi[i] + ai[i] * br[i]
    ar[i] = r
  }
  sig.ifft(ar, ai)
  return Float32Array.from(ar.subarray(0, x.length))
}

// Room impulse response: direct sound plus exponentially decaying noise, 60 dB down after `rt60` seconds.
function roomIr(rt60, seconds, seed) {
  const rand = mulberry32(seed)
  const h = new Float32Array(Math.round(seconds * RATE))
  h[0] = 1
  for (let t = 1; t < h.length; t++) h[t] = (rand() * 2 - 1) * 0.3 * Math.exp(-6.91 * t / (rt60 * RATE))
  return h
}

const results = []
function check(name, body) {
  try {
    const detail = body()
    results.push(true)
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`)
  } catch (e) {
    results.push(false)
    console.log(`FAIL  ${name} — ${e.message}`)
  }
}
const near = (actual, expected, tol, what) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${what} ${actual} is not within ${tol} of ${expected}`)

const base = synth()
const dry = base.x

check('levels: 0.5-amplitude sine reads -6.0 dBFS peak and -9.0 dBFS RMS; DC offset and clipping are detected', () => {
  const s = sine(440, 0.5, 1)
  const l = sig.levels(s)
  near(l.peakDbfs, -6.02, 0.05, 'peak dBFS')
  near(l.rmsDbfs, -9.03, 0.05, 'RMS dBFS')
  assert.equal(l.clipped, 0)
  near(sig.levels(s.map(v => v + 0.1)).dc, 0.1, 0.001, 'DC offset')
  const hot = sine(440, 1.5, 1).map(v => Math.max(-1, Math.min(1, v)))
  assert.ok(sig.levels(hot).clipped > 0, 'clipped count is zero for a clipped signal')
  return `peak ${l.peakDbfs.toFixed(2)} dBFS, RMS ${l.rmsDbfs.toFixed(2)} dBFS, clipped ${sig.levels(hot).clipped} in the hard-clipped sine`
})

check('silences: 200 ms lead-in and tail, three 300 ms pauses between four bursts', () => {
  const s = sig.silences(dry, RATE)
  near(s.leadingMs, 200, 25, 'leading ms')
  near(s.trailingMs, 200, 25, 'trailing ms')
  assert.equal(s.pauses.length, 3, `pauses found: ${s.pauses.length}`)
  for (const p of s.pauses) near(p.ms, 300, 25, 'pause ms')
  return `lead ${s.leadingMs} ms, tail ${s.trailingMs} ms, pauses ${s.pauses.map(p => p.ms).join('/')} ms`
})

check('joins, clean seams: gaps about 300 ms, click ratios well under 1, nothing flagged', () => {
  const j = sig.joins(dry, RATE, base.starts)
  assert.equal(j.length, 3)
  for (const b of j) {
    near(b.gapMs, 300, 30, 'gap ms')
    assert.ok(b.clickRatio < 1, `click ratio ${b.clickRatio.toFixed(2)} on a clean seam`)
    assert.equal(b.flagged, false)
  }
  return `gaps ${j.map(b => b.gapMs).join('/')} ms, worst click ratio ${Math.max(...j.map(b => b.clickRatio)).toFixed(3)}`
})

check('joins, click: a 0.8 spike at a boundary raises its click ratio above 6 and flags it', () => {
  const x = Float32Array.from(dry)
  x[base.bursts[1][0]] += 0.8
  const j = sig.joins(x, RATE, base.starts)
  assert.ok(j[0].clickRatio > 6, `click ratio ${j[0].clickRatio.toFixed(2)} did not rise above 6`)
  assert.equal(j[0].clickFlag, true)
  assert.ok(j[1].clickRatio < 1 && j[2].clickRatio < 1, 'clicks leaked to clean boundaries')
  return `clicked boundary ratio ${j[0].clickRatio.toFixed(1)} (clean ${sig.joins(dry, RATE, base.starts)[0].clickRatio.toFixed(3)})`
})

check('joins, long gap: a 900 ms pause is measured and flagged as a gap', () => {
  const g = synth({ gap: 0.9 })
  const j = sig.joins(g.x, RATE, g.starts)
  for (const b of j) near(b.gapMs, 900, 40, 'gap ms')
  assert.equal(j[0].gapFlag, true)
  assert.equal(j[0].clickFlag, false)
  return `gaps ${j.map(b => b.gapMs).join('/')} ms, flagged ${j.every(b => b.gapFlag)}`
})

check('levels: hard clipping is counted (baseline has none)', () => {
  const hot = dry.map(v => Math.max(-1, Math.min(1, v * 10)))
  const clipped = sig.levels(hot).clipped
  assert.ok(clipped > 0, 'no clipped samples found')
  assert.equal(sig.levels(dry).clipped, 0)
  return `${clipped} clipped samples after x10 gain (baseline 0)`
})

check('roominess: 300 ms room reverb falls clearly slower than the dry signal', () => {
  const wet = convolve(dry, roomIr(0.3, 0.5, 7))
  const d = sig.roominess(dry, RATE)
  const w = sig.roominess(wet, RATE)
  assert.ok(d.medianMs !== null && w.medianMs !== null, 'no falls measured')
  assert.ok(w.medianMs >= 3 * d.medianMs, `reverb ${w.medianMs} ms not clearly above dry ${d.medianMs} ms`)
  assert.ok(w.medianMs >= 50, `reverb fall ${w.medianMs} ms is too quick`)
  return `dry ${d.medianMs} ms (${d.falls} falls), reverb ${w.medianMs} ms (${w.falls} falls)`
})

check('pitch: a constant 150 Hz tone reads as 150 Hz with near-zero spread', () => {
  const p = sig.pitch(synth({ f0: () => 150 }).x, RATE)
  near(p.medianHz, 150, 3, 'median Hz')
  assert.ok(Number.isFinite(p.semitoneSd) && p.semitoneSd < 1, `semitone spread ${p.semitoneSd} for a constant tone`)
  return `median ${p.medianHz} Hz, spread ${p.semitoneSd} semitones`
})

check('pitch: a tone that moves +/-4 semitones at 1.5 Hz shows a clearly larger spread than the constant one', () => {
  const flat = sig.pitch(synth({ f0: () => 150 }).x, RATE)
  const moving = sig.pitch(synth({ f0: t => 150 * 2 ** (4 * Math.sin(2 * Math.PI * 1.5 * t) / 12) }).x, RATE)
  assert.ok(moving.semitoneSd > flat.semitoneSd + 1.5, `moving ${moving.semitoneSd} vs flat ${flat.semitoneSd}`)
  near(moving.semitoneSd, 4 / Math.SQRT2, 0.5, 'semitone spread of a +/-4 st sine')
  return `flat ${flat.semitoneSd} st, moving ${moving.semitoneSd} st (expected about ${(4 / Math.SQRT2).toFixed(2)})`
})

check('brightness: a 6 kHz tone is almost all above 4 kHz; a 500 Hz tone is almost none', () => {
  const hi = sig.brightness(sine(6000, 0.3, 1), RATE)
  const lo = sig.brightness(sine(500, 0.3, 1), RATE)
  assert.ok(hi > 0.95, `6 kHz share ${hi}`)
  assert.ok(lo < 0.02, `500 Hz share ${lo}`)
  return `6 kHz ${hi}, 500 Hz ${lo}`
})

check('fft: ifft(fft(x)) returns x', () => {
  const rand = mulberry32(3)
  const re = Float64Array.from({ length: 256 }, () => rand() - 0.5)
  const im = new Float64Array(256)
  const orig = Float64Array.from(re)
  sig.fft(re, im); sig.ifft(re, im)
  for (let i = 0; i < 256; i++) near(re[i], orig[i], 1e-9, 'sample')
  return 'max error below 1e-9'
})

check('compare: one changed word and one dropped word give WER 2/9 and name both', () => {
  const r = compare('Hello Tharun, the price rose 3.5 percent today.', 'Hello Taron the price rose 3.5 percent')
  assert.equal(r.refWords, 9)
  assert.deepEqual(r.substitutions, [['tharun', 'taron']])
  assert.deepEqual(r.missing, ['today'])
  assert.deepEqual(r.extra, [])
  near(r.wer, 2 / 9, 1e-9, 'wer')
  assert.equal(compare('Same words, here.', 'same WORDS here').wer, 0)
  return `wer ${r.wer.toFixed(3)}, substitutions ${JSON.stringify(r.substitutions)}, missing ${JSON.stringify(r.missing)}`
})

check('wav: 16-bit round trip keeps the rate and every sample within one quantisation step', () => {
  const dir = mkdtempSync(join(tmpdir(), 'listen-selftest-'))
  try {
    const file = join(dir, 'roundtrip.wav')
    writeWav(file, dry, RATE)
    const back = readWav(file)
    assert.equal(back.rate, RATE)
    assert.equal(back.pcm.length, dry.length)
    let worst = 0
    for (let i = 0; i < dry.length; i++) worst = Math.max(worst, Math.abs(back.pcm[i] - Math.max(-1, Math.min(1, dry[i]))))
    assert.ok(worst <= 1 / 32767 + 1e-9, `worst error ${worst}`)
    return `worst sample error ${worst.toExponential(2)}`
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

const failed = results.filter(r => !r).length
console.log(failed ? `\n${failed} of ${results.length} checks FAILED` : `\nAll ${results.length} checks passed`)
process.exitCode = failed ? 1 : 0
