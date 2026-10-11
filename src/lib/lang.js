// Document language: which voice and segmentation a document gets. Pure — runs in Node tests.
export const LANGS = {
  en: { name: 'English', locale: 'en' },
  hi: { name: 'Hindi', locale: 'hi' },
  te: { name: 'Telugu', locale: 'te' },
}

// Count letters (\p{L}) by script in the first 4000 characters. Devanagari is 'hi',
// Telugu is 'te'. The language is the script holding MORE THAN HALF of the letters;
// otherwise 'en' (an English paper quoting one Telugu line stays English). Empty is 'en'.
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
