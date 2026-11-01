import JSZip from 'jszip'
import { walk } from './html.js'

const parseXml = s => new DOMParser().parseFromString(s, 'application/xml')
const resolve = (base, href) => {
  const parts = (base + decodeURIComponent(href.split('#')[0])).split('/')
  const out = []
  for (const p of parts) p === '..' ? out.pop() : p !== '.' && out.push(p)
  return out.join('/')
}
const byLocal = (doc, name) => [...doc.getElementsByTagNameNS('*', name)]

async function shrinkImage(blob, width = 240) {
  const bmp = await createImageBitmap(blob)
  const c = document.createElement('canvas')
  c.width = width
  c.height = Math.round((bmp.height / bmp.width) * width)
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.75)
}

export async function readEpub(data, filename) {
  const zip = await JSZip.loadAsync(data)
  const container = parseXml(await zip.file('META-INF/container.xml').async('string'))
  const opfPath = byLocal(container, 'rootfile')[0].getAttribute('full-path')
  const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : ''
  const opfText = await zip.file(opfPath).async('string')
  const opf = parseXml(opfText)
  const gutenberg = /gutenberg\.org/i.test(opfText) // a Project Gutenberg book: its own markings are known (below)

  const items = new Map(byLocal(opf, 'item').map(i => [i.getAttribute('id'), {
    href: resolve(base, i.getAttribute('href')),
    type: i.getAttribute('media-type') || '',
    props: i.getAttribute('properties') || '',
  }]))
  const title = byLocal(opf, 'title')[0]?.textContent.trim() || filename.replace(/\.epub$/i, '')
  const author = byLocal(opf, 'creator').map(c => c.textContent.trim()).filter(Boolean).join(', ')

  const coverId = byLocal(opf, 'meta').find(m => m.getAttribute('name') === 'cover')?.getAttribute('content')
  const coverItem = [...items.values()].find(i => i.props.includes('cover-image')) || items.get(coverId)
  let cover = null
  if (coverItem?.type.startsWith('image/')) {
    const f = zip.file(coverItem.href)
    if (f) cover = await shrinkImage(new Blob([await f.async('uint8array')], { type: coverItem.type })).catch(() => null)
  }

  const blocks = []
  for (const ref of byLocal(opf, 'itemref')) {
    if (ref.getAttribute('linear') === 'no') continue
    const item = items.get(ref.getAttribute('idref'))
    if (!item || item.props.includes('nav') || !/x?html/.test(item.type)) continue
    const file = zip.file(item.href)
    if (!file) continue
    const src = await file.async('string')
    let doc = new DOMParser().parseFromString(src, 'application/xhtml+xml')
    if (doc.querySelector('parsererror')) doc = new DOMParser().parseFromString(src, 'text/html')
    const body = doc.body || byLocal(doc, 'body')[0]
    if (!body) continue
    // Skip front/back matter that nobody wants read aloud.
    const epubType = (body.getAttribute('epub:type') || '') + ' ' + (body.querySelector('section')?.getAttribute('epub:type') || '')
    if (/\b(toc|copyright-page|index|landmarks|loi|lot)\b/.test(epubType)) continue
    // Project Gutenberg's own header and licence, marked by Gutenberg itself: the book, not the legal text, is heard.
    for (const el of body.querySelectorAll('#pg-header, #pg-footer')) el.remove()
    // Gutenberg's contents page, which nothing marks as one (a heading over a table of links to its chapters), is
    // for the eye: a row that is nothing but links into the book goes, then a "Contents" heading left over. Only in
    // its books: elsewhere a caption may be a single link.
    if (gutenberg) for (const el of body.querySelectorAll('table, ul, ol, p')) {
      const links = [...el.querySelectorAll('a[href]')]
      const own = links.length && links.every(a => !/^[a-z][a-z\d+.-]*:/i.test(a.getAttribute('href')))
      if (own && el.textContent.replace(/\s+/g, '') === links.map(a => a.textContent).join('').replace(/\s+/g, '')) el.remove()
    }
    if (gutenberg) for (const h of body.querySelectorAll('h1, h2, h3, h4')) if (/^\s*(table of\s+)?contents\s*$/i.test(h.textContent)) h.remove()
    const chapter = walk(body)
    const words = chapter.reduce((a, b) => a + b.text.split(' ').length, 0)
    if (words < 12 && !chapter.some(b => b.k === 'h')) continue // cover/title/blank pages
    blocks.push(...chapter)
  }
  return { title, author, cover, blocks }
}
