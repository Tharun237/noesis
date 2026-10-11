// Reading insights for one document, all on the device, no AI. The arc and tone count ordinary
// English words of feeling, so they only mean something for English text. Pure: no DOM access.

// Common English words of feeling. Lower case. A word is in at most one set.
export const POSITIVE = new Set([
  'joy', 'joyful', 'hope', 'hopeful', 'love', 'loved', 'loving', 'success', 'successful', 'calm', 'calmer',
  'bright', 'brighter', 'win', 'won', 'safe', 'safety', 'happy', 'happiness', 'kind', 'kindness',
  'gentle', 'gentleness', 'gift', 'gifts', 'laugh', 'laughed', 'laughter', 'smile', 'smiled', 'smiles',
  'cheer', 'cheerful', 'delight', 'delighted', 'wonderful', 'beautiful', 'beauty', 'brave', 'bravery',
  'peace', 'peaceful', 'warm', 'warmth', 'free', 'freedom', 'grace', 'glad', 'grateful', 'thanks', 'thankful',
  'generous', 'honest', 'honesty', 'friend', 'friends', 'friendship', 'trust', 'lucky', 'luck',
  'celebrate', 'celebration', 'triumph', 'victory', 'reward', 'rewarded', 'shine', 'shining',
  'sunny', 'sunshine', 'comfort', 'comforted', 'healthy', 'health', 'healed', 'heal',
  'growth', 'blessing', 'blessed', 'pleasure', 'pleased', 'great', 'good', 'best', 'better',
  'improve', 'improved', 'progress', 'achieve', 'achieved', 'achievement', 'admired', 'proud', 'pride',
  'tender', 'embrace', 'hug', 'playful', 'fun', 'enjoy', 'enjoyed', 'enjoyable',
  'delicious', 'sweet', 'lovely', 'glory', 'harmony', 'wisdom', 'inspire', 'inspired', 'inspiring',
  'thrilled', 'excited', 'exciting', 'amazing', 'radiant', 'miracle', 'relief', 'treasure',
])

export const NEGATIVE = new Set([
  'fear', 'fears', 'afraid', 'scared', 'scary', 'frightened', 'death', 'dead', 'die', 'dies', 'died', 'dying',
  'loss', 'lost', 'lose', 'war', 'pain', 'painful', 'hurt', 'hurts', 'dark', 'darkness', 'darker', 'fail',
  'failed', 'failure', 'danger', 'sad', 'sadness', 'sorrow', 'grief', 'grieve', 'cry', 'cried', 'crying', 'tears',
  'lonely', 'loneliness', 'alone', 'angry', 'anger', 'rage', 'hate', 'hatred', 'wound', 'wounded', 'blood',
  'kill', 'killed', 'killing', 'murder', 'murdered', 'violence', 'violent', 'attack', 'attacked', 'enemy',
  'enemies', 'threat', 'terror', 'terrified', 'horror', 'dread', 'despair', 'hopeless', 'misery', 'miserable',
  'suffer', 'suffering', 'suffered', 'poverty', 'poor', 'hunger', 'disease', 'sick', 'illness', 'funeral',
  'grave', 'ghost', 'nightmare', 'cruel', 'evil', 'wicked', 'guilt', 'guilty', 'shame', 'ashamed', 'regret',
  'regrets', 'ruin', 'ruined', 'destroy', 'destroyed', 'collapse', 'crisis', 'disaster', 'tragedy', 'tragic',
  'panic', 'anxious', 'anxiety', 'worry', 'worried', 'prison', 'broken', 'bitter', 'weak', 'weakness', 'harm',
  'abuse', 'betray', 'betrayal', 'deceit', 'misfortune', 'injury', 'wreck', 'wrecked', 'flood', 'bad', 'worse', 'worst',
])

const NEGATIONS = new Set(['not', 'no', 'never'])
const WORD = /\p{L}[\p{L}\p{M}]*/gu
const MIN_ARC_WORDS = 40
const PART_SENTENCES = 60
const HARD_MIN_LETTERS = 9

function wordsOf(text) {
  return String(text || '').match(WORD) || []
}

// (positive - negative) / (positive + negative), from -1 to 1. A word right after not/no/never
// counts for the other side. 0 when the text has no feeling words.
export function tone(text) {
  const words = wordsOf(String(text || '').toLowerCase())
  let pos = 0
  let neg = 0
  for (let i = 0; i < words.length; i++) {
    let side = POSITIVE.has(words[i]) ? 1 : NEGATIVE.has(words[i]) ? -1 : 0
    if (!side) continue
    if (i > 0 && NEGATIONS.has(words[i - 1])) side = -side
    if (side > 0) pos++
    else neg++
  }
  return pos + neg === 0 ? 0 : (pos - neg) / (pos + neg)
}

// sections = [{ title, start, text }] → [{ title, start, tone, words }], sections under 40 words skipped.
export function arc(sections) {
  const out = []
  for (const s of sections || []) {
    const words = wordsOf(s.text).length
    if (words < MIN_ARC_WORDS) continue
    out.push({ title: s.title, start: s.start, tone: tone(s.text), words })
  }
  return out
}

function blockText(block) {
  return (block.s || []).join(' ').trim()
}

// Sections from blocks [{ k, s: [sentences] }] and starts[b] = index of block b's first sentence.
function span(list, starts, from, to, title) {
  const texts = []
  for (let b = from; b < to; b++) texts.push((list[b].s || []).join(' '))
  return { title, start: starts[from], text: texts.join(' ').trim() }
}

// No headings: cut at block boundaries once a part holds about PART_SENTENCES sentences.
function cutParts(list, starts) {
  const out = []
  let from = 0
  let count = 0
  for (let b = 0; b < list.length; b++) {
    if (count >= PART_SENTENCES) {
      out.push(span(list, starts, from, b, `Part ${out.length + 1}`))
      from = b
      count = 0
    }
    count += (list[b].s || []).length
  }
  if (list.length) out.push(span(list, starts, from, list.length, `Part ${out.length + 1}`))
  return out
}

export function splitSections(blocks, starts) {
  const list = blocks || []
  const heads = []
  for (let i = 0; i < list.length; i++) if (list[i].k === 'h') heads.push(i)
  if (!heads.length) return cutParts(list, starts)
  const out = []
  if (heads[0] > 0) {
    const before = span(list, starts, 0, heads[0], 'Beginning')
    if (before.text) out.push(before)
  }
  for (let n = 0; n < heads.length; n++) {
    const to = n + 1 < heads.length ? heads[n + 1] : list.length
    out.push(span(list, starts, heads[n], to, blockText(list[heads[n]])))
  }
  return out
}

// Long words (9+ letters) that are not names, ranked by length times log(1 + count).
// A use is a name signal only mid-sentence: a capital at a sentence start is grammar, not evidence.
// A word is a name when most of its mid-sentence uses are capitalised.
export function hardWords(text, { max = 30 } = {}) {
  const src = String(text || '')
  const seen = new Map()
  let prevEnd = 0
  let first = true
  for (const m of src.matchAll(WORD)) {
    const gap = src.slice(prevEnd, m.index)
    const sentenceStart = first || /[.!?…\n]/u.test(gap)
    first = false
    prevEnd = m.index + m[0].length
    const word = m[0].toLowerCase()
    if (word.length < HARD_MIN_LETTERS) continue
    let s = seen.get(word)
    if (!s) {
      s = { count: 0, midTotal: 0, midCaps: 0 }
      seen.set(word, s)
    }
    s.count++
    if (!sentenceStart) {
      s.midTotal++
      if (/^\p{Lu}/u.test(m[0])) s.midCaps++
    }
  }
  const ranked = []
  for (const [word, s] of seen) {
    if (s.midCaps * 2 > s.midTotal) continue
    ranked.push({ word, count: s.count, score: word.length * Math.log(1 + s.count) })
  }
  ranked.sort((a, b) => b.score - a.score || (a.word < b.word ? -1 : a.word > b.word ? 1 : 0))
  return ranked.slice(0, max).map(({ word, count }) => ({ word, count }))
}
