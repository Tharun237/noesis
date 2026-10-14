// The promise: a document I add is made soon, even while a long book is open in the player. The book in the
// player goes first only until it has plenty ready ahead of where I am; then the others are made too.
// Before 14 October a short article waited behind every sentence of the open book (hours on a phone).
//   npx vite --port 5180 --strictPort --host     then     node e2e/made-next.mjs
import { chromium } from 'playwright-core'

const BASE = process.argv[2] || 'http://localhost:5180'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const ctx = await chromium.launchPersistentContext(new URL('../.qa-profile/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'), {
  channel: 'chrome', headless: true, viewport: { width: 1360, height: 860 }, args: ['--autoplay-policy=no-user-gesture-required'],
})
const page = ctx.pages()[0] || await ctx.newPage()
const app = expr => page.evaluate(async expr => {
  const find = p => performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes(p)) || p
  const m = { lib: await import(find('/src/lib/library.js')), pl: await import(find('/src/lib/player.js')), settings: await import(find('/src/lib/settings.js')) }
  return (0, eval)(`(m) => (${expr})`)(m)
}, expr)
async function until(fn, ms, what) {
  const end = Date.now() + ms
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error('timed out waiting for ' + what); await sleep(500) }
}
const doc = title => app(`m.lib.library.get().docs.find(d => d.title === ${JSON.stringify(title)})`)
const drop = async title => { const d = await doc(title); if (d) await app(`m.lib.deleteDoc(${JSON.stringify(d.id)})`) }
const add = (title, n) => app(`m.lib.addDocument({ kind: 'text', name: ${JSON.stringify(title)}, text: ${JSON.stringify(Array.from({ length: n }, (_, k) => `Sentence ${k + 1} of ${title}, which is read aloud and goes on for a little while.`).join(' '))} }, { title: ${JSON.stringify(title)}, renamed: true })`)

await page.goto(BASE)
await until(() => app('m.lib.library.get().loaded'), 15000, 'library')
await app("m.settings.settings.set({ voiceEngine: 'natural' })")
for (const t of ['Queue test: long book', 'Queue test: short article']) await drop(t)

let ok = false
try {
  await add('Queue test: long book', 600)
  const long = (await until(async () => { const d = await doc('Queue test: long book'); return d?.total ? d : null }, 30000, 'long text')).id
  await app(`m.pl.open(${JSON.stringify(long)}, { autoplay: false })`) // open in the player: its audio goes first
  await until(async () => (await doc('Queue test: long book')).done >= 100, 600000, 'a good stretch of the long book') // ~8 min ahead, nearly the lead it is given
  const t0 = Date.now()
  await add('Queue test: short article', 4)
  try {
    await until(async () => (await doc('Queue test: short article'))?.status === 'ready', 60000, 'the short article')
    ok = true
    console.log(`  ✔ the short article was ready ${Math.round((Date.now() - t0) / 1000)} s after it was added, with the long book open`)
  } catch {
    const d = await doc('Queue test: short article'), l = await doc('Queue test: long book')
    console.log(`  ✘ the short article was not made in 60 s: ${d?.done || 0} of ${d?.total} made; the long book went on (${l.done} of ${l.total})`)
  }
} finally {
  await app('m.pl.pause()').catch(() => {})
  for (const t of ['Queue test: long book', 'Queue test: short article']) await drop(t)
  await ctx.close()
}
process.exit(ok ? 0 : 1)
