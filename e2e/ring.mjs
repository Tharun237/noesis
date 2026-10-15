// The daily ring, the real way: real listening closes it, and it says so once; a finished book says so once.
// The goal is set just above what has been listened to today (any number of minutes works in the code; the
// customer's choices are 10 to 60), then a document plays until the ring closes.
//   npx vite --port 5180 --strictPort --host     then     node e2e/ring.mjs
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] || 'http://localhost:5180'
const OUT = new URL('../.qa-out/ring/', import.meta.url)
mkdirSync(OUT, { recursive: true })
const shot = name => page.screenshot({ path: new URL(name + '.png', OUT).pathname.replace(/^\/([A-Z]:)/, '$1') })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const ctx = await chromium.launchPersistentContext(new URL('../.qa-profile/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'), {
  channel: 'chrome', headless: true, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
})
const page = ctx.pages()[0] || await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e)))
const app = expr => page.evaluate(async expr => {
  const find = p => performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes(p)) || p
  const m = { lib: await import(find('/src/lib/library.js')), pl: await import(find('/src/lib/player.js')), nav: await import(find('/src/lib/nav.js')),
    settings: await import(find('/src/lib/settings.js')), history: await import(find('/src/lib/history.js')), heard: await import(find('/src/lib/heard.js')) }
  return (0, eval)(`(m) => (${expr})`)(m)
}, expr)
async function until(fn, ms, what) {
  const end = Date.now() + ms
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error('timed out waiting for ' + what); await sleep(400) }
}
const results = []
const check = (name, ok, note) => { results.push(ok); console.log(`  ${ok ? '✔' : '✘'} ${name}${note ? ' — ' + note : ''}`) }
const toasts = []
const watchToasts = () => page.evaluate(() => { window.__toasts = []; setInterval(() => { const t = [...document.querySelectorAll('[role=status],[role=alert]')].map(e => e.innerText).join(' | '); if (t && window.__toasts.at(-1) !== t) window.__toasts.push(t) }, 150) })
const seen = async re => (await page.evaluate(() => window.__toasts)).some(t => re.test(t))

await page.goto(BASE)
await until(() => app('m.lib.library.get().loaded'), 15000, 'library')
await app("m.settings.settings.set({ voiceEngine: 'natural', listenGoal: 20 })")
await page.goto(BASE)
await until(() => app('m.lib.library.get().loaded'), 15000, 'library')
await sleep(2500) // the rings have filled
await shot('1-library-phone')
await page.screenshot({ path: new URL('0-rings-filling.png', OUT).pathname.replace(/^\/([A-Z]:)/, '$1'), clip: { x: 0, y: 360, width: 390, height: 260 } }).catch(() => {})

// 1. close the ring by listening
const today = await app('Object.values(m.history.historyStore.get().log[m.heard.dayKey(new Date())] || {}).reduce((a, b) => a + b, 0)')
const goalMin = Math.ceil((today + 45) / 60) // closes after about a minute of listening
console.log(`  (today ${today} s before, goal ${goalMin} min)`)
await app(`m.settings.settings.set({ listenGoal: ${goalMin} })`)
// the document with the most audio made: a minute of real sound (Start now plays what is made, whatever the rest)
const ready = await app("m.lib.library.get().docs.filter(d => (d.status === 'ready' || d.status === 'voicing') && d.done >= 12).sort((a, b) => b.done - a.done).map(d => ({ id: d.id, title: d.title, total: d.total }))[0]")
check('a document that can play', !!ready, ready?.title)
await watchToasts()
await app(`m.pl.open(${JSON.stringify(ready.id)}, { at: 0, autoplay: false }).then(() => m.pl.startNow(${JSON.stringify(ready.id)}))`)
try {
  await until(() => seen(/You closed your ring/), 150000, 'the ring to close')
  check('real listening closed the ring, and it said so', true, `goal ${goalMin} min, ${Math.round(today / 60)} min before`)
} catch { check('real listening closed the ring, and it said so', false, (await page.evaluate(() => window.__toasts)).join(' / ') + ' · ' + await app("JSON.stringify({ ...(({ playing, waiting, i }) => ({ playing, waiting, i }))(m.pl.player.get()), today: Object.values(m.history.historyStore.get().log[m.heard.dayKey(new Date())] || {}).reduce((a, b) => a + b, 0), goal: m.settings.settings.get().listenGoal })")) }
await app('m.pl.pause()')
await page.evaluate(() => history.state?.view !== 'library' && document.querySelector('button[aria-label="Back to library"]')?.click())
await sleep(1500)
const glance = await page.evaluate(() => document.querySelector('[aria-label="Your listening: open all of it"]')?.innerText || '')
check('the strip says the ring is closed', /Ring closed/.test(glance), glance.replace(/\s+/g, ' ').slice(0, 120))
await shot('2-ring-closed-phone')
const said = (await page.evaluate(() => window.__toasts)).filter(t => /closed your ring/.test(t)).length
check('said once, not on every tick', said === 1, `${said} time(s)`)

// 2. a finished book says so, once, with its count this year
await page.evaluate(() => { window.__toasts = [] })
const fin = await app("m.lib.library.get().docs.filter(d => d.status === 'ready' && !d.finished && d.total >= 2).map(d => ({ id: d.id, total: d.total }))[0]")
const id = fin.id
await app(`m.pl.open(${JSON.stringify(id)}, { at: ${fin.total - 1} })`)
try {
  await until(() => seen(/Finished .+/), 60000, 'the finish')
  const t = (await page.evaluate(() => window.__toasts)).find(x => /Finished/.test(x))
  check('finishing a book says so', true, t.replace(/\s+/g, ' ').slice(0, 120))
} catch { check('finishing a book says so', false, (await page.evaluate(() => window.__toasts)).join(' / ')) }
await shot('3-finished-phone')
await app('m.pl.pause()')
await app(`m.lib.patch(${JSON.stringify(id)}, { finished: false })`) // leave the profile as it was

// 3. the wide screen
await page.setViewportSize({ width: 1360, height: 860 })
await page.evaluate(() => history.state?.view !== 'library' && document.querySelector('button[aria-label="Back to library"]')?.click())
await sleep(1500)
await shot('4-library-wide')
await app('m.settings.settings.set({ listenGoal: 20 })')
if (errors.length) console.log('page errors:', errors.slice(0, 3))
check('no page errors', !errors.length)
await ctx.close()
console.log(results.every(Boolean) ? 'ALL KEPT' : `${results.filter(x => !x).length} NOT KEPT`)
process.exit(results.every(Boolean) ? 0 : 1)
