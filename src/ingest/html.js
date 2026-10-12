import { spokenMath } from '../lib/text.js'

// DOM → blocks. Shared by web articles (after Readability), EPUB chapters and DOCX (via mammoth).
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'NAV', 'ASIDE', 'FORM', 'BUTTON', 'SVG', 'IFRAME', 'OBJECT', 'TEMPLATE', 'SELECT', 'INPUT', 'TEXTAREA', 'HEAD'])
const BLOCK = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'MAIN', 'BODY', 'HEADER', 'FOOTER', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'DL', 'DT', 'DD', 'ADDRESS', 'CENTER', 'HGROUP', 'DETAILS', 'SUMMARY', 'CAPTION', 'FIGCAPTION', 'HR'])
const NOISE_CLASS = /\b(mw-editsection|reference|noprint|footnote-ref|noteref|cite-bracket|sr-only|visually-hidden|mw-jump-link|hatnote|navbox|infobox|metadata|reflist|references)\b/i

const tag = n => n.localName?.toUpperCase() || ''

function isNoise(el) {
  const t = tag(el)
  if (el.getAttribute('aria-hidden') === 'true' || el.hasAttribute('hidden')) return true
  if (NOISE_CLASS.test(el.getAttribute('class') || '')) return true
  const et = el.getAttribute('epub:type') || el.getAttribute('role') || ''
  if (/noteref|footnote|endnote|rearnote|doc-noteref|doc-endnotes|doc-footnote|pagebreak|doc-pagebreak/.test(et)) return true
  if (t === 'SUP' && (el.querySelector('a') || /^\s*\[?[\d*†‡,–-]+\]?\s*$/.test(el.textContent))) return true
  return false
}

function mathText(el) {
  const tex = el.getAttribute('alttext') || el.querySelector('annotation[encoding*="tex" i]')?.textContent
  return tex ? spokenMath(tex) : el.textContent.replace(/\s+/g, ' ')
}

function inlineText(el) {
  let s = ''
  for (const n of el.childNodes) {
    if (n.nodeType === 3) s += n.data
    else if (n.nodeType === 1) {
      const t = tag(n)
      if (SKIP.has(t) || isNoise(n)) continue
      if (t === 'BR') s += ' '
      else if (t === 'MATH') s += ' ' + mathText(n) + ' '
      else if (t === 'IMG') s += n.getAttribute('alt') ? ' ' : ''
      else s += inlineText(n)
    }
  }
  return s
}

function tableText(table) {
  const rows = [...table.querySelectorAll('tr')]
  const head = rows[0] ? [...rows[0].children].map(c => c.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean) : []
  const caption = table.querySelector('caption')?.textContent.replace(/\s+/g, ' ').trim()
  const parts = [caption ? `Table: ${caption}.` : 'A table.']
  if (head.length) parts.push(`It has ${rows.length - 1} rows, with columns ${head.slice(0, 8).join(', ')}.`)
  return parts.join(' ')
}

const clean = s => s.replace(/\s+/g, ' ').trim()

// The cells themselves, header row first: what is spoken only describes the table, but its numbers can be
// heard as sound. Bounded, so one huge table cannot swell a stored document.
export const TABLE_ROWS = 200
export const TABLE_COLS = 12
const tableData = table => [...table.querySelectorAll('tr')].slice(0, TABLE_ROWS).map(tr => [...tr.children].slice(0, TABLE_COLS).map(c => clean(c.textContent)))

export function walk(node, out = []) {
  let buf = ''
  const flush = () => { const t = clean(buf); if (t) out.push({ k: 'p', text: t }); buf = '' }
  for (const n of node.childNodes) {
    if (n.nodeType === 3) { buf += n.data; continue }
    if (n.nodeType !== 1) continue
    const t = tag(n)
    if (SKIP.has(t) || isNoise(n)) continue
    if (/^H[1-6]$/.test(t)) { flush(); const h = clean(inlineText(n)); if (h) out.push({ k: 'h', text: h }); continue }
    if (t === 'PRE') { flush(); out.push({ k: 'code', text: n.textContent }); continue }
    if (t === 'TABLE') { flush(); out.push({ k: 'table', text: tableText(n), data: tableData(n) }); continue }
    if (t === 'MATH' && n.getAttribute('display') === 'block') { flush(); out.push({ k: 'math', text: mathText(n) }); continue }
    if (t === 'IMG') {
      const alt = clean(n.getAttribute('alt') || '')
      if (alt.length > 3) { flush(); out.push({ k: 'fig', text: `Image: ${alt}.` }) }
      continue
    }
    if (t === 'FIGURE') {
      flush()
      const cap = n.querySelector('figcaption')
      const alt = clean(n.querySelector('img')?.getAttribute('alt') || '')
      const tbl = n.querySelector('table')
      if (tbl) out.push({ k: 'table', text: tableText(tbl), data: tableData(tbl) })
      const txt = clean(cap ? inlineText(cap) : alt)
      if (txt) out.push({ k: 'fig', text: /^(fig|figure|image|table)/i.test(txt) ? txt : `Figure: ${txt}` })
      continue
    }
    if (BLOCK.has(t)) { flush(); walk(n, out); continue }
    buf += inlineText(n)
  }
  flush()
  return out
}

export const htmlToBlocks = root => walk(root)

// A web page's citations, taken before the article is cut out of the page (that step drops the marks and
// loses the classes that tell a reference list from the text). Returns the page's own numbered reference
// list (the longest one; shorter ones are footnotes) and takes it out of the page, so it is never read
// aloud; and turns each mark such as [12] into plain text, so its paragraph knows what it cites (the
// listening text drops the marks again).
const CITE_MARK = /^\[\d{1,3}\]$/
export function keepCitations(doc) {
  for (const sup of doc.querySelectorAll('sup')) {
    const mark = sup.textContent.trim()
    if (CITE_MARK.test(mark)) sup.replaceWith(doc.createTextNode(` ${mark}`))
  }
  const lists = [...doc.querySelectorAll('ol.references')].sort((a, b) => b.children.length - a.children.length)
  if (!lists.length) return []
  lists[0].remove()
  return [...lists[0].children].map((li, i) => ({ n: i + 1, text: clean((li.querySelector('.reference-text') || li).textContent).replace(/^[\^↑]\s*/, '') })).filter(r => r.text.length > 20)
}
