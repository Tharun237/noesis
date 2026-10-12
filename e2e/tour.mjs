// A photograph of every screen, sheet and menu, for a design review (.claude/skills/design). Scripted walks
// say whether things work and the random customer whether they break; neither says whether a screen is GOOD.
// That takes eyes: run this, open every picture, and answer the design skill's questions for each.
//
//   node e2e/tour.mjs            phone and desktop, into .qa-out/tour-phone-*.png and tour-wide-*.png
//   node e2e/tour.mjs phone      one size only (or: wide)
//
// Fresh dev server on port 5180. It uses the QA profile's library (read-only: it changes no document) and
// puts back the two settings it touches. The landing page (an empty library) is photographed first, in a
// browser profile of its own that is thrown away.
import { chromium } from 'playwright-core'
import { fileURLToPath } from 'node:url'
import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const OUT = fileURLToPath(new URL('../.qa-out', import.meta.url))
const PROFILE = fileURLToPath(new URL('../.qa-profile', import.meta.url))
const only = process.argv[2]
const sleep = ms => new Promise(r => setTimeout(r, ms))
mkdirSync(OUT, { recursive: true })
for (const f of readdirSync(OUT)) if (f.startsWith('tour-')) rmSync(`${OUT}/${f}`)

async function tour(size) {
  const wide = size === 'wide'
  const ctx = await chromium.launchPersistentContext(PROFILE, { channel: 'chrome', headless: true, viewport: wide ? { width: 1360, height: 860 } : { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: !wide, hasTouch: !wide, args: ['--autoplay-policy=no-user-gesture-required'] })
  const page = ctx.pages()[0] || await ctx.newPage()
  await page.addInitScript(() => { try { localStorage.setItem('noesis.install.dismissed', String(Date.now())) } catch { /* no storage */ } })
  await page.goto('http://localhost:5180/'); await page.waitForLoadState('networkidle'); await sleep(700)
  const mod = (path, expr) => page.evaluate(async ([path, expr]) => { const f = performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes(path)) || path; const m = await import(f); return eval(expr) }, [path, expr])
  const before = await mod('/src/lib/settings.js', 'JSON.stringify({ readerView: m.settings.get().readerView, sidePage: m.settings.get().sidePage })')
  await mod('/src/lib/settings.js', "m.settings.set({ readerView: 'text', sidePage: true })")
  await mod('/src/lib/nav.js', "m.ui.set({ filter: 'all' })")
  let n = 0
  const missed = []
  const shot = async name => { n++; await page.screenshot({ path: `${OUT}/tour-${size}-${String(n).padStart(2, '0')}-${name}.png` }) }
  const btn = name => page.getByRole('button', { name, exact: true }).first()
  const item = text => page.locator('[role=menu]').getByText(text, { exact: false }).first()
  const card = text => page.locator('[role=button]').filter({ hasText: text }).first()
  const home = async () => {
    for (let k = 0; k < 5; k++) {
      const s = await page.evaluate(() => history.state || {})
      if (s.view === 'library' && !s.sheet && !s.searching) return
      if (s.sheet || s.panel || s.searching) await page.goBack().catch(() => {})
      else if (await btn('Back to library').count()) await btn('Back to library').click()
      else await (wide ? page.goBack().catch(() => {}) : btn('Library').click().catch(() => {}))
      await sleep(600)
    }
  }
  // one picture: get there, wait for it to settle, photograph, and leave it as it was found
  const see = async (name, go, leave) => {
    try { await go(); await sleep(900); await shot(name) } catch (e) { missed.push(`${name}: ${String(e.message).split('\n')[0].slice(0, 90)}`) }
    try { if (leave) await leave(); else await page.keyboard.press('Escape'); await sleep(450) } catch { /* next one starts from home anyway */ }
  }
  const close = () => page.goBack().catch(() => {})

  await home()
  await see('library', async () => {}, async () => {})
  await see('library-ai-menu', () => btn('Ask your library').click())
  await see('library-card-menu', () => page.locator('button[aria-label^="More options for"]').first().click())
  await see('library-sort-filter', () => btn('Sort and filter').click())
  await see('add-file', () => btn(wide ? 'Add document' : 'Add').click(), async () => {})
  await see('add-text', () => page.getByRole('tab', { name: 'Text', exact: true }).click(), async () => {})
  await see('add-link', () => page.getByRole('tab', { name: 'Link', exact: true }).click(), close)
  await see('ask-your-library', async () => { await btn('Ask your library').click(); await sleep(300); await item('Ask your library').click() }, close)
  await see('concept-map', async () => { await btn('Ask your library').click(); await sleep(300); await item('Concept map').click(); await sleep(2500) }, close)
  await see('your-listening', async () => { await btn('Ask your library').click(); await sleep(300); await item('Your listening').click() }, close)
  await see('briefing', async () => { await btn('Ask your library').click(); await sleep(300); await item('Make a briefing').click() }, close)

  // the reader, on a web article and then on a PDF
  await see('reader-text', async () => { await card('Dad joke').click(); await page.locator('article [data-i]').first().waitFor({ timeout: 20000 }) }, async () => {})
  await see('reader-document-menu', () => btn('Document menu').click())
  await see('reader-playing', async () => { await btn('Play').click(); await sleep(2600) }, async () => { await btn('Pause').click().catch(() => {}) })
  await see('player-sleep-timer', () => page.getByRole('button', { name: /^Sleep timer/ }).first().click())
  await see('player-speed', () => btn('Playback speed').click())
  await see('reading-settings', () => btn('Reading settings').click(), close)
  await see('bookmarks', async () => { await btn('Document menu').click(); await sleep(300); await item('Bookmarks and notes').click() }, close)
  await see('hard-words', async () => { await btn('Document menu').click(); await sleep(300); await item('Hard words').click(); await sleep(600) }, close)
  await see('change-voice', async () => { await btn('Document menu').click(); await sleep(300); await item('Change voice').click() }, close)
  await see('another-language', async () => { await btn('Document menu').click(); await sleep(300); await item('Listen in another language').click() }, close)
  await see('ask-about-document', () => btn('Ask about this document').click(), async () => { wide ? await btn('Ask about this document').click() : await close() })
  await see('find-in-document', async () => { if (wide) return btn('Find in document').click(); await btn('Document menu').click(); await sleep(300); await item('Find in document').click() }, async () => { await page.getByRole('button', { name: /Close/ }).first().click().catch(() => {}) })
  await see('reader-focus', () => page.getByRole('tab', { name: 'Focus', exact: true }).click(), async () => { await page.getByRole('tab', { name: 'Text', exact: true }).click() })
  await home()
  await see('reader-pdf-text', async () => { await card('Traction').click(); await page.locator('article [data-i]').first().waitFor({ timeout: 30000 }); await sleep(wide ? 2500 : 600) }, async () => {})
  if (!wide) await see('reader-contents', () => btn('Contents').click(), close)
  await see('reader-pdf-pages', async () => { await page.getByRole('tab', { name: 'Pages', exact: true }).click(); await sleep(2800) }, async () => { await page.getByRole('tab', { name: 'Text', exact: true }).click() })
  await home()
  await see('settings', () => btn('Settings').click(), async () => {})
  for (const name of ['Account', 'Voice', 'Listening', 'Sounds and haptics', 'AI', 'Storage', 'About']) {
    await see(`settings-${name.toLowerCase().replace(/ /g, '-')}`, () => page.getByRole('button', { name: new RegExp('^' + name) }).first().click(), async () => { if (!wide) await page.goBack().catch(() => {}) })
  }
  await home()

  await mod('/src/lib/player.js', 'm.pause()').catch(() => {})
  await mod('/src/lib/settings.js', `m.settings.set(${before})`).catch(() => {})
  await ctx.close()
  console.log(`${size}: ${n} pictures${missed.length ? `, ${missed.length} not reached:` : ''}`)
  for (const m of missed) console.log('  - ' + m)
}

// The landing page is what an EMPTY library shows, so it has a library of its own: a browser that has never
// been here. A screen at a time from top to bottom (its words light and its sections rise as it is scrolled),
// and it reports anything that runs off the side of the screen or out of the box that holds it.
async function landing(size) {
  const wide = size === 'wide'
  const fresh = `${tmpdir()}/noesis-tour-empty-${size}`
  rmSync(fresh, { recursive: true, force: true })
  const view = wide ? { width: 1360, height: 860 } : { width: 390, height: 844 }
  const ctx = await chromium.launchPersistentContext(fresh, { channel: 'chrome', headless: true, viewport: view, deviceScaleFactor: 1, isMobile: !wide, hasTouch: !wide })
  const page = ctx.pages()[0] || await ctx.newPage()
  await page.addInitScript(() => { try { localStorage.setItem('noesis.install.dismissed', String(Date.now())) } catch { /* no storage */ } })
  await page.goto('http://localhost:5180/'); await page.waitForLoadState('networkidle'); await sleep(1500)
  const height = await page.evaluate(() => document.documentElement.scrollHeight)
  let n = 0
  for (let y = 0; y < height && n < 10; y += Math.round(view.height * 0.8)) {
    await page.evaluate(y => scrollTo(0, y), y); await sleep(450)
    await page.screenshot({ path: `${OUT}/tour-${size}-00-landing-${String(++n).padStart(2, '0')}.png` })
  }
  const off = await page.evaluate(() => [...document.querySelectorAll('[data-screen] *')].filter(e => {
    const b = e.getBoundingClientRect()
    if (!b.width || e.closest('svg')) return false
    if (b.right > innerWidth + 1) return true
    const p = e.parentElement?.getBoundingClientRect()
    return !!p && b.right > p.right + 2 && getComputedStyle(e).position === 'static'
  }).slice(0, 6).map(e => `${e.tagName.toLowerCase()} "${(e.innerText || '').slice(0, 30)}"`))
  await ctx.close()
  console.log(`${size}: ${n} pictures of the landing page${off.length ? `; RUNS OFF ITS BOX: ${off.join(', ')}` : ''}`)
}

for (const size of ['phone', 'wide']) if (!only || only === size) { await landing(size); await tour(size) }
console.log(`\nOpen them: ${OUT}/tour-*.png`)
