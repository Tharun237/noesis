// A film of every transition, for the eye. The tour (tour.mjs) photographs screens at rest; a transition can
// be wrong while both of its ends are right: Tharun's recording of 2026-10-12 showed the white pill of
// Text | Pages | Focus leaving its control and flying in from the bottom of the screen, with an empty grey
// frame between two views, and no photograph of a screen at rest could have shown it.
//
//   node e2e/film.mjs            phone and desktop: .qa-out/film-phone-*.png and film-wide-*.png
//   node e2e/film.mjs phone      one size only (or: wide)
//
// Each picture is one transition, frame after frame as the browser painted it, with the milliseconds since
// the tap under each frame. Open every one and follow each moving thing from where it was to where it lands:
// it must travel in a straight line between the two, nothing may appear somewhere it does not belong, and no
// frame may be empty. Fresh dev server on port 5180; uses the QA profile's library and changes nothing in it.
import { chromium } from 'playwright-core'
import { fileURLToPath } from 'node:url'
import { mkdirSync, readdirSync, rmSync } from 'node:fs'

const OUT = fileURLToPath(new URL('../.qa-out', import.meta.url))
const PROFILE = fileURLToPath(new URL('../.qa-profile', import.meta.url))
const only = process.argv[2]
const sleep = ms => new Promise(r => setTimeout(r, ms))
const FILM_MS = 900 // how long a transition is watched
const FRAMES = 12 // frames kept for the picture, spread over the film
mkdirSync(OUT, { recursive: true })
for (const f of readdirSync(OUT)) if (f.startsWith('film-')) rmSync(`${OUT}/${f}`)

async function film(size) {
  const wide = size === 'wide'
  const view = wide ? { width: 1360, height: 860 } : { width: 390, height: 844 }
  const ctx = await chromium.launchPersistentContext(PROFILE, { channel: 'chrome', headless: true, viewport: view, deviceScaleFactor: 1, isMobile: !wide, hasTouch: !wide, args: ['--autoplay-policy=no-user-gesture-required'] })
  const page = ctx.pages()[0] || await ctx.newPage()
  // The frames are laid side by side in a browser of their own: a second page in the same window changed
  // the size of what was being filmed.
  const album = await chromium.launch({ channel: 'chrome', headless: true })
  const sheet = await album.newPage()
  await page.addInitScript(() => { try { localStorage.setItem('noesis.install.dismissed', String(Date.now())) } catch { /* no storage */ } })
  await page.goto('http://localhost:5180/'); await page.waitForLoadState('networkidle'); await sleep(700)
  const cdp = await ctx.newCDPSession(page)
  const mod = (path, expr) => page.evaluate(async ([path, expr]) => { const f = performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes(path)) || path; const m = await import(f); return eval(expr) }, [path, expr])
  const before = await mod('/src/lib/settings.js', 'JSON.stringify({ readerView: m.settings.get().readerView, sidePage: m.settings.get().sidePage })')
  await mod('/src/lib/settings.js', "m.settings.set({ readerView: 'text', sidePage: false })")
  await mod('/src/lib/nav.js', "m.ui.set({ filter: 'all' })")
  const btn = name => page.getByRole('button', { name, exact: true }).first()
  const tab = name => page.getByRole('tab', { name, exact: true }).first()
  const card = text => page.locator('[role=button]:not([aria-label^="Your listening"])').filter({ hasText: text }).first()
  let n = 0
  const missed = []

  // one transition: film from the tap until the screen has been still for the length of the film
  const take = async (name, act) => {
    const frames = []
    const onFrame = f => { frames.push({ t: f.metadata.timestamp * 1000, data: f.data }); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}) }
    cdp.on('Page.screencastFrame', onFrame)
    try {
      await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 70, everyNthFrame: 1 })
      await sleep(120)
      const t0 = Date.now()
      const first = frames.length
      await act()
      await sleep(FILM_MS)
      await cdp.send('Page.stopScreencast')
      const got = frames.slice(Math.max(0, first - 1)) // the last frame before the tap, then everything after
      if (got.length < 2) { missed.push(`${name}: nothing moved`); return }
      const base = got[0].t
      const keep = got.length <= FRAMES ? got : Array.from({ length: FRAMES }, (_, k) => got[Math.round(k * (got.length - 1) / (FRAMES - 1))])
      const cols = wide ? 3 : 6
      const w = wide ? 620 : 250
      await sheet.setViewportSize({ width: cols * (w + 10) + 10, height: 400 })
      await sheet.setContent(`<body style="margin:0;padding:10px;background:#222;font:12px monospace;color:#bbb"><div style="font-size:14px;color:#fff;margin:0 0 8px">${size}: ${name} (${got.length} frames painted in ${Date.now() - t0} ms)</div><div style="display:grid;grid-template-columns:repeat(${cols},${w}px);gap:10px">${keep.map(f => `<div><img src="data:image/jpeg;base64,${f.data}" style="width:${w}px;display:block;border:1px solid #444"><div>${Math.max(0, Math.round(f.t - base))} ms</div></div>`).join('')}</div></body>`)
      n++
      await sheet.screenshot({ path: `${OUT}/film-${size}-${String(n).padStart(2, '0')}-${name}.png`, fullPage: true })
    } catch (e) {
      missed.push(`${name}: ${String(e.message).split('\n')[0].slice(0, 90)}`)
      await cdp.send('Page.stopScreencast').catch(() => {})
    } finally { cdp.off('Page.screencastFrame', onFrame); await sleep(300) }
  }

  // the library: shelves, tabs, a sheet, a menu
  if (wide) {
    await take('shelf-queue', () => page.locator('aside').getByRole('button', { name: /^Queue/ }).click())
    await take('shelf-archived', () => page.locator('aside').getByRole('button', { name: /^Archived/ }).click())
    await take('shelf-all', () => page.locator('aside').getByRole('button', { name: /^All/ }).click())
  } else {
    await take('shelf-queue', () => btn('Queue').click())
    await take('shelf-all', () => btn('All').click())
    await page.mouse.wheel(0, 500); await sleep(400) // the library scrolled: the tab's bar must still slide sideways only
    await take('tab-settings-from-a-scrolled-library', () => btn('Settings').click())
    await take('settings-open-a-section', () => page.getByRole('button', { name: /^Sounds and haptics/ }).click())
    await take('settings-back-to-the-list', () => btn('Back to Settings').click())
    await take('tab-library', () => btn('Library').click())
  }
  await take('add-sheet-opens', () => btn(wide ? 'Add document' : 'Add').click())
  await take('add-sheet-text-tab', () => tab('Text').click())
  await take('add-sheet-link-tab', () => tab('Link').click())
  await take('add-sheet-closes', () => page.goBack())
  await take('card-menu-opens', () => page.locator('button[aria-label^="More options for"]').first().click())
  await take('card-menu-closes', () => page.keyboard.press('Escape'))

  // the reader, on a long PDF, scrolled into the book: every change of view, each way
  await take('open-a-document', () => card('Traction').click())
  await page.locator('article [data-i]').first().waitFor({ timeout: 30000 }); await sleep(1200)
  await page.mouse.wheel(0, 2400); await sleep(700)
  await take('reader-text-to-pages', () => tab('Pages').click())
  await sleep(1500)
  await take('reader-pages-to-focus', () => tab('Focus').click())
  await take('reader-focus-to-text', () => tab('Text').click())
  await sleep(900)
  await take('reader-text-to-focus', () => tab('Focus').click())
  await take('reader-focus-to-pages', () => tab('Pages').click())
  await sleep(1500)
  await take('reader-pages-to-text', () => tab('Text').click())
  await sleep(900)
  await take('reader-menu-opens', () => btn('Document menu').click())
  await take('reader-menu-closes', () => page.keyboard.press('Escape'))
  await take('reading-settings-opens', () => btn('Reading settings').click())
  await take('reading-settings-closes', () => page.goBack())
  await take('play', () => btn('Play').click())
  await take('pause', () => btn('Pause').click())
  await take('back-to-the-library', () => btn('Back to library').click())

  await mod('/src/lib/player.js', 'm.pause()').catch(() => {})
  await mod('/src/lib/settings.js', `m.settings.set(${before})`).catch(() => {})
  await ctx.close()
  await album.close()
  console.log(`${size}: ${n} transitions filmed${missed.length ? `, ${missed.length} not filmed:` : ''}`)
  for (const m of missed) console.log('  - ' + m)
}

for (const size of ['phone', 'wide']) if (!only || only === size) await film(size)
console.log(`\nOpen them: ${OUT}/film-*.png`)
