// The part of reading a PDF that needs no PDF: what pdf.js found on each page goes in, the text to be heard
// comes out. Kept apart from pdf.js (which needs a browser) so it runs in Node: the unit tests, and
// tools/extract.mjs, which reads real books with exactly this code.
import { pause } from '../lib/text.js'

// Which reader this is. A PDF remembers the reader that read it (readVer), and one read by an older reader is
// read again from its own file, without being asked (library.js rereadOld). Raise it whenever a change here or
// in ocrfix.js makes the same file come out as different text.
//   2 (October 2026): crooked scans no longer lose words; paragraphs by their first-line indent and across
//     pages; chapter titles in the body's size; drop capitals; note numbers; footnotes after their paragraph.
//   3: a paper's block of authors' e-mail addresses is not read out.
export const READER = 3

// pdf.js text items → visual lines {text, y, size, x}
// A line goes on while the words keep to its baseline and keep moving right. The baseline followed is the last
// word's, not the first's: a scanned page sits a little crooked, so its lines climb or fall as they cross it.
// pdf.js's own end-of-line mark is not used: on a crooked page it puts one after every word, which made every
// word a line, every line a paragraph, and the short ones were then thrown away as noise (measured on
// Tharun's books, October 2026: whole sentences were missing).
export function toLines(items) {
  const lines = []
  let cur = null
  for (const it of items) {
    if (!it.str.trim()) continue
    const [, b, c, d, x, y] = it.transform
    const size = Math.hypot(c, d) || it.height || Math.abs(b) || 10
    // A note's number, set small and above the line: for the eye to follow to the back of the book, not to be read out.
    if (cur && /^\d{1,3}$/.test(it.str.trim()) && size < cur.size * 0.8 && y > cur.yEnd + cur.size * 0.15) continue
    // A drop capital: one letter, far larger than its line (a scan gives it the line's size but its true width).
    if (/^\p{Lu}$/u.test(it.str.trim()) && it.width > size * 1.8) { lines.push({ text: it.str.trim(), y, yEnd: y, x, xEnd: x + it.width, size, cap: true }); cur = null; continue }
    if (cur && Math.abs(y - cur.yEnd) <= Math.max(size, cur.size) * 0.45 && x > cur.xEnd - size * 1.5) {
      const gap = x - cur.xEnd
      if (gap > size * 0.12 && !cur.text.endsWith(' ') && !it.str.startsWith(' ')) cur.text += ' '
      cur.text += it.str
      cur.parts.push(it.str)
      cur.xEnd = x + it.width
      if (size >= cur.size * 0.8) cur.yEnd = y // a raised or lowered mark (a footnote number) does not move the baseline
      cur.size = Math.max(cur.size, size)
    } else {
      cur = { text: it.str, parts: [it.str], y, yEnd: y, x, xEnd: x + it.width, size }
      lines.push(cur)
    }
  }
  for (const l of lines) {
    // A title set wide comes as "G R A V I T Y :" then "A N" and "I N T R O D U C T I O N": each piece is a word.
    const tokens = l.text.trim().split(/\s+/)
    if (l.parts && tokens.length >= 4 && tokens.filter(t => t.length === 1).length / tokens.length >= 0.8) l.text = l.parts.map(t => t.replace(/\s+/g, '')).filter(Boolean).join(' ')
    l.text = l.text.replace(/\s+/g, ' ').replace(/(\p{Ll})¬ ?/gu, '$1-').trim() // "¬" is how some scans write a line-end hyphen
    delete l.parts
  }
  return lines.filter(l => l.text)
}

const norm = t => t.toLowerCase().replace(/\d+|^[ivxlc]+(?=\s)|(?<=\s)[ivxlc]+$/g, '#').replace(/\s+/g, ' ').trim()
// The words of a line without its numbers, roman numbers and specks: what a running header keeps from page to
// page when a scan reads its page number as "21]", "I4]" or "=xxvii".
const ROMAN = /^[ivxlc]+$/
const wordsKey = t => t.toLowerCase().split(/\s+/).map(w => w.replace(/[^\p{L}]/gu, '')).filter(w => w.length > 1 && !ROMAN.test(w)).join(' ')
const PAGE_NO = /^(?:page\s*)?(?:#|[ivxlc]+)(?:\s*(?:of|\/)\s*#)?$|^[-–—]\s*#\s*[-–—]$/i
const REFS = /^(?:\d+\.?\s*|[ivx]+\.\s*)?(?:references|bibliography|works cited|literature cited|citations)$/i
const APPENDIX = /^(?:appendix|appendices|supplementary|[a-z]\s+appendix)/i
const CAPTION = /^(fig(?:ure)?\.?|table|algorithm|listing)\s*[\dIVX]+[a-z]?\s*[.:|—–-]/i
const NUMBERED_HEADING = /^(?:\d+(?:\.\d+){0,3}\.?|[IVX]+\.|[A-Z]\.)\s+[A-Z][^.!?]{2,90}$/

// Navigation pages (contents, index) are mostly lines ending in a page number: "4.4. Space Flight / 113",
// "Thrust coefficient, 23, 45", "Chapter 3 ........ 52". They are for eyes, not ears.
const NAV_LINE = /(?:^|[\s.…\/|=,–-])(?:\d{1,3}|(?!1[5-9]\d\d|20\d\d)\d{4})(?:\s*[-–]\s*\d{1,4})?\s*$/ // years (1500–2099) are not page numbers
const isNavPage = lines => lines.length >= 8 && lines.filter(l => l.text.length < 160 && NAV_LINE.test(l.text)).length / lines.length >= 0.4
const BOILERPLATE = /^(?:digitized by|no sponsor|in \d{4} with funding from|with funding from|this page (?:is )?intentionally left blank|all rights reserved|printed in |library of congress|isbn\b|copyright\s?©|©\s?\d{4})/i
const isLegalPage = lines => lines.some(l => /all rights reserved|ISBN[\s:-]*[\dX-]{10}/i.test(l.text))
const wordy = t => (t.match(/\p{L}{3,}/gu) || []).length >= 1 && (t.match(/\p{L}/gu) || []).length / t.length >= 0.5

const median = arr => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 0 }

// ponytail: digit/symbol-heavy short paragraphs are table cells, axis labels or broken equations.
// Rule mode drops them; AI mode (Gemini sees the page image) describes them properly instead.
const isResidue = t => {
  const words = (t.match(/[A-Za-z]{3,}/g) || []).length
  const sym = (t.match(/[^A-Za-z\s]/g) || []).length
  if (words >= 4) return false
  // A short line that is a sentence is speech, not a label: "No." "I did, anyway." Dropping those took the
  // one-line replies out of every novel.
  const letters = (t.match(/\p{L}/gu) || []).length
  if (letters / t.length >= 0.4 && /^["“‘'—–-]\s?\p{L}|\p{L}[.!?…]["”’')]*$/u.test(t)) return false
  return sym / t.length > 0.3 || t.length < 40
}

// Under a paper's title: names, employers and e-mail addresses, set in columns. Read out it is a minute of
// "at google dot com". The title says what the paper is; who wrote it is on the document's card.
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/g
const isContacts = b => { const n = (b.text.match(EMAIL) || []).length; return b.page <= 1 && (n >= 2 || (n === 1 && b.text.split(' ').length < 20)) }

// Chapter openings set in the body's own size: "PROLOGUE", "Chapter 8", "Acknowledgements".
const HEAD_WORD = /^(?:chapter|part|book|prologue|epilogue|introduction|preface|foreword|afterword|acknowledge?ments?|appendix|conclusions?|glossary|about the author)\b/i
const isShoutedTitle = t => t.length <= 60 && !/[.,;:!?]$/.test(t) && /^[\p{Lu}\d]/u.test(t) && (
  (t === t.toUpperCase() && (t.match(/\p{Lu}/gu) || []).length >= 3 && wordy(t)) ||
  (HEAD_WORD.test(t) && t.split(' ').length <= 6))
const NOTE_MARK = /^(?:[*†‡§¶]\s?|\d{1,3}\s?(?=\p{Lu}))/u // how a footnote opens: "* To be fair", "12 See"
const ENDS = /[.!?]["”’')\]]*$/ // a finished sentence

const SLICE = 20 // pages read between two pauses: about 40 ms of work on a phone, so a book read in the background never holds a frame

// What the book itself spells: its own words are the dictionary for mending a word broken across two lines.
async function wordsOf(pages) {
  const words = new Set(), heads = new Set(), tails = new Set(), compounds = new Set()
  for (let pi = 0; pi < pages.length; pi++) for (const l of pages[pi]) {
    if (l === pages[pi][0] && pi % SLICE === SLICE - 1) await pause()
    const found = l.text.toLowerCase().match(/\p{L}+(?:-\p{L}+)*/gu) || []
    found.forEach((w, i) => {
      if (!w.includes('-')) { if (i < found.length - 1 || !l.text.endsWith('-')) words.add(w); return }
      compounds.add(w)
      const parts = w.split('-')
      heads.add(parts[0]); tails.add(parts[parts.length - 1])
      for (const part of parts) words.add(part)
    })
  }
  return { words, heads, tails, compounds }
}

// pages: one array of lines per page (toLines) → { blocks, refLines, pageText }
export async function blocksFromPages(pages) {
  // Running headers/footers: the first/last two lines of a page that repeat across many pages.
  const edge = new Map(), edgeWords = new Map()
  pages.forEach(lines => {
    if (lines.length < 3) return
    const byY = [...lines].sort((a, b) => b.y - a.y)
    const seen = new Set([...byY.slice(0, 2), ...byY.slice(-2)].map(l => norm(l.text)))
    for (const k of seen) edge.set(k, (edge.get(k) || 0) + 1)
    for (const l of [byY[0], byY[byY.length - 1]]) { const k = wordsKey(l.text); if (k.length >= 6) edgeWords.set(k, (edgeWords.get(k) || 0) + 1) }
  })
  // Repeating 3+ times at a page edge = running header/footer, even if it only spans one chapter
  // ("8 CLASSIFICATION", "10 CLASSIFICATION" both normalise to "# classification").
  const junk = new Set([...edge].filter(([k, c]) => pages.length >= 6 && c >= 3 && k.length < 90).map(([k]) => k))

  // The same words on the top or bottom line of 3+ pages, on a line that carries something besides them (its page number).
  const junkWords = new Set([...edgeWords].filter(([k, c]) => pages.length >= 6 && c >= 3 && k.length < 90).map(([k]) => k))

  const allLines = pages.flat()
  const body = median(allLines.map(l => l.size)) || 10
  const isRunning = l => { const k = wordsKey(l.text); return junkWords.has(k) && l.text.toLowerCase() !== k && l.text.length - k.length <= 12 && l.size < body * 1.18 }
  const vocab = await wordsOf(pages)
  const blocks = []
  const pageText = []
  let para = null
  let skipping = false, refSize = 0
  const refLines = [] // the reference list: never read aloud, kept so a citation can be looked up
  let tocPage = -1
  let cap = null // a drop capital waiting for the word it begins
  let held = [] // this page's footnotes, waiting for the paragraph above them to end
  const flush = () => { if (para && para.text.trim()) blocks.push(para); para = null; blocks.push(...held); held = [] }
  // A big first letter and the rest of its word: "W" + "HILE MOST OF" → "WHILE MOST OF". Only A and I can be a
  // word by themselves, and the book's own words say which it is ("A FEW" stays, "A" + "FTER" joins).
  const withCap = (letter, text) => {
    const first = (text.match(/^\p{L}+/u) || [''])[0]
    const apart = /[AI]/.test(letter) && !vocab.words.has((letter + first).toLowerCase())
    return letter + (apart ? ' ' : '') + text
  }
  // A word broken across two lines: "organiza-" + "tion" is one word, "lower-" + "dimensional" keeps its hyphen.
  const mend = (text, next) => {
    const a = (text.match(/(\p{L}+)-$/u) || [])[1]?.toLowerCase(), b = (next.match(/^\p{L}+/u) || [''])[0].toLowerCase()
    const keep = a && b && (vocab.compounds.has(a + '-' + b) ||
      (!vocab.words.has(a + b) && ((vocab.tails.has(b) && vocab.words.has(a)) || (vocab.heads.has(a) && vocab.words.has(b)))))
    return (keep ? text : text.slice(0, -1)) + next
  }

  const frontMatter = Math.max(8, pages.length * 0.06)
  for (let pi = 0; pi < pages.length; pi++) {
    const lines = pages[pi]
    if (pi % SLICE === SLICE - 1) await pause() // a 700-page book is one long job: let the screen draw in between
    if (isNavPage(lines) || (pi < frontMatter && isLegalPage(lines))) { pageText.push(''); continue }
    const byY = [...lines].sort((a, b) => b.y - a.y)
    const edges = new Set([...byY.slice(0, 2), ...byY.slice(-2)])
    pageText.push(lines.map(l => l.text).join('\n'))
    const gaps = []
    for (let i = 1; i < lines.length; i++) { const g = lines[i - 1].y - lines[i].y; if (g > 0 && g < body * 3) gaps.push(g) }
    const lead = median(gaps) || body * 1.2
    const apart = (a, b) => !a || !b || a.y - b.y > lead * 1.3 || a.y - b.y < 0 // b does not follow a as the next line of one paragraph
    let read = null // the last line of this page that went into the text
    // A page set to a straight right edge (most books) says where a paragraph ends: at a line that stops short of it.
    const ends = lines.filter(l => Math.abs(l.size - body) <= body * 0.2).map(l => l.xEnd).sort((a, b) => a - b)
    const right = ends[Math.floor(ends.length * 0.95)] || 0
    const justified = ends.length >= 6 && ends.filter(x => x > right - body * 1.5).length / ends.length >= 0.5
    const short = l => justified && l.xEnd < right - body * 3
    const running = l => { const key = norm(l.text); return edges.has(l) && (junk.has(key) || PAGE_NO.test(key) || isRunning(l)) }
    // Footnotes are the run of smaller lines that ends the page, from the first that opens with a note's mark.
    let foot = lines.length
    for (let i = lines.length - 1; i >= 0; i--) {
      if (running(lines[i])) continue
      if (lines[i].size > body * 0.95) break
      if (NOTE_MARK.test(lines[i].text)) foot = i
    }

    lines.forEach((l, i) => {
      if (running(l)) return
      if (BOILERPLATE.test(l.text)) return
      if (i >= foot) {
        if (skipping) return
        const opens = NOTE_MARK.test(l.text), last = held[held.length - 1]
        if (opens || !last) held.push({ k: 'p', text: l.text.replace(NOTE_MARK, ''), page: pi, size: l.size })
        else last.text = /\p{Ll}-$/u.test(last.text) && /^\p{Ll}/u.test(l.text) ? mend(last.text, l.text) : last.text + ' ' + l.text
        return
      }
      if (l.cap) {
        // the letter may come before its word or after it (a scanned page reads the small first line first)
        if (para && para.page === pi && para.lines <= 2 && /^\p{Lu}{2}|^\p{Ll}/u.test(para.text)) para.text = withCap(l.text, para.text)
        else cap = l.text
        return
      }
      const prev = lines[i - 1], next = lines[i + 1]
      const alone = apart(prev, l) && apart(l, next)
      const big = o => !!o && o.size >= body * 1.18
      // Large type is a heading unless it is prose: a line that starts in the middle of a sentence, a line of large
      // type among ordinary ones (a scan misjudging one line's size), or several long lines of it (a jacket's blurb).
      const prose = /^\p{Ll}/u.test(l.text) ||
        (!apart(prev, l) && !big(prev) && !apart(l, next) && !big(next)) ||
        (l.text.length > 45 && ((!apart(l, next) && big(next) && next.text.length > 45) || (!apart(prev, l) && big(prev) && prev.text.length > 45)))
      const isHeading = wordy(l.text) && !NAV_LINE.test(l.text) && ((big(l) && l.text.length < 140 && !prose) ||
        (NUMBERED_HEADING.test(l.text) && alone) ||
        (alone && !cap && isShoutedTitle(l.text)))
      if (isHeading) {
        if (REFS.test(l.text.trim())) { flush(); skipping = true; refSize = l.size; return }
        if (/^(?:table of )?contents$/i.test(l.text.trim())) { flush(); tocPage = pi; return } // OCR'd TOC lines may not end in numbers
        // A paper's references run to its end (or its appendix). A book has a list after each chapter, and the next
        // chapter opens with a heading larger than the list's own, or with the word itself ("Chapter 3").
        if (skipping && !APPENDIX.test(l.text.trim()) && !HEAD_WORD.test(l.text.trim()) && l.size <= refSize + 0.5) return
        skipping = false
        flush()
        const last = blocks[blocks.length - 1]
        if (last?.k === 'h' && last.page === pi && Math.abs(last.size - l.size) < 0.5 && last.text.length < 100) last.text += ' ' + l.text
        else blocks.push({ k: 'h', text: l.text, page: pi, size: l.size })
        return
      }
      if (skipping) { refLines.push(l.text); return }
      if (tocPage === pi) return
      const text = cap ? withCap(cap, l.text) : l.text
      cap = null
      const gap = prev ? prev.y - l.y : Infinity
      const caption = CAPTION.exec(text)
      // Books mark a paragraph by setting its first line in. A line set in after an unfinished sentence on a full
      // line is something else (the second line of a numbered item), and a reply of one line ("No.") is set in
      // like the lines around it: there the sentence that ended short of the right edge says a paragraph ended.
      const inFrom = o => l.x - o.x > l.size * 0.8 && l.x - o.x < l.size * 6
      const sized = para && Math.abs(l.size - para.size) > body * 0.2
      let newPara
      if (!para || caption || sized) newPara = true
      // The first line of a page carries on the paragraph the last page left unfinished.
      else if (!read) newPara = para.k !== 'p' || ENDS.test(para.text) || (!!next && !apart(l, next) && inFrom(next))
      else {
        const done = ENDS.test(para.text)
        newPara = gap > lead * 1.3 || (gap < 0 && done) || // gap < 0: the next column, after a finished sentence
          (inFrom(read) && (done || short(read))) || (done && short(read))
      }
      read = l
      if (newPara) {
        flush()
        const k = caption ? (/^tab/i.test(caption[1]) ? 'table' : 'fig') : 'p'
        para = { k, text, page: pi, size: l.size, lines: 1 }
      } else {
        para.lines++
        if (/\p{Ll}-$/u.test(para.text) && /^\p{Ll}/u.test(text)) para.text = mend(para.text, text)
        else para.text += ' ' + text
      }
    })
    if (held.length && (!para || ENDS.test(para.text))) flush()
  }
  flush()

  const kept = blocks.filter(b => b.k !== 'p' || !(isResidue(b.text) || isContacts(b)))
  return { blocks: kept, refLines, pageText }
}
