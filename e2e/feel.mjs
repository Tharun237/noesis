// How the app FEELS on a phone, in numbers. The production build, a phone-sized screen and the processor
// slowed down (a desktop is several times faster than a phone: motion that is smooth here can stutter there).
// For each thing a customer does it records every frame for a second and reports: how long until the screen
// first answers, the longest single stall, how many frames were late, and where the script time went.
//
//   npx vite build && npx vite preview --port 5190 --strictPort      (in another terminal)
//   node e2e/feel.mjs              4x slower processor (a mid-range phone)
//   node e2e/feel.mjs 6            6x slower (an old or busy phone)
//
// Targets: first answer under 100 ms, no stall over 100 ms, late frames under a fifth. Compare runs before
// and after a change; a number here is worth more than "it feels fine on my machine".
import { chromium } from 'playwright-core'
import { fileURLToPath } from 'node:url'

const RATE = +(process.argv[2] || 4)
const HOME = 'http://localhost:5190/'
const PROFILE = fileURLToPath(new URL('../.feel-profile', import.meta.url))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const ctx = await chromium.launchPersistentContext(PROFILE, { channel: 'chrome', headless: true, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, args: ['--autoplay-policy=no-user-gesture-required'] })
const page = ctx.pages()[0] || await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
const errors = []
page.on('pageerror', e => errors.push(String(e).slice(0, 160)))
// the install card floats over the bottom of the library after a while: this customer has waved it away
await page.addInitScript(() => { try { localStorage.setItem('noesis.install.dismissed', String(Date.now())) } catch { /* no storage */ } })
await page.goto(HOME); await page.waitForLoadState('networkidle'); await sleep(800)

const btn = name => page.getByRole('button', { name, exact: true }).first()
// the install card floats over the bottom of the library: a customer would wave it away first
if (await btn('Not now').count()) { await btn('Not now').click(); await sleep(400) }
// the library a customer would have: one long book, one short document
const have = await page.locator('body').innerText()
const add = async text => {
  await btn('Add').click(); await sleep(500)
  await page.getByRole('tab', { name: 'Text', exact: true }).click()
  await page.locator('[role=dialog] textarea').first().fill(text)
  await page.getByRole('button', { name: 'Add to library' }).click()
  await page.waitForFunction(() => history.state?.view === 'reader', null, { timeout: 20000 })
  await page.locator('article [data-i]').first().waitFor({ timeout: 30000 }); await sleep(1500)
  await btn('Back to library').click(); await sleep(700)
}
const para = n => Array.from({ length: n }, (_, i) => `Paragraph ${i + 1}. The river ran past the mill and on toward the sea, and the people who lived beside it measured their days by its sound. Nothing in the valley moved faster than the water.`).join('\n\n')
if (!have.includes('The long river')) await add(`# The long river\n\n${Array.from({ length: 30 }, (_, k) => `## Part ${k + 1}\n\n${para(12)}`).join('\n\n')}`)
for (const t of ['Field notes', 'On listening', 'A short walk', 'Winter light', 'The mill']) if (!have.includes(t)) await add(`# ${t}\n\n${para(6)}`)

await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE })
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 400 })

// record every frame for `ms` after the action starts
const WINDOW = 1100
const watch = () => page.evaluate(ms => {
  const t0 = performance.now()
  const frames = []
  window.__feel = { t0, frames, done: false }
  const f = t => { frames.push(t - t0); if (t - t0 < ms) requestAnimationFrame(f); else window.__feel.done = true }
  requestAnimationFrame(f)
}, WINDOW)
const read = async () => {
  await page.waitForFunction(() => window.__feel?.done, null, { timeout: 15000 })
  return page.evaluate(() => window.__feel.frames)
}
const rows = []
const byFile = new Map()
const byFn = new Map() // printed with FUNCS=1; use a readable build for it: npx vite build --minify false
async function measure(name, act) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) { await act(); await sleep(1200); return } // ONLY=book: do the rest unmeasured
  await sleep(500)
  await cdp.send('Profiler.start')
  await watch()
  const started = Date.now()
  await act()
  const frames = await read()
  const { profile } = await cdp.send('Profiler.stop')
  // script time by file (the minified names say little; the file says whose code it is)
  const node = new Map(profile.nodes.map(n => [n.id, n]))
  let script = 0
  profile.samples.forEach((id, k) => {
    const f = node.get(id).callFrame
    if (/^\((idle|program|garbage collector)\)$/.test(f.functionName)) return
    const file = (f.url.split('/').pop() || '(browser)').replace(/-[A-Za-z0-9_]{8}\.js$/, '.js') || '(browser)'
    const ms = (profile.timeDeltas[k] || 0) / 1000
    script += ms
    byFile.set(file, (byFile.get(file) || 0) + ms)
    const fn = `${f.functionName || '(anonymous)'}  ${file}:${f.lineNumber}`
    byFn.set(fn, (byFn.get(fn) || 0) + ms)
  })
  const gaps = frames.slice(1).map((t, i) => t - frames[i])
  const first = frames.find(t => t > 4) ?? 0 // the first frame after the tap landed
  const worst = Math.max(0, ...gaps)
  const late = gaps.filter(g => g > 34).length
  rows.push({ name, first: Math.round(first), worst: Math.round(worst), late, frames: gaps.length, script: Math.round(script), took: Date.now() - started })
}

const card = t => page.locator('[role=button]').filter({ hasText: t }).first()
await measure('open a long book', () => card('The long river').click())
await measure('sit still in the reader', () => sleep(50)) // nothing happening: script here is pure overhead
await measure('open the reader menu', () => btn('Document menu').click())
await measure('close the menu', () => page.keyboard.press('Escape'))
await measure('open reading settings (sheet)', () => btn('Reading settings').click())
await measure('close the sheet with Back', () => page.goBack())
await measure('switch to Focus', () => page.getByRole('tab', { name: 'Focus', exact: true }).click())
await measure('switch back to Text', () => page.getByRole('tab', { name: 'Text', exact: true }).click())
await measure('press play', () => btn('Play').click())
await measure('pause', () => btn('Pause').click().catch(() => {}))
await measure('back to the library', () => btn('Back to library').click())
await measure('sit still in the library', () => sleep(50))
await measure('Settings tab', () => btn('Settings').click())
await measure('Library tab', () => btn('Library').click())
await measure('Add sheet', () => btn('Add').click())
await measure('close Add with Back', () => page.goBack())
await measure('open a short document', () => card('Field notes').click())
await measure('back to the library again', () => btn('Back to library').click())

console.log(`\nprocessor ${RATE}x slower. first = ms until the screen first answers; worst = longest stall; late = frames slower than 34 ms\n`)
console.log('what the customer did'.padEnd(34) + 'first'.padStart(7) + 'worst'.padStart(7) + 'late'.padStart(10) + 'script'.padStart(9))
for (const r of rows) console.log(r.name.padEnd(34) + `${r.first}`.padStart(7) + `${r.worst}`.padStart(7) + `${r.late}/${r.frames}`.padStart(10) + `${r.script} ms`.padStart(9) + (r.first > 100 || r.worst > 100 ? '   <<' : ''))
const sum = k => rows.reduce((a, r) => a + r[k], 0)
console.log('total'.padEnd(34) + ''.padStart(7) + `${Math.max(...rows.map(r => r.worst))}`.padStart(7) + `${sum('late')}/${sum('frames')}`.padStart(10) + `${sum('script')} ms`.padStart(9))
console.log('\nwhere the script time went:')
for (const [f, ms] of [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 7)) console.log(`  ${String(Math.round(ms)).padStart(6)} ms  ${f}`)
if (process.env.FUNCS) {
  console.log('\nthe functions that took longest:')
  for (const [f, ms] of [...byFn].sort((a, b) => b[1] - a[1]).slice(0, 34)) console.log(`  ${String(Math.round(ms)).padStart(6)} ms  ${f}`)
}
if (errors.length) console.log('\nerrors:', errors)
await ctx.close()
