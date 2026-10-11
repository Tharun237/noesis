// Word error rate between the text Noesis should say and what Whisper heard. No dependencies.
// Normalisation: Unicode-aware lower case, apostrophes removed (don't -> dont), "%" read as "percent", every
// other non-letter/digit becomes a space ("3.5" -> "3 5"), and British spellings folded onto American
// (harbour -> harbor, realise -> realize): Whisper writes American, and a spelling is not a mispronunciation.
// Both sides get the same treatment, so punctuation and spelling never count as errors.

// Marks (\p{M}) stay inside words: Indic vowel signs are marks, not letters.
export function normalise(text) {
  return text.normalize('NFKC').toLowerCase().replace(/['’]/g, '').replace(/%/g, ' percent ')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean)
    .map(w => w.replace(/(..)our$/, '$1or').replace(/is(e[sd]?|ing|ation)$/, 'iz$1'))
}

// Levenshtein alignment over words. wer = (substitutions + missing + extra) / reference words.
// substitutions: [expected, heard]; missing: expected words Whisper skipped; extra: words Whisper added.
export function compare(expected, heard) {
  const ref = normalise(expected), hyp = normalise(heard)
  const n = ref.length, m = hyp.length
  const d = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = 0; i <= n; i++) d[i][0] = i
  for (let j = 0; j <= m; j++) d[0][j] = j
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sub = d[i - 1][j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1)
      d[i][j] = Math.min(sub, d[i - 1][j] + 1, d[i][j - 1] + 1)
    }
  }
  const substitutions = [], missing = [], extra = []
  for (let i = n, j = m; i > 0 || j > 0;) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1)) {
      if (ref[i - 1] !== hyp[j - 1]) substitutions.push([ref[i - 1], hyp[j - 1]])
      i--; j--
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      missing.push(ref[i - 1]); i--
    } else {
      extra.push(hyp[j - 1]); j--
    }
  }
  substitutions.reverse(); missing.reverse(); extra.reverse()
  const errors = substitutions.length + missing.length + extra.length
  return { wer: n ? errors / n : (m ? 1 : 0), errors, refWords: n, substitutions, missing, extra }
}
