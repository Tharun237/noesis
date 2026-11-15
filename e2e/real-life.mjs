// A person listening on a phone, for minutes, doing what people do while it reads: watching, scrolling away and
// back, switching to Focus and back, opening the contents, putting the phone away (the app hidden) and taking it
// out again. Written after Tharun found, on his phone, the word being lit stopping while the voice went on, and
// the voice stopping when the app went to the background (15 November 2026). Each part had been checked alone,
// for seconds; never a person using it for minutes.
//
// Two promises, checked every 300 ms from inside the page (no polling of the page from outside):
//   1. While sound is coming out, the lit word moves on: never the same word for longer than STUCK_MS.
//   2. Hiding the app does not stop the sound: after the app was hidden, the audio is still going.
//
//   node e2e/real-life.mjs            (dev server on 5180; the first run downloads the voice, about 60 MB)
//   MINUTES=6 node e2e/real-life.mjs  (a longer listen)
import { chromium } from 'playwright-core'
import { tmpdir } from 'node:os'

const HOME = 'http://localhost:5180/'
const MINUTES = Number(process.env.MINUTES || 3)
const SLOW = Number(process.env.SLOW || 1) // how many times slower than this computer the phone is (CPU), all along
const STUCK_MS = 2500 // a word is said in well under this; the lit word unchanged longer than this, with sound, is stuck
const sleep = ms => new Promise(r => setTimeout(r, ms))
const failures = []
const check = (what, ok, detail = '') => { console.log(`${ok ? '  ✔' : '  ✖'} ${what}${detail ? ` — ${detail}` : ''}`); if (!ok) failures.push(what) }

// writing with feeling that rises and falls, long enough to have a mood line (120 sentences and more)
const MOODS = [
  ['The morning was bright and the harbour shone with light.', 'Children laughed as the boats came home full.', 'Everyone sang, and the music carried across the water!'],
  ['Then the storm came, and the sky turned black.', 'The keeper feared the worst for the ships at sea.', 'Nobody spoke; grief sat heavy in every house.'],
]
const TEXT = '# The keeper\n\n' + Array.from({ length: 60 }, (_, k) => MOODS[Math.floor(k / 12) % 2].map(s => s.replace('.', `, on day ${k + 1}.`)).join(' ')).join('\n\n')

const ctx = await chromium.launchPersistentContext(`${tmpdir()}/noesis-real-life`, { channel: 'chrome', headless: true, viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true, args: ['--autoplay-policy=no-user-gesture-required'] })
const page = ctx.pages()[0] || await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e).slice(0, 200)))
await page.addInitScript(() => { try { localStorage.setItem('noesis.install.dismissed', String(Date.now())) } catch { /* none */ } })
const lib = expr => page.evaluate(async expr => {
  const at = p => performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes(p)) || p
  const m = { library: await import(at('/src/lib/library.js')), player: await import(at('/src/lib/player.js')), settings: await import(at('/src/lib/settings.js')) }
  return eval(expr)
}, expr)

try {
  await page.goto(HOME); await page.waitForLoadState('networkidle'); await sleep(1500)
  await lib(`m.settings.settings.set({ voiceEngine: 'natural', voice: 'en_GB-alba-medium' })`)
  const id = await lib(`(m.library.library.get().docs.find(d => d.title === 'The keeper')?.id) || m.library.addDocument({ kind: 'md', name: 'The keeper', title: 'The keeper', text: ${JSON.stringify(TEXT)} })`)
  await lib(`m.library.patch(${JSON.stringify(id)}, { pos: 0, finished: false })`)
  await page.evaluate(id => { history.pushState({ view: 'reader', docId: id, depth: 1 }, ''); dispatchEvent(new PopStateEvent('popstate', { state: history.state })) }, id)
  await sleep(2500)
  if (SLOW > 1) { const c = await ctx.newCDPSession(page); await c.send('Emulation.setCPUThrottlingRate', { rate: SLOW }) }
  // pressed like a person presses it
  await page.getByRole('button', { name: /^(Play|Resume)$/ }).first().click()
  let ready = false
  for (let k = 0; k < 180 && !ready; k++) { await sleep(1000); ready = await lib(`m.player.player.get().playing && !m.player.player.get().waiting && !m.player.audioState().paused`) }
  check('it starts playing', ready)
  if (!ready) throw new Error('never played')

  // the watcher, inside the page: what is heard, and what is lit, every 300 ms
  await page.evaluate(async () => {
    const at = p => performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes(p))
    const pl = await import(at('/src/lib/player.js'))
    window.__log = []
    let lastWord = null, since = performance.now(), lastAudio = -1, heard = 0
    window.__watch = setInterval(() => {
      const a = pl.audioState(), p = pl.player.get()
      const lit = document.querySelector('[data-fill]')
      const word = lit ? `${p.i}:${[...document.querySelectorAll('[data-fill]')].indexOf(lit)}:${lit.dataset.fill}` : null
      const sounding = !a.paused && p.playing && !p.waiting && a.currentTime !== lastAudio
      if (sounding) heard += 0.3
      lastAudio = a.currentTime
      if (word !== lastWord) { lastWord = word; since = performance.now() }
      window.__log.push({ t: Math.round(performance.now()), sounding, word, still: Math.round(performance.now() - since), i: p.i, hidden: document.visibilityState === 'hidden', view: history.state?.view })
    }, 300)
  })

  // what a person does while it reads: a script of minutes, repeated
  const hide = async ms => {
    // the app goes to the background: the page is told it is hidden, as a phone tells it, and runs slower
    const cdp = await ctx.newCDPSession(page)
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')) })
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: SLOW * 2 })
    await sleep(ms)
    const still = await lib(`({ playing: m.player.player.get().playing, paused: m.player.audioState().paused, i: m.player.player.get().i })`)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: SLOW })
    await page.evaluate(() => { delete document.visibilityState; delete document.hidden; document.dispatchEvent(new Event('visibilitychange')) })
    await cdp.detach()
    return still
  }
  const steps = [
    ['listen', () => sleep(15000)],
    ['scroll away and back', async () => { for (let k = 0; k < 6; k++) { await page.mouse.wheel(0, k < 3 ? 900 : -900); await sleep(700) } await sleep(4000) }],
    ['Focus, then Text', async () => { await page.getByText('Focus', { exact: true }).first().click(); await sleep(8000); await page.getByText('Text', { exact: true }).first().click(); await sleep(6000) }],
    ['contents open and closed', async () => { await page.getByRole('button', { name: /contents/i }).first().click().catch(() => {}); await sleep(4000); if (await page.evaluate(() => !!history.state?.panel)) await page.goBack(); await sleep(4000) }],
    ['the app put away for 25 s', async () => {
      const before = await lib('m.player.player.get().i')
      const during = await hide(25000)
      check('hidden, the sound keeps going', during.playing && !during.paused && during.i >= before + 3, `playing ${during.playing}, paused ${during.paused}, ${during.i - before} sentences heard while hidden`)
      await sleep(5000)
    }],
  ]
  const end = Date.now() + MINUTES * 60000
  for (let round = 1; Date.now() < end; round++) {
    for (const [name, run] of steps) {
      if (Date.now() >= end) break
      console.log(`  · ${name} (round ${round})`)
      await run()
    }
  }

  const log = await page.evaluate(() => { clearInterval(window.__watch); return window.__log })
  const stuck = log.filter(x => x.sounding && !x.hidden && x.view === 'reader' && x.still > STUCK_MS)
  const heardS = log.filter(x => x.sounding).length * 0.3
  check(`the lit word keeps up with the voice (${Math.round(heardS)} s of sound watched)`, !stuck.length,
    stuck.length ? `${stuck.length} looks with the same word for over ${STUCK_MS / 1000} s, first at sentence ${stuck[0].i} (${stuck[0].word}), ${stuck[0].still} ms` : '')
  const stops = log.filter((x, k) => k && log[k - 1].sounding && !x.sounding && !x.hidden).length
  console.log(`  (sound stopped and started again ${stops} times while visible: waits for the voice, or a fault)`)
  await page.screenshot({ path: `${tmpdir()}/noesis-real-life-end.png` })
  check('no errors', !errors.length, errors.join(' | '))
} catch (e) {
  failures.push(String(e.message || e)); console.log('  ✖', e.message || e)
} finally {
  await ctx.close().catch(() => {})
}
console.log(failures.length ? `\n${failures.length} failed` : '\nA PERSON LISTENED, AND IT KEPT UP')
process.exit(failures.length ? 1 : 0)
