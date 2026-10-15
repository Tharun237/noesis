// Natural pause after every sentence: measure the silence already at the end of the
// sentence's samples and add silence so the total trailing pause reaches a target.
// Silence = trailing 10 ms windows whose level is more than 35 dB below the sentence's RMS.
// Measured per window, not per sample: a neural voice's "silence" is a faint noise floor whose single
// samples cross any fixed line, so a per-sample test saw no silence and padded every sentence in full
// (measured with tools/listen: Alba's gaps came out at 480-750 ms for a 260 ms target).
// Never removes audio; only adds.
const QUIET = Math.pow(10, -35 / 20)
const WIN_S = 0.01

function rmsOf(pcm) {
  let sum = 0
  for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i]
  return pcm.length ? Math.sqrt(sum / pcm.length) : 0
}

function trailingCount(pcm, rate, rms) {
  const win = Math.max(1, Math.round(rate * WIN_S))
  const limit = (rms * QUIET) ** 2
  let end = pcm.length
  while (end > 0) {
    const a = Math.max(0, end - win)
    let sum = 0
    for (let i = a; i < end; i++) sum += pcm[i] * pcm[i]
    if (sum / (end - a) > limit) break
    end = a
  }
  return pcm.length - end
}

// Seconds of trailing silence in pcm (0 when unknown / all silent input is fully silent).
export function trailingSeconds(pcm, rate) {
  if (!pcm?.length || !rate) return 0
  const rms = rmsOf(pcm)
  if (!(rms > 0)) return pcm.length / rate
  return trailingCount(pcm, rate, rms) / rate
}

export function padTail(pcm, rate, targetMs) {
  if (!pcm?.length || !rate || !(targetMs > 0)) return pcm
  const rms = rmsOf(pcm)
  if (!(rms > 0)) return pcm // all silent: nothing to measure against
  const trailing = trailingCount(pcm, rate, rms)
  const target = Math.round((targetMs * rate) / 1000)
  if (trailing >= target) return pcm
  const out = new Float32Array(pcm.length + (target - trailing))
  out.set(pcm)
  return out
}

// Seconds of speech in pcm: from the first window that is not the voice's own quiet to the last (voiceplan.js
// compares a sentence cut from a run with the same sentence spoken alone).
export function speechSeconds(pcm, rate) {
  if (!pcm?.length || !rate) return 0
  const rms = rmsOf(pcm)
  if (!(rms > 0)) return 0
  const win = Math.max(1, Math.round(rate * WIN_S))
  const limit = (rms * QUIET) ** 2
  let start = 0
  while (start < pcm.length) {
    const b = Math.min(pcm.length, start + win)
    let sum = 0
    for (let i = start; i < b; i++) sum += pcm[i] * pcm[i]
    if (sum / (b - start) > limit) break
    start = b
  }
  return Math.max(0, pcm.length - start - trailingCount(pcm, rate, rms)) / rate
}
