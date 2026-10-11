// Plot sonification: the numbers in a passage played as a line of tones (higher value, higher pitch).
// The pure helpers are tested in Node. Web Audio is touched only inside playTones, which the caller runs from a
// tap, so nothing here touches AudioContext at import time.

const MAX_TONES = 40 // longer series are sampled evenly; the first and last value are always kept
const RAMP_S = 0.015 // attack and release of each tone, seconds: no clicks
const LEAD_S = 0.02 // scheduling lead so the first tone is not clipped at the start

const SCALE = { million: 6, billion: 9, thousand: 3 } // exponent for "1.2 million" and friends
const FORMAT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const YEAR_MIN = 1500
const YEAR_MAX = 2100

// One match per token. A label ("Table 3", "Fig. 2") matches the first branch and has no digits group, so it is
// skipped. A number is an optional minus, digits with optional thousands commas, an optional decimal, an optional
// million / billion / thousand, and an optional percent sign (dropped). A minus only counts as a sign when it does
// not follow a letter or digit, so "2019-2021" reads as two positive years.
const TOKEN = new RegExp(
  String.raw`\b(?:table|figure|fig\.?|chart|exhibit)\s+\d+(?:\.\d+)*` +
    String.raw`|(?<![\w.])(?<sign>[-−])?(?<digits>\d{1,3}(?:,\d{3})+|\d+)(?<frac>\.\d+)?` +
    String.raw`(?:\s*(?<scale>million|billion|thousand)s?\b)?(?<pct>%)?`,
  'gi',
)

function valueOf(m) {
  const { sign, digits, frac = '', scale } = m.groups
  const exponent = scale ? SCALE[scale.toLowerCase()] : 0
  // Number() on a string with an exponent is exact ("1.2e6" is 1200000), where multiplying a float would not be.
  return Number(`${sign ? '-' : ''}${digits.replaceAll(',', '')}${frac}e${exponent}`)
}

// A year is a bare four-digit number with no sign, decimal, scale or percent.
function isYear(m, value) {
  const { sign, frac, scale, pct, digits } = m.groups
  return !sign && !frac && !scale && !pct && /^\d{4}$/.test(digits) && value >= YEAR_MIN && value <= YEAR_MAX
}

// The numbers in a text, in order. Years are dropped when the text has other numbers; a text with only years keeps them.
export function numbersIn(text) {
  const found = []
  for (const m of text.matchAll(TOKEN)) {
    if (m.groups.digits === undefined) continue // "Table 3" or "Figure 2": a label, not data
    const value = valueOf(m)
    found.push({ value, year: isYear(m, value) })
  }
  const data = found.filter(f => !f.year)
  return (data.length > 0 ? data : found).map(f => f.value)
}

// The columns of a table that hold numbers, each as { name, values }. `rows` are the table's cells, header
// row first. A column counts when at least three of its cells, and at least half of them, are numbers. Each
// cell is read on its own, so a value such as 1800 is never mistaken for a year. A first column that only
// counts upward in even steps (years, row numbers) is the table's axis, not data: it is left out when there
// is anything else to play.
const MIN_CELLS = 3
export function columnsIn(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return []
  const [head, ...body] = rows
  const width = Math.max(...rows.map(r => r.length))
  const cols = []
  for (let c = 0; c < width; c++) {
    const values = body.map(r => numbersIn(r[c] || '')[0]).filter(v => v !== undefined)
    if (values.length >= MIN_CELLS && values.length * 2 >= body.length) cols.push({ c, name: head[c] || `Column ${c + 1}`, values })
  }
  const evenSteps = v => v.every((x, i) => i === 0 || x - v[i - 1] === v[1] - v[0]) && v[1] !== v[0]
  const data = cols.length > 1 && cols[0].c === 0 && evenSteps(cols[0].values) ? cols.slice(1) : cols
  return data.map(({ name, values }) => ({ name, values }))
}

// Indexes of the values that become tones: all of them up to MAX_TONES, otherwise MAX_TONES evenly spaced ones.
function pickIndexes(n) {
  if (n <= MAX_TONES) return Array.from({ length: n }, (_, i) => i)
  return Array.from({ length: MAX_TONES }, (_, k) => Math.round((k * (n - 1)) / (MAX_TONES - 1)))
}

// Musical (logarithmic) scale: t runs 0..1 from the lowest value to the highest. Equal steps in t are equal intervals.
function pitchAt(t, low, high) {
  if (t === 0) return low
  if (t === 1) return high
  return low * (high / low) ** t
}

// Values become tones. The scale is set by the whole series, then a long series is sampled, so a tone's pitch
// always matches its value. Equal values all sit at the middle pitch.
export function toTones(values, { low = 220, high = 880, seconds = 0.28 } = {}) {
  if (values.length === 0) return []
  const lo = values.reduce((a, v) => Math.min(a, v), Infinity)
  const hi = values.reduce((a, v) => Math.max(a, v), -Infinity)
  return pickIndexes(values.length).map((i, k) => {
    const t = hi === lo ? 0.5 : (values[i] - lo) / (hi - lo)
    return { freq: pitchAt(t, low, high), start: k * seconds, duration: seconds, value: values[i] }
  })
}

// One plain sentence about the shape of the series. Steps all one way: it rises or falls. Mixed steps: it
// still rises or falls overall when it ends more than half its range away from where it began; otherwise it
// goes up and down. No changes at all means it stays level.
export function describe(values) {
  if (values.length === 0) return 'There are no values.'
  const lo = values.reduce((a, v) => Math.min(a, v), Infinity)
  const hi = values.reduce((a, v) => Math.max(a, v), -Infinity)
  const count = values.length === 1 ? '1 value' : `${values.length} values`
  if (lo === hi) return `${count}, all ${FORMAT.format(lo)}; it stays level.`
  let up = false
  let down = false
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[i - 1]) up = true
    if (values[i] < values[i - 1]) down = true
  }
  const net = (values[values.length - 1] - values[0]) / (hi - lo)
  const trend = up && down ? (net > 0.5 ? 'rises overall' : net < -0.5 ? 'falls overall' : 'goes up and down') : up ? 'rises overall' : 'falls overall'
  const top = values.indexOf(hi)
  const where = top === 0 ? 'at the start' : values.lastIndexOf(hi) === values.length - 1 ? 'at the end' : 'in the middle'
  return `${count}, from ${FORMAT.format(lo)} up to ${FORMAT.format(hi)}; it ${trend}, with the highest ${where}.`
}

// Plays the tones in order: one oscillator per tone through its own gain, with a short attack and release.
// onTone(index) is called as each tone starts. The promise resolves when the last tone ends, or when signal aborts;
// either way the sound fades out and the AudioContext is closed. It rejects only when Web Audio is missing.
export function playTones(tones, { volume = 0.2, onTone, signal } = {}) {
  return new Promise((resolve, reject) => {
    if (tones.length === 0 || (signal && signal.aborted)) {
      resolve()
      return
    }
    const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext
    if (!Ctor) {
      reject(new Error('Web Audio is not available in this browser.'))
      return
    }
    const ctx = new Ctor()
    const t0 = ctx.currentTime + LEAD_S
    const gains = []
    const timers = []
    let done = false

    const finish = () => {
      if (done) return
      done = true
      timers.forEach(id => clearTimeout(id))
      if (signal) signal.removeEventListener('abort', finish)
      const now = ctx.currentTime
      for (const gain of gains) {
        gain.gain.cancelScheduledValues(now)
        gain.gain.setValueAtTime(gain.gain.value, now)
        gain.gain.linearRampToValueAtTime(0, now + RAMP_S)
      }
      setTimeout(() => ctx.close().then(resolve, reject), RAMP_S * 1000)
    }

    tones.forEach((tone, index) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const start = t0 + tone.start
      const end = start + tone.duration
      osc.type = 'sine'
      osc.frequency.value = tone.freq
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(volume, start + RAMP_S)
      gain.gain.setValueAtTime(volume, end - RAMP_S)
      gain.gain.linearRampToValueAtTime(0, end)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(end)
      gains.push(gain)
      if (onTone) timers.push(setTimeout(() => onTone(index), Math.max(0, (start - ctx.currentTime) * 1000)))
    })

    const last = tones[tones.length - 1]
    timers.push(setTimeout(finish, Math.max(0, (t0 + last.start + last.duration - ctx.currentTime) * 1000)))
    if (signal) signal.addEventListener('abort', finish)
    ctx.resume()
  })
}
