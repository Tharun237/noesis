// Natural pause after every sentence: measure the silence already at the end of the
// sentence's samples and add silence so the total trailing pause reaches a target.
// Silence = trailing samples whose level is more than 40 dB below the sentence's RMS.
// Never removes audio; only adds.
const DB_RATIO = Math.pow(10, -40 / 20) // 0.01

function rmsOf(pcm) {
  let sum = 0
  for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i]
  return pcm.length ? Math.sqrt(sum / pcm.length) : 0
}

function trailingCount(pcm, threshold) {
  let n = 0
  for (let i = pcm.length - 1; i >= 0; i--) {
    if (Math.abs(pcm[i]) <= threshold) n++
    else break
  }
  return n
}

// Seconds of trailing silence in pcm (0 when unknown / all silent input is fully silent).
export function trailingSeconds(pcm, rate) {
  if (!pcm?.length || !rate) return 0
  const rms = rmsOf(pcm)
  if (!(rms > 0)) return pcm.length / rate
  return trailingCount(pcm, rms * DB_RATIO) / rate
}

export function padTail(pcm, rate, targetMs) {
  if (!pcm?.length || !rate || !(targetMs > 0)) return pcm
  const rms = rmsOf(pcm)
  if (!(rms > 0)) return pcm // all silent: nothing to measure against
  const threshold = rms * DB_RATIO
  const trailing = trailingCount(pcm, threshold)
  const target = Math.round((targetMs * rate) / 1000)
  if (trailing >= target) return pcm
  const out = new Float32Array(pcm.length + (target - trailing))
  out.set(pcm)
  return out
}
