import { htmlToBlocks } from './html.js'
import { readMarkdown, readPlain, titleFrom } from './text.js'

// Source record (stored, so documents can be re-processed): { kind, name, blob?, text?, url? }
// Parsed output: { title, author, cover, blocks: [{k, text}], pdf?, pageText? }

export function kindOf(name = '', type = '') {
  const ext = name.toLowerCase().split('.').pop()
  if (type === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (type === 'application/epub+zip' || ext === 'epub') return 'epub'
  if (ext === 'docx' || type.includes('wordprocessingml')) return 'docx'
  if (ext === 'md' || ext === 'markdown' || type === 'text/markdown') return 'md'
  if (ext === 'html' || ext === 'htm' || type.includes('html')) return 'html'
  if (ext === 'txt' || type.startsWith('text/')) return 'txt'
  return null
}

export const ACCEPT = '.pdf,.epub,.docx,.md,.markdown,.txt,.html,.htm,application/pdf,application/epub+zip,text/plain,text/markdown,text/html'

async function readHtml(html, url, fallback) {
  const { Readability } = await import('@mozilla/readability') // only web pages need it
  const doc = new DOMParser().parseFromString(html, 'text/html')
  if (url) { const b = doc.createElement('base'); b.href = url; doc.head.prepend(b) }
  const art = new Readability(doc, { charThreshold: 300 }).parse()
  if (!art?.content) {
    const blocks = htmlToBlocks(doc.body)
    return { title: doc.title || titleFrom(blocks, fallback), author: '', blocks }
  }
  const body = new DOMParser().parseFromString(art.content, 'text/html').body
  const blocks = htmlToBlocks(body)
  const title = art.title?.trim() || fallback
  if (blocks[0]?.k === 'h' && blocks[0].text.trim() === title) blocks.shift()
  return { title, author: art.byline?.trim() || art.siteName || '', blocks }
}

const ARXIV = /^https?:\/\/(?:www\.)?arxiv\.org\/(?:abs|html)\/([\w.\-/]+?)(?:v\d+)?\/?$/

export async function fetchUrl(url) {
  const m = url.match(ARXIV)
  if (m) url = `https://arxiv.org/pdf/${m[1]}` // listen to the paper, not the abstract page
  const res = await fetch('/api/fetch?url=' + encodeURIComponent(url))
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || `Could not fetch that link (${res.status})`)
  const type = (res.headers.get('content-type') || '').split(';')[0].trim()
  const finalUrl = res.headers.get('x-final-url') || url
  const name = decodeURIComponent(new URL(finalUrl).pathname.split('/').pop() || new URL(finalUrl).hostname)
  const kind = kindOf(name, type) || 'html'
  return { kind, name, url: finalUrl, blob: await res.blob() }
}

export async function parseSource(src, onProgress) {
  const name = src.name || 'Untitled'
  switch (src.kind) {
    case 'pdf': {
      const { readPdf } = await import('./pdf.js')
      return readPdf(new Uint8Array(await src.blob.arrayBuffer()), name, onProgress)
    }
    case 'epub': {
      const { readEpub } = await import('./epub.js')
      return readEpub(await src.blob.arrayBuffer(), name)
    }
    case 'docx': {
      const mammoth = (await import('mammoth')).default
      const { value } = await mammoth.convertToHtml({ arrayBuffer: await src.blob.arrayBuffer() })
      const blocks = htmlToBlocks(new DOMParser().parseFromString(value, 'text/html').body)
      return { title: name.replace(/\.docx$/i, ''), author: '', blocks }
    }
    case 'html': {
      const html = src.text ?? await src.blob.text()
      return readHtml(html, src.url, name.replace(/\.html?$/i, ''))
    }
    case 'md': {
      const blocks = readMarkdown(src.text ?? await src.blob.text())
      return { title: titleFrom(blocks, name.replace(/\.(md|markdown)$/i, '')), author: '', blocks }
    }
    default: {
      const blocks = readPlain(src.text ?? await src.blob.text())
      const title = src.title || titleFrom(blocks, name.replace(/\.txt$/i, ''))
      if (blocks[0]?.text.trim().toLowerCase() === title.trim().toLowerCase()) blocks.shift() // title line ≠ body text
      return { title, author: '', blocks }
    }
  }
}
