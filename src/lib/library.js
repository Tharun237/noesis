import { createStore, uid } from './store.js'
import { db, persistStorage, canStore, storeNames } from './db.js'
import { onShelf } from './shelf.js'
import { samePart, progressOf } from './parts.js'
import { settings, hasKey } from './settings.js'
import { hasAiKey, providerName, hostOf } from './ai.js'
import { synthesize, engine, loadEngine } from './tts.js'
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
import { READER } from '../ingest/pdftext.js'
import { carrier } from './carry.js'
import { mergeMarks, sameMarks, carryMarks } from './marks.js'
import { prefsSnapshot, applyPrefs, quietly, offerPrefs } from './prefs.js'
import { muxOggOpus, unpackPackets, wav } from './audio-format.js'
import { touch, touchAfter, configureSync, startSync, downloadContent, deviceName } from './sync.js'

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
const META_FIELDS = ['title', 'author', 'kind', 'url', 'createdAt', 'mode', 'ai', 'voice', 'lang', 'archived', 'collections', 'cover', 'renamed', 'contentVer', 'parts', 'target', 'from', 'part', 'spc']
const POS_FIELDS = ['pos', 'posF', 'finished', 'lastPlayed']
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]))

// A place and a set of bookmarks are sentence numbers: they mean something only in the text they were counted
// in. So each is kept with the version of the text it belongs to (posVer, marksVer), which is the text this
// device holds (textVer) unless the one writing it says otherwise.
const holds = d => d.textVer ?? d.contentVer
const withVersions = (d, p) => ({
  ...d, ...p,
  ...('pos' in p && !('posVer' in p) ? { posVer: holds(d) } : {}),
  ...('marks' in p && !('marksVer' in p) ? { marksVer: holds(d) } : {}),
})

export function patch(id, p, remote = false) {
  let next = null
  library.set(s => ({ docs: s.docs.map(d => (d.id === id ? (next = withVersions(d, p)) : d)) }))
  if (!next) return
  saveMeta(id, next)
  if (remote) return
  const keys = Object.keys(p)
  if (keys.some(k => META_FIELDS.includes(k))) touch('meta:' + id)
  if (keys.some(k => POS_FIELDS.includes(k))) touch('pos:' + id)
  if (keys.includes('marks')) touch('marks:' + id)
}

// A change the machine worked out (sync.js touchAfter): kept here, and sent as the record it came from plus
// one tick, never as "the customer just did this". For everything Noesis changes by itself in a record that
// holds what the customer chose: their place, their bookmarks, a title, a voice.
export function derive(id, p) {
  patch(id, p, true)
  const keys = Object.keys(p)
  if (keys.some(k => META_FIELDS.includes(k))) touchAfter('meta:' + id)
  if (keys.some(k => POS_FIELDS.includes(k))) touchAfter('pos:' + id)
  if (keys.includes('marks')) touchAfter('marks:' + id)
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
// How long a letter takes to say. Each device measured its own, so the same book was a different length on
// each. The first device to have voiced a good part of it says what it measured (spc, kept in step with the
// document), and every device uses that.
const SPC_FROM = 20000 // letters voiced before the measure is told to the others: about twenty minutes of audio
export const secPerChar = d => d.spc || (d.vChars > 400 ? d.vSec / d.vChars : 1 / 14.5)
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
      // A sentence's length is kept apart from its audio, and a little later: an app closed in between (a phone
      // ends it at will) kept the audio and lost the length. The audio record carries its own length, so it is
      // taken from there. Without it "ready" waited for ever for sentences that were made (readiness).
      const lost = [...voicedSet(id)].filter(i => i < segs.length && !(durs[i] > 0))
      if (lost.length) { // ponytail: a silent sentence (dur 0) is looked up again on each load; few in a book
        const recs = await Promise.all(lost.map(i => db.getAudio(id, i)))
        let found = 0
        recs.forEach((r, k) => { if (r?.dur > 0) { durs[lost[k]] = r.dur; tails[lost[k]] = r.tail || 0; found++ } })
        if (found) db.putDurs(id, { durs, tails })
      }
      const c = { blocks: doc.blocks, segs, starts, durs, tails, refs: doc.refs || [] }
      cache.set(id, c)
      return c
    })().finally(() => loading.delete(id)))
  }
  return loading.get(id)
}

const durTimers = new Map()
// At most one write in 1.5 s, and always one. (It waited for 1.5 s of quiet, which a device making sentences
// faster than that never gave it: nothing was written until the whole book was made.)
function saveDurs(id) {
  if (durTimers.has(id)) return // the write already planned takes the newest lengths
  durTimers.set(id, setTimeout(() => { durTimers.delete(id); const c = cache.get(id); if (c) db.putDurs(id, { durs: c.durs, tails: c.tails }) }, 1500))
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
// Translations the customer asked to pause: the run stops at its next piece (translate.js Paused).
const held = new Set()
export function pauseTranslation(id) { if (getDoc(id)?.status === 'narrating') held.add(id) }
export function resumeTranslation(id) { if (getDoc(id)?.status === 'paused') { patch(id, { status: 'queued', stage: 'Waiting' }); kickPrep() } }
// How fast this device translates (characters a second), kept so the next estimate is this device's own.
function rememberTranslateSpeed(cps) {
  const prev = settings.get().translateCps
  const next = Math.round(prev ? prev * 0.7 + cps * 0.3 : cps)
  if (!prev || Math.abs(next - prev) / prev > 0.1) settings.set({ translateCps: next })
}
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
  // made: its audio is kept. A sentence that could not be made is kept as silence (length 0) and is made too:
  // counted as still to come, a book stopped at it and waited for ever, since nothing would ever make it.
  const made = voicedSet(d.id)
  let i = from
  let ahead = 0
  while (i < n && (c.durs[i] > 0 || made.has(i))) ahead += c.durs[i++]
  if (i >= n) return { ready: true, wait: 0 }
  const est = secPerChar(d)
  let rest = 0
  for (let k = i; k < n; k++) rest += c.durs[k] || (made.has(k) ? 0 : c.segs[k].t.length * est)
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

// A voice that could not be loaded because the device was offline is loaded when it is online again. (Nothing
// did: the message said "downloads when you're back online", and it never did until the app was restarted.)
if (typeof addEventListener === 'function') addEventListener('online', () => { const e = engine.get(); if (e.status === 'error' && e.voice) loadEngine(e.voice).then(() => kickVoice()).catch(() => {}) })

export const kickVoice = makeLoop(async () => {
  if (activeEngine() === 'system') return false // built-in voice speaks directly; no generation, no CPU load
  if (engine.get().status === 'error') return false // wait for a retry (which kicks)
  if (library.get().noRoom) return false // no room to keep audio in: wait until something is removed
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

// Documents whose online voice could not be reached, and when each is tried again.
const later = new Map()
const AGAIN_MS = 5000

async function nextVoiceJob() {
  const p = priority()
  const docs = library.get().docs.filter(d => d.status === 'voicing' && !rewriting.has(d.id))
    .sort((a, b) => (b.id === p?.id) - (a.id === p?.id) || a.createdAt - b.createdAt)
  for (const d of docs) {
    if (d.voice == null) continue // no natural voice for this language: the built-in voice speaks it, no generation
    if (later.get(d.id) > Date.now()) continue // its online voice could not be reached a moment ago: the others go first
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
      // A network or quota failure must never mark the sentence as failed: it is tried again in a moment.
      // Only a real refusal (bad key, text rejected) goes to the failure path below. Meanwhile this document
      // steps aside (`later`), so the others in the line are made: it used to wait here, in the one line
      // there is, and a document in a voice made on the device waited behind it for as long as it did.
      try {
        rec = await synthesize(seg.t, voice, pauseKind, tone, { onRetry })
      } catch (e) {
        if (engine.get().status === 'error') return // voice failed to load; loop parks until retried
        const status = e?.status
        const msg = String(e?.message || '')
        const refusal = status === 401 || status === 403 || status === 404 || status === 400 ||
          /did not accept the key/i.test(msg)
        if (refusal) throw e
        if (!/limiting requests/i.test(msg)) patch(id, { stage: 'This voice is made online. Waiting for a connection.' })
        later.set(id, Date.now() + AGAIN_MS)
        setTimeout(() => kickVoice(), AGAIN_MS + 100)
        return
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
  if (!now || (isVoice(now.voice) ? now.voice : fromKokoro(now.voice)) !== voice || (settings.get().voiceTone || 'natural') !== tone || cache.get(id) !== c || rewriting.has(id)) return // deleted / voice changed / re-processed meanwhile
  rec.v = tone === 'natural' ? voice : voice + '|' + tone
  // No room left on this device: the audio just made cannot be kept. That used to stop the line without a
  // word, and start it again on every nudge to make the same sentence and fail the same way. Now it is
  // said (Activity.jsx), and nothing more is made until something has been removed.
  try { await db.putAudio(id, i, rec) } catch (e) {
    console.warn('Audio could not be kept:', e)
    library.set({ noRoom: true })
    return
  }
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
  const voicedNow = getDoc(id)
  if (voicedNow && !voicedNow.spc && voicedNow.vChars > SPC_FROM) derive(id, { spc: Math.round((voicedNow.vSec / voicedNow.vChars) * 1e5) / 1e5 })
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
      // A version may be one part of the original (parts.js): a chapter, or from a page on. Block n of a part
      // is block part.from + n of the original, which is how the place is carried between them (listenIn).
      const own = d.part ? orig.blocks.slice(d.part.from, d.part.to ?? undefined) : orig.blocks
      fromOriginal = { blocks: own.map(b => ({ k: b.k, text: b.s.join(' '), page: b.p, data: b.d, src: b.x })), refs: orig.refs, title: d.title, author: o?.author, cover: o?.cover }
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
      blocks = await fix.repairAsync(blocks, pause)
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
      // With the customer's own AI key, the AI translates (more natural). Without one the device does it,
      // free: nobody is shut out of their own language for want of a key (Tharun, 2026-10-13).
      const source = detectLang(before)
      const onDevice = !hasAiKey()
      if (onDevice) {
        const { canTranslateHere } = await import('./localtranslate.js')
        // Latin letters that are not English could be Dutch or Polish: a translator from English would make nonsense of them.
        if ((source === 'en' && !isEnglish(before)) || !canTranslateHere(source, d.target)) throw new Error("Noesis can't translate this document on your device. With your own AI key it can: add one in Settings.")
      }
      const languageName = LANGS[d.target].name
      const stage = `Translating into ${languageName}`
      patch(id, { status: 'narrating', stage, prep: 0 })
      const { translateBlocks } = await import('./translate.js')
      const stored = await db.getTranslation(id)
      const saved = stored instanceof Map ? stored : new Map()
      const progress = stepped(id), loading = stepped(id) // each moves the bar a whole per cent at a time, not on every message
      const pages = blocks.reduce((a, b) => (typeof b.page === 'number' && b.page > a ? b.page : a), 0)
      const firstPage = blocks.find(b => typeof b.page === 'number')?.page ?? 0
      let startedAt = 0, startedDone = 0, lastWhere = ''
      held.delete(id)
      const fetching = `Downloading the ${languageName} translator`
      blocks = await translateBlocks(blocks, d.target, {
        onDevice, source,
        // the first time a language is used its translator comes down once: say that, in the app's words for a download
        onLoad: (got, all) => { if (getDoc(id)?.stage !== fetching) patch(id, { stage: fetching }); loading(all ? got / all : 0) },
        stopped: () => held.has(id),
        // Where it is and how long is left, said in whole pages and a rounded time so the line does not flicker.
        // The clock starts at the first piece really translated now: pieces kept from an earlier run are instant.
        onProgress: (f, at) => {
          if (at?.fresh && !startedAt) { startedAt = Date.now(); startedDone = at.done }
          const p = at ? progressOf({ done: at.done - startedDone, total: at.total - startedDone, startedAt: startedAt || Date.now(), now: Date.now(), page: blocks[at.block]?.page, pages }) : null
          const where = p?.where && pages - firstPage > 0 ? p.where : ''
          const left = p?.left == null ? null : p.left < 60 ? Math.ceil(p.left / 10) * 10 : Math.round(p.left / 30) * 30
          const now = getDoc(id)
          const say = where ? `${stage} · ${where}` : stage
          if (now?.stage !== say || (now?.eta ?? null) !== left || where !== lastWhere) { lastWhere = where; patch(id, { stage: say, eta: left }) }
          if (p?.cps > 0 && at.done - startedDone > 20000 && onDevice) rememberTranslateSpeed(p.cps)
          progress(f)
        },
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
    const hadText = await db.getDoc(id) // the text it had, if it had one: the place and the bookmarks are carried from it
    await db.delAudio(id)
    await db.putDoc(id, refs.length ? { blocks: listening, refs } : { blocks: listening })
    const total = listening.reduce((a, b) => a + b.s.length, 0)
    const chars = listening.reduce((a, b) => a + b.s.reduce((x, t) => x + t.length, 0), 0)
    await db.putDurs(id, { durs: new Array(total).fill(0), tails: new Array(total).fill(0) })
    await db.delTranslation(id)
    cache.delete(id)
    voiced.set(id, new Set())
    // A version switch carries the place by block number: first sentence of that block.
    const was = (hadText?.blocks || []).flatMap(b => b.s)
    const to = was.length ? carrier(was, listening.flatMap(b => b.s)) : i => Math.min(i, total - 1)
    const cur = getDoc(id) // as it is now: the customer may have listened on while this was prepared
    let pos = cur.pos ? to(cur.pos) : 0
    const kept = was.length ? carryMarks({ marks: cur.marks, gone: cur.marksGone }, to) : { marks: cur.marks || [], gone: cur.marksGone || {} }
    let startPatch = {}
    const startBlock = getDoc(id)?.startBlock
    if (startBlock != null && listening.length) {
      const starts = []
      let at = 0
      for (const b of listening) { starts.push(at); at += b.s.length }
      pos = starts[Math.min(startBlock, starts.length - 1)]
      startPatch = { startBlock: null }
    } else if (!cur.pos) {
      // a new document: the voice begins where the book does, after the copyright page and the contents (front.js)
      pos = listening.slice(0, bookStart(listening)).reduce((a, b) => a + b.s.length, 0)
    }
    // contentVer changes → sync uploads this exact text once, so other devices never re-parse or re-run AI.
    const ver = Date.now()
    // settings.voice stays an English voice and is never changed here; only the document's own voice follows its lang.
    patch(id, { status: voice == null ? 'ready' : 'voicing', stage: voice == null ? '' : 'Generating audio', total, chars, done: 0, vChars: 0, vSec: 0, prep: 1, ...startPatch, note: langNote ?? note, lang, foreign, voice, contentVer: ver, textVer: ver, readVer: READER })
    // Where it begins, and where its bookmarks now are, is worked out here: nobody listened or marked anything
    // just now, so it is not sent as if somebody had (derive).
    derive(id, { pos, posF: pos === cur.pos ? cur.posF || 0 : 0, posVer: ver, marks: kept.marks, marksGone: kept.gone, marksVer: ver })
    if (was.length) reread.forEach(f => f(id, pos)) // the player, if it holds this document, goes to the same words in the new text
    kickVoice()
  } catch (e) {
    // Paused by the customer: not a failure. What was translated is kept, and Resume carries on from there.
    if (e?.name === 'Paused') { held.delete(id); const at = (getDoc(id)?.stage || '').split(' · ')[1]; patch(id, { status: 'paused', stage: at ? `Paused at ${at}` : 'Paused', eta: null }); return }
    console.error(e)
    patch(id, { status: 'error', stage: 'Failed', error: e.message || String(e) })
  } finally {
    parsed?.pdf?.loadingTask.destroy() // pdf.js v6: the loading task owns the worker-side document
  }
}

// ── a better reader reads the old documents again ─────────────────────────────────────────
// Tharun, with 21 books in his library the day the reader was mended: "I'll not upload all those things again.
// It has to auto do it." So it does: a PDF read by an older reader (readVer < READER) is read again from its
// own file, which this device kept. Quietly: the document stays as it is, playable, until the new text is
// whole, and then one changes into the other with the place and the bookmarks carried to the same words.
// Not read again unasked: a document an AI narrated or a translator wrote (that is the customer's quota and
// time), one that has versions made from it (their places are counted in its paragraphs), and the one that is
// sounding right now (it is done the next time the app opens).
let sounding = () => false // the player says which document is being heard
export const setSounding = f => { sounding = f }
const reread = new Set()
export const onReread = f => { reread.add(f); return () => reread.delete(f) }
const REREAD_AFTER_MS = 5000 // opening the app comes first
// While a document's text is being replaced, nothing voices it: a sentence made from the old text must not be
// kept under the new text's numbers.
const rewriting = new Set()
const mayChange = (id, d) => { const cur = getDoc(id); return !!cur && cur.contentVer === d.contentVer && (cur.status === 'ready' || cur.status === 'voicing') && !sounding(id) }

// The reading is done in a worker (reread.worker.js): on a phone it would otherwise hold the screen. Where a
// worker cannot do it (it failed once), the page's own thread does, in slices.
async function rereadOld() {
  let worker = null, noWorker = false, asked = 0
  const ask = msg => new Promise((done, fail) => {
    const n = ++asked // the answer carries it back: nothing else said on this line is taken for an answer
    worker.onmessage = e => { if (e.data?.re === n) e.data.error ? fail(new Error(e.data.error)) : done(e.data) }
    worker.onerror = e => fail(new Error(e.message || 'the worker stopped'))
    worker.postMessage({ ...msg, n })
  })
  for (const { id } of [...library.get().docs]) {
    const d = getDoc(id)
    if (!d || d.kind !== 'pdf' || !d.total || (d.readVer || 1) >= READER || (d.status !== 'ready' && d.status !== 'voicing')) continue
    if (d.mode !== 'full' || d.target || (d.ai && hasAiKey()) || sounding(id) || library.get().docs.some(x => x.from === id)) continue
    try {
      if (noWorker) throw new Error('no worker')
      if (!worker) { worker = new Worker(new URL('./reread.worker.js', import.meta.url), { type: 'module' }); worker.postMessage({ stores: storeNames }) }
      const r = await ask({ read: true, id, lang: d.lang || 'en' })
      if (r.same) patch(id, { readVer: READER }, true)
      else if (r.ask && !mayChange(id, d)) worker.postMessage({ drop: true, id }) // it is looked at again the next time the app opens
      else if (r.ask) {
        const cur = getDoc(id)
        rewriting.add(id)
        try { takeNewText(id, cur, await ask({ write: true, id, pos: cur.pos || 0, marks: cur.marks || [], gone: cur.marksGone || {} })) } finally { rewriting.delete(id) }
      }
    } catch (e) {
      if (!noWorker) console.warn('Reading again in a worker failed, doing it here:', e?.message || e)
      noWorker = true
      worker?.terminate()
      worker = null
      await readAgain(id).catch(e => console.warn('Could not read again:', d.title, e?.message || e))
    }
    await pause()
  }
  worker?.terminate()
}

// The new text is in storage: the page lets go of the old one and says so.
function takeNewText(id, cur, n) {
  const ver = Date.now()
  cache.delete(id)
  voiced.set(id, new Set())
  patch(id, {
    status: cur.voice == null ? 'ready' : 'voicing', stage: cur.voice == null ? '' : 'Generating audio',
    total: n.total, chars: n.chars, done: 0, vChars: 0, vSec: 0, note: n.note ?? cur.note, scanned: n.scanned,
    contentVer: ver, textVer: ver, readVer: READER,
  })
  // The text is new, and says so. The place and the bookmarks are the same ones, carried to the same words:
  // nobody listened or marked anything just now, so they are not stamped as if somebody had.
  derive(id, { pos: n.pos, posF: 0, posVer: ver, marks: n.marks, marksGone: n.gone || {}, marksVer: ver })
  reread.forEach(f => f(id, n.pos))
  kickVoice()
}

async function readAgain(id) {
  const d = getDoc(id)
  const src = await db.getSource(id)
  if (src?.kind !== 'pdf') return // the file is on another device: that one reads it again, and sends the text
  let parsed = null
  try {
    parsed = await parseSource(src, null, { cover: false })
    let blocks = parsed.blocks
    let refs = parsed.refs || []
    const taken = takeRefs(blocks)
    if (taken.refs.length) { blocks = taken.blocks; if (!refs.length) refs = taken.refs }
    if (refs.length) blocks = withoutEmptyRefHeading(blocks)
    let note = d.note
    if (parsed.scanned) {
      const { loadRepair } = await import('../ingest/ocrfix.js')
      const fix = await loadRepair()
      blocks = await fix.repairAsync(blocks, pause)
      note = `Scanned book: Noesis fixed ${fix.stats.fixed.toLocaleString()} OCR errors and removed ${fix.stats.dropped.toLocaleString()} garbled lines on this device.`
    }
    const listening = await toListeningAsync(blocks, d.lang || 'en')
    const old = await db.getDoc(id)
    const was = (old?.blocks || []).flatMap(b => b.s), now = listening.flatMap(b => b.s)
    // deleted, re-processed, or begun to play while this was read: leave it, it is looked at again next time
    if (!mayChange(id, d)) return
    if (!now.length || (was.length === now.length && was.every((t, i) => t === now[i]))) return patch(id, { readVer: READER }, true)
    const cur = getDoc(id)
    const to = carrier(was, now)
    const pos = cur.pos ? to(cur.pos) : listening.slice(0, bookStart(listening)).reduce((a, b) => a + b.s.length, 0)
    const kept = carryMarks({ marks: cur.marks, gone: cur.marksGone }, to)
    rewriting.add(id)
    try {
      await db.delAudio(id)
      await db.putDoc(id, refs.length ? { blocks: listening, refs } : { blocks: listening })
      await db.putDurs(id, { durs: new Array(now.length).fill(0), tails: new Array(now.length).fill(0) })
      takeNewText(id, cur, { total: now.length, chars: now.reduce((a, t) => a + t.length, 0), pos, marks: kept.marks, gone: kept.gone, note, scanned: !!parsed.scanned })
    } finally { rewriting.delete(id) }
  } finally {
    parsed?.pdf?.loadingTask.destroy()
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
  offerPrefs()
  for (const d of metas) {
    if (d.status === 'syncing' && !d.contentVer && d.stage !== NOT_SENT) patch(d.id, { stage: NOT_SENT }, true) // said in older words
    if (d.status === 'syncing') fetchSynced(d.id) // resume interrupted downloads
    // Documents prepared before text versioning existed: give them a stable version so their text can sync.
    else if (d.total && !d.contentVer) derive(d.id, { contentVer: d.createdAt })
  }
  startSync().catch(e => console.warn('Sync failed to start:', e))
  setTimeout(() => void rereadOld(), REREAD_AFTER_MS)
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
      // looked at as it is NOW (a title that arrived from another device since the app opened is not mended away), and
      // sent as a mending, not as something the customer just typed
      const now = getDoc(d.id)
      if (now && !now.renamed && (cleaned.title !== now.title || cleaned.author !== (now.author || '')) && now.title === d.title) derive(d.id, cleaned)
    } catch { /* one bad document must not stop the repair */ }
    await pause()
  }
}

// One-time move off the retired Kokoro engine: free its ~310 MB model cache, and give documents in a
// Kokoro voice the closest Piper voice (their Kokoro audio is deleted so it regenerates, never skipped).
async function retireKokoro(metas) {
  globalThis.caches?.delete('transformers-cache').catch(() => {})
  if (!isVoice(settings.get().voice)) quietly(() => settings.set({ voice: fromKokoro(settings.get().voice) })) // mended, not chosen
  for (const d of metas) {
    if (d.voice == null || isVoice(d.voice)) continue
    await resetAudio(d.id)
    derive(d.id, { voice: fromKokoro(d.voice) }) // the nearest voice to the one they chose: not a new choice
  }
}

// ── sync bridge ───────────────────────────────────────────────────────────────────────
const remotePos = new Set()
export const onRemotePos = f => { remotePos.add(f); return () => remotePos.delete(f) }
const pending = new Map() // pos/marks that arrived before their doc's meta: id → patch
const aside = new Map() // a place or bookmarks counted in a text this device does not have: id → { pos?, marks? }

// Bookmarks from another device are put together with the ones here (marks.js), not put in their place.
// → 'again' when this device had something the other did not: the two together are then sent back.
function takeMarks(id, v) {
  const d = getDoc(id)
  const mine = { marks: d.marks || [], gone: d.marksGone || {} }
  const theirs = { marks: v.marks || [], gone: v.gone || {} }
  const both = mergeMarks(mine, theirs)
  patch(id, { marks: both.marks, marksGone: both.gone, marksVer: v.ver ?? holds(d) }, true)
  return sameMarks(both, theirs) ? undefined : 'again'
}

// Listening records are history.js's: it gives sync their keys, their contents and what to do with one that arrives.
let heard = null
export const setHeardSync = h => { heard = h }

const syncHooks = {
  allKeys: async () => ['cols', 'prefs', ...library.get().docs.flatMap(d => ['meta:' + d.id, 'pos:' + d.id, 'marks:' + d.id]), ...(await heard?.keys() || [])],
  content: id => db.getDoc(id),
  snapshot(k) {
    if (k === 'cols') return { collections: library.get().collections }
    if (k === 'prefs') return prefsSnapshot()
    if (k.startsWith('heard:')) return heard?.snapshot(k)
    const [type, id] = k.split(':')
    const d = getDoc(id)
    // A document is told to the other devices once its text exists (contentVer): told earlier, it stood on
    // them as "waiting for your other device" for as long as this one took, and for ever if this one was
    // closed or the file failed. Every change to it marks it to be sent again, so nothing is lost by waiting.
    if (type === 'meta') return !d ? { deleted: true } : d.contentVer ? pick(d, META_FIELDS) : undefined // deleted → tombstone
    if (!d) return undefined
    // each says which text it is counted in (ver), and bookmarks say which were taken away and when (gone)
    if (type === 'pos') return { ...pick(d, POS_FIELDS), dev: deviceName(), ver: d.posVer ?? holds(d) }
    if (type === 'marks') return { marks: d.marks || [], gone: d.marksGone || {}, ver: d.marksVer ?? holds(d) }
  },
  async apply(k, v) {
    if (k === 'cols') return library.set({ collections: v.collections || [] })
    if (k === 'prefs') return applyPrefs(v)
    if (k.startsWith('heard:')) return heard?.apply(k, v)
    const [type, id] = k.split(':')
    const d = getDoc(id)
    if (type === 'meta') {
      if (v.deleted) return d && deleteDoc(id, true)
      if (!d) return createSynced(id, v)
      // The voice was changed on another device: the audio kept here is in the old one. It is made again, as
      // if the voice had been changed here (it was left as it was, and a document open in the player then
      // waited for a sentence in the new voice that nothing was making).
      const revoice = v.voice && d.voice && v.voice !== d.voice && d.total > 0 && d.status !== 'syncing'
      if (revoice) await resetAudio(id)
      patch(id, pick(v, META_FIELDS), true)
      if (revoice) kickVoice()
      if (v.contentVer && v.contentVer !== d.contentVer) fetchSynced(id) // text was re-processed elsewhere
      return
    }
    if (!d) return pending.set(id, { ...pending.get(id), ...(type === 'pos' ? { ...pick(v, POS_FIELDS), posVer: v.ver } : { marks: v.marks || [], marksGone: v.gone || {}, marksVer: v.ver }) })
    // Counted in a text this device does not hold: the numbers would point at other sentences. That text may be
    // on its way here (its record has arrived, its words have not), or the other device may not yet have a
    // text this one has. Either way it is kept aside, and taken when this device holds that text (carryHere),
    // after this device's own place and bookmarks have been carried to it.
    if (v.ver && v.ver !== holds(d)) { aside.set(id, { ...aside.get(id), [type]: v }); return }
    if (type === 'pos') {
      patch(id, { ...pick(v, POS_FIELDS), posVer: v.ver ?? holds(d) }, true)
      remotePos.forEach(f => f(id, v))
      return
    }
    return takeMarks(id, v)
  },
}

// A document another device told this one about before it had sent the text (devices no longer do: see
// snapshot above). It is not work this device can do, so it says where the work is.
export const NOT_SENT = 'Not sent yet by the device it was added on'

async function createSynced(id, v) {
  const meta = {
    id, title: 'Untitled', author: '', kind: 'text', url: null, createdAt: Date.now(), lastPlayed: 0, mode: 'full', ai: false,
    voice: settings.get().voice, status: 'syncing', stage: NOT_SENT, prep: 0, total: 0, chars: 0,
    done: 0, vChars: 0, vSec: 0, pos: 0, posF: 0, finished: false, archived: false, collections: [], marks: [], cover: null,
    error: null, note: null, ...pick(v, META_FIELDS), ...pending.get(id),
  }
  pending.delete(id)
  await db.putMeta(meta)
  library.set(s => ({ docs: [meta, ...s.docs].sort((a, b) => b.createdAt - a.createdAt) }))
  fetchSynced(id)
}

const fetching = new Set()
// The text of a document has just been replaced by a newer one from another device. This device's place and
// bookmarks, if they were counted in the text it had, are carried to the same words; and anything kept aside
// because it was counted in the text that has now arrived is taken.
function carryHere(id, before, doc, ver) {
  const cur = getDoc(id)
  const was = (before?.blocks || []).flatMap(b => b.s)
  const carried = {}
  if (was.length && cur) {
    const stale = v => (v ?? null) !== ver
    const hasPlace = cur.pos > 0 && stale(cur.posVer), hasMarks = ((cur.marks || []).length || Object.keys(cur.marksGone || {}).length) && stale(cur.marksVer)
    if (hasPlace || hasMarks) {
      const to = carrier(was, doc.blocks.flatMap(b => b.s))
      if (hasPlace) Object.assign(carried, { pos: to(cur.pos), posF: 0, posVer: ver })
      if (hasMarks) { const kept = carryMarks({ marks: cur.marks, gone: cur.marksGone }, to); Object.assign(carried, { marks: kept.marks, marksGone: kept.gone, marksVer: ver }) }
    }
  }
  if (Object.keys(carried).length) derive(id, carried)
  else if (cur) patch(id, { ...(cur.posVer == null ? { posVer: ver } : {}), ...(cur.marksVer == null ? { marksVer: ver } : {}) }, true)
  const kept = aside.get(id)
  aside.delete(id)
  if (kept?.pos?.ver === ver) { patch(id, { ...pick(kept.pos, POS_FIELDS), posVer: ver }, true); remotePos.forEach(f => f(id, kept.pos)) }
  if (kept?.marks?.ver === ver && takeMarks(id, kept.marks) === 'again') touchAfter('marks:' + id)
  if (carried.pos != null && !(kept?.pos?.ver === ver)) reread.forEach(f => f(id, carried.pos)) // the player, if it holds this book, moves with it
}
async function fetchSynced(id) {
  const d = getDoc(id)
  if (!d?.contentVer || !d.parts || fetching.has(id)) return
  fetching.add(id)
  try {
    patch(id, { status: 'syncing', stage: 'Downloading from your other device', error: null }, true)
    const doc = await downloadContent(id, d.contentVer, d.parts)
    const before = await db.getDoc(id) // the text this device had: its place and bookmarks are counted in that
    await db.delAudio(id)
    await db.putDoc(id, doc)
    const total = doc.blocks.reduce((a, b) => a + b.s.length, 0)
    const chars = doc.blocks.reduce((a, b) => a + b.s.reduce((x, t) => x + t.length, 0), 0)
    await db.putDurs(id, { durs: new Array(total).fill(0), tails: new Array(total).fill(0) })
    cache.delete(id)
    voiced.set(id, new Set())
    const spoken = getDoc(id)?.voice != null // no natural voice for its language: the device's own voice reads it, nothing is made
    patch(id, { status: spoken ? 'voicing' : 'ready', stage: spoken ? 'Making the audio' : '', total, chars, done: 0, vChars: 0, vSec: 0, prep: 1, textVer: d.contentVer }, true)
    carryHere(id, before, doc, d.contentVer)
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
export async function listenIn(id, target, part = null) {
  const cur = getDoc(id)
  const rootId = cur?.from || id
  const root = getDoc(rootId) || cur
  let wantedId
  if (target === root?.lang && !root?.foreign) {
    wantedId = rootId
  } else {
    const existing = library.get().docs.find(x => x.from === rootId && x.target === target && samePart(x.part, part))
    if (existing) wantedId = existing.id
    else {
      const name = `${root?.title || 'Untitled'} (${LANGS[target].name}${part?.label ? `, ${part.label}` : ''})`
      wantedId = await addDocument({ kind: 'ref', from: rootId },
        { target, title: name, renamed: true, mode: 'full', from: rootId, ...(part ? { part: { from: part.from, to: part.to ?? null, label: part.label } } : {}) })
    }
  }
  // Carry the place: the block number being read in the current document, counted in the ORIGINAL's blocks
  // (a part starts at its own first block). A version that has no text yet (still translating, or failed)
  // has no place to carry: leaving it must not move the other version back to its start.
  const c = await loadDoc(id)
  if (!c?.segs?.length) return wantedId
  const wanted = getDoc(wantedId)
  const inRoot = (c.segs[Math.min(cur?.pos || 0, c.segs.length - 1)]?.b ?? 0) + (cur?.part?.from || 0)
  const block = Math.max(0, inRoot - (wanted?.part?.from || 0))
  if (wanted && (wanted.status === 'voicing' || wanted.status === 'ready')) {
    const wc = await loadDoc(wantedId)
    if (wc) {
      patch(wantedId, { pos: wc.starts[Math.min(block, wc.starts.length - 1)], posF: 0, lastPlayed: Date.now(), startBlock: null })
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
  patch(id, { voice, spc: null }) // another voice speaks at another pace: the measure is taken again
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
  if (library.get().noRoom) { library.set({ noRoom: false }); setTimeout(() => kickVoice(), 500) } // room has been made
  cache.delete(id)
  voiced.delete(id)
  library.set(s => ({ docs: s.docs.filter(d => d.id !== id) }))
  if (!remote) touch('meta:' + id) // snapshot of a missing doc = tombstone → deleted on every device
  await Promise.all([db.delMeta(id), db.delContent(id), db.delAudio(id)])
}

export async function deleteAllAudio() {
  if (library.get().noRoom) library.set({ noRoom: false }) // room has been made
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
  const d = getDoc(id)
  const marks = d.marks || []
  const has = marks.some(m => m.i === i)
  const gone = { ...(d.marksGone || {}) }
  if (has) gone[i] = Date.now() // taken away, and when: so that it is not brought back by a device that still has it
  else delete gone[i]
  patch(id, { marks: has ? marks.filter(m => m.i !== i) : [...marks, { i, note: '', at: Date.now() }].sort((a, b) => a.i - b.i), marksGone: gone })
  return !has
}
export const setMarkNote = (id, i, note) => patch(id, { marks: (getDoc(id).marks || []).map(m => (m.i === i ? { ...m, note, at: Date.now() } : m)) })

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
