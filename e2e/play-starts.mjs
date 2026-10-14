// The promise: press Play ONCE on a book whose audio is not ready, and the sound starts by itself when it is.
// Tharun, 2026-10-14: "it says it is gathering but it never gathers; I have to press Play again".
// Each case opens the app fresh (the voice engine cold, as after a long time away), opens a book, presses Play
// once, and waits for sound without touching anything again.
//   npx vite --port 5180 --strictPort --host     then     node e2e/play-starts.mjs
import { chromium } from 'playwright-core'

const BASE = process.argv[2] || 'http://localhost:5180'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const ctx = await chromium.launchPersistentContext(new URL('../.qa-profile/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'), {
  channel: 'chrome', headless: true, viewport: { width: 1360, height: 860 }, args: ['--autoplay-policy=no-user-gesture-required'],
})
const page = ctx.pages()[0] || await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e)))
const app = expr => page.evaluate(async expr => {
  const find = p => performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes(p)) || p
  const m = { lib: await import(find('/src/lib/library.js')), pl: await import(find('/src/lib/player.js')), db: await import(find('/src/lib/db.js')), tts: await import(find('/src/lib/tts.js')) }
  return (0, eval)(`(m) => (${expr})`)(m)
}, expr)
async function until(fn, ms, what) {
  const end = Date.now() + ms
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`)
    await sleep(300)
  }
}
const doc = title => app(`m.lib.library.get().docs.find(d => d.title === ${JSON.stringify(title)})`)
const fresh = async () => { await page.goto(BASE); await until(() => app('m.lib.library.get().loaded'), 15000, 'library') }
const SENTENCES = Array.from({ length: 60 }, (_, k) => `This is sentence number ${k + 1} of a book that is read aloud, and it goes on for a while.`).join(' ')

async function add(title) {
  const old = await doc(title)
  if (old) await app(`m.lib.deleteDoc(${JSON.stringify(old.id)})`)
  await app(`m.lib.addDocument({ kind: 'text', name: ${JSON.stringify(title)}, text: ${JSON.stringify(SENTENCES)} }, { title: ${JSON.stringify(title)}, renamed: true })`)
  const id = (await until(async () => { const d = await doc(title); return d?.total ? d : null }, 30000, 'text')).id
  await app(`m.pl.open(${JSON.stringify(id)}, { autoplay: false })`) // open: its audio is made first
  return id
}

// Open the book from the library and press Play once; true when the audio really moves within `ms`.
async function pressPlayOnce(title, ms) {
  await page.evaluate(() => document.querySelector('button[aria-label="Back to library"]')?.click()) // a launch may reopen the last book
  await sleep(600)
  await page.locator('[role=button]').filter({ hasText: title }).first().click()
  await until(() => page.evaluate(() => history.state?.view === 'reader'), 8000, 'reader')
  await page.getByRole('button', { name: /^(Play|Resume)$/ }).first().click()
  const t0 = Date.now()
  try {
    await until(async () => { const s = await app('({ ...m.pl.player.get(), clock: m.pl.audioClock() })'); return s.playing && s.clock > 0.5 }, ms, 'sound')
    return { started: true, after: Math.round((Date.now() - t0) / 1000) }
  } catch {
    return { started: false, state: await app('(({ playing, waiting, gate, i }) => ({ playing, waiting, gate, i }))(m.pl.player.get())'), engine: await app('m.tts.engine.get().status'), doc: await app(`(async () => { const p = m.pl.player.get(); const d = m.lib.getDoc(p.id); const c = await m.lib.loadDoc(p.id); return { status: d.status, done: d.done, pos: d.pos, voicingNow: m.lib.library.get().voicingNow === p.id ? 'this' : m.lib.library.get().voicingNow, durs: Array.from(c.durs.slice(0, 8)).map(x => +x.toFixed(1)), readiness: m.lib.readiness(d, c, p.i) } })()`) }
  }
}

const results = []
async function check(name, fn) {
  try { const r = await fn(); results.push(r.started); console.log(`  ${r.started ? '✔' : '✘'} ${name}: ${JSON.stringify(r)}`) }
  catch (e) { results.push(false); console.log(`  ✘ ${name}: ${e.message}`) }
}

await fresh()
await app(`(async () => { const s = (await import(performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes('/src/lib/settings.js')))).settings; s.set({ voiceEngine: 'natural' }) })()`)

// 1. The app was closed while a book's audio was being made; the place is past what was made.
await check('closed while making the audio, place past the made part', async () => {
  const id = await add('Play test: half made')
  await until(async () => (await doc('Play test: half made')).done >= 2, 120000, 'a little audio')
  await app(`(async () => { m.lib.patch(${JSON.stringify(id)}, { pos: 40, posF: 0 }); await m.db.db.putMeta(m.lib.getDoc(${JSON.stringify(id)})) })()`)
  await fresh()
  const r = await pressPlayOnce('Play test: half made', 90000)
  // every sentence that has audio must also have its length (the lengths are what "ready" and the timeline use)
  r.lengthsMissing = await app(`(async () => { const c = await m.lib.loadDoc(${JSON.stringify(id)}); let n = 0; for (let i = 0; i < c.durs.length; i++) { const a = await m.db.db.getAudio(${JSON.stringify(id)}, i); if (a?.dur > 0 && !(c.durs[i] > 0)) n++ } return n })()`)
  if (r.lengthsMissing) r.started = false
  return r
})

// 2. A sentence at the place could not be made (it is kept as silence, "none"): the book is otherwise ready.
await check('a sentence that could not be made, right at the place', async () => {
  const id = await add('Play test: one silent')
  await until(async () => (await doc('Play test: one silent')).status === 'ready', 240000, 'all audio')
  await app(`(async () => { const id = ${JSON.stringify(id)}; const r = await m.db.db.getAudio(id, 10); await m.db.db.putAudio(id, 10, { codec: 'none', dur: 0, tail: 0, v: r.v })
    const d = await m.db.db.getDurs(id); d.durs[10] = 0; d.tails[10] = 0; await m.db.db.putDurs(id, d); m.lib.patch(id, { pos: 10, posF: 0 }); await m.db.db.putMeta(m.lib.getDoc(id)) })()`)
  await fresh()
  return pressPlayOnce('Play test: one silent', 30000)
})

// 3. Only the sentence at the place is still to be made: the book waits on it, and making it is the last news.
await check('only the sentence at the place still to make', async () => {
  const id = await add('Play test: one left')
  await until(async () => (await doc('Play test: one left')).status === 'ready', 240000, 'all audio')
  await sleep(2000) // the lengths are written
  await app(`(async () => { const id = ${JSON.stringify(id)}
    await new Promise((ok, no) => { const r = indexedDB.open(m.db.storeNames.audio); r.onerror = no; r.onsuccess = () => { const t = r.result.transaction('audio', 'readwrite'); t.objectStore('audio').delete(id + ':20'); t.oncomplete = () => { r.result.close(); ok() } } })
    const d = await m.db.db.getDurs(id); d.durs[20] = 0; d.tails[20] = 0; await m.db.db.putDurs(id, d)
    m.lib.patch(id, { pos: 20, posF: 0, status: 'voicing', done: 59 }); await m.db.db.putMeta(m.lib.getDoc(id)) })()`)
  await fresh()
  return pressPlayOnce('Play test: one left', 60000)
})

// 4. A slow speed kept from an earlier day (an old voice, a busy moment) while the phone is fast today. On
// 14 October this said "ready in about 7.6 hours" and offered another voice, and the book played 5 s later. A
// time may only be said once it is measured since the app opened; until then the page says no time.
await check('an old slow measurement says no time, and Play starts', async () => {
  const id = await add('Play test: old speed')
  await until(async () => (await doc('Play test: old speed')).done >= 2, 120000, 'a little audio')
  await app(`(async () => { m.lib.patch(${JSON.stringify(id)}, { pos: 30, posF: 0 }); await m.db.db.putMeta(m.lib.getDoc(${JSON.stringify(id)})) })()`)
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('noesis.settings.v1')); s.voiceSpeeds = { [s.voice]: 0.05 }; localStorage.setItem('noesis.settings.v1', JSON.stringify(s)) })
  await fresh()
  // everything the page says while it waits, read every 100 ms
  await page.evaluate(() => { window.__said = new Set(); window.__look = setInterval(() => { for (const l of document.body.innerText.split(String.fromCharCode(10))) if (/ready in|hour/i.test(l)) window.__said.add(l) }, 100) })
  const r = await pressPlayOnce('Play test: old speed', 60000)
  r.saidTime = await page.evaluate(() => { clearInterval(window.__look); return [...window.__said] })
  if (r.saidTime.length) r.started = false
  return r
})

for (const t of ['Play test: half made', 'Play test: one silent', 'Play test: one left', 'Play test: old speed']) { const d = await doc(t); if (d) await app(`m.lib.deleteDoc(${JSON.stringify(d.id)})`) }
if (errors.length) console.log('page errors:', errors.slice(0, 5))
await ctx.close()
console.log(results.every(Boolean) ? 'ALL STARTED BY THEMSELVES' : `${results.filter(x => !x).length} of ${results.length} DID NOT START`)
process.exit(results.every(Boolean) ? 0 : 1)
