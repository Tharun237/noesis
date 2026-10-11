// A customer's wander through the app, measuring what jumps. For 800 ms after every action, each frame
// records where the fixed landmarks are; anything that moves when it should not, overflows sideways, or
// throws, is reported. Dev server, QA profile, phone size (pass "wide" for desktop).
//   node e2e/sweep.mjs          phone size
//   node e2e/sweep.mjs wide     desktop size
// Needs a freshly started dev server on port 5180. Lines marked !! are things to look at.
import { chromium } from 'playwright-core'
import { fileURLToPath } from 'node:url'
const OUT = fileURLToPath(new URL('../.qa-out', import.meta.url))
const WIDE = process.argv[2] === 'wide'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const vp = WIDE ? { width: 1360, height: 860 } : { width: 390, height: 844 }
const ctx = await chromium.launchPersistentContext(fileURLToPath(new URL('../.qa-profile', import.meta.url)), { channel: 'chrome', headless: true, viewport: vp, deviceScaleFactor: WIDE ? 1 : 2, isMobile: !WIDE, hasTouch: !WIDE, args: ['--autoplay-policy=no-user-gesture-required'] })
const page = ctx.pages()[0] || await ctx.newPage()
const errs = []
page.on('pageerror', e => errs.push('pageerror: ' + String(e).slice(0, 160)))
page.on('console', m => { if (m.type() === 'error' && !/favicon|net::ERR/.test(m.text())) errs.push('console: ' + m.text().slice(0, 160)) })
await page.goto('http://localhost:5180/'); await page.waitForLoadState('networkidle')
const mod = (path, expr) => page.evaluate(async ([path, expr]) => { const f = performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes(path)) || path; const m = await import(f); return eval(expr) }, [path, expr])
await page.evaluate(() => history.state?.view !== 'library' && history.back()); await sleep(400)
await mod('/src/lib/nav.js', "m.ui.set({ filter: 'all' })")
await mod('/src/lib/player.js', 'm.pause()')
await mod('/src/lib/settings.js', "m.settings.set({ readerView: 'text' })")

// start a per-frame recorder in the page; stop() returns what moved
const watch = () => page.evaluate(() => {
  const pick = () => ({
    tab: document.querySelector('nav[aria-label="Main"]'),
    player: [...document.querySelectorAll('button[aria-label="Play"],button[aria-label="Pause"]')].map(b => b.closest('div[style*="fixed"]')).filter(Boolean).pop(),
  })
  const rec = { frames: 0, tabTop: new Set(), playerTop: new Set(), over: 0, dialogs: new Set(), minOpacity: 1, scrollYs: [] }
  window.__rec = rec
  const t0 = performance.now()
  const loop = () => {
    const e = pick()
    rec.frames++
    if (e.tab) rec.tabTop.add(Math.round(e.tab.getBoundingClientRect().top))
    if (e.player) rec.playerTop.add(Math.round(e.player.getBoundingClientRect().top))
    rec.over = Math.max(rec.over, document.documentElement.scrollWidth - innerWidth)
    rec.dialogs.add(document.querySelectorAll('[role=dialog]').length)
    rec.scrollYs.push(Math.round(scrollY))
    if (performance.now() - t0 < 800) requestAnimationFrame(loop); else rec.done = true
  }
  requestAnimationFrame(loop)
})
const stop = async () => { await page.waitForFunction(() => window.__rec?.done, null, { timeout: 5000 }).catch(() => {}); return page.evaluate(() => { const r = window.__rec; if (!r) return null; return { frames: r.frames, tabTop: [...r.tabTop], playerTop: [...r.playerTop], over: r.over, dialogs: [...r.dialogs], scrollJumps: r.scrollYs.filter((y, i, a) => i && Math.abs(y - a[i - 1]) > 40).length } }) }
let n = 0
const step = async (name, act, { shot } = {}) => {
  n++
  const before = errs.length
  await watch()
  let failed = null
  try { await act() } catch (e) { failed = String(e.message).split('\n')[0].slice(0, 120) }
  if (shot) { await sleep(110); await page.screenshot({ path: `${OUT}/sw-${String(n).padStart(2, '0')}-mid.png` }) }
  const r = (await stop()) || { lost: true, tabTop: [], playerTop: [], over: 0, scrollJumps: 0 }
  if (shot) await page.screenshot({ path: `${OUT}/sw-${String(n).padStart(2, '0')}-end.png` })
  const state = await page.evaluate(() => ({ view: history.state?.view, sheet: history.state?.sheet || null, depth: history.state?.depth, dialogs: document.querySelectorAll('[role=dialog]').length, menus: document.querySelectorAll('[role=menu]').length }))
  const flags = []
  if (failed) flags.push('ACTION FAILED: ' + failed)
  if (r.lost) flags.push('THE PAGE WAS REPLACED (a reload, or Back left the app)')
  if (r.tabTop.length > 1) flags.push('tab bar moved ' + r.tabTop.join('/'))
  if (r.playerTop.length > 2) flags.push('player moved ' + r.playerTop.join('/'))
  if (r.over > 0) flags.push('sideways overflow ' + r.over + 'px')
  if (r.scrollJumps > 1) flags.push('scroll jumped ' + r.scrollJumps + ' times')
  if (errs.length > before) flags.push(...errs.slice(before))
  console.log(`${String(n).padStart(2)} ${name.padEnd(36)} → ${state.view}${state.sheet ? '+' + state.sheet : ''} d${state.depth} dlg${state.dialogs} menu${state.menus}${flags.length ? '   !! ' + flags.join(' | ') : ''}`)
}
const card = t => page.locator('[role=button]').filter({ hasText: t }).first()
const btn = name => page.getByRole('button', { name, exact: true }).first()

await step('open a document', () => card('Dad joke').click(), { shot: true })
await step('back to the library', () => btn('Back to library').click(), { shot: true })
await step('open it again', () => card('Dad joke').click())
await step('open the document menu', () => btn('Document menu').click(), { shot: true })
await step('choose Listen in another language', () => page.locator('[role=menu]').getByText('Listen in another language').click(), { shot: true })
await step('close that sheet with Back', () => page.goBack())
await step('open Ask', () => btn('Ask about this document').click())
// on a wide screen Ask is docked beside the text (not a dialog, not a history entry)
await step('close Ask', () => page.locator(WIDE ? 'aside button[aria-label="Close"]' : '[role=dialog] button[aria-label="Close"]').last().click())
await step('reading settings', () => btn('Reading settings').click(), { shot: true })
await step('close reading settings with Back', () => page.goBack())
await step(WIDE ? 'open Ask, then close it from the header' : 'open Ask, then Back', async () => { await btn('Ask about this document').click(); await sleep(500); await (WIDE ? btn('Ask about this document').click() : page.goBack()) })
await step('rapid: back, open, back, open', async () => { await btn('Back to library').click(); await sleep(60); await card('Dad joke').click(); await sleep(60); await page.goBack(); await sleep(60); await card('Dad joke').click(); await sleep(900) })
await step('one page on screen after the rapid taps', async () => { const n = await page.locator('button[aria-label="Back to library"]').count(); const lib = await page.getByText('YOUR LIBRARY').count(); if (n !== 1 || lib !== 0) throw new Error('stranded page: reader headers ' + n + ', library headers ' + lib) })
await step('switch to Focus', () => page.getByRole('tab', { name: 'Focus', exact: true }).click(), { shot: true })
await step('switch back to Text', () => page.getByRole('tab', { name: 'Text', exact: true }).click())
await step('press play', () => btn('Play').click())
await sleep(1500)
await step('back to the library while it plays', () => btn('Back to library').click(), { shot: true })
await step('pause from the mini player', () => btn('Pause').click())
if (!WIDE) {
  await step('Settings tab', () => btn('Settings').click(), { shot: true })
  await step('Library tab', () => btn('Library').click())
  await step('Search tab', () => btn('Search').click(), { shot: true }) // --- search ---
  await step('Back closes the search', async () => { await page.goBack(); await sleep(300); const st = await page.evaluate(() => history.state); const box = await page.getByRole('button', { name: 'Close search' }).count(); if (st.view !== 'library' || box) throw new Error('search still open or left the library: ' + JSON.stringify(st)) })
  await step('Add tab (sheet)', () => btn('Add').click(), { shot: true })
} else {
  await step('Settings', () => btn('Settings').click(), { shot: true })
  await step('back from Settings', () => page.goBack())
  await step('Add document (sheet)', () => btn('Add document').click(), { shot: true })
}
await step('paste text and add', async () => { await page.getByRole('tab', { name: 'Text', exact: true }).click(); await page.locator('[role=dialog] textarea').first().fill('Sweep test document\n\nOne short paragraph for the sweep. It has two sentences.'); await btn('Add to library').click(); await page.waitForFunction(() => history.state?.view === 'reader', null, { timeout: 10000 }) })
await step('Back from the new document', () => btn('Back to library').click(), { shot: true })
await step('library AI menu', () => btn('Ask your library').click(), { shot: true })
await step('choose Ask your library', () => page.locator('[role=menu]').getByText('Ask your library').click())
await step('close it with Back', () => page.goBack())
await step('a card menu', () => page.locator('button[aria-label*="menu" i], button[aria-label*="More" i]').first().click(), { shot: true })
await step('close the card menu', () => page.keyboard.press('Escape'))
// tidy up
const id = await mod('/src/lib/library.js', "(m.library.get().docs.find(d => d.title === 'Sweep test document') || {}).id")
if (id) await mod('/src/lib/library.js', `m.deleteDoc(${JSON.stringify(id)})`)
await mod('/src/lib/player.js', 'm.pause()')
await ctx.close()
