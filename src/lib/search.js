// Keyword retrieval over the text the app already stores. No embeddings, no server:
// a classic BM25 rank over passages (one per heading/paragraph block), computed on the device.
const STOP = new Set([
  'the', 'a', 'an', 'of', 'to', 'in', 'is', 'and', 'or', 'for', 'on',
  'with', 'that', 'this', 'it', 'as', 'at', 'by', 'be', 'are', 'was',
  'were', 'what', 'how', 'do', 'does', 'my', 'about',
])

// Lower-cased word list: letters (marks stay inside words, so Telugu/Hindi stay whole)
// plus numbers, after NFKC. One-letter Latin words and the stop list are dropped.
export function tokens(text) {
  const matches = String(text || '').normalize('NFKC').match(/\p{L}[\p{L}\p{M}\p{N}]*|\p{N}+/gu) || []
  const out = []
  for (const m of matches) {
    const t = m.toLowerCase()
    if (/^[a-z]$/.test(t)) continue
    if (STOP.has(t)) continue
    out.push(t)
  }
  return out
}

// docs = [{ id, title, blocks: [{ k, s: [sentences], p }] }] → passages plus BM25 statistics.
export function buildIndex(docs) {
  const passages = []
  for (const doc of docs || []) {
    const blocks = doc.blocks || []
    for (let bi = 0; bi < blocks.length; bi++) {
      const b = blocks[bi]
      if (b.k !== 'p' && b.k !== 'h') continue
      const text = (b.s || []).join(' ').trim()
      if (text.length < 40) continue
      const toks = tokens(text)
      const tf = new Map()
      for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1)
      passages.push({ doc: doc.id, title: doc.title, block: bi, text, tf, len: toks.length })
    }
  }
  const df = new Map()
  for (const p of passages) for (const t of p.tf.keys()) df.set(t, (df.get(t) || 0) + 1)
  const avgLen = passages.length ? passages.reduce((a, p) => a + p.len, 0) / passages.length : 0
  return { passages, df, avgLen, n: passages.length }
}

const K1 = 1.4
const B = 0.75

// Top k passages with score, best first. A passage with no query term is never returned;
// at most 4 passages per document so one long book cannot crowd out the rest.
export function search(index, query, k = 12) {
  const q = tokens(query)
  if (!q.length || !index?.passages?.length || !index.avgLen) return []
  const uniq = [...new Set(q)]
  const idfOf = new Map()
  for (const t of uniq) {
    const df = index.df.get(t) || 0
    if (!df) continue
    idfOf.set(t, Math.log(1 + (index.n - df + 0.5) / (df + 0.5)))
  }
  if (!idfOf.size) return []
  const scored = []
  for (const p of index.passages) {
    let score = 0
    for (const [t, idf] of idfOf) {
      const tf = p.tf.get(t) || 0
      if (!tf) continue
      score += (idf * tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * p.len) / index.avgLen))
    }
    if (score > 0) scored.push({ doc: p.doc, title: p.title, block: p.block, text: p.text, score })
  }
  scored.sort((a, b) => b.score - a.score)
  const perDoc = new Map()
  const out = []
  for (const p of scored) {
    const n = perDoc.get(p.doc) || 0
    if (n >= 4) continue
    perDoc.set(p.doc, n + 1)
    out.push(p)
    if (out.length >= k) break
  }
  return out
}
