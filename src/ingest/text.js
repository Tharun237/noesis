import { spokenMath } from '../lib/text.js'

const inline = s => s
  .replace(/!\[([^\]]*)\]\([^)]*\)/g, '')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/\[\^[^\]]+\]/g, '')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/\$([^$\n]+)\$/g, (_, t) => spokenMath(t))
  .replace(/(\*\*|__|\*|_|~~)(?=\S)([^*_~]+?)\1/g, '$2')
  .replace(/<[^>]+>/g, '')

export function readMarkdown(src) {
  const blocks = []
  let para = []
  let fence = null
  let math = null
  const flush = () => { const t = inline(para.join(' ')).trim(); if (t) blocks.push({ k: 'p', text: t }); para = [] }
  for (const line of src.replace(/\r\n?/g, '\n').split('\n')) {
    if (fence !== null) {
      if (/^\s*(```|~~~)/.test(line)) { blocks.push({ k: 'code', text: fence }); fence = null } else fence += line + '\n'
      continue
    }
    if (math !== null) {
      if (/^\s*\$\$\s*$/.test(line)) { blocks.push({ k: 'math', text: spokenMath(math) }); math = null } else math += ' ' + line
      continue
    }
    if (/^\s*(```|~~~)/.test(line)) { flush(); fence = ''; continue }
    if (/^\s*\$\$\s*$/.test(line)) { flush(); math = ''; continue }
    const one = line.match(/^\s*\$\$(.+)\$\$\s*$/)
    if (one) { flush(); blocks.push({ k: 'math', text: spokenMath(one[1]) }); continue }
    const h = line.match(/^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/)
    if (h) { flush(); blocks.push({ k: 'h', text: inline(h[1]) }); continue }
    if (!line.trim() || /^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) { flush(); continue }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      if (/^\s*\|?\s*:?-{2,}/.test(line)) continue
      flush()
      const prev = blocks[blocks.length - 1]
      if (prev?.k === 'table') prev.rows++
      else blocks.push({ k: 'table', rows: 0, cols: line.split('|').slice(1, -1).map(c => inline(c).trim()) })
      continue
    }
    const li = line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.*)$/)
    if (li) { flush(); para.push(li[1]); flush(); continue }
    para.push(line.replace(/^\s*>\s?/, ''))
  }
  if (fence !== null) blocks.push({ k: 'code', text: fence })
  flush()
  return blocks.map(b => b.k === 'table' ? { k: 'table', text: `A table with ${b.rows} rows, with columns ${b.cols.join(', ')}.` } : b)
}

export function readPlain(src) {
  const text = src.replace(/\r\n?/g, '\n')
  // Hard-wrapped text (no blank lines, many short lines) → treat single newlines as spaces.
  const paras = /\n\s*\n/.test(text) ? text.split(/\n\s*\n/) : text.split(/\n(?=\s{2,}|\t)|\n(?=[A-Z][^\n]{0,60}\n)/)
  return paras.map(p => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean).map(text => ({ k: 'p', text }))
}

export const titleFrom = (blocks, fallback) => {
  const h = blocks.find(b => b.k === 'h')?.text
  const first = blocks[0]?.text || ''
  return (h || (first.length < 90 ? first : first.split(/[.!?]/)[0].slice(0, 80)) || fallback).trim()
}
