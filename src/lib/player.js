import { waitWords } from './readiness-math.js'
import { createStore } from './store.js'
import { settings } from './settings.js'
import { db } from './db.js'
import { recordToBlob, voiceWait } from './tts.js'
import { muxOggOpus, unpackPackets } from './audio-format.js'
import { VISUAL_KINDS } from './text.js'
import { LANGS } from './lang.js'
import { activeEngine, builtInOnly, pickSystemVoice } from './engine.js'
import { library, getDoc, loadDoc, patch, onSegment, setPriority, kickVoice, secPerChar, onRemotePos, readiness, nextInQueue, audioMatches, ensureFresh, setSounding, onReread } from './library.js'
import { toast, openSheet } from './nav.js'
import { wordWeights } from './words.js'
import { flushNow } from './sync.js'

// Two ways to speak, chosen per device (engine.js):
//   natural — pre-generated Piper audio, played through an <audio> element in continuous stretches of sentences
//   system  — the device's built-in TTS, spoken live sentence by sentence (no generation, no CPU load)
//
// `playing` is the listener's intent. `waiting` = natural audio for the next sentence isn't generated yet.
// `gate` = seconds until the natural voice can play to the end without stalling (null = no gate).
// `word` = character offset of the word being spoken (built-in voice reports exact word boundaries).
export const player = createStore({ id: null, i: 0, playing: false, waiting: false, rate: settings.get().speed, t: 0, sleep: null, gate: null, word: 0 })

const audio = new Audio()
audio.preload = 'auto'
// The natural voice plays in stretches: consecutive generated sentences joined into one audio file. One clip
// per sentence (usually under 5 s) left tiny gaps between sentences, and Android only shows its media
// notification (lock screen, headset, car controls) for audio longer than about 5 seconds.
// A stretch: { id, from, to, n, k, starts, url } — sentences from..to-1, starts[j] = second where sentence j
// begins (starts[n] = length), k = index of the sentence playing now.
const STRETCH_S = 40
const STRETCH_MAX = 48
let current = null
let next = null // the following stretch, built shortly before it is needed
let token = 0
let utter = 0
let posTimer = null
let pendingStart = false // play was pressed while the natural voice was still preparing
let playError = null // name of the last refused play(), for the diagnostics report

// A refused play() has to say so: a tap that does nothing is the worst status there is.
function playFailed(e) {
  player.set({ playing: false })
  if (e?.name === 'AbortError') return // replaced by a newer load or a pause: not a failure
  playError = e?.name || 'Error'
  toast(playError === 'NotAllowedError' ? 'Your browser held playback back. Tap play again.' : "This browser couldn't play the audio.")
}

const system = () => activeEngine() === 'system' || builtInOnly(getDoc(player.get().id))

setPriority(() => { const p = player.get(); return p.id ? { id: p.id, i: p.i } : null })

const revoke = x => x?.url && URL.revokeObjectURL(x.url)
const covers = (st, id, i) => !!st && st.id === id && i >= st.from && i < st.to

// → a stretch starting at sentence i, 'skip' (that sentence failed to generate), or null (not generated yet).
async function stretchAt(id, c, i) {
  if (next?.id === id && next.from === i) { const n = next; next = null; return n }
  const d = getDoc(id)
  const recs = await db.getAudios(id, i, Math.min(c.segs.length, i + STRETCH_MAX))
  const first = recs[0]
  if (!first || !audioMatches(d, first)) return null // not generated yet, or made in a previous voice
  if (first.codec === 'none') return 'skip'
  if (first.codec !== 'opus') return { id, from: i, to: i + 1, n: 1, k: 0, starts: [0, first.dur], url: URL.createObjectURL(recordToBlob(first)) }
  const packets = []
  const frames = []
  const starts = [0]
  let total = 0 // in 48 kHz samples, from the packets themselves: exact sentence boundaries inside the file
  let n = 0
  for (const rec of recs) {
    if (!rec || rec.codec !== 'opus' || rec.rate !== first.rate || !audioMatches(d, rec)) break
    if (n > 0 && skipVisual(c, i + n, 1) !== i + n) break // a skipped figure or table ends the stretch
    const u = unpackPackets(rec)
    for (let j = 0; j < u.packets.length; j++) { packets.push(u.packets[j]); frames.push(u.frames[j]); total += u.frames[j] }
    starts.push(total / 48000)
    n++
    if (total / 48000 >= STRETCH_S) break
  }
  const blob = new Blob([muxOggOpus(packets, frames, { inputRate: first.rate })], { type: 'audio/ogg; codecs=opus' })
  return { id, from: i, to: i + n, n, k: 0, starts, url: URL.createObjectURL(blob) }
}

async function prefetch(id, c, i) {
  if (i >= c.segs.length || (next?.id === id && next.from === i)) return
  const st = await stretchAt(id, c, i)
  if (!st || st === 'skip' || player.get().id !== id) return void (st?.url && URL.revokeObjectURL(st.url))
  revoke(next)
  next = st
}

// Which sentence of the stretch is at the audio's current time; moves the highlight and saved position with it.
function track(withTime) {
  if (!current || system()) return
  const t = audio.currentTime
  let k = current.k
  while (k + 1 < current.n && t >= current.starts[k + 1]) k++
  while (k > 0 && t < current.starts[k]) k--
  const p = player.get()
  if (!covers(current, p.id, p.i)) return // a jump elsewhere is loading; the old stretch must not pull the position back
  const i = current.from + k
  if (k !== current.k || i !== p.i) {
    current.k = k
    if (i > p.i && p.sleep?.chapter && doc?.segs[i]?.k === 'h') { // sleep at end of chapter: stop on the heading
      audio.pause()
      audio.currentTime = current.starts[k]
      player.set({ sleep: null, i, t: 0, word: 0 })
      return pause()
    }
    player.set({ i, t: t - current.starts[k], word: 0 })
    savePosition()
  } else if (withTime) player.set({ t: t - current.starts[k] })
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
  if (!covers(current, p.id, p.i)) return 0
  const j = p.i - current.from
  const len = current.starts[j + 1] - current.starts[j]
  return len > 0 ? Math.max(0, Math.min(0.999, (audio.currentTime - current.starts[j]) / len)) : 0
}
let doc = null // loaded content of the current document (for synchronous lookups)
const segText = i => doc?.segs[i]?.t || ''

// The place of a book is where it was last listened to, or moved to by hand, on whichever device that was.
// So this device writes the place only once the customer has listened or moved HERE (`here`). Opening a
// book, being handed the place by another device, or the text being read again is not a move: writing then
// stamped this device's older place as the newest, and the real one was lost on every device.
let here = false
// The customer has listened or moved here. A finished book is begun again by that, and only by that: opening
// it to look marked it unfinished, at the start, on every device.
function mine() {
  here = true
  const { id } = player.get()
  if (id && getDoc(id)?.finished) patch(id, { finished: false })
}
function savePosition(now = false) {
  clearTimeout(posTimer)
  const save = () => {
    const { id, i } = player.get()
    if (id && here) patch(id, { pos: i, posF: Math.round(fraction() * 1000) / 1000, lastPlayed: Date.now() })
  }
  now ? save() : (posTimer = setTimeout(save, 1200))
}
addEventListener('pagehide', () => savePosition(true))
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && savePosition(true))

// given: the place was handed to this device (the book was opened, another device moved it, its text was read
// again), not reached here by the customer.
async function load(i, { autoplay = player.get().playing, offset = 0, from = 0, dir = 1, given = false } = {}) {
  const { id } = player.get()
  const c = await loadDoc(id)
  if (!c) return
  doc = c
  i = skipVisual(c, Math.max(0, i), dir)
  // Past the end: listening got there, and the book is finished. Handed a place past the end (the text was read
  // again and is shorter), nobody finished anything: it is the last sentence.
  if (i >= c.segs.length) { if (!given) return finish(); i = c.segs.length - 1 }
  const my = ++token
  cancelSpeech()
  player.set({ i, t: offset, waiting: false, word: from })
  refreshMedia()
  if (!given) mine()
  savePosition()
  if (system()) { audio.pause(); return speak(c, i, autoplay, from) }

  if (covers(current, id, i) && audio.src) { // inside the stretch that is loaded: just move within it
    current.k = i - current.from
    audio.currentTime = current.starts[current.k] + offset
    audio.playbackRate = speed()
    if (autoplay && audio.paused) audio.play().catch(playFailed)
    return
  }
  const st = await stretchAt(id, c, i)
  if (my !== token) return void (st?.url && URL.revokeObjectURL(st.url))
  if (st === 'skip') return load(i + dir, { autoplay, dir, given })
  if (!st) {
    // Not generated yet: generation follows the playhead, so this sentence is made next.
    audio.pause()
    player.set({ waiting: true })
    kickVoice()
    return
  }
  revoke(current)
  current = st
  audio.src = st.url
  audio.playbackRate = speed()
  if (offset) audio.currentTime = offset
  if (autoplay) audio.play().catch(playFailed)
}

// ── built-in voice ───────────────────────────────────────────────────────────────
function speak(c, i, autoplay, from = 0) {
  const my = ++utter
  if (!autoplay) return
  const full = c.segs[i].t
  const text = full.slice(from)
  if (!text.trim()) return sentenceEnded()
  const u = new SpeechSynthesisUtterance(text)
  const locale = LANGS[getDoc(player.get().id)?.lang || 'en']?.locale || 'en'
  const voice = pickSystemVoice(locale)
  if (voice) { u.voice = voice; u.lang = voice.lang } else { u.lang = locale }
  u.rate = speed()
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
  refreshMedia(true)
  if (!id) return
  const s = settings.get()
  patch(id, { finished: true, pos: 0, posF: 0, ...(s.archiveFinished && { archived: true }) })
  const up = !sleep?.doc && s.autoplayNext && nextInQueue(id, s.sort)
  if (!up) return
  toast(`Playing next: ${up.title}`)
  open(up.id)
}

// End of a stretch: carry on with the next one (or stop for the sleep timer / the end of the document).
audio.addEventListener('ended', async () => {
  const p = player.get()
  const c = await loadDoc(p.id)
  if (!c || !current) return
  const to = current.to
  if (p.sleep?.chapter && c.segs[to]?.k === 'h') { player.set({ sleep: null, i: Math.min(to, c.segs.length - 1), t: 0 }); return pause() }
  if (sleepCheck()) return
  load(to, { autoplay: true })
})
audio.addEventListener('timeupdate', () => {
  track(true)
  sleepCheck()
  updatePositionState()
  refreshMedia()
  // Build the following stretch a few seconds before it is needed, so it holds as much generated audio as possible.
  if (current && !current.pre && audio.duration - audio.currentTime < 6) {
    current.pre = true
    loadDoc(current.id).then(c => c && prefetch(current.id, c, current.to))
  }
})
// timeupdate only fires ~4 times a second: the sentence being spoken is also looked for at the moment the
// current one ends. (It was looked for on every frame, which made the phone build a frame sixty times a second
// for something that happens every few seconds.) Never left longer than FOLLOW_MS, so a change of speed or a
// jump is noticed as soon as timeupdate would have noticed it.
const FOLLOW_MS = 250
const FOLLOW_MIN_MS = 10
let following = 0
const follow = () => {
  clearTimeout(following)
  track(false)
  if (!current || audio.paused) return
  const next = current.k + 1 < current.n ? current.starts[current.k + 1] : audio.duration
  const left = ((next - audio.currentTime) * 1000) / (audio.playbackRate || 1)
  following = setTimeout(follow, Math.max(FOLLOW_MIN_MS, Math.min(FOLLOW_MS, left + 1)))
}
audio.addEventListener('playing', follow)
for (const e of ['pause', 'ended', 'emptied']) audio.addEventListener(e, () => clearTimeout(following))
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


onSegment(async (id, i) => {
  const p = player.get()
  if (p.id !== id) return
  if (p.waiting && p.i === i) { // the sentence it waited for is made: not a move
    await load(i, { autoplay: p.playing, given: true })
    if (!pendingStart) return // Play was pressed while it waited: that still stands (it was dropped here, for ever if this was the last sentence to make)
  }
  if (pendingStart && await gateCheck()) {
    pendingStart = false
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
  if (!same) here = false // another book: its place is what its record says until the customer moves it here
  player.set({ id, playing: false, gate: null })
  heard = { id, voice: d.voice, sys: settings.get().systemVoice, engine: activeEngine() }
  setSession(d)
  await ensureFresh(id) // audio made in another voice or tone is remade, not played
  const c = await loadDoc(id)
  if (!c) return // still being prepared — the reader shows progress
  doc = c
  const start = at ?? (same ? player.get().i : d.finished ? 0 : d.pos || 0)
  const resume = at == null && !same && !d.finished && start === d.pos && d.posF
  await load(start, {
    autoplay: false,
    given: at == null, // opened where it was left; a tap on a sentence (at) is a move

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
  mine() // listening here: from now on the place is this device's to write
  // Resuming audio that is already loaded starts inside the tap itself: Safari refuses a play() that
  // comes after an await, and nothing here needs to wait.
  if (!system() && !p.waiting && p.gate == null && audio.src && covers(current, p.id, p.i)) audio.play().catch(playFailed)
  maybeLockTip()
  if (!(await gateCheck())) {
    audio.pause()
    pendingStart = true
    player.set({ playing: false })
    kickVoice()
    const wait = player.get().gate
    const voice = voiceWait() // a voice still on its way is the wait: no "ready in 10 seconds" before a download
    // short: the page already says the rest ("Play starts by itself"); this is only the offer beside it
    toast(voice ? voice.text : `Making the audio: ready in ${waitWords(wait)}`,
      typeof speechSynthesis !== 'undefined' ? { label: 'Use built-in voice', run: () => settings.set({ voiceEngine: 'system' }) } : null)
    return
  }
  pendingStart = false
  player.set({ playing: true, gate: null })
  refreshMedia(true)
  if (system()) return load(p.i, { autoplay: true, from: p.word })
  if (p.waiting) return kickVoice()
  if (!audio.src || !covers(current, p.id, p.i)) return load(p.i, { autoplay: true })
  audio.play().catch(playFailed)
}

export function pause() {
  pendingStart = false
  player.set({ playing: false, gate: null })
  stopOutput()
  refreshMedia(true)
  savePosition(true)
  flushNow()
}

// A document is never read again while it is being heard (library.js rereadOld). One that is open here but
// silent is: the player then holds sentences that no longer exist, so it takes the new ones, at the same words.
setSounding(id => { const p = player.get(); return p.id === id && (p.playing || p.waiting) })
onReread((id, pos) => { if (player.get().id === id) load(pos, { given: true }) }) // silent stays silent; begun in that very moment, it goes on

// Another device moved ahead. Never yank audio that is playing here: offer a jump instead.
onRemotePos((id, v) => {
  const p = player.get()
  if (p.id !== id || v.pos === p.i) return
  const from = v.dev ? `from your ${v.dev}` : 'from your other device'
  const jump = autoplay => loadDoc(id).then(c => load(v.pos, { autoplay, given: !autoplay, offset: (v.posF || 0) * (c.durs[v.pos] || 0), from: wordStart(c.segs[v.pos].t, v.posF || 0) }))
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
  const now = { id: d.id, voice: d.voice, sys: settings.get().systemVoice, engine: activeEngine(), tone: settings.get().voiceTone || 'natural' }
  const changed = heard.id === now.id && (heard.voice !== now.voice || heard.sys !== now.sys || heard.engine !== now.engine || (heard.tone ?? now.tone) !== now.tone)
  heard = now
  if (!changed) return
  // Audio in the previous voice must never resume: drop both stretches before playing on.
  const resume = p.playing || pendingStart // Play was pressed (while audio was being prepared, it still stands). A book only open and waiting stays silent
  stopOutput()
  revoke(next); revoke(current)
  next = current = null
  audio.removeAttribute('src')
  if (resume) play()
}
library.sub(voiceChanged)
settings.sub(voiceChanged)
// One speed, the customer's: set in Settings or arriving from another device, it is the speed being heard.
let usual = settings.get().speed
settings.sub(() => { const s = settings.get().speed; if (s !== usual) { usual = s; if (player.get().rate !== s) setRate(s) } })

export const toggle = () => (player.get().playing || pendingStart ? pause() : play())
export const nextSentence = () => load(player.get().i + 1, { dir: 1 })
export const prevSentence = () => {
  const p = player.get()
  const into = system() ? p.word > 12 : p.t > 2.5 && !p.waiting
  load(into ? p.i : p.i - 1, { dir: -1 })
}
export const seekTo = i => load(i)

// A passing slow-down on top of the listener's own speed (aware listening slows the voice while it is noisy).
// It is not their setting: it is never saved or shown as their speed, and 1 takes it away.
let ease = 1
const MIN_SPEED = 0.5
const speed = () => Math.max(MIN_SPEED, player.get().rate * ease)
export function setEase(f) {
  if (f === ease) return
  ease = f
  audio.playbackRate = speed()
}

// Clarity in noise (aware listening): the crisp part of the voice, where consonants live, is lifted while
// the room is noisy. The sound is passed through a filter from the first time this is asked for, and stays
// so until the app is reopened (a browser cannot undo it); at rest the filter changes nothing. The filter's
// own clock is started and checked BEFORE the sound is passed through it: sound sent into a stopped one
// would be silence.
const CLARITY = { hz: 2800, db: 7, glide: 0.4 }
let clarity = null // { ctx, shelf }
export async function setClarity(on) {
  if (!clarity) {
    if (!on) return true
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return false
    const ctx = new Ctx()
    await ctx.resume()
    if (ctx.state !== 'running') { ctx.close(); return false }
    const shelf = ctx.createBiquadFilter()
    shelf.type = 'highshelf'
    shelf.frequency.value = CLARITY.hz
    shelf.gain.value = 0
    ctx.createMediaElementSource(audio).connect(shelf).connect(ctx.destination)
    ctx.onstatechange = () => { if (ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume() } // the phone took the sound away for a moment
    clarity = { ctx, shelf }
  }
  clarity.shelf.gain.setTargetAtTime(on ? CLARITY.db : 0, clarity.ctx.currentTime, CLARITY.glide)
  return true
}
export const clarityState = () => (clarity ? { routed: true, lift: clarity.shelf.gain.value, clock: clarity.ctx.state } : { routed: false })

// While the speed is being dragged it is HEARD at once, and nothing else is told: every part of the screen that
// shows a time is worked out from the speed, and telling them twenty times a second made frames late on a
// phone (measured: 23 of 332). They are told once, when the finger lets go (setRate).
export function hearRate(r) {
  audio.playbackRate = Math.max(MIN_SPEED, Math.min(4, Math.max(0.5, r)) * ease)
}

export function setRate(r) {
  const rate = Math.round(Math.min(4, Math.max(0.5, r)) * 100) / 100
  player.set({ rate })
  audio.playbackRate = speed()
  if (system() && player.get().playing) load(player.get().i, { autoplay: true, from: player.get().word }) // utterance rate is fixed once speaking
}

export const setSleep = s => player.set({ sleep: s })

// Sub-second clock for word highlighting with the natural voice (timeupdate only fires ~4×/s).
export const audioClock = () => (current ? audio.currentTime - current.starts[current.k] : audio.currentTime) // seconds into the current sentence
// For tests: the audio that is loaded right now.
export const stretchInfo = () => (current ? { from: current.from, to: current.to, seconds: audio.duration } : null)
export const audioState = () => ({ playbackRate: audio.playbackRate, paused: audio.paused, ended: audio.ended, readyState: audio.readyState, currentTime: audio.currentTime, duration: audio.duration, hasSrc: !!audio.src, rate: audio.playbackRate, volume: audio.volume, muted: audio.muted, playError })

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
let sessionArtwork = null
let sessionCoverKey = null
let lastMeta = { title: null, artist: null, album: null }
let lastMetaAt = 0

function artworkFor(d) {
  const key = d?.cover || '/pwa-512x512.png'
  if (key !== sessionCoverKey) {
    sessionCoverKey = key
    sessionArtwork = d?.cover
      ? [{ src: d.cover, sizes: '240x320', type: 'image/jpeg' }]
      : [{ src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' }]
  }
  return sessionArtwork
}

function chapterFor(c, i) {
  if (!c) return ''
  for (let k = Math.min(i, c.segs.length - 1); k >= 0; k--) {
    if (c.segs[k]?.k === 'h') return c.segs[k].t
  }
  return ''
}

function currentPhrase() {
  const p = player.get()
  if (!current || system() || !covers(current, p.id, p.i)) return null
  const text = doc?.segs[p.i]?.t
  if (!text) return null
  const j = p.i - current.from
  const dur = current.starts[j + 1] - current.starts[j]
  if (!dur || dur <= 0) return null
  const elapsed = audio.currentTime - current.starts[j]
  if (elapsed < 0) return null
  const { ws, ends } = wordWeights(text)
  if (!ws.length) return null
  const f = elapsed / dur
  let idx = ends.findIndex(e => e >= f)
  if (idx < 0) idx = ws.length - 1
  let start = Math.max(0, idx - 2)
  let end = Math.min(ws.length, start + 6)
  start = Math.max(0, end - 6)
  let s = ws.slice(start, end).join(' ')
  if (!s) return null
  if (start > 0) s = '… ' + s
  if (end < ws.length) s = s + ' …'
  return s
}

function pushMeta(meta, force = false) {
  if (!('mediaSession' in navigator) || !meta) return
  if (meta.title === lastMeta.title && meta.artist === lastMeta.artist && meta.album === lastMeta.album) return
  const now = Date.now()
  if (!force && now - lastMetaAt < 1000) return
  lastMeta = meta
  lastMetaAt = now
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: meta.title,
      artist: meta.artist,
      album: meta.album,
      artwork: artworkFor(getDoc(player.get().id)),
    })
  } catch { /* unsupported */ }
}

function defaultMeta() {
  const p = player.get()
  const d = getDoc(p.id)
  if (!d) return null
  return { title: d.title, artist: d.author || 'Noesis', album: chapterFor(doc, p.i) }
}

function refreshMedia(force = false) {
  const p = player.get()
  const d = getDoc(p.id)
  if (!d) return
  if (p.playing && !system() && settings.get().lockScreenWords) {
    const phrase = currentPhrase()
    if (phrase) pushMeta({ title: phrase, artist: d.title, album: chapterFor(doc, p.i) }, force)
    return // between sentences there is no phrase for a moment: keep the last one instead of flashing the title
  }
  pushMeta(defaultMeta(), force)
}

function setSession(d) {
  if (!('mediaSession' in navigator)) return
  sessionCoverKey = null
  lastMeta = { title: null, artist: null, album: null }
  lastMetaAt = 0
  try {
    const meta = { title: d.title, artist: d.author || 'Noesis', album: '' }
    lastMeta = meta
    lastMetaAt = Date.now()
    navigator.mediaSession.metadata = new MediaMetadata({ ...meta, artwork: artworkFor(d) })
  } catch { /* unsupported */ }
}

// One-time help for Android: the lock-screen controls only appear if the phone lets Chrome show notifications,
// and a web app cannot check that. Offered once playback has run for a few seconds (so it cannot be replaced
// at once by a "preparing" message), and only marked as seen when it was really shown.
let lockTipTimer = 0
function maybeLockTip() {
  if (!/Android/i.test(navigator.userAgent) || settings.get().lockTipSeen || lockTipTimer) return
  lockTipTimer = setTimeout(() => {
    lockTipTimer = 0
    if (!player.get().playing || settings.get().lockTipSeen) return
    settings.set({ lockTipSeen: true })
    toast('Want play and pause on your lock screen?', { label: 'Show me how', run: () => openSheet('lockscreen') })
  }, 8000)
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
  player.sub(() => {
    navigator.mediaSession.playbackState = player.get().playing ? 'playing' : 'paused'
    if (!player.get().playing) refreshMedia(true)
  })
  settings.sub(() => refreshMedia(true))
}
