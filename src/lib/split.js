// A run of sentences spoken as one, cut back into its sentences at the voice's own pauses.
//
// Each sentence used to be spoken alone: the voice ended every one as if nothing came after it and began the next
// cold, so at each full stop the feeling dropped and started again ("it cuts abrupt and starts abrupt, no
// emotions", Tharun, 16 October 2026; given the whole paragraph instead, "B is far better than A"). Noesis still
// keeps one piece of audio per sentence (the place, the light on the words, bookmarks and seeking count in
// sentences), so the run's audio is cut where the voice itself paused between two sentences.
//
// A cut is used only when it can be trusted: in a real pause, near where that sentence's share of the text says it
// ends, and every piece about as long as its text. Otherwise null, and the caller makes the sentences one by one,
// as before: never a sentence lit while another is heard.
//
// pcm: Float32Array of the whole run · lengths: characters of each sentence → sample index where each sentence
// starts and the end ([0, …, pcm.length], lengths.length + 1 bounds), or null.
const WIN_S = 0.01
const QUIET_DB = 35 // a window this far under the run's level is the voice's own quiet (as pause.js)
const MIN_PAUSE_MS = 90 // shorter than this is a breath inside a word, not between sentences
const NEAR = 0.22 // a cut may be this far (share of the speech) from where the text says the sentence ends
const KEEP_MS = 40 // of the pause, kept as the next sentence's own lead-in: the rest stays with the sentence it ends
const FIT = [0.45, 2.2] // each piece's share of the speech against its share of the text

export function sentenceCuts(pcm, rate, lengths) {
  const n = lengths.length
  if (n < 2) return n === 1 ? [0, pcm.length] : null
  const win = Math.max(1, Math.round(rate * WIN_S))
  const count = Math.floor(pcm.length / win)
  if (count < 4) return null
  let all = 0
  for (let i = 0; i < pcm.length; i++) all += pcm[i] * pcm[i]
  const limit = (all / pcm.length) * 10 ** (-QUIET_DB / 10)
  const quiet = new Uint8Array(count)
  for (let w = 0; w < count; w++) {
    let s = 0
    for (let i = w * win; i < (w + 1) * win; i++) s += pcm[i] * pcm[i]
    quiet[w] = s / win < limit ? 1 : 0
  }
  let first = 0, last = count - 1
  while (first < count && quiet[first]) first++
  while (last > first && quiet[last]) last--
  if (last - first < 4) return null
  // the pauses inside the speech: [start window, end window)
  const minRun = Math.ceil(MIN_PAUSE_MS / 1000 / WIN_S)
  const runs = []
  for (let w = first; w <= last; w++) {
    if (!quiet[w]) continue
    let e = w
    while (e <= last && quiet[e]) e++
    if (e - w >= minRun) runs.push({ a: w, b: e, mid: (w + e) / 2, len: e - w })
    w = e
  }
  const total = lengths.reduce((x, y) => x + y, 0) || 1
  const span = last + 1 - first
  const want = []
  for (let k = 1, at = 0; k < n; k++) { at += lengths[k - 1]; want.push(first + (at / total) * span) }
  // the best ordered choice of one pause per boundary: long pauses near where they are expected (dynamic programming)
  const score = (r, k) => {
    const off = Math.abs(r.mid - want[k]) / span
    return off > NEAR ? -Infinity : r.len / minRun - off * 20
  }
  const R = runs.length, K = n - 1
  if (R < K) return null
  const best = Array.from({ length: K }, () => new Float64Array(R).fill(-Infinity))
  const from = Array.from({ length: K }, () => new Int32Array(R).fill(-1))
  for (let r = 0; r < R; r++) best[0][r] = score(runs[r], 0)
  for (let k = 1; k < K; k++) {
    let top = -Infinity, topAt = -1
    for (let r = 0; r < R; r++) {
      if (r > 0 && best[k - 1][r - 1] > top) { top = best[k - 1][r - 1]; topAt = r - 1 }
      const s = score(runs[r], k)
      if (top > -Infinity && s > -Infinity) { best[k][r] = top + s; from[k][r] = topAt }
    }
  }
  let end = -1, endScore = -Infinity
  for (let r = 0; r < R; r++) if (best[K - 1][r] > endScore) { endScore = best[K - 1][r]; end = r }
  if (end < 0) return null
  const chosen = new Array(K)
  for (let k = K - 1, r = end; k >= 0; k--) { chosen[k] = runs[r]; r = from[k][r] }
  // each piece about as long as its text
  const edges = [first, ...chosen.map(r => r.mid), last + 1]
  for (let k = 0; k < n; k++) {
    const ratio = (edges[k + 1] - edges[k]) / span / (lengths[k] / total)
    if (ratio < FIT[0] || ratio > FIT[1]) return null
  }
  const keep = Math.round((KEEP_MS / 1000) * rate)
  return [0, ...chosen.map(r => Math.max(r.a * win, r.b * win - keep)), pcm.length]
}
