// Generation-time "equalizer" presets (tone.js). Standard RBJ cookbook biquads in plain JS,
// processed in place on a copy. 'natural' = no processing.
function lowShelf(f0, gainDb, rate, S = 1) {
  const A = Math.pow(10, gainDb / 40)
  const w0 = (2 * Math.PI * f0) / rate
  const cos = Math.cos(w0), sin = Math.sin(w0)
  const alpha = (sin / 2) * Math.sqrt((A + 1 / A) * (1 / S - 1) + 2)
  const sqrtA = Math.sqrt(A)
  const b0 = A * (A + 1 - (A - 1) * cos + 2 * sqrtA * alpha)
  const b1 = 2 * A * (A - 1 - (A + 1) * cos)
  const b2 = A * (A + 1 - (A - 1) * cos - 2 * sqrtA * alpha)
  const a0 = A + 1 + (A - 1) * cos + 2 * sqrtA * alpha
  const a1 = -2 * (A - 1 + (A + 1) * cos)
  const a2 = A + 1 + (A - 1) * cos - 2 * sqrtA * alpha
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0]
}

function highShelf(f0, gainDb, rate, S = 1) {
  const A = Math.pow(10, gainDb / 40)
  const w0 = (2 * Math.PI * f0) / rate
  const cos = Math.cos(w0), sin = Math.sin(w0)
  const alpha = (sin / 2) * Math.sqrt((A + 1 / A) * (1 / S - 1) + 2)
  const sqrtA = Math.sqrt(A)
  const b0 = A * (A + 1 + (A - 1) * cos + 2 * sqrtA * alpha)
  const b1 = -2 * A * (A - 1 + (A + 1) * cos)
  const b2 = A * (A + 1 + (A - 1) * cos - 2 * sqrtA * alpha)
  const a0 = A + 1 - (A - 1) * cos + 2 * sqrtA * alpha
  const a1 = 2 * (A - 1 - (A + 1) * cos)
  const a2 = A + 1 - (A - 1) * cos - 2 * sqrtA * alpha
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0]
}

function peaking(f0, gainDb, Q, rate) {
  const A = Math.pow(10, gainDb / 40)
  const w0 = (2 * Math.PI * f0) / rate
  const cos = Math.cos(w0), sin = Math.sin(w0)
  const alpha = sin / (2 * Q)
  const b0 = 1 + alpha * A
  const b1 = -2 * cos
  const b2 = 1 - alpha * A
  const a0 = 1 + alpha / A
  const a1 = -2 * cos
  const a2 = 1 - alpha / A
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0]
}

function runBiquad(data, c) {
  const [b0, b1, b2, a1, a2] = c
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let n = 0; n < data.length; n++) {
    const x0 = data[n]
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
    x2 = x1; x1 = x0; y2 = y1; y1 = y0
    data[n] = y0
  }
}

function stagesFor(tone, rate) {
  if (tone === 'clear') return [lowShelf(180, -3, rate), peaking(3000, 3, 0.9, rate), highShelf(6000, 2, rate)]
  if (tone === 'warm') return [lowShelf(200, 3, rate), highShelf(5000, -2, rate)]
  if (tone === 'bright') return [highShelf(4500, 5, rate), peaking(300, -2, 1, rate)]
  return null
}

export function applyTone(pcm, rate, tone) {
  if (!tone || tone === 'natural') return pcm
  const stages = stagesFor(tone, rate)
  if (!stages) return pcm
  const out = new Float32Array(pcm)
  for (const c of stages) runBiquad(out, c)
  let peak = 0
  for (let i = 0; i < out.length; i++) {
    const a = Math.abs(out[i])
    if (a > peak) peak = a
  }
  if (peak > 0.98) {
    const g = 0.98 / peak
    for (let i = 0; i < out.length; i++) out[i] *= g
  }
  return out
}
