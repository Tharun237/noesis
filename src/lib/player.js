import { createStore } from './store.js'
import { settings } from './settings.js'
import { db } from './db.js'
import { recordToBlob } from './tts.js'
import { VISUAL_KINDS } from './text.js'
import { library, getDoc, loadDoc, patch, onSegment, setPriority, kickVoice, secPerChar, onRemotePos } from './library.js'
import { toast } from './nav.js'
import { flushNow } from './sync.js'

// `playing` is the listener's intent. `waiting` = the next sentence isn't voiced yet (we resume on arrival).
export const player = createStore({ id: null, i: 0, playing: false, waiting: false, rate: settings.get().speed, t: 0, sleep: null })

const audio = new Audio()
audio.preload = 'auto'
let current = null // { i, url }
let next = null // prefetched { i, url }
let token = 0
let posTimer = null

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

// Position = sentence index + fraction through it, so another device lands on the same word
// even with a different voice or speed.
function positionNow() {
  const { id, i } = player.get()
  const f = audio.duration > 0 && current?.i === i ? Math.min(0.999, audio.currentTime / audio.duration) : 0
  return id && { id, p: { pos: i, posF: Math.round(f * 1000) / 1000, lastPlayed: Date.now() } }
}
function savePosition(now = false) {
  clearTimeout(posTimer)
  const save = () => { const x = positionNow(); if (x) patch(x.id, x.p) }
  now ? save() : (posTimer = setTimeout(save, 1200))
}
addEventListener('pagehide', () => savePosition(true))
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && savePosition(true))

async function load(i, { autoplay = player.get().playing, offset = 0, dir = 1 } = {}) {
  const { id } = player.get()
  const c = await loadDoc(id)
  if (!c) return
  i = skipVisual(c, Math.max(0, i), dir)
  if (i >= c.segs.length) return finish()
  const my = ++token
  player.set({ i, t: offset, waiting: false })
  savePosition()
  const url = await urlFor(id, i)
  if (my !== token) { if (url && url !== 'skip') URL.revokeObjectURL(url); return }
  if (url === 'skip') return load(i + dir, { autoplay, dir })
  if (!url) {
    // Not voiced yet: voicing follows the playhead, so this sentence is generated next.
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

function finish() {
  const { id } = player.get()
  audio.pause()
  player.set({ playing: false, waiting: false })
  if (id) patch(id, { finished: true, pos: 0 })
}

audio.addEventListener('ended', async () => {
  const p = player.get()
  const c = await loadDoc(p.id)
  if (p.sleep?.chapter && c.segs[p.i + 1]?.k === 'h') { player.set({ sleep: null }); return pause() }
  load(p.i + 1)
})
audio.addEventListener('timeupdate', () => {
  const p = player.get()
  player.set({ t: audio.currentTime })
  if (p.sleep?.until && Date.now() >= p.sleep.until) { player.set({ sleep: null }); pause() }
  updatePositionState()
})
audio.addEventListener('pause', () => { if (!audio.ended && !player.get().waiting && player.get().playing && audio.src) player.set({ playing: false }) })
audio.addEventListener('play', () => player.set({ playing: true }))

onSegment((id, i) => {
  const p = player.get()
  if (p.waiting && p.id === id && p.i === i) load(i, { autoplay: p.playing })
})

// ── public controls ──────────────────────────────────────────────────────────────
export async function open(id, { at, autoplay = true } = {}) {
  const d = getDoc(id)
  if (!d) return
  revoke(next); next = null
  const same = player.get().id === id
  player.set({ id, playing: autoplay })
  setSession(d)
  const c = await loadDoc(id)
  if (!c) return // still being prepared — the reader shows progress
  const start = at ?? (same ? player.get().i : d.finished ? 0 : d.pos || 0)
  if (d.finished && at == null) patch(id, { finished: false })
  const resume = at == null && !same && !d.finished && start === d.pos && d.posF && c.durs[start]
  load(start, { autoplay, offset: resume ? d.posF * c.durs[start] : 0 })
}

export function play() {
  const p = player.get()
  if (!p.id) return
  player.set({ playing: true })
  if (p.waiting) return kickVoice()
  if (!audio.src || current?.i !== p.i) return load(p.i, { autoplay: true })
  audio.play().catch(() => player.set({ playing: false }))
}

export function pause() {
  player.set({ playing: false })
  audio.pause()
  savePosition(true)
  flushNow()
}

// Another device moved ahead. Never yank audio that is playing here: offer a jump instead.
onRemotePos((id, v) => {
  const p = player.get()
  if (p.id !== id || v.pos === p.i) return
  const from = v.dev ? `from your ${v.dev}` : 'from your other device'
  if (p.playing) {
    toast(`Further along ${from}`, { label: 'Jump there', run: () => loadDoc(id).then(c => load(v.pos, { offset: (v.posF || 0) * (c.durs[v.pos] || 0) })) })
  } else {
    loadDoc(id).then(c => load(v.pos, { autoplay: false, offset: (v.posF || 0) * (c.durs[v.pos] || 0) }))
    toast(`Synced ${from}`)
  }
})

// A doc deleted on another device disappears here too: stop playing it.
library.sub(() => { const { id } = player.get(); if (id && !getDoc(id)) stopIf(id) })

export const toggle = () => (player.get().playing ? pause() : play())
export const nextSentence = () => load(player.get().i + 1, { dir: 1 })
export const prevSentence = () => {
  const p = player.get()
  load(audio.currentTime > 2.5 && !p.waiting ? p.i : p.i - 1, { dir: -1 })
}
export const seekTo = i => load(i)

export function setRate(r) {
  const rate = Math.round(Math.min(4, Math.max(0.5, r)) * 100) / 100
  audio.playbackRate = rate
  player.set({ rate })
}

export const setSleep = s => player.set({ sleep: s })

// Sub-second clock for word highlighting (timeupdate only fires ~4×/s).
export const audioClock = () => audio.currentTime

export function stopIf(id) {
  if (player.get().id !== id) return
  audio.pause()
  audio.removeAttribute('src')
  revoke(current); revoke(next); current = next = null
  player.set({ id: null, playing: false, waiting: false, i: 0, t: 0 })
}

// Global timeline: voiced sentences use their real duration, the rest an estimate learned on this device.
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
