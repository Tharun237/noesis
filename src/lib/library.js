import { createStore, uid } from './store.js'
import { db, persistStorage, canStore } from './db.js'
import { onShelf } from './shelf.js'
import { settings, hasKey } from './settings.js'
import { hasAiKey, providerName, hostOf } from './ai.js'
import { synthesize, engine } from './tts.js'
import { toListeningAsync, pause } from './text.js'
import { takeRefs, withoutEmptyRefHeading } from './citations.js'
import { isVoice, fromKokoro, defaultVoiceFor, VOICES } from './voices.js'
import { isCloudVoice, cloudVoiceInfo, loadCloudVoices } from './cloudvoice.js'
import { LANGS, detectLang, isEnglish } from './lang.js'
import { activeEngine, hasSystemVoice } from './engine.js'
import { waitSeconds } from './readiness-math.js'
import { parseSource, fetchUrl } from '../ingest/index.js'
import { cleanMeta } from '../ingest/meta.js'
import { bookStart } from '../ingest/front.js'
import { muxOggOpus, unpackPackets, wav } from './audio-format.js'
import { touch, configureSync, startSync, downloadContent, deviceName } from './sync.js'

// Document lifecycle: queued → reading → narrating (AI only) → voicing → ready  (or error)
// Two independent loops: PREP (parse + optional Gemini) and VOICE (on-device TTS, one sentence at a time),
// so a long book can be prepared while you already listen to something else.

const COLLECTIONS_KEY = onShelf('noesis.collections.v1')
const loadCollections = () => { try { return JSON.parse(localStorage.getItem(COLLECTIONS_KEY) || '[]') } catch { return [] } }

export const library = createStore({ docs: [], loaded: false, collections: loadCollections(), voicingNow: null })
// The library store changes many times a second while a book is voiced; only write collections when they change.
let savedCollections = library.get().collections
library.sub(() => {
  const c = library.get().collections
  if (c === savedCollections) return
  savedCollections = c
  localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(c))
})

const cache = new Map() // id → { blocks, segs: [{t, b, k}], starts: [segIndex per block], durs: [sec, 0 = not voiced], tails: [sec trailing silence, 0 = unknown] }
const voiced = new Map() // id → Set<segIndex>
const segListeners = new Set()
export const onSegment = f => { segListeners.add(f); return () => segListeners.delete(f) }

let priority = () => null // player registers () => ({ id, i }) so voicing follows the playhead
export const setPriority = f => { priority = f }

export const getDoc = id => library.get().docs.find(d => d.id === id)
const voicedSet = id => voiced.get(id) ?? voiced.set(id, new Set()).get(id)
export const isVoiced = (id, i) => voicedSet(id).has(i)

// What syncs between devices. Everything else on a doc (status, voicing progress, errors) is per-device.
const META_FIELDS = ['title', 'author', 'kind', 'url', 'createdAt', 'mode', 'ai', 'voice', 'lang', 'archived', 'collections', 'cover', 'renamed', 'contentVer', 'parts', 'target', 'from']
const POS_FIELDS = ['pos', 'posF', 'finished', 'lastPlayed']
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]))

export function patch(id, p, remote = false) {
  let next = null
  library.set(s => ({ docs: s.docs.map(d => (d.id === id ? (next = { ...d, ...p }) : d)) }))
  if (!next) return
  saveMeta(id, next)
  if (remote) return
  const keys = Object.keys(p)
  if (keys.some(k => META_FIELDS.includes(k))) touch('meta:' + id)
  if (keys.some(k => POS_FIELDS.includes(k))) touch('pos:' + id)
  if (keys.includes('marks')) touch('marks:' + id)
}

// Disk writes are grouped. Progress changes several times a second while a book is prepared or voiced, and
// each write copies the whole record (cover image included) on the UI thread. The latest state is written
// at most every 400 ms per document, and immediately once the page is hidden (closing, switching apps).
const metaTimers = new Map()
function saveMeta(id, next) {
  if (document.visibilityState === 'hidden') return void db.putMeta(next)
  if (metaTimers.has(id)) return
  metaTimers.set(id, setTimeout(() => { metaTimers.delete(id); const d = getDoc(id); if (d) db.putMeta(d) }, 400))
}
function flushMeta() {
  for (const [id, t] of metaTimers) { clearTimeout(t); const d = getDoc(id); if (d) db.putMeta(d) }
  metaTimers.clear()
}
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushMeta())
addEventListener('pagehide', flushMeta)

// Progress callbacks fire per page or per chunk; the UI only needs whole percents.
const stepped = id => { let last = -1; return p => { if (p >= 1 || p - last >= 0.01) { last = p; patch(id, { prep: p }) } } }

// Seconds of audio per character, learned from what this device has actually produced.
export const secPerChar = d => (d.vChars > 400 ? d.vSec / d.vChars : 1 / 14.5)
export const docDuration = d => d.chars * secPerChar(d)

// Library sort orders. The player uses the same order to pick "up next", so the queue you see is the queue you hear.
export const SORTS = {
  recent: (a, b) => Math.max(b.lastPlayed || 0, b.createdAt) - Math.max(a.lastPlayed || 0, a.createdAt),
  added: (a, b) => b.createdAt - a.createdAt,
  title: (a, b) => a.title.localeCompare(b.title),
  author: (a, b) => (a.author || '￿').localeCompare(b.author || '￿') || a.title.localeCompare(b.title),
  length: (a, b) => docDuration(b) - docDuration(a),
}

// The unfinished, unarchived document after `id` in the given order (wrapping to the top).
export function nextInQueue(id, sort) {
  const list = library.get().docs.filter(d => d.id === id || (!d.archived && !d.finished && d.status !== 'error')).sort(SORTS[sort] || SORTS.recent)
  const at = list.findIndex(d => d.id === id)
  return [...list.slice(at + 1), ...list.slice(0, Math.max(0, at))][0] || null
}

// Concurrent callers (reader, player, voice loop) must share ONE object: durations are filled in
// place as sentences are voiced. So the in-flight promise is shared, not just the finished result.
const loading = new Map()
export function loadDoc(id) {
  if (cache.has(id)) return Promise.resolve(cache.get(id))
  if (!loading.has(id)) {
    loading.set(id, (async () => {
      const [doc, stored] = await Promise.all([db.getDoc(id), db.getDurs(id)])
      if (!doc) return null
      const segs = []
      const starts = []
      doc.blocks.forEach((b, bi) => { starts.push(segs.length); for (const t of b.s) segs.push({ t, b: bi, k: b.k }) })
      let durs, tails
      if (stored && !Array.isArray(stored) && Array.isArray(stored.durs) && stored.durs.length === segs.length) {
        durs = stored.durs
        tails = Array.isArray(stored.tails) && stored.tails.length === segs.length ? stored.tails : new Array(segs.length).fill(0)
      } else {
        durs = stored?.length === segs.length ? stored : new Array(segs.length).fill(0)
        tails = new Array(segs.length).fill(0)
      }
      const c = { blocks: doc.blocks, segs, starts, durs, tails, refs: doc.refs || [] }
      cache.set(id, c)
      return c
    })().finally(() => loading.delete(id)))
  }
  return loading.get(id)
}

const durTimers = new Map()
function saveDurs(id) {
  clearTimeout(durTimers.get(id))
  durTimers.set(id, setTimeout(() => { const c = cache.get(id); if (c) db.putDurs(id, { durs: c.durs, tails: c.tails }) }, 1500))
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

// How fast THIS device generates natural voice: seconds of audio per second of work (moving average).
// Measured per compute device: the graphics chip and the processor differ by 10× or more, so a
// processor measurement must never stand in for the GPU (or vice versa) after switching.
function recordSpeed(x) {
  const prev = settings.get().voiceSpeed
  const next = Math.round((prev ? prev * 0.8 + x * 0.2 : x) * 100) / 100
  // Saving a setting rewrites localStorage and re-renders everything that reads settings: skip the noise.
  if (!prev || Math.abs(next - prev) / prev > 0.03) settings.set({ voiceSpeed: next })
}

// Paper2Audio-style readiness for the natural voice: can playback from sentence `from` run to the end
// without ever catching up with generation? With A s already generated ahead, R s still to generate and
// generation running at r× speaking speed, playback never stalls once A ≥ R·(1−r)/r.
// Waiting w seconds adds r·w to A and removes r·w from R, so the wait is max(0, R·(1−r)/r − A).
export function readiness(d, c, from = 0) {
  if (!d || !c) return { ready: false, wait: null }
  const n = c.segs.length
  let i = from
  let ahead = 0
  while (i < n && c.durs[i] > 0) ahead += c.durs[i++]
  if (i >= n) return { ready: true, wait: 0 }
  const est = secPerChar(d)
  let rest = 0
  for (let k = i; k < n; k++) rest += c.durs[k] || c.segs[k].t.length * est
  // Safety margin is a fixed buffer, not a speed discount: discounting would turn a device that is
  // just faster than real time (1.06×) into a "slow" one and make long books wait for nothing.
  const wait = waitSeconds(ahead, rest, Math.max(0.02, settings.get().voiceSpeed || 1))
  return { ready: wait <= 0, wait }
}

let lastEngine = activeEngine()
settings.sub(() => { const e = activeEngine(); if (e !== lastEngine) { lastEngine = e; kickVoice() } })

// A tone change remakes audio, but never the whole library at once: that would throw away hours of generated
// audio for books nobody is listening to. The book in the player is remade now (from the listening position);
// any other book is checked when it is next opened (ensureFresh).
let lastTone = settings.get().voiceTone || 'natural'
settings.sub(() => {
  const t = settings.get().voiceTone || 'natural'
  if (t === lastTone) return
  lastTone = t
  const p = priority()
  if (p) resetAudio(p.id).then(kickVoice)
})

// Called when a document is opened: if its stored audio was made in another voice or tone, remake it.
export async function ensureFresh(id) {
  const d = getDoc(id)
  const first = [...voicedSet(id)][0]
  if (!d || first === undefined) return
  const rec = await db.getAudio(id, first)
  if (rec && rec.codec !== 'none' && !audioMatches(d, rec)) { await resetAudio(id); kickVoice() }
}

export const kickVoice = makeLoop(async () => {
  if (activeEngine() === 'system') return false // built-in voice speaks directly; no generation, no CPU load
  if (engine.get().status === 'error') return false // wait for a retry (which kicks)
  const job = await nextVoiceJob()
  if (!job) { if (library.get().voicingNow) library.set({ voicingNow: null }); return false }
  await voiceOne(job.id, job.i)
  return true
})

async function resetAudio(id) {
  const d = getDoc(id)
  await db.delAudio(id)
  voicedSet(id).clear()
  const c = cache.get(id)
  if (c) { c.durs.fill(0); c.tails.fill(0); db.putDurs(id, { durs: c.durs, tails: c.tails }) }
  patch(id, { done: 0, vChars: 0, vSec: 0, ...(d.status === 'ready' ? { status: 'voicing', stage: 'Making the audio' } : {}) })
}

async function nextVoiceJob() {
  const p = priority()
  const docs = library.get().docs.filter(d => d.status === 'voicing')
    .sort((a, b) => (b.id === p?.id) - (a.id === p?.id) || a.createdAt - b.createdAt)
  for (const d of docs) {
    if (d.voice == null) continue // no natural voice for this language: the built-in voice speaks it, no generation
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
  if (library.get().voicingNow !== id) library.set({ voicingNow: id })
  const d = getDoc(id)
  if (d.voice == null) return // no natural voice for this language: skip without an error, without spinning
  const c = cache.get(id)
  const seg = c.segs[i]
  const voice = isVoice(d.voice) ? d.voice : fromKokoro(d.voice) // a device not yet updated may sync a Kokoro voice
  const tone = settings.get().voiceTone || 'natural'
  const b = seg.b
  const lastInBlock = i === c.starts[b] + c.blocks[b].s.length - 1
  const pauseKind = seg.k === 'h' ? 'heading' : lastInBlock ? 'paragraph' : 'sentence'
  let rec
  const warm = engine.get().status === 'ready' && engine.get().voice === voice // the first call also downloads the voice
  const t0 = performance.now()
  const cloud = isCloudVoice(voice)
  const own = typeof voice === 'string' && voice.startsWith('oa:')
  const ownHost = own ? (hostOf(String(settings.get().voiceBase || '')) || 'The voice service') : null
  const onRetry = !cloud ? undefined : v => {
    if (!getDoc(id)) return
    if (v === 'offline') patch(id, { stage: 'This voice is made online. Waiting for a connection.' })
    else if (v == null) patch(id, { stage: 'Making the audio' })
    else if (typeof v === 'string') patch(id, { stage: v }) // pre-worded provider message (browser block)
    else if (ownHost) patch(id, { stage: `${ownHost}'s quota is limiting requests. Retrying in about ${v} s.` })
    else patch(id, { stage: `NVIDIA's free quota is limiting requests. Retrying in about ${v} s.` })
  }
  try {
    if (cloud) {
      // A network or quota failure must never mark the sentence as failed: wait and try again.
      // Only a real refusal (bad key, text rejected) leaves this loop for the failure path below.
      for (;;) {
        try {
          rec = await synthesize(seg.t, voice, pauseKind, tone, { onRetry })
          break
        } catch (e) {
          if (engine.get().status === 'error') return // voice failed to load; loop parks until retried
          const status = e?.status
          const msg = String(e?.message || '')
          const refusal = status === 401 || status === 403 || status === 404 || status === 400 ||
            /did not accept the key/i.test(msg)
          if (refusal) throw e
          if (/limiting requests/i.test(msg)) { /* stage already says so via onRetry; keep waiting */ }
          else patch(id, { stage: 'This voice is made online. Waiting for a connection.' })
          await new Promise(r => setTimeout(r, 5000))
          const still = getDoc(id)
          if (!still || (isVoice(still.voice) ? still.voice : fromKokoro(still.voice)) !== voice) return
        }
      }
    } else {
      rec = await synthesize(seg.t, voice, pauseKind, tone)
    }
    if (warm && rec.dur > 0.5) recordSpeed(rec.dur / ((performance.now() - t0) / 1000))
  } catch (e) {
    if (engine.get().status === 'error') return // voice failed to load; loop parks until retried
    console.warn('Sentence failed, skipping:', seg.t, e)
    rec = { codec: 'none', dur: 0, tail: 0 }
  }
  const now = getDoc(id)
  if (!now || (isVoice(now.voice) ? now.voice : fromKokoro(now.voice)) !== voice || (settings.get().voiceTone || 'natural') !== tone || cache.get(id) !== c) return // deleted / voice changed / re-processed meanwhile
  rec.v = tone === 'natural' ? voice : voice + '|' + tone
  await db.putAudio(id, i, rec)
  const set = voicedSet(id)
  set.add(i)
  c.durs[i] = rec.dur
  c.tails[i] = rec.tail || 0
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
    patch(id, { status: 'reading', stage: 'Reading the document', error: null, prep: 0 })
    let src = await db.getSource(id)
    if (!src) throw new Error('The original file is on the device you added it from. Re-process it there.')
    // A translated version points at the original instead of copying its file.
    // It is made from the original's prepared text, not by reading the file again: no second pass of
    // page reading or AI narration, and block n here is block n there, which is how the place is carried.
    const refFrom = src.kind === 'ref' ? src.from : null
    let fromOriginal = null
    if (refFrom) {
      const orig = await db.getDoc(refFrom)
      if (!orig?.blocks?.length) throw new Error('The original document was removed from this device.')
      const o = getDoc(refFrom)
      fromOriginal = { blocks: orig.blocks.map(b => ({ k: b.k, text: b.s.join(' '), page: b.p, data: b.d, src: b.x })), refs: orig.refs, title: d.title, author: o?.author, cover: o?.cover }
      patch(id, { kind: o?.kind || 'text' })
    }
    if (src.kind === 'link') {
      patch(id, { stage: 'Fetching link' })
      src = await fetchUrl(src.url)
      if (!refFrom) await db.putSource(id, src)
      patch(id, { kind: src.kind, url: src.url })
    }
    parsed = fromOriginal || await parseSource(src, stepped(id))
    await pause()
    patch(id, {
      title: d.renamed ? d.title : parsed.title || d.title,
      author: parsed.author || d.author,
      cover: parsed.cover || d.cover,
    })
    let blocks = parsed.blocks
    // The reference list is never read aloud. It is kept beside the text, so a citation can be looked at.
    let refs = parsed.refs || []
    const taken = takeRefs(blocks)
    if (taken.refs.length) { blocks = taken.blocks; if (!refs.length) refs = taken.refs }
    if (refs.length) blocks = withoutEmptyRefHeading(blocks)
    let note = null

    if (d.ai && hasAiKey() && parsed.pdf) {
      patch(id, { status: 'narrating', stage: 'AI is reading the pages', prep: 0 })
      const { narratePdf } = await import('./gemini.js')
      const r = await narratePdf({
        pdf: parsed.pdf, pageText: parsed.pageText, key: s.geminiKey, model: s.geminiModel,
        onProgress: stepped(id),
        onRetry: secs => patch(id, { stage: secs == null ? 'AI is reading the pages' : `${providerName()}'s free quota is limiting requests. Retrying in about ${secs} s.` }),
      })
      blocks = r.blocks.flatMap(b => (b.k === 'gap' ? parsed.blocks.filter(x => x.page >= b.from && x.page <= b.to) : [b]))
      if (r.failed.length) note = `AI narration failed on pages ${r.failed.map(([a, b]) => (a === b ? a : `${a}–${b}`)).join(', ')}; those pages use standard cleanup.`
    }

    // Scanned book without AI narration: repair OCR errors on-device with a dictionary.
    if (parsed.scanned && !(d.ai && hasAiKey())) {
      patch(id, { stage: 'Repairing scanned text', prep: 0 })
      const { loadRepair } = await import('../ingest/ocrfix.js')
      const fix = await loadRepair()
      blocks = fix.repair(blocks)
      note = `Scanned book: Noesis fixed ${fix.stats.fixed.toLocaleString()} OCR errors and removed ${fix.stats.dropped.toLocaleString()} garbled lines on this device.`
    }
    patch(id, { scanned: !!parsed.scanned })

    if (d.mode !== 'full') {
      if (!hasAiKey()) throw new Error('Summaries need a free AI key. Add one in Settings.')
      patch(id, { status: 'narrating', stage: d.mode === 'long' ? 'Writing a long summary' : 'Writing a short summary', prep: 0 })
      const { summarize } = await import('./gemini.js')
      const text = blocks.map(b => (b.k === 'h' ? `\n## ${b.text}\n` : b.text)).join('\n')
      const stage = d.mode === 'long' ? 'Writing a long summary' : 'Writing a short summary'
      blocks = await summarize({ text, title: getDoc(id).title, mode: d.mode,
        onRetry: secs => patch(id, { stage: secs == null ? stage : `${providerName()}'s free quota is limiting requests. Retrying in about ${secs} s.` }) })
    }

    // Already in the wanted language? Script tells Telugu and Hindi apart; for English the words must agree
    // too, or a French book (Latin letters) would pass as English and never be translated.
    const before = blocks.map(b => b.text || '').join('\n')
    const already = detectLang(before) === d.target && (d.target !== 'en' || isEnglish(before))
    if (d.target && LANGS[d.target] && !already) {
      if (!hasAiKey()) throw new Error('Translation needs a free AI key. Add one in Settings.')
      const languageName = LANGS[d.target].name
      const stage = `Translating into ${languageName}`
      patch(id, { status: 'narrating', stage, prep: 0 })
      const { translateBlocks } = await import('./translate.js')
      const stored = await db.getTranslation(id)
      const saved = stored instanceof Map ? stored : new Map()
      blocks = await translateBlocks(blocks, d.target, {
        onProgress: stepped(id),
        onRetry: secs => patch(id, { stage: secs == null ? stage : `${providerName()}'s free quota is limiting requests. Retrying in about ${secs} s.` }),
        saved,
        onChunk: (index, strings) => { saved.set(index, strings); return db.putTranslation(id, saved) },
      })
    }

    const finalText = blocks.map(b => b.text || '').join('\n')
    // A translated document (or one already in the target language) keeps its target language,
    // not a new detection.
    const lang = (d.target && LANGS[d.target]) ? d.target : detectLang(finalText)
    const foreign = lang === 'en' && !isEnglish(finalText) // Latin letters, but not English: no voice of its own yet
    const curLang = d.voice == null ? null : (VOICES.find(v => v.id === d.voice)?.lang ?? (isCloudVoice(d.voice) ? cloudVoiceInfo(d.voice).lang : 'en'))
    // A custom (`oa:`) voice has no language of its own: the document keeps it whatever its language.
    const keepOwn = typeof d.voice === 'string' && d.voice.startsWith('oa:')
    const voice = keepOwn || lang === curLang ? d.voice : defaultVoiceFor(lang)
    const langNote = voice == null ? `No natural voice for ${LANGS[lang].name} yet. ${hasSystemVoice() ? "Your device's built-in voice reads this document." : 'This browser has no built-in voice to read it either.'}` : null
    const listening = await toListeningAsync(blocks, lang)
    if (!listening.length) {
      throw new Error(parsed.pdf && !hasAiKey()
        ? 'No selectable text found (scanned PDF?). Add an AI key in Settings to read scanned pages.'
        : 'No readable text found in this document.')
    }
    await db.delAudio(id)
    await db.putDoc(id, refs.length ? { blocks: listening, refs } : { blocks: listening })
    const total = listening.reduce((a, b) => a + b.s.length, 0)
    const chars = listening.reduce((a, b) => a + b.s.reduce((x, t) => x + t.length, 0), 0)
    await db.putDurs(id, { durs: new Array(total).fill(0), tails: new Array(total).fill(0) })
    await db.delTranslation(id)
    cache.delete(id)
    voiced.set(id, new Set())
    // A version switch carries the place by block number: first sentence of that block.
    let pos = Math.min(d.pos || 0, total - 1)
    let startPatch = {}
    const startBlock = getDoc(id)?.startBlock
    if (startBlock != null && listening.length) {
      const starts = []
      let at = 0
      for (const b of listening) { starts.push(at); at += b.s.length }
      pos = starts[Math.min(startBlock, starts.length - 1)]
      startPatch = { startBlock: null }
    } else if (!d.pos) {
      // a new document: the voice begins where the book does, after the copyright page and the contents (front.js)
      pos = listening.slice(0, bookStart(listening)).reduce((a, b) => a + b.s.length, 0)
    }
    // contentVer changes → sync uploads this exact text once, so other devices never re-parse or re-run AI.
    // settings.voice stays an English voice and is never changed here; only the document's own voice follows its lang.
    patch(id, { status: voice == null ? 'ready' : 'voicing', stage: voice == null ? '' : 'Generating audio', total, chars, done: 0, vChars: 0, vSec: 0, prep: 1, pos, ...startPatch, note: langNote ?? note, lang, foreign, voice, contentVer: Date.now() })
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
  // This browser may give the page no storage (db.js canStore), or refuse it. The app still opens: an empty
  // library, which shows the welcome page, and that page says documents cannot be kept here.
  const kept = canStore ? await Promise.all([db.allMeta(), db.audioKeys()]).catch(e => { console.warn('No storage in this browser:', e?.message || e); return null }) : null
  if (!kept) return library.set({ loaded: true, noStorage: true })
  const [metas, keys] = kept
  for (const k of keys) {
    const j = k.lastIndexOf(':')
    voicedSet(k.slice(0, j)).add(+k.slice(j + 1))
  }
  library.set({ docs: metas.sort((a, b) => b.createdAt - a.createdAt), loaded: true })
  void repairMeta(metas)
  await retireKokoro(metas)
  persistStorage()
  kickPrep()
  kickVoice()
  // NVIDIA voices, if the customer saved a key: refresh the list at most once a day.
  void loadCloudVoices().catch(e => console.warn('NVIDIA voice list not loaded:', e?.message || e))
  configureSync(syncHooks)
  for (const d of metas) {
    if (d.status === 'syncing') fetchSynced(d.id) // resume interrupted downloads
    // Documents prepared before text versioning existed: give them a stable version so their text can sync.
    else if (d.total && !d.contentVer) patch(d.id, { contentVer: d.createdAt })
  }
  startSync().catch(e => console.warn('Sync failed to start:', e))
}

// Documents already in the library may carry junk PDF metadata titles/authors. Repair them
// after the library is shown so startup never waits; yield between documents.
async function repairMeta(metas) {
  for (const d of metas) {
    try {
      if (d.renamed) continue
      const src = await db.getSource(d.id)
      if (!src?.name) continue
      const stored = await db.getDoc(d.id).catch(() => null)
      const firstHeading = stored?.blocks?.find(b => b.k === 'h')?.s?.join(' ') || ''
      const cleaned = cleanMeta({ title: d.title, author: d.author }, { fileName: src.name, firstHeading })
      if (cleaned.title !== d.title || cleaned.author !== (d.author || '')) patch(d.id, cleaned)
    } catch { /* one bad document must not stop the repair */ }
    await pause()
  }
}

// One-time move off the retired Kokoro engine: free its ~310 MB model cache, and give documents in a
// Kokoro voice the closest Piper voice (their Kokoro audio is deleted so it regenerates, never skipped).
async function retireKokoro(metas) {
  globalThis.caches?.delete('transformers-cache').catch(() => {})
  if (!isVoice(settings.get().voice)) settings.set({ voice: fromKokoro(settings.get().voice) })
  for (const d of metas) {
    if (d.voice == null || isVoice(d.voice)) continue
    await resetAudio(d.id)
    patch(d.id, { voice: fromKokoro(d.voice) })
  }
}

// ── sync bridge ───────────────────────────────────────────────────────────────────────
const remotePos = new Set()
export const onRemotePos = f => { remotePos.add(f); return () => remotePos.delete(f) }
const pending = new Map() // pos/marks that arrived before their doc's meta: id → patch

const syncHooks = {
  allKeys: () => ['cols', ...library.get().docs.flatMap(d => ['meta:' + d.id, 'pos:' + d.id, 'marks:' + d.id])],
  content: id => db.getDoc(id),
  snapshot(k) {
    if (k === 'cols') return { collections: library.get().collections }
    const [type, id] = k.split(':')
    const d = getDoc(id)
    if (type === 'meta') return d ? pick(d, META_FIELDS) : { deleted: true } // deleted → tombstone
    if (!d) return undefined
    if (type === 'pos') return { ...pick(d, POS_FIELDS), dev: deviceName() }
    if (type === 'marks') return { marks: d.marks || [] }
  },
  async apply(k, v) {
    if (k === 'cols') return library.set({ collections: v.collections || [] })
    const [type, id] = k.split(':')
    const d = getDoc(id)
    if (type === 'meta') {
      if (v.deleted) return d && deleteDoc(id, true)
      if (!d) return createSynced(id, v)
      patch(id, pick(v, META_FIELDS), true)
      if (v.contentVer && v.contentVer !== d.contentVer) fetchSynced(id) // text was re-processed elsewhere
      return
    }
    const p = type === 'pos' ? pick(v, POS_FIELDS) : { marks: v.marks || [] }
    if (!d) return pending.set(id, { ...pending.get(id), ...p })
    patch(id, p, true)
    if (type === 'pos') remotePos.forEach(f => f(id, v))
  },
}

async function createSynced(id, v) {
  const meta = {
    id, title: 'Untitled', author: '', kind: 'text', url: null, createdAt: Date.now(), lastPlayed: 0, mode: 'full', ai: false,
    voice: settings.get().voice, status: 'syncing', stage: 'Waiting for your other device to finish preparing', prep: 0, total: 0, chars: 0,
    done: 0, vChars: 0, vSec: 0, pos: 0, posF: 0, finished: false, archived: false, collections: [], marks: [], cover: null,
    error: null, note: null, ...pick(v, META_FIELDS), ...pending.get(id),
  }
  pending.delete(id)
  await db.putMeta(meta)
  library.set(s => ({ docs: [meta, ...s.docs].sort((a, b) => b.createdAt - a.createdAt) }))
  fetchSynced(id)
}

const fetching = new Set()
async function fetchSynced(id) {
  const d = getDoc(id)
  if (!d?.contentVer || !d.parts || fetching.has(id)) return
  fetching.add(id)
  try {
    patch(id, { status: 'syncing', stage: 'Downloading from your other device', error: null }, true)
    const doc = await downloadContent(id, d.contentVer, d.parts)
    await db.delAudio(id)
    await db.putDoc(id, doc)
    const total = doc.blocks.reduce((a, b) => a + b.s.length, 0)
    const chars = doc.blocks.reduce((a, b) => a + b.s.reduce((x, t) => x + t.length, 0), 0)
    await db.putDurs(id, { durs: new Array(total).fill(0), tails: new Array(total).fill(0) })
    cache.delete(id)
    voiced.set(id, new Set())
    patch(id, { status: 'voicing', stage: 'Making the audio', total, chars, done: 0, vChars: 0, vSec: 0, prep: 1 }, true)
    kickVoice()
  } catch (e) {
    patch(id, { status: 'syncing', stage: 'Waiting to download from your other device', error: e.message }, true)
    setTimeout(() => fetchSynced(id), 60_000)
  } finally {
    fetching.delete(id)
  }
}

export async function addDocument(src, overrides = {}) {
  const s = settings.get()
  const id = uid()
  const meta = {
    id, title: src.title || src.name || src.url || 'Untitled', author: '', kind: src.kind, url: src.url || null,
    createdAt: Date.now(), lastPlayed: 0, mode: s.mode, ai: s.aiNarration && hasAiKey(), voice: s.voice,
    status: 'queued', stage: 'Waiting', prep: 0, total: 0, chars: 0, done: 0, vChars: 0, vSec: 0,
    pos: 0, finished: false, archived: false, collections: [], marks: [], cover: null, error: null, note: null,
    ...overrides,
  }
  if (!LANGS[meta.target]) delete meta.target
  await db.putSource(id, src)
  await db.putMeta(meta)
  library.set(st => ({ docs: [meta, ...st.docs] }))
  kickPrep()
  return id
}

// The reader's language switch. Returns the wanted document's id; does not navigate.
// Deleting an original never touches its translated versions (deleteDoc is per-id).
export async function listenIn(id, target) {
  const cur = getDoc(id)
  const rootId = cur?.from || id
  const root = getDoc(rootId) || cur
  let wantedId
  if (target === root?.lang && !root?.foreign) {
    wantedId = rootId
  } else {
    const existing = library.get().docs.find(x => x.from === rootId && x.target === target)
    if (existing) wantedId = existing.id
    else {
      wantedId = await addDocument({ kind: 'ref', from: rootId },
        { target, title: `${root?.title || 'Untitled'} (${LANGS[target].name})`, renamed: true, mode: 'full', from: rootId })
    }
  }
  // Carry the place: the block number being read in the current document.
  // A version that has no text yet (still translating, or failed) has no place to carry: leaving it must
  // not move the other version back to its start.
  const c = await loadDoc(id)
  if (!c?.segs?.length) return wantedId
  const block = c.segs[Math.min(cur?.pos || 0, c.segs.length - 1)]?.b ?? 0
  const wanted = getDoc(wantedId)
  if (wanted && (wanted.status === 'voicing' || wanted.status === 'ready')) {
    const wc = await loadDoc(wantedId)
    if (wc) {
      patch(wantedId, { pos: wc.starts[Math.min(block, wc.starts.length - 1)], startBlock: null })
      return wantedId
    }
  }
  patch(wantedId, { startBlock: block })
  return wantedId
}

export async function changeVoice(id, voice) {
  const d = getDoc(id)
  if (!d || d.voice === voice) return
  await resetAudio(id)
  patch(id, { voice })
  kickVoice()
}

// Stored audio is only valid for the voice AND tone it was made with (records are tagged with rec.v;
// plain `voice` for the natural tone so existing audio stays valid; untagged records are from the
// retired Kokoro engine and never match).
export const audioMatches = (d, rec) => {
  if (!d || !rec) return false
  const voice = isVoice(d.voice) ? d.voice : fromKokoro(d.voice)
  const tone = settings.get().voiceTone || 'natural'
  return rec.v === (tone === 'natural' ? voice : voice + '|' + tone)
}

export function reprocess(id, changes = {}) {
  cache.delete(id)
  patch(id, { ...changes, status: 'queued', stage: 'Waiting', error: null })
  kickPrep()
}

export async function deleteDoc(id, remote = false) {
  cache.delete(id)
  voiced.delete(id)
  library.set(s => ({ docs: s.docs.filter(d => d.id !== id) }))
  if (!remote) touch('meta:' + id) // snapshot of a missing doc = tombstone → deleted on every device
  await Promise.all([db.delMeta(id), db.delContent(id), db.delAudio(id)])
}

export async function deleteAllAudio() {
  for (const d of library.get().docs) {
    await db.delAudio(d.id)
    voicedSet(d.id).clear()
    const c = cache.get(d.id)
    if (c) { c.durs.fill(0); c.tails.fill(0) }
    if (d.total) patch(d.id, { done: 0, vChars: 0, vSec: 0, status: d.status === 'ready' ? 'voicing' : d.status })
  }
  kickVoice()
}

// Bookmarks & notes: [{ i: sentence index, note, at }]
export function toggleMark(id, i) {
  const marks = getDoc(id).marks || []
  const has = marks.some(m => m.i === i)
  patch(id, { marks: has ? marks.filter(m => m.i !== i) : [...marks, { i, note: '', at: Date.now() }].sort((a, b) => a.i - b.i) })
  return !has
}
export const setMarkNote = (id, i, note) => patch(id, { marks: (getDoc(id).marks || []).map(m => (m.i === i ? { ...m, note } : m)) })

export function addCollection(name) {
  const c = { id: uid(), name: name.trim() }
  library.set(s => ({ collections: [...s.collections, c] }))
  touch('cols')
  return c.id
}

export function toggleInCollection(docId, colId) {
  const d = getDoc(docId)
  const has = d.collections.includes(colId)
  patch(docId, { collections: has ? d.collections.filter(x => x !== colId) : [...d.collections, colId] })
}

export function removeCollection(colId) {
  library.set(s => ({ collections: s.collections.filter(c => c.id !== colId) }))
  touch('cols')
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
  let wavRate = 0 // read from the stored WAV's own header: Piper voices are 16 or 22.05 kHz
  for (let from = 0; from < c.segs.length; from += 200) {
    const recs = await db.getAudios(id, from, Math.min(c.segs.length, from + 200))
    for (const r of recs) {
      if (!r || r.codec === 'none') continue
      rate = r.rate || rate
      if (r.codec === 'opus') { const u = unpackPackets(r); packets.push(...u.packets); frames.push(...u.frames) } else { wavRate ||= new DataView(r.bytes.buffer, r.bytes.byteOffset).getUint32(24, true); wavParts.push(r.bytes.subarray(44)) }
    }
  }
  // ponytail: sentences are concatenated as one Opus stream without re-encoding; boundaries can carry a ~6 ms seam.
  if (packets.length) return download(new Blob([muxOggOpus(packets, frames, { inputRate: rate })], { type: 'audio/ogg' }), `${safeName(d.title)}.opus`)
  const size = wavParts.reduce((a, p) => a + p.length, 0)
  const head = wav(new Float32Array(0), wavRate)
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
