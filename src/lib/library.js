import { createStore, uid } from './store.js'
import { db, persistStorage } from './db.js'
import { settings, hasKey } from './settings.js'
import { synthesize, engine } from './tts.js'
import { toListening } from './text.js'
import { parseSource, fetchUrl } from '../ingest/index.js'
import { muxOggOpus, unpackPackets, wav } from './audio-format.js'

// Document lifecycle: queued → reading → narrating (AI only) → voicing → ready  (or error)
// Two independent loops: PREP (parse + optional Gemini) and VOICE (on-device TTS, one sentence at a time),
// so a long book can be prepared while you already listen to something else.

const COLLECTIONS_KEY = 'noesis.collections.v1'
const loadCollections = () => { try { return JSON.parse(localStorage.getItem(COLLECTIONS_KEY) || '[]') } catch { return [] } }

export const library = createStore({ docs: [], loaded: false, collections: loadCollections() })
library.sub(() => localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(library.get().collections)))

const cache = new Map() // id → { blocks, segs: [{t, b, k}], starts: [segIndex per block], durs: [sec, 0 = not voiced] }
const voiced = new Map() // id → Set<segIndex>
const segListeners = new Set()
export const onSegment = f => { segListeners.add(f); return () => segListeners.delete(f) }

let priority = () => null // player registers () => ({ id, i }) so voicing follows the playhead
export const setPriority = f => { priority = f }

export const getDoc = id => library.get().docs.find(d => d.id === id)
const voicedSet = id => voiced.get(id) ?? voiced.set(id, new Set()).get(id)
export const isVoiced = (id, i) => voicedSet(id).has(i)

export function patch(id, p) {
  let next = null
  library.set(s => ({ docs: s.docs.map(d => (d.id === id ? (next = { ...d, ...p }) : d)) }))
  if (next) db.putMeta(next)
}

// Seconds of audio per character, learned from what this device has actually produced.
export const secPerChar = d => (d.vChars > 400 ? d.vSec / d.vChars : 1 / 14.5)
export const docDuration = d => d.chars * secPerChar(d)

export async function loadDoc(id) {
  if (cache.has(id)) return cache.get(id)
  const [doc, durs] = await Promise.all([db.getDoc(id), db.getDurs(id)])
  if (!doc) return null
  const segs = []
  const starts = []
  doc.blocks.forEach((b, bi) => { starts.push(segs.length); for (const t of b.s) segs.push({ t, b: bi, k: b.k }) })
  const c = { blocks: doc.blocks, segs, starts, durs: durs?.length === segs.length ? durs : new Array(segs.length).fill(0) }
  cache.set(id, c)
  return c
}

const durTimers = new Map()
function saveDurs(id) {
  clearTimeout(durTimers.get(id))
  durTimers.set(id, setTimeout(() => { const c = cache.get(id); if (c) db.putDurs(id, c.durs) }, 1500))
}

// ── loops ─────────────────────────────────────────────────────────────────────────────
function makeLoop(step) {
  let running = false
  let wake = null
  const kick = () => {
    if (wake) { const w = wake; wake = null; w() }
    if (running) return
    running = true
    ;(async () => {
      for (;;) {
        let more = false
        // A loop that dies on one bad document would silently stop all future work; log and carry on.
        try { more = await step() } catch (e) { console.error('Noesis worker loop:', e) }
        if (more) continue
        await new Promise(r => { wake = r })
      }
    })()
  }
  return kick
}

const PREP = new Set(['queued', 'reading', 'narrating'])
export const kickPrep = makeLoop(async () => {
  const doc = [...library.get().docs].reverse().find(d => PREP.has(d.status))
  if (!doc) return false
  await prepare(doc.id)
  return true
})

export const kickVoice = makeLoop(async () => {
  if (engine.get().status === 'error') return false // wait for Settings → retry (which kicks)
  const job = await nextVoiceJob()
  if (!job) return false
  await voiceOne(job.id, job.i)
  return true
})

async function nextVoiceJob() {
  const p = priority()
  const docs = library.get().docs.filter(d => d.status === 'voicing')
    .sort((a, b) => (b.id === p?.id) - (a.id === p?.id) || a.createdAt - b.createdAt)
  for (const d of docs) {
    const c = await loadDoc(d.id)
    if (!c) continue
    const set = voicedSet(d.id)
    const n = c.segs.length
    const from = d.id === p?.id ? p.i : d.pos || 0
    for (let k = 0; k < n; k++) {
      const i = (from + k) % n
      if (!set.has(i)) return { id: d.id, i }
    }
    patch(d.id, { status: 'ready', stage: 'Ready', done: n })
  }
  return null
}

async function voiceOne(id, i) {
  const d = getDoc(id)
  const c = cache.get(id)
  const seg = c.segs[i]
  const voice = d.voice
  let rec
  try {
    rec = await synthesize(seg.t, voice)
  } catch (e) {
    if (engine.get().status === 'error') return // engine failed to load; loop parks until retried
    console.warn('Sentence failed, skipping:', seg.t, e)
    rec = { codec: 'none', dur: 0 }
  }
  const now = getDoc(id)
  if (!now || now.voice !== voice || cache.get(id) !== c) return // deleted / voice changed / re-processed meanwhile
  await db.putAudio(id, i, rec)
  const set = voicedSet(id)
  set.add(i)
  c.durs[i] = rec.dur
  saveDurs(id)
  const done = set.size
  patch(id, {
    done,
    vChars: now.vChars + seg.t.length,
    vSec: now.vSec + rec.dur,
    ...(done >= c.segs.length ? { status: 'ready', stage: 'Ready' } : {}),
  })
  segListeners.forEach(f => f(id, i))
}

async function prepare(id) {
  const d = getDoc(id)
  const s = settings.get()
  let parsed = null
  try {
    patch(id, { status: 'reading', stage: 'Reading document', error: null, prep: 0 })
    let src = await db.getSource(id)
    if (src.kind === 'link') {
      patch(id, { stage: 'Fetching link' })
      src = await fetchUrl(src.url)
      await db.putSource(id, src)
      patch(id, { kind: src.kind, url: src.url })
    }
    parsed = await parseSource(src, p => patch(id, { prep: p }))
    patch(id, {
      title: d.renamed ? d.title : parsed.title || d.title,
      author: parsed.author || d.author,
      cover: parsed.cover || d.cover,
    })
    let blocks = parsed.blocks
    let note = null

    if (d.ai && hasKey() && parsed.pdf) {
      patch(id, { status: 'narrating', stage: 'AI is reading the pages' })
      const { narratePdf } = await import('./gemini.js')
      const r = await narratePdf({
        pdf: parsed.pdf, pageText: parsed.pageText, key: s.geminiKey, model: s.geminiModel,
        onProgress: p => patch(id, { prep: p }),
      })
      blocks = r.blocks.flatMap(b => (b.k === 'gap' ? parsed.blocks.filter(x => x.page >= b.from && x.page <= b.to) : [b]))
      if (r.failed.length) note = `AI narration failed on pages ${r.failed.map(([a, b]) => (a === b ? a : `${a}–${b}`)).join(', ')}; those pages use standard cleanup.`
    }

    if (d.mode !== 'full') {
      if (!hasKey()) throw new Error('Summaries need a free Gemini key. Add one in Settings.')
      patch(id, { status: 'narrating', stage: d.mode === 'long' ? 'Writing a long summary' : 'Writing a short summary', prep: 0 })
      const { summarize } = await import('./gemini.js')
      const text = blocks.map(b => (b.k === 'h' ? `\n## ${b.text}\n` : b.text)).join('\n')
      blocks = await summarize({ text, title: getDoc(id).title, mode: d.mode, key: s.geminiKey, model: s.geminiModel })
    }

    const listening = toListening(blocks)
    if (!listening.length) {
      throw new Error(parsed.pdf && !hasKey()
        ? 'No selectable text found (scanned PDF?). Add a free Gemini key in Settings to read scanned pages.'
        : 'No readable text found in this document.')
    }
    await db.delAudio(id)
    await db.putDoc(id, { blocks: listening })
    const total = listening.reduce((a, b) => a + b.s.length, 0)
    const chars = listening.reduce((a, b) => a + b.s.reduce((x, t) => x + t.length, 0), 0)
    await db.putDurs(id, new Array(total).fill(0))
    cache.delete(id)
    voiced.set(id, new Set())
    patch(id, { status: 'voicing', stage: 'Generating audio', total, chars, done: 0, vChars: 0, vSec: 0, prep: 1, pos: Math.min(d.pos || 0, total - 1), note })
    kickVoice()
  } catch (e) {
    console.error(e)
    patch(id, { status: 'error', stage: 'Failed', error: e.message || String(e) })
  } finally {
    parsed?.pdf?.loadingTask.destroy() // pdf.js v6: the loading task owns the worker-side document
  }
}

// ── actions ───────────────────────────────────────────────────────────────────────────
export async function boot() {
  const [metas, keys] = await Promise.all([db.allMeta(), db.audioKeys()])
  for (const k of keys) {
    const j = k.lastIndexOf(':')
    voicedSet(k.slice(0, j)).add(+k.slice(j + 1))
  }
  library.set({ docs: metas.sort((a, b) => b.createdAt - a.createdAt), loaded: true })
  persistStorage()
  kickPrep()
  kickVoice()
}

export async function addDocument(src, overrides = {}) {
  const s = settings.get()
  const id = uid()
  const meta = {
    id, title: src.title || src.name || src.url || 'Untitled', author: '', kind: src.kind, url: src.url || null,
    createdAt: Date.now(), lastPlayed: 0, mode: s.mode, ai: s.aiNarration && hasKey(), voice: s.voice,
    status: 'queued', stage: 'Waiting', prep: 0, total: 0, chars: 0, done: 0, vChars: 0, vSec: 0,
    pos: 0, finished: false, archived: false, collections: [], cover: null, error: null, note: null,
    ...overrides,
  }
  await db.putSource(id, src)
  await db.putMeta(meta)
  library.set(st => ({ docs: [meta, ...st.docs] }))
  kickPrep()
  return id
}

export async function changeVoice(id, voice) {
  const d = getDoc(id)
  if (!d || d.voice === voice) return
  await db.delAudio(id)
  voicedSet(id).clear()
  const c = cache.get(id)
  if (c) { c.durs.fill(0); db.putDurs(id, c.durs) }
  patch(id, { voice, done: 0, vChars: 0, vSec: 0, ...(d.status === 'ready' ? { status: 'voicing', stage: 'Generating audio' } : {}) })
  kickVoice()
}

export function reprocess(id, changes = {}) {
  cache.delete(id)
  patch(id, { ...changes, status: 'queued', stage: 'Waiting', error: null })
  kickPrep()
}

export async function deleteDoc(id) {
  cache.delete(id)
  voiced.delete(id)
  library.set(s => ({ docs: s.docs.filter(d => d.id !== id) }))
  await Promise.all([db.delMeta(id), db.delContent(id), db.delAudio(id)])
}

export async function deleteAllAudio() {
  for (const d of library.get().docs) {
    await db.delAudio(d.id)
    voicedSet(d.id).clear()
    const c = cache.get(d.id)
    if (c) c.durs.fill(0)
    if (d.total) patch(d.id, { done: 0, vChars: 0, vSec: 0, status: d.status === 'ready' ? 'voicing' : d.status })
  }
}

export function addCollection(name) {
  const c = { id: uid(), name: name.trim() }
  library.set(s => ({ collections: [...s.collections, c] }))
  return c.id
}

export function toggleInCollection(docId, colId) {
  const d = getDoc(docId)
  const has = d.collections.includes(colId)
  patch(docId, { collections: has ? d.collections.filter(x => x !== colId) : [...d.collections, colId] })
}

export function removeCollection(colId) {
  library.set(s => ({ collections: s.collections.filter(c => c.id !== colId) }))
  for (const d of library.get().docs) if (d.collections.includes(colId)) patch(d.id, { collections: d.collections.filter(x => x !== colId) })
}

export async function exportTranscript(id) {
  const d = getDoc(id)
  const c = await loadDoc(id)
  const md = [`# ${d.title}`, d.author ? `_${d.author}_` : '', '',
    ...c.blocks.map(b => (b.k === 'h' ? `\n## ${b.s.join(' ')}\n` : b.k === 'p' ? b.s.join(' ') + '\n' : `> **${b.k.toUpperCase()}** ${b.s.join(' ')}\n`))].join('\n')
  download(new Blob([md], { type: 'text/markdown' }), `${safeName(d.title)}.md`)
}

export async function exportAudio(id) {
  const d = getDoc(id)
  const c = await loadDoc(id)
  const packets = []
  const frames = []
  const wavParts = []
  let rate = 24000
  for (let from = 0; from < c.segs.length; from += 200) {
    const recs = await db.getAudios(id, from, Math.min(c.segs.length, from + 200))
    for (const r of recs) {
      if (!r || r.codec === 'none') continue
      rate = r.rate || rate
      if (r.codec === 'opus') { const u = unpackPackets(r); packets.push(...u.packets); frames.push(...u.frames) } else wavParts.push(r.bytes.subarray(44))
    }
  }
  // ponytail: sentences are concatenated as one Opus stream without re-encoding; boundaries can carry a ~6 ms seam.
  if (packets.length) return download(new Blob([muxOggOpus(packets, frames, { inputRate: rate })], { type: 'audio/ogg' }), `${safeName(d.title)}.opus`)
  const size = wavParts.reduce((a, p) => a + p.length, 0)
  const head = wav(new Float32Array(0), 24000)
  const v = new DataView(head.buffer)
  v.setUint32(4, 36 + size, true)
  v.setUint32(40, size, true)
  download(new Blob([head, ...wavParts], { type: 'audio/wav' }), `${safeName(d.title)}.wav`)
}

const safeName = t => t.replace(/[\\/:*?"<>|]+/g, '').slice(0, 80).trim() || 'noesis'
export function download(blob, name) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}
