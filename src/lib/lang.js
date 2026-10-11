// Document language: which voice and segmentation a document gets. Pure — runs in Node tests.
export const LANGS = {
  en: { name: 'English', locale: 'en', nv: 'en-US' },
  hi: { name: 'Hindi', locale: 'hi', nv: 'hi-IN' },
  te: { name: 'Telugu', locale: 'te' },
  es: { name: 'Spanish', locale: 'es', nv: 'es-US' },
  fr: { name: 'French', locale: 'fr', nv: 'fr-FR' },
  de: { name: 'German', locale: 'de', nv: 'de-DE' },
  it: { name: 'Italian', locale: 'it', nv: 'it-IT' },
  pt: { name: 'Portuguese', locale: 'pt', nv: 'pt-BR' },
  vi: { name: 'Vietnamese', locale: 'vi', nv: 'vi-VN' },
  zh: { name: 'Chinese', locale: 'zh', nv: 'zh-CN' },
  ja: { name: 'Japanese', locale: 'ja', nv: 'ja-JP' },
  ko: { name: 'Korean', locale: 'ko', nv: 'ko-KR' },
  ar: { name: 'Arabic', locale: 'ar', nv: 'ar-AR' },
}

// Count letters (\p{L}) by script in the first 4000 characters. Devanagari is 'hi',
// Telugu is 'te', Arabic is 'ar', Hangul is 'ko'. Han with Hiragana or Katakana is 'ja',
// Han alone is 'zh'. The language is the script holding MORE THAN HALF of the letters;
// otherwise Latin scoring below (an English paper quoting one Telugu line stays English).
// Empty is 'en'.
// Latin letters do not say which language a text is in by script, so the commonest words
// decide: about 15 words per language, no word shared between two lists. The best score
// wins when it is at least 0.08 of the words and beats the second by 1.3×; otherwise 'en'.
// English is recognised by its commonest words: about a quarter of the words of any English text.
const EN_WORDS = new Set(['the', 'and', 'of', 'to', 'in', 'is', 'that', 'for', 'with', 'was', 'as', 'it', 'on', 'are', 'this', 'by', 'be', 'from'])
export function isEnglish(text) {
  const words = String(text || '').slice(0, 4000).toLowerCase().match(/\p{L}+/gu) || []
  return words.length > 0 && words.filter(w => EN_WORDS.has(w)).length / words.length >= 0.12
}

// Common words per Latin-script language. Disjoint by construction: no word appears in two lists.
const WORD_LISTS = {
  en: ['the', 'and', 'of', 'to', 'in', 'is', 'that', 'for', 'with', 'was', 'as', 'it', 'on', 'are', 'this'],
  es: ['el', 'los', 'las', 'también', 'donde', 'porque', 'hay', 'están', 'está', 'pero', 'sus', 'este', 'esta', 'entre', 'aquel'],
  fr: ['le', 'les', 'des', 'est', 'dans', 'avec', 'plus', 'cette', 'nous', 'vous', 'tout', 'leurs', 'quand', 'quoi', 'voici'],
  de: ['der', 'die', 'das', 'und', 'den', 'von', 'mit', 'sich', 'auf', 'nicht', 'ein', 'eine', 'auch', 'oder', 'wenn'],
  it: ['il', 'lo', 'della', 'degli', 'sono', 'senza', 'questo', 'nella', 'hanno', 'quello', 'molto', 'quando', 'quale', 'sopra', 'sotto'],
  pt: ['o', 'os', 'uma', 'para', 'como', 'não', 'mais', 'foi', 'eles', 'essa', 'esse', 'aquilo', 'hoje', 'muito', 'pois'],
  vi: ['của', 'người', 'những', 'không', 'trong', 'là', 'một', 'với', 'được', 'này', 'rằng', 'tôi', 'bạn', 'chúng', 'gì'],
}
const WORD_SETS = Object.fromEntries(Object.entries(WORD_LISTS).map(([k, ws]) => [k, new Set(ws)]))

export function detectLang(text) {
  if (!text) return 'en'
  const head = String(text).slice(0, 4000)
  const letters = head.match(/\p{L}/gu)
  if (!letters || letters.length === 0) return 'en'
  const total = letters.length
  const deva = (head.match(/\p{Script=Devanagari}/gu) || []).length
  if (deva > total / 2) return 'hi'
  const telu = (head.match(/\p{Script=Telugu}/gu) || []).length
  if (telu > total / 2) return 'te'
  const arab = (head.match(/\p{Script=Arabic}/gu) || []).length
  if (arab > total / 2) return 'ar'
  const hang = (head.match(/\p{Script=Hangul}/gu) || []).length
  if (hang > total / 2) return 'ko'
  const han = (head.match(/\p{Script=Han}/gu) || []).length
  const hira = (head.match(/\p{Script=Hiragana}/gu) || []).length
  const kata = (head.match(/\p{Script=Katakana}/gu) || []).length
  if (han + hira + kata > total / 2) return (hira > 0 || kata > 0) ? 'ja' : 'zh'
  const words = (head.toLowerCase().match(/\p{L}+/gu) || [])
  if (!words.length) return 'en'
  const scored = Object.entries(WORD_SETS).map(([lang, set]) => {
    let n = 0
    for (const w of words) if (set.has(w)) n++
    return [lang, n / words.length]
  }).sort((a, b) => b[1] - a[1])
  const [[best, bestScore], [, secondScore]] = [scored[0], scored[1]]
  if (bestScore >= 0.08 && bestScore >= secondScore * 1.3) return best
  return 'en'
}
