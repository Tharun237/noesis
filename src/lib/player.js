import { createStore } from './store.js'
import { settings } from './settings.js'
import { db } from './db.js'
import { recordToBlob } from './tts.js'
import { VISUAL_KINDS } from './text.js'
import { activeEngine, pickSystemVoice } from './engine.js'
import { library, getDoc, loadDoc, patch, onSegment, setPriority, kickVoice, secPerChar, onRemotePos, readiness, nextInQueue } from './library.js'
import { toast } from './nav.js'
import { flushNow } from './sync.js'

// Two ways to speak, chosen per device (engine.js):
//   natural — pre-generated Kokoro audio per sentence, played through an <audio> element
//   system  — the device's built-in TTS, spoken live sentence by sentence (no generation, no CPU load)
//
// `playing` is the listener's intent. `waiting` = natural audio for the next sentence isn't generated yet.
// `gate` = seconds until the natural voice can play to the end without stalling (null = no gate).
// `word` = character offset of the word being spoken (built-in voice reports exact word boundaries).
export const player = createStore({ id: null, i: 0, playing: false, waiting: false, rate: settings.get().speed, t: 0, sleep: null, gate: null, word: 0 })

const audio = new Audio()
audio.preload = 'auto'
let current = null // { i, url }
let next = null // prefetched { i, url }
let token = 0
let utter = 0
let posTimer = null
let pendingStart = false // play was pressed while the natural voice was still preparing

const system = () => activeEngine() === 'system'

setPriority(() => { const p = player.get(); return p.id ? { id: p.id, i: p.i } : null })

const revoke = x => x && URL.revokeObjectURL(x.url)

async function urlFor(id, i) {
  if (next?.i === i) { const n = next; next = null; return n.url }
  const rec = await db.getAudio(id, i)
  if (!rec) return null
  if (rec.codec === 'none') return 'skip'
  return URL.createObjectURL(recordToBlob(rec))
}

async function prefetch(id, i) {
  const c = await loadDoc(id)
  if (i >= c.segs.length || next?.i === i) return
  const rec = await db.getAudio(id, i)
  if (!rec || rec.codec === 'none' || player.get().id !== id) return
  revoke(next)
  next = { i, url: URL.createObjectURL(recordToBlob(rec)) }
}

function skipVisual(c, i, dir) {
  if (!settings.get().skipVisuals) return i
  while (i >= 0 && i < c.segs.length && VISUAL_KINDS.has(c.segs[i].k)) i += dir
  return i
}

// Swapping sentences must not pause the <audio> element (that would flash "paused" on every seek).
function cancelSpeech() {
  utter++
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
}
function stopOutput() {
  cancelSpeech()
  audio.pause()
}

// Position = sentence index + fraction through it, so another device lands on the same word
// even with a different voice, engine or speed.
function fraction() {
  const p = player.get()
  if (system()) {
    const len = segText(p.i).length
    return len ? Math.min(0.999, p.word / len) : 0
  }
  return audio.duration > 0 && current?.i === p.i ? Math.min(0.999, audio.currentTime / audio.duration) : 0
}
let doc = null // loaded content of the current document (for synchronous lookups)
const segText = i => doc?.segs[i]?.t || ''

function savePosition(now = false) {
  clearTimeout(posTimer)
  const save = () => {
    const { id, i } = player.get()
    if (id) patch(id, { pos: i, posF: Math.round(fraction() * 1000) / 1000, lastPlayed: Date.now() })
  }
  now ? save() : (posTimer = setTimeout(save, 1200))
}
addEventListener('pagehide', () => savePosition(true))
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && savePosition(true))

async function load(i, { autoplay = player.get().playing, offset = 0, from = 0, dir = 1 } = {}) {
  const { id } = player.get()
  const c = await loadDoc(id)
  if (!c) return
  doc = c
  i = skipVisual(c, Math.max(0, i), dir)
  if (i >= c.segs.length) return finish()
  const my = ++token
  cancelSpeech()
  player.set({ i, t: offset, waiting: false, word: from })
  savePosition()
  if (system()) { audio.pause(); return speak(c, i, autoplay, from) }

  const url = await urlFor(id, i)
  if (my !== token) { if (url && url !== 'skip') URL.revokeObjectURL(url); return }
  if (url === 'skip') return load(i + dir, { autoplay, dir })
  if (!url) {
    // Not generated yet: generation follows the playhead, so this sentence is made next.
    audio.pause()
    player.set({ waiting: true })
    kickVoice()
    return
  }
  revoke(current)
  current = { i, url }
  audio.src = url
  audio.playbackRate = player.get().rate
  if (offset) audio.currentTime = offset
  if (autoplay) audio.play().catch(() => player.set({ playing: false }))
  prefetch(id, skipVisual(c, i + 1, 1))
}

// ── built-in voice ───────────────────────────────────────────────────────────────
function speak(c, i, autoplay, from = 0) {
  const my = ++utter
  if (!autoplay) return
  const full = c.segs[i].t
  const text = full.slice(from)
  if (!text.trim()) return sentenceEnded()
  const u = new SpeechSynthesisUtterance(text)
  const voice = pickSystemVoice()
  if (voice) { u.voice = voice; u.lang = voice.lang }
  u.rate = player.get().rate
  const est = secPerChar(getDoc(player.get().id) || { vChars: 0 })
  u.onboundary = e => {
    if (my !== utter || e.name === 'sentence') return
    const word = from + e.charIndex
    player.set({ word, t: word * est })
    sleepCheck()
  }
  u.onend = () => { if (my === utter) sentenceEnded() }
  u.onerror = e => {
    if (my !== utter || e.error === 'interrupted' || e.error === 'canceled') return
    console.warn('Built-in voice error:', e.error)
    if (e.error === 'not-allowed') return player.set({ playing: false })
    sentenceEnded()
  }
  speechSynthesis.speak(u)
  player.set({ playing: true })
}

async function sentenceEnded() {
  const p = player.get()
  const c = await loadDoc(p.id)
  if (!c) return
  if (p.sleep?.chapter && c.segs[p.i + 1]?.k === 'h') { player.set({ sleep: null }); return pause() }
  if (sleepCheck()) return
  load(p.i + 1, { autoplay: true })
}

function sleepCheck() {
  const { sleep } = player.get()
  if (sleep?.until && Date.now() >= sleep.until) { player.set({ sleep: null }); pause(); return true }
  return false
}

// End of document: mark it finished, then (unless the sleep timer says "end of document") play what's next.
function finish() {
  const { id, sleep } = player.get()
  stopOutput()
  player.set({ playing: false, waiting: false, sleep: sleep?.doc ? null : sleep })
  if (!id) return
  const s = settings.get()
  patch(id, { finished: true, pos: 0, posF: 0, ...(s.archiveFinished && { archived: true }) })
  const up = !sleep?.doc && s.autoplayNext && nextInQueue(id, s.sort)
  if (!up) return
  toast(`Up next: ${up.title}`)
  open(up.id)
}

audio.addEventListener('ended', sentenceEnded)
audio.addEventListener('timeupdate', () => {
  player.set({ t: audio.currentTime })
  sleepCheck()
  updatePositionState()
})
audio.addEventListener('pause', () => { if (!audio.ended && !player.get().waiting && player.get().playing && audio.src && !system()) player.set({ playing: false }) })
audio.addEventListener('play', () => player.set({ playing: true }))

// ── natural voice readiness gate (like Paper2Audio: don't start what would stall) ─────
async function gateCheck() {
  const p = player.get()
  if (system()) return true
  const d = getDoc(p.id)
  const c = await loadDoc(p.id)
  const r = readiness(d, c, p.i)
  player.set({ gate: r.ready ? null : r.wait })
  return r.ready
}

const fmtWait = s => (s < 90 ? 'under 2 minutes' : s < 3600 ? `about ${Math.round(s / 60)} minutes` : `about ${(s / 3600).toFixed(1)} hours`)

onSegment(async (id, i) => {
  const p = player.get()
  if (p.id !== id) return
  if (p.waiting && p.i === i) return load(i, { autoplay: p.playing })
  if (pendingStart && await gateCheck()) {
    pendingStart = false
    toast('The natural voice is ready')
    play()
  }
})

// ── public controls ──────────────────────────────────────────────────────────────
export async function open(id, { at, autoplay = true } = {}) {
  const d = getDoc(id)
  if (!d) return
  revoke(next); next = null
  pendingStart = false
  const same = player.get().id === id
  player.set({ id, playing: false, gate: null })
  heard = { id, voice: d.voice, sys: settings.get().systemVoice, engine: activeEngine() }
  setSession(d)
  const c = await loadDoc(id)
  if (!c) return // still being prepared — the reader shows progress
  doc = c
  const start = at ?? (same ? player.get().i : d.finished ? 0 : d.pos || 0)
  if (d.finished && at == null) patch(id, { finished: false })
  const resume = at == null && !same && !d.finished && start === d.pos && d.posF
  await load(start, {
    autoplay: false,
    offset: resume && c.durs[start] ? d.posF * c.durs[start] : 0,
    from: resume && system() ? wordStart(c.segs[start].t, d.posF) : 0,
  })
  if (autoplay) play()
}

// Character offset of the word at a fraction through a sentence (resume a built-in voice mid-sentence).
const wordStart = (t, f) => { const at = Math.floor(t.length * f); const k = t.lastIndexOf(' ', at); return k < 0 ? 0 : k + 1 }

export async function play() {
  const p = player.get()
  if (!p.id) return
  if (!(await gateCheck())) {
    pendingStart = true
    player.set({ playing: false })
    kickVoice()
    const wait = player.get().gate
    toast(`The natural voice is still being prepared on this device: ready in ${fmtWait(wait)}. It starts by itself.`,
      typeof speechSynthesis !== 'undefined' ? { label: 'Use built-in voice now', run: () => settings.set({ voiceEngine: 'system' }) } : null)
    return
  }
  pendingStart = false
  player.set({ playing: true, gate: null })
  if (system()) return load(p.i, { autoplay: true, from: p.word })
  if (p.waiting) return kickVoice()
  if (!audio.src || current?.i !== p.i) return load(p.i, { autoplay: true })
  audio.play().catch(() => player.set({ playing: false }))
}

export function pause() {
  pendingStart = false
  player.set({ playing: false, gate: null })
  stopOutput()
  savePosition(true)
  flushNow()
}

// Another device moved ahead. Never yank audio that is playing here: offer a jump instead.
onRemotePos((id, v) => {
  const p = player.get()
  if (p.id !== id || v.pos === p.i) return
  const from = v.dev ? `from your ${v.dev}` : 'from your other device'
  const jump = autoplay => loadDoc(id).then(c => load(v.pos, { autoplay, offset: (v.posF || 0) * (c.durs[v.pos] || 0), from: wordStart(c.segs[v.pos].t, v.posF || 0) }))
  if (p.playing) toast(`Further along ${from}`, { label: 'Jump there', run: () => jump(true) })
  else { jump(false); toast(`Synced ${from}`) }
})

// Voice or engine changes (here, in Settings, or synced) take effect at once: restart the current
// sentence in the new voice. A doc deleted on another device stops playing here.
let heard = { id: null, voice: null, sys: null, engine: null }
function voiceChanged() {
  const p = player.get()
  if (!p.id) return
  const d = getDoc(p.id)
  if (!d) return stopIf(p.id)
  const now = { id: d.id, voice: d.voice, sys: settings.get().systemVoice, engine: activeEngine() }
  const changed = heard.id === now.id && (heard.voice !== now.voice || heard.sys !== now.sys || heard.engine !== now.engine)
  heard = now
  if (!changed) return
  revoke(next)
  next = null
  if (p.playing || p.waiting) { stopOutput(); play() }
  else { stopOutput(); revoke(current); current = null; audio.removeAttribute('src') }
}
library.sub(voiceChanged)
settings.sub(voiceChanged)

export const toggle = () => (player.get().playing || pendingStart ? pause() : play())
export const nextSentence = () => load(player.get().i + 1, { dir: 1 })
export const prevSentence = () => {
  const p = player.get()
  const into = system() ? p.word > 12 : audio.currentTime > 2.5 && !p.waiting
  load(into ? p.i : p.i - 1, { dir: -1 })
}
export const seekTo = i => load(i)

export function setRate(r) {
  const rate = Math.round(Math.min(4, Math.max(0.5, r)) * 100) / 100
  audio.playbackRate = rate
  player.set({ rate })
  if (system() && player.get().playing) load(player.get().i, { autoplay: true, from: player.get().word }) // utterance rate is fixed once speaking
}

export const setSleep = s => player.set({ sleep: s })

// Sub-second clock for word highlighting with the natural voice (timeupdate only fires ~4×/s).
export const audioClock = () => audio.currentTime

export function stopIf(id) {
  if (player.get().id !== id) return
  stopOutput()
  audio.removeAttribute('src')
  revoke(current); revoke(next); current = next = null
  pendingStart = false
  player.set({ id: null, playing: false, waiting: false, i: 0, t: 0, gate: null, word: 0 })
}

// Global timeline: generated sentences use their real duration, the rest an estimate learned on this device.
export function timeline(d, c) {
  const est = secPerChar(d)
  const offs = new Float64Array(c.segs.length + 1)
  for (let i = 0; i < c.segs.length; i++) offs[i + 1] = offs[i] + (c.durs[i] || c.segs[i].t.length * est)
  return offs
}

export async function seekTime(sec) {
  const { id } = player.get()
  const d = getDoc(id)
  const c = await loadDoc(id)
  if (!c) return
  const offs = timeline(d, c)
  let lo = 0, hi = c.segs.length - 1
  while (lo < hi) { const m = (lo + hi + 1) >> 1; offs[m] <= sec ? (lo = m) : (hi = m - 1) }
  load(lo, { offset: c.durs[lo] ? Math.max(0, sec - offs[lo]) : 0 })
}

// ── lock screen / headset / car controls ─────────────────────────────────────────
function setSession(d) {
  if (!('mediaSession' in navigator)) return
  navigator.mediaSession.metadata = new MediaMetadata({
    title: d.title,
    artist: d.author || 'Noesis',
    album: 'Noesis',
    artwork: d.cover ? [{ src: d.cover, sizes: '240x320', type: 'image/jpeg' }] : [{ src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' }],
  })
}

let lastPosUpdate = 0
async function updatePositionState() {
  if (!('mediaSession' in navigator) || Date.now() - lastPosUpdate < 1000) return
  lastPosUpdate = Date.now()
  const p = player.get()
  const d = getDoc(p.id)
  const c = await loadDoc(p.id)
  if (!d || !c) return
  const offs = timeline(d, c)
  const duration = offs[c.segs.length]
  try { navigator.mediaSession.setPositionState({ duration, position: Math.min(duration, offs[p.i] + p.t), playbackRate: p.rate }) } catch { /* duration 0 while preparing */ }
}

if ('mediaSession' in navigator) {
  const on = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f) } catch { /* unsupported action */ } }
  on('play', play)
  on('pause', pause)
  on('previoustrack', prevSentence)
  on('nexttrack', nextSentence)
  on('seekbackward', prevSentence)
  on('seekforward', nextSentence)
  on('seekto', e => seekTime(e.seekTime))
  player.sub(() => { navigator.mediaSession.playbackState = player.get().playing ? 'playing' : 'paused' })
}
