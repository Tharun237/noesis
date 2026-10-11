// Listening metrics over mono PCM (Float32Array, -1..1, at `rate` Hz). No dependencies.
// Each metric says what a careful listener would hear. Thresholds marked "to calibrate" are guesses
// until measured on real Noesis audio; selftest.mjs proves each metric responds to what it claims.

const db = x => 20 * Math.log10(Math.max(x, 1e-9)) // dBFS; the floor keeps digital silence finite

// Short-time RMS in dB: one value per `hopMs`, each over a `winMs` window centred on the hop.
export function envelopeDb(pcm, rate, hopMs = 10, winMs = 10) {
  const hop = Math.round(rate * hopMs / 1000)
  const win = Math.round(rate * winMs / 1000)
  const n = Math.floor(pcm.length / hop)
  const out = new Float64Array(n)
  for (let f = 0; f < n; f++) {
    const a = Math.max(0, f * hop + (hop >> 1) - (win >> 1))
    const b = Math.min(pcm.length, a + win)
    let s = 0
    for (let i = a; i < b; i++) s += pcm[i] * pcm[i]
    out[f] = db(Math.sqrt(s / Math.max(1, b - a)))
  }
  return { db: out, hopSec: hop / rate }
}

// The file's speech level: 90th percentile of the 10 ms envelope. Unlike the whole-file RMS it is not
// pulled down by long pauses, so "35 dB below speech" means the same thing for any recording.
export function speechDb(envDb) {
  if (!envDb.length) return -180
  const sorted = envDb.slice().sort()
  return sorted[Math.floor(sorted.length * 0.9)]
}

// Silence = envelope more than 35 dB under the speech level.
const SILENCE_BELOW_SPEECH_DB = 35 // to calibrate

// Peak, RMS, clipped samples and DC offset of the whole file.
// Listener: peak near 0 dBFS with clipped > 0 means crackle and distortion on loud words; DC is a thump at start/end.
export function levels(pcm) {
  let peak = 0, sum = 0, sq = 0, clipped = 0
  for (const x of pcm) {
    const a = Math.abs(x)
    if (a > peak) peak = a
    if (a >= 0.999) clipped++
    sum += x
    sq += x * x
  }
  const n = pcm.length || 1
  return { peakDbfs: db(peak), rmsDbfs: db(Math.sqrt(sq / n)), clipped, dc: sum / n }
}

// Leading and trailing silence, and internal pauses of 250 ms or more.
// Listener: a long dead start, or a pause that lands mid-sentence, sounds like the voice stalled.
export function silences(pcm, rate) {
  const { db: e, hopSec } = envelopeDb(pcm, rate)
  const thr = speechDb(e) - SILENCE_BELOW_SPEECH_DB
  const ms = frames => Math.round(frames * hopSec * 1000)
  const first = e.findIndex(v => v > thr)
  if (first < 0) return { leadingMs: null, trailingMs: null, pauses: [], longestPauseMs: 0, thresholdDb: thr }
  let last = e.length - 1
  while (e[last] <= thr) last--
  const pauses = []
  let run = -1
  for (let f = first; f <= last; f++) {
    if (e[f] <= thr) { if (run < 0) run = f; continue }
    if (run >= 0 && ms(f - run) >= 250) pauses.push({ atSec: +(run * hopSec).toFixed(3), ms: ms(f - run) })
    run = -1
  }
  return {
    leadingMs: ms(first),
    trailingMs: ms(e.length - 1 - last),
    pauses,
    longestPauseMs: pauses.reduce((a, p) => Math.max(a, p.ms), 0),
    thresholdDb: thr,
  }
}

// Each sentence boundary (starts[1..n-1], seconds; starts[0] = 0 and starts[n] = end are not boundaries).
// gapMs: silence directly before plus directly after the boundary (0 if the boundary sits inside speech).
//   Listener: under 60 ms the sentences run together; over 700 ms the voice seems to stop and wonder.
// clickRatio: largest sample-to-sample jump within ±8 ms of the boundary, divided by the RMS of the 200 ms
//   centred on it (floored at 50 dB under speech so silent gaps do not explode the ratio).
//   Listener: a ratio above 6 is a pop or tick at the seam. Threshold 6 is to calibrate.
export function joins(pcm, rate, starts) {
  const { db: e, hopSec } = envelopeDb(pcm, rate)
  const top = speechDb(e)
  const thr = top - SILENCE_BELOW_SPEECH_DB
  const hop = Math.round(rate * 0.01)
  const floor = 10 ** ((top - 50) / 20) // to calibrate
  const half = Math.round(0.1 * rate)
  const w = Math.round(0.008 * rate)
  const out = []
  for (let j = 1; j < starts.length - 1; j++) {
    const s = Math.round(starts[j] * rate)
    const fb = Math.floor(s / hop)
    let before = 0, after = 0
    while (fb - before - 1 >= 0 && e[fb - before - 1] <= thr && before < 200) before++
    while (fb + after < e.length && e[fb + after] <= thr && after < 200) after++
    const gapMs = Math.round((before + after) * hopSec * 1000)
    let jump = 0
    for (let k = Math.max(1, s - w); k <= Math.min(pcm.length - 1, s + w); k++) jump = Math.max(jump, Math.abs(pcm[k] - pcm[k - 1]))
    let sq = 0, n = 0
    for (let k = Math.max(0, s - half); k < Math.min(pcm.length, s + half); k++) { sq += pcm[k] * pcm[k]; n++ }
    const clickRatio = jump / Math.max(Math.sqrt(sq / Math.max(1, n)), floor)
    const gapFlag = gapMs > 700 || gapMs < 60 // to calibrate
    const clickFlag = clickRatio > 6 // to calibrate
    out.push({ atSec: +(s / rate).toFixed(3), gapMs, clickRatio, gapFlag, clickFlag, flagged: gapFlag || clickFlag })
  }
  return out
}

// Pitch track on 16 kHz: 40 ms frames every 10 ms, normalised autocorrelation over lags for 60-400 Hz.
// Voiced = speech-level frame with correlation >= 0.6 (to calibrate). The smallest lag within 90% of the best
// correlation is taken, which avoids octave errors. Parabolic interpolation refines the lag.
// Listener: semitoneSd is how far the voice moves around its middle pitch. Low (under about 2 semitones, to
// calibrate) is flat and robotic; lively, questioning speech moves several semitones.
export function pitch(pcm, rate) {
  const { db: e } = envelopeDb(pcm, rate)
  const thr = speechDb(e) - SILENCE_BELOW_SPEECH_DB
  const x = resample(pcm, rate, 16000)
  const N = 640, HOP = 160, MIN = 40, MAX = 267 // 400 Hz -> lag 40, 60 Hz -> lag 267 at 16 kHz
  const r = new Float64Array(MAX + 2)
  const f0 = []
  for (let p = 0, s = 0; s + N + MAX + 1 <= x.length; p++, s += HOP) {
    if (p >= e.length || e[p] <= thr) continue
    let e0 = 0
    for (let i = 0; i < N; i++) e0 += x[s + i] * x[s + i]
    if (e0 <= 0) continue
    for (let l = MIN - 1; l <= MAX + 1; l++) {
      let c = 0, el = 0
      for (let i = 0; i < N; i++) { const y = x[s + i + l]; c += x[s + i] * y; el += y * y }
      r[l] = c / Math.sqrt(e0 * el + 1e-12)
    }
    let rmax = 0
    for (let l = MIN; l <= MAX; l++) if (r[l] > rmax) rmax = r[l]
    if (rmax < 0.6) continue // to calibrate
    let lag = MIN
    while (r[lag] < 0.9 * rmax) lag++
    while (lag < MAX && r[lag + 1] > r[lag]) lag++ // climb from the first 90% crossing to the top of that peak
    const a = r[lag - 1], b = r[lag], c = r[lag + 1]
    // Interpolate only at a true local maximum: there the parabola's vertex lies within half a lag. Elsewhere
    // the vertex can be many lags away and would give a non-finite pitch.
    const d = a - 2 * b + c
    const off = b >= a && b >= c && d < 0 ? 0.5 * (a - c) / d : 0
    f0.push(16000 / (lag + off))
  }
  if (!f0.length) return { medianHz: null, semitoneSd: null, voicedFrames: 0 }
  const sorted = f0.slice().sort((u, v) => u - v)
  const median = sorted[sorted.length >> 1]
  const st = f0.map(f => 12 * Math.log2(f / median))
  const mean = st.reduce((u, v) => u + v, 0) / st.length
  const sd = Math.sqrt(st.reduce((u, v) => u + (v - mean) ** 2, 0) / st.length)
  return { medianHz: +median.toFixed(1), semitoneSd: +sd.toFixed(2), voicedFrames: f0.length }
}

// Room echo ("bathroom" sound). Find each loud peak that starts a fall. The clock starts when the level first
// sits 3 dB under that peak (the fall begins, so a steady vowel is not timed) and stops at 20 dB under the peak.
// Falls are discarded if the level rises back by more than 3 dB first (speech resumed). Returns the median ms.
// Listener: dry studio speech drops in a few ms; a reverberant room lets each word ring for 100 ms or more.
// The 3 dB start, 20 dB depth and 3 dB "speech resumed" rule are to calibrate.
export function roominess(pcm, rate) {
  const { db: e, hopSec } = envelopeDb(pcm, rate, 5, 10)
  const top = speechDb(e)
  const maxFrames = Math.round(0.5 / hopSec)
  const falls = []
  for (let i = 1; i < e.length - 1; i++) {
    if (e[i] < top - 10) continue // only falls from loud speech
    if (!(e[i] >= e[i - 1] && e[i] > e[i + 1])) continue // a peak that starts a fall
    let start = -1
    for (let j = i + 1; j < e.length && j <= i + maxFrames; j++) {
      if (e[j] <= e[i] - 3) { start = j; break }
      if (e[j] > e[j - 1] + 3) break
    }
    if (start < 0) continue
    for (let j = start + 1; j < e.length && j <= start + maxFrames; j++) {
      if (e[j] <= e[i] - 20) { falls.push((j - start) * hopSec * 1000); break }
      if (e[j] > e[j - 1] + 3) break
    }
  }
  if (!falls.length) return { medianMs: null, falls: 0 }
  falls.sort((u, v) => u - v)
  return { medianMs: +falls[falls.length >> 1].toFixed(1), falls: falls.length }
}

// Share of spectral energy above 4 kHz, over speech frames (Welch average, 2048-point Hann, 50% overlap).
// Listener: low (under about 0.1, to calibrate) is muffled, like a phone line; high is crisp and bright.
export function brightness(pcm, rate) {
  const N = 2048, H = 1024
  const { db: e } = envelopeDb(pcm, rate)
  const thr = speechDb(e) - SILENCE_BELOW_SPEECH_DB
  const win = new Float64Array(N)
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)
  const power = new Float64Array(N / 2 + 1)
  let frames = 0
  for (let s = 0; s + N <= pcm.length; s += H) {
    let sq = 0
    for (let i = 0; i < N; i++) sq += pcm[s + i] * pcm[s + i]
    if (db(Math.sqrt(sq / N)) <= thr) continue
    const re = new Float64Array(N), im = new Float64Array(N)
    for (let i = 0; i < N; i++) re[i] = pcm[s + i] * win[i]
    fft(re, im)
    for (let k = 0; k <= N / 2; k++) power[k] += re[k] * re[k] + im[k] * im[k]
    frames++
  }
  if (!frames) return null
  let total = 0, high = 0
  for (let k = 1; k <= N / 2; k++) {
    total += power[k]
    if (k * rate / N >= 4000) high += power[k]
  }
  return +(high / total).toFixed(4)
}

// Linear resampler. Downsampling averages each output's input span (a box anti-alias filter);
// upsampling interpolates linearly.
export function resample(pcm, from, to) {
  if (from === to) return pcm
  const ratio = from / to
  const n = Math.floor(pcm.length / ratio)
  const out = new Float32Array(n)
  for (let o = 0; o < n; o++) {
    if (ratio >= 1) {
      const a = Math.floor(o * ratio)
      const b = Math.max(a + 1, Math.floor((o + 1) * ratio))
      let s = 0
      for (let i = a; i < b && i < pcm.length; i++) s += pcm[i]
      out[o] = s / (b - a)
    } else {
      const x = o * ratio, i = Math.floor(x), f = x - i
      out[o] = pcm[i] * (1 - f) + (pcm[i + 1] !== undefined ? pcm[i + 1] : pcm[i]) * f
    }
  }
  return out
}

// In-place radix-2 FFT (re/im Float64Array, power-of-two length).
export function fft(re, im) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t
      t = im[i]; im[i] = im[j]; im[j] = t
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1, ang = -2 * Math.PI / len
    for (let k = 0; k < half; k++) {
      const wr = Math.cos(ang * k), wi = Math.sin(ang * k)
      for (let i = k; i < n; i += len) {
        const b = i + half
        const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr
        re[b] = re[i] - xr; im[b] = im[i] - xi
        re[i] += xr; im[i] += xi
      }
    }
  }
}

export function ifft(re, im) {
  for (let i = 0; i < im.length; i++) im[i] = -im[i]
  fft(re, im)
  const n = re.length
  for (let i = 0; i < n; i++) { re[i] /= n; im[i] = -im[i] / n }
}
