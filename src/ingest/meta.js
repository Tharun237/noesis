// Clean PDF metadata titles and authors. Pure module — no DOM — so it runs in Node tests too.
const EXT = /\.(indd|pdf|docx?|qxd|tex|dvi|ps|rtf|odt|pages|txt)$/i
const MSWORD = /^microsoft\s+word\s*[-–—:]\s*/i
const TOOLS = ['adobe', 'microsoft', 'acrobat', 'latex', 'tex', 'quark', 'indesign', 'word', 'pscript', 'calibre', 'writer']

const hasLetters = t => /[\p{L}]/u.test(t)

function isJunkTitle(raw) {
  const t = (raw || '').trim()
  if (!t) return true
  let cand = t
  const m = cand.match(MSWORD)
  if (m) {
    cand = cand.slice(m[0].length).trim()
    if (!cand) return true
  }
  const lower = cand.toLowerCase()
  if (lower === 'untitled' || lower === 'document') return true
  if (/^untitled[\s._-]*\d*$/i.test(cand) || /^document[\s._-]*\d*$/i.test(cand)) return true
  if (EXT.test(cand)) return true
  if (!/\s/.test(cand)) {
    if (cand.includes('_')) return true
    const digits = (cand.match(/\d/g) || []).length
    const letters = (cand.match(/[A-Za-z]/g) || []).length
    const alnum = (cand.match(/[A-Za-z0-9]/g) || []).length
    if (alnum > 0 && digits * 2 >= alnum) return true
    if (letters === 0 && digits > 0) return true
  }
  return false
}

function looksLikeTitle(h) {
  const t = (h || '').trim()
  return t.length >= 3 && t.length <= 120 && hasLetters(t)
}

function fromFileName(name) {
  const base = (name || '').split('/').pop().split('\\').pop().trim()
  const noExt = base.replace(/\.[^.\s]+$/, '').trim()
  const spaced = noExt.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return spaced || 'Untitled'
}

function cleanTitle(title, fileName, firstHeading) {
  const raw = (title || '').trim()
  // Strip the Word prefix first: "Microsoft Word - Thesis final.docx" → "Thesis final.docx".
  let cand = raw
  const m = cand.match(MSWORD)
  if (m) cand = cand.slice(m[0].length).trim()
  if (!isJunkTitle(raw)) {
    // Not junk, but a stripped Word prefix or a trailing extension still comes off.
    if (m) {
      const noExt = cand.replace(EXT, '').trim()
      return noExt || cand
    }
    return raw
  }
  if (looksLikeTitle(firstHeading)) return firstHeading.trim()
  // If the Word remainder itself looks like a title, prefer it over the file name.
  if (m) {
    const stripped = cand.replace(EXT, '').trim()
    if (stripped && !isJunkTitle(stripped) && looksLikeTitle(stripped)) return stripped
  }
  return fromFileName(fileName)
}

function isJunkAuthor(raw) {
  const t = (raw || '').trim()
  if (!t) return false
  if (!hasLetters(t)) return true
  if (/^\d+$/.test(t)) return true
  const lower = t.toLowerCase()
  if (!/\s/.test(t) && /^\d+$/.test(t)) return true
  for (const tool of TOOLS) {
    if (lower.startsWith(tool)) return true
  }
  return false
}

export function cleanMeta({ title, author } = {}, { fileName, firstHeading } = {}) {
  const t = (title || '').trim()
  const a = (author || '').trim()
  const outTitle = isJunkTitle(t) ? cleanTitle(t, fileName, firstHeading) : (() => {
    // Even a kept title loses a Word prefix.
    const m = t.match(MSWORD)
    if (m) {
      const rest = t.slice(m[0].length).trim().replace(EXT, '').trim()
      if (rest && !isJunkTitle(rest)) return rest
    }
    return t
  })()
  const outAuthor = !a ? '' : isJunkAuthor(a) ? '' : a
  return { title: outTitle, author: outAuthor }
}
