// A slow phone, as the customer lives it: a phone-sized touch screen, the page's processor slowed (CDP), and the
// voice made at a chosen speed. Chrome's CPU slow-down does not reach workers, so the voice is slowed where it
// is measured: each sentence's audio is handed back only after as long as that phone would have taken to make
// it (its length ÷ the speed). The app then measures that phone's speed itself, as it would on the real one.
// It opens the app fresh, adds a book, presses Play once, and writes down every second what the screen says.
//   node e2e/slow-phone.mjs [--voice 0.7] [--cpu 4] [--sentences 300] [--seconds 90] [--start-now]
// --start-now: once the page offers "Start now", press it, and write down when the sound plays and when it stops.
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? +process.argv[i + 1] : d }
const VOICE = arg('voice', 0.7), CPU = arg('cpu', 4), N = arg('sentences', 300), SECONDS = arg('seconds', 90)
const START_NOW = process.argv.includes('--start-now')
const BASE = 'http://localhost:5180'
const OUT = new URL(`../.qa-out/slow-phone-${VOICE}x${START_NOW ? '-now' : ''}/`, import.meta.url)
mkdirSync(OUT, { recursive: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const ctx = await chromium.launchPersistentContext(new URL('../.qa-profile/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'), {
  channel: 'chrome', headless: true, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
})
const page = ctx.pages()[0] || await ctx.newPage()
await page.addInitScript(speed => {
  const Real = window.Worker
  window.Worker = class extends Real {
    constructor(url, opts) {
      super(url, opts)
      if (!String(url).includes('tts.worker')) return
      const sent = new Map()
      const post = this.postMessage.bind(this)
      this.postMessage = (m, t) => { if (m?.type === 'speak' || m?.type === 'encode') sent.set(m.id, performance.now()); return post(m, t) }
      let handler = null
      Object.defineProperty(this, 'onmessage', { get: () => handler, set: f => { handler = f } })
      this.addEventListener('message', e => {
        const t0 = sent.get(e.data?.id), dur = e.data?.rec?.dur
        sent.delete(e.data?.id)
        const hold = t0 != null && dur > 0 ? Math.max(0, (dur * 1000) / speed - (performance.now() - t0)) : 0
        setTimeout(() => handler?.(e), hold)
      })
    }
  }
}, VOICE)
const app = expr => page.evaluate(async expr => {
  const find = p => performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes(p)) || p
  const m = { lib: await import(find('/src/lib/library.js')), pl: await import(find('/src/lib/player.js')), nav: await import(find('/src/lib/nav.js')), settings: await import(find('/src/lib/settings.js')) }
  return (0, eval)(`(m) => (${expr})`)(m)
}, expr)
async function until(fn, ms, what) {
  const end = Date.now() + ms
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error('timed out waiting for ' + what); await sleep(300) }
}

// A phone that has never measured this voice, on the natural voice.
await page.goto(BASE)
await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('noesis.settings.v1') || '{}'); s.voiceEngine = 'natural'; s.voiceSpeeds = {}; localStorage.setItem('noesis.settings.v1', JSON.stringify(s)) })
await page.goto(BASE)
await until(() => app('m.lib.library.get().loaded'), 20000, 'library')
const TITLE = 'Slow phone book'
for (const d of await app(`m.lib.library.get().docs.filter(d => d.title === ${JSON.stringify(TITLE)}).map(d => d.id)`)) await app(`m.lib.deleteDoc(${JSON.stringify(d)})`)
const text = Array.from({ length: N }, (_, k) => `This is sentence ${k + 1} of a book that a person listens to on a slow phone, and it carries on.`).join(' ')
await app(`m.lib.addDocument({ kind: 'text', name: ${JSON.stringify(TITLE)}, text: ${JSON.stringify(text)} }, { title: ${JSON.stringify(TITLE)}, renamed: true })`)
await until(async () => (await app(`m.lib.library.get().docs.find(d => d.title === ${JSON.stringify(TITLE)})?.total`)) > 0, 30000, 'text')
await page.goto(BASE) // the app opened fresh: nothing measured, the voice not started
await until(() => app('m.lib.library.get().loaded'), 20000, 'library')
const cdp = await ctx.newCDPSession(page)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU })

await page.locator('[role=button]').filter({ hasText: TITLE }).first().click()
await until(() => page.evaluate(() => history.state?.view === 'reader'), 15000, 'reader')
await page.getByRole('button', { name: /^(Play|Resume)$/ }).first().click()
const t0 = Date.now(), log = []
let last = '', shots = 0, pressed = 0, shotStop = false
const turns = [] // [seconds after Start now, sound on?]
for (let s = 0; s <= SECONDS; s++) {
  if (START_NOW && !pressed && await page.getByRole('button', { name: 'Start now' }).first().isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Start now' }).first().click()
    pressed = Date.now()
    console.log('  -- pressed Start now')
  }
  const st = await app(`(() => { const p = m.pl.player.get(); return { playing: p.playing, waiting: p.waiting, i: p.i, gate: p.gate, sure: p.gateSure, speeds: m.settings.settings.get().voiceSpeeds } })()`)
  const on = st.playing && !st.waiting // sound: playing, and not caught up with the voice
  if (pressed && turns.at(-1)?.[1] !== on) turns.push([Math.round((Date.now() - pressed) / 1000), on])
  if (pressed && st.playing && !on && turns.filter(t => !t[1]).length === 1 && !shotStop) { await sleep(3000); shotStop = true; await page.screenshot({ path: new URL('stop.png', OUT).pathname.replace(/^\/([A-Z]:)/, '$1') }) } // what a stop looks like
  // what a person reads: the lines that talk about the wait
  const said = (await page.evaluate(() => document.body.innerText)).split(String.fromCharCode(10)).map(l => l.trim())
    .filter(l => /making the audio|ready in|starts by itself|built-in|starting the|downloading|catching up|going on|playing while/i.test(l))
  const line = `${String(Math.round((Date.now() - t0) / 1000)).padStart(3)} s  ${on ? 'PLAYING' : st.playing ? 'catching up' : 'waiting'} at ${st.i}  gate ${st.gate == null ? '-' : Math.round(st.gate) + ' s'}${st.sure ? ' (measured)' : st.gate != null ? ' (guess)' : ''}  speed ${JSON.stringify(st.speeds)}  says: ${[...new Set(said)].join(' | ')}`
  const key = line.slice(5)
  if (key !== last) { log.push(line); console.log(line); last = key; if (shots < 12) await page.screenshot({ path: new URL(`${String(++shots).padStart(2, '0')}.png`, OUT).pathname.replace(/^\/([A-Z]:)/, '$1') }) }
  if (st.playing && !START_NOW) break
  await sleep(1000)
}
if (START_NOW) {
  const stops = turns.filter(([, on], k) => !on && k > 0).map(([at], k) => `at ${at} s for ${(turns[turns.indexOf(turns.find(t => t[0] === at && !t[1])) + 1]?.[0] ?? '…') - at} s`)
  const sum = pressed ? `after Start now: sound from ${turns.find(t => t[1])?.[0] ?? 'never'} s; stops ${stops.join(', ') || 'none'}` : 'Start now was never offered'
  log.push(sum)
  console.log(sum)
}
writeFileSync(new URL('log.txt', OUT), log.join('\n'))
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
await app('m.pl.pause()')
for (const d of await app(`m.lib.library.get().docs.filter(d => d.title === ${JSON.stringify(TITLE)}).map(d => d.id)`)) await app(`m.lib.deleteDoc(${JSON.stringify(d)})`)
await ctx.close()
