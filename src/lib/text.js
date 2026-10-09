// Text normalisation for listening. Pure functions — no DOM — so they run in Node tests too.

const LIGATURES = { 'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬃ': 'ffi', 'ﬄ': 'ffl', 'ﬅ': 'st', 'ﬆ': 'st' }

// Abbreviations that both sound wrong and trick the sentence splitter ("e.g. The" ≠ two sentences).
const SPOKEN = [
  [/\be\.\s?g\.,?/gi, 'for example,'],
  [/\bi\.\s?e\.,?/gi, 'that is,'],
  [/\bet al\.(?=\s+[a-z(,])/g, 'et al'],
  [/\bcf\.\s*/gi, 'compare '],
  [/\bvs?\.\s+/gi, 'versus '],
  [/\bFigs?\.\s*(?=\d)/g, m => (m.startsWith('Figs') ? 'Figures ' : 'Figure ')],
  [/\bEqs?\.\s*(?=[\d(])/g, m => (m.startsWith('Eqs') ? 'Equations ' : 'Equation ')],
  [/\bSecs?\.\s*(?=\d)/g, 'Section '],
  [/\bTab\.\s*(?=\d)/g, 'Table '],
  [/\bapprox\.\s*/gi, 'approximately '],
  [/\bw\.r\.t\.\s*/gi, 'with respect to '],
  [/\bresp\.\s*/gi, 'respectively '],
  [/\bNo\.\s*(?=\d)/g, 'number '],
  [/\bpp?\.\s*(?=\d)/g, 'page '],
]

const CITATIONS = [
  /\s?\[\d+(?:\s*[-–—,]\s*\d+)*\]/g,                                    // [3], [1, 4], [2–7]
  /\s?\((?:see\s)?[A-Z][\p{L}'-]+(?:\s(?:et al\.?|and|&)\s?(?:[A-Z][\p{L}'-]+)?)?,?\s\d{4}[a-z]?(?:[;,]\s?[A-Z][\p{L}'-]+(?:\s(?:et al\.?|and|&)\s?(?:[A-Z][\p{L}'-]+)?)?,?\s\d{4}[a-z]?)*\)/gu, // (Smith et al., 2020; Lee, 2019)
  /[¹²³⁰-⁹]+/g,                                 // superscript footnote marks
]

export function cleanText(s) {
  if (!s) return ''
  s = s.replace(/[ﬀ-ﬆ]/g, c => LIGATURES[c]).replace(/­/g, '')
  for (const re of CITATIONS) s = s.replace(re, '')
  s = s.replace(/\bhttps?\s?:\s?\/\/\S+|\bwww\.\S+|\bdoi:\s?\S+/gi, '') // OCR often writes "https ://"
  for (const [re, to] of SPOKEN) s = s.replace(re, to)
  return s.replace(/\s+([,.;:!?])/g, '$1').replace(/\s+/g, ' ').trim()
}

// LaTeX → words. Covers the common 90% (fractions, powers, Greek, relations); not a full TeX engine.
const MATH_RULES = [
  [/\\sqrt\{([^{}]*)\}/g, ' the square root of $1 '],
  [/\^\{?2\}?/g, ' squared '],
  [/\^\{?3\}?/g, ' cubed '],
  [/\^\{?T\}?/g, ' transpose '],
  [/\^\{([^{}]*)\}/g, ' to the power $1 '],
  [/\^(\w)/g, ' to the $1 '],
  [/_\{([^{}]*)\}/g, ' sub $1 '],
  [/_(\w)/g, ' sub $1 '],
  [/\\(?:leq|le)\b/g, ' is at most '],
  [/\\(?:geq|ge)\b/g, ' is at least '],
  [/\\neq\b/g, ' is not equal to '],
  [/\\approx\b/g, ' is approximately '],
  [/\\propto\b/g, ' is proportional to '],
  [/\\(?:cdot|times)\b/g, ' times '],
  [/\\sum\b/g, ' the sum of '],
  [/\\prod\b/g, ' the product of '],
  [/\\int\b/g, ' the integral of '],
  [/\\partial\b/g, ' partial '],
  [/\\nabla\b/g, ' grad '],
  [/\\infty\b/g, ' infinity '],
  [/\\(?:to|rightarrow)\b/g, ' goes to '],
  [/\\in\b/g, ' in '],
  [/\\(?:left|right|big|Big|bigg|Bigg|displaystyle|mathrm|mathbf|mathit|mathcal|mathbb|text|textbf|operatorname|quad|qquad)\b/g, ' '],
  [/\\([a-zA-Z]+)/g, ' $1 '],
  [/=/g, ' equals '],
  [/\+/g, ' plus '],
  [/(^|[\s(])-(?=[\s\w])/g, '$1 minus '],
  [/</g, ' less than '],
  [/>/g, ' greater than '],
  [/[{}$\\&]/g, ' '],
]

export function spokenMath(tex) {
  let s = tex
  for (let prev = ''; prev !== s;) { prev = s; s = s.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, ' $1 over $2 ') }
  for (const [re, to] of MATH_RULES) s = s.replace(re, to)
  return s.replace(/\s+/g, ' ').trim()
}

// Sentence segmentation with the platform's own segmenter (ICU), then sized for the TTS model:
// Kokoro handles ~510 phoneme tokens per call, so very long sentences are split at clause marks.
const MAX = 280
const MIN = 18
const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' })

function splitLong(s) {
  if (s.length <= MAX) return [s]
  const out = []
  let cur = ''
  for (const part of s.split(/(?<=[;:,—–])\s+|\s+(?=\()/)) {
    if (cur && (cur + ' ' + part).length > MAX) { out.push(cur); cur = part } else cur = cur ? cur + ' ' + part : part
  }
  if (cur) out.push(cur)
  return out.flatMap(p => {
    if (p.length <= MAX * 1.3) return [p]
    const words = p.split(' ')
    const chunks = []
    let c = ''
    for (const w of words) { if (c && (c + ' ' + w).length > MAX) { chunks.push(c); c = w } else c = c ? c + ' ' + w : w }
    if (c) chunks.push(c)
    return chunks
  })
}

export function sentences(text) {
  const out = []
  let carry = ''
  for (const { segment } of segmenter.segment(text)) {
    const s = (carry + segment).trim()
    if (!s) continue
    // Carry enumeration stubs ("1.", "2.3", "a)", "iv.") and unterminated fragments into the next sentence.
    if (s.length < MIN && (/^\(?(?:\d+(?:\.\d+)*|[a-zA-Z]|[ivxIVX]+)[.)]?$/.test(s) || !/[.!?…"”')\]]$/.test(s))) { carry = s + ' '; continue }
    carry = ''
    out.push(...splitLong(s))
  }
  if (carry.trim()) out.length ? (out[out.length - 1] += ' ' + carry.trim()) : out.push(carry.trim())
  return out
}

// Blocks → listening model. Block kinds: h (heading), p, fig, table, math, code.
export function toListening(blocks) {
  const out = []
  for (const b of blocks) {
    const raw = b.k === 'math' && b.tex ? spokenMath(b.text) : b.text
    const t = b.k === 'code' && !b.spoken ? 'A code listing appears here.' : cleanText(raw)
    if (!t || !/[\p{L}\d]/u.test(t)) continue
    const s = b.k === 'h' ? [t.replace(/\.$/, '')] : sentences(t)
    if (s.length) out.push({ k: b.k, s })
  }
  return out
}

export const VISUAL_KINDS = new Set(['fig', 'table', 'math', 'code'])
