// Document language: which voice and segmentation a document gets. Pure — runs in Node tests.
export const LANGS = {
  en: { name: 'English', locale: 'en' },
  hi: { name: 'Hindi', locale: 'hi' },
  te: { name: 'Telugu', locale: 'te' },
}

// Count letters (\p{L}) by script in the first 4000 characters. Devanagari is 'hi',
// Telugu is 'te'. The language is the script holding MORE THAN HALF of the letters;
// otherwise 'en' (an English paper quoting one Telugu line stays English). Empty is 'en'.
// Latin letters do not say which language a text is in (French and English look the same by script), so
// English is recognised by its commonest words: about a quarter of the words of any English text.
const EN_WORDS = new Set(['the', 'and', 'of', 'to', 'in', 'is', 'that', 'for', 'with', 'was', 'as', 'it', 'on', 'are', 'this', 'by', 'be', 'from'])
export function isEnglish(text) {
  const words = String(text || '').slice(0, 4000).toLowerCase().match(/\p{L}+/gu) || []
  return words.length > 0 && words.filter(w => EN_WORDS.has(w)).length / words.length >= 0.12
}

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
  return 'en'
}
