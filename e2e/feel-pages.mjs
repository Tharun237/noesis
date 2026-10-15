// What reading in the Pages view costs a phone: the main thread's own work a second, and late frames, while the
// voice reads, on a processor slowed 4x. Run against two builds in turn, each from a clean profile, and compare.
//
//   node e2e/feel-pages.mjs <address> [seconds]      e.g. http://127.0.0.1:8788  https://www.noesisaudio.com
import { chromium } from 'playwright-core'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const HOME = process.argv[2] || 'http://127.0.0.1:8788'
const SECONDS = +(process.argv[3] || 12)
const PDF = process.env.PDF || 'C:/Users/tharu/AppData/Local/Temp/paper.pdf'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const profile = `${tmpdir()}/noesis-feelpages`
rmSync(profile, { recursive: true, force: true })
const ctx = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true, viewport: { width: 412, height: 860 }, deviceScaleFactor: 2 })
const page = ctx.pages()[0] || await ctx.newPage()
try {
  await page.addInitScript(() => { try { localStorage.setItem('noesis.install.dismissed', String(Date.now())); localStorage.setItem('noesis.settings.v1', JSON.stringify({ voiceEngine: 'system', readerView: 'pages' })) } catch { /* none */ } })
  await page.goto(HOME); await sleep(3000)
  await page.getByRole('button', { name: /^(Add a document|Add)$/ }).first().click(); await sleep(1200)
  await page.locator('input[type=file]').first().setInputFiles(PDF); await sleep(600)
  await page.getByRole('button', { name: /^Add to library$/ }).first().click()
  for (let k = 0; k < 60 && await page.evaluate(() => /Reading the document/.test(document.body.innerText)); k++) await sleep(500)
  await sleep(2000)
  await page.goBack(); await sleep(1500)
  await page.locator('[role=button]:not([aria-label^="Your listening"])', { hasText: /\w/ }).first().click(); await sleep(3000)
  await page.getByRole('button', { name: 'Play', exact: true }).first().click(); await sleep(1500)
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Performance.enable')
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  const metric = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]))
  await page.evaluate(() => { window.__late = 0; window.__worst = 0; let last = performance.now(); const tick = t => { const d = t - last; last = t; if (d > 34) window.__late++; if (d > window.__worst) window.__worst = d; requestAnimationFrame(tick) }; requestAnimationFrame(tick) })
  if (process.env.TRACE) { // why an animation could not be run by the compositor, in the browser's own words
    const events = []
    cdp.on('Tracing.dataCollected', d => events.push(...d.value))
    const done = new Promise(ok => cdp.once('Tracing.tracingComplete', ok))
    await cdp.send('Tracing.start', { categories: 'blink.animations,devtools.timeline,cc', transferMode: 'ReportEvents' })
    await sleep(3000)
    await cdp.send('Tracing.end'); await done
    const why = new Map()
    for (const e of events) if (e.name === 'Animation' && e.args?.data?.compositeFailed != null) { const k = `${e.args.data.compositeFailed} ${JSON.stringify(e.args.data.unsupportedProperties || [])}`; why.set(k, (why.get(k) || 0) + 1) }
    const names = new Map()
    for (const e of events) if (e.name === 'Animation' && e.ph === 'b') { const n = e.args?.data?.name || e.args?.data?.id; names.set(n, (names.get(n) || 0) + 1) }
    console.log('animations started:', JSON.stringify([...names].slice(0, 12)))
    console.log('could not composite (reason bits, properties → count):', JSON.stringify([...why]))
  }
  const a = await metric()
  await sleep(SECONDS * 1000)
  const b = await metric()
  const late = await page.evaluate(() => [window.__late, Math.round(window.__worst)])
  const marks = await page.evaluate(() => document.querySelectorAll('[data-testid="word-mark"]').length)
  const per = k => Math.round(((b[k] - a[k]) * 1000) / SECONDS)
  console.log(`${HOME}: script ${per('ScriptDuration')} ms/s · style ${per('RecalcStyleDuration')} ms/s · layout ${per('LayoutDuration')} ms/s · all tasks ${per('TaskDuration')} ms/s · late frames ${late[0]} · worst ${late[1]} ms · word mark on screen ${marks ? 'yes' : 'no'}`)
} finally {
  await ctx.close()
  rmSync(profile, { recursive: true, force: true })
}
