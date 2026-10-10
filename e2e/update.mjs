// Live-update test against a production build served by `vite preview`.
//   node e2e/update.mjs      (builds, serves on :4180, simulates two redeploys)
import { chromium } from 'playwright-core'
import { execSync, spawn } from 'node:child_process'

const URL = 'http://localhost:4180/'
const build = () => execSync('npx vite build', { stdio: 'ignore' })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const results = []
const check = (name, ok, note = '') => { results.push(ok); console.log(`  ${ok ? '✔' : '✖'} ${name}${note ? ` — ${note}` : ''}`) }

build()
const server = spawn('npx vite preview --port 4180 --strictPort', { shell: true, stdio: 'ignore' })
const stopServer = () => { try { execSync(`taskkill /PID ${server.pid} /T /F`, { stdio: 'ignore' }) } catch { server.kill() } }
await sleep(4000)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext()
const page = await ctx.newPage()
await page.addInitScript(() => {
  const log = m => sessionStorage.setItem('swlog', (sessionStorage.getItem('swlog') || '') + `${(performance.timeOrigin + performance.now()) % 100000 | 0}:${m} `)
  navigator.serviceWorker?.getRegistration().then(r => {
    if (!r) return
    r.addEventListener('updatefound', () => { log('found'); const w = r.installing; w?.addEventListener('statechange', () => log(w.state)) })
  })
  navigator.serviceWorker?.addEventListener('controllerchange', () => log('controllerchange'))
})
const swlog = () => page.evaluate(() => sessionStorage.getItem('swlog')).catch(() => '?')
if (process.env.DIAG) page.on('framenavigated', f => f === page.mainFrame() && console.log('    nav', new Date().toISOString().slice(17, 23)))

try {
  await page.goto(URL)
  await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 20000 }).catch(() => {})
  await page.reload() // second load runs under the service worker (offline-capable)
  await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 20000 })
  check('service worker installed and controlling the app', true)

  // ── redeploy #1, user just launched the app ──
  await page.evaluate(() => { window.__marker = 'v1' })
  build()
  await page.reload() // "launch": update check runs; nothing done yet → switches immediately
  // The app reloads itself into the new version; poll across that navigation for the confirmation toast.
  let updated = false
  for (const end = Date.now() + 40000; !updated && Date.now() < end; await sleep(300)) {
    updated = await page.evaluate(() => document.body.innerText.includes('Noesis updated')).catch(() => false)
  }
  check('fresh launch switches to the new version automatically', updated, updated ? 'toast shown' : 'no toast · ' + await swlog())

  // ── redeploy #2 while the user is active: waits, then switches when the app goes to the background ──
  await page.mouse.click(5, 5) // the user is interacting now
  await page.evaluate(() => { window.__marker = 'active' })
  build()
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update())
  await sleep(6000)
  check('no reload while the user is active in the foreground', await page.evaluate(() => window.__marker) === 'active')
  const waiting = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return { waiting: !!r.waiting, installing: !!r.installing } })
  console.log('    diag before background:', JSON.stringify(waiting))
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  const reloaded = await page.waitForFunction(() => window.__marker === undefined, null, { timeout: 20000 }).then(() => true).catch(() => false)
  if (!reloaded) console.log('    diag after background:', JSON.stringify(await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return { marker: window.__marker, waiting: !!r.waiting, vis: document.visibilityState } })))
  check('switches when the app goes to the background', reloaded, reloaded ? '' : await swlog())
} finally {
  await browser.close()
  stopServer()
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)
