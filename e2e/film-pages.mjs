// The Pages view while the voice reads, filmed frame by frame on a phone-sized screen: how the sentence and the
// word are marked on the page, how one sentence hands over to the next, how the page follows the voice.
//
//   node e2e/film-pages.mjs [seconds]        → .qa-out/fp-NNN.png (every frame the browser paints, ~30 a second)
//
// Needs a dev server on port 5180. A thrown-away profile; the built-in voice, so nothing is downloaded.
import { chromium } from 'playwright-core'
import { rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

const SECONDS = +(process.argv[2] || 8)
const PDF = process.env.PDF || 'C:/Users/tharu/AppData/Local/Temp/paper.pdf'
const OUT = '.qa-out'
const sleep = ms => new Promise(r => setTimeout(r, ms))
mkdirSync(OUT, { recursive: true })
const profile = `${tmpdir()}/noesis-filmpages`
rmSync(profile, { recursive: true, force: true })
const ctx = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true, viewport: { width: 412, height: 860 }, deviceScaleFactor: 2 })
const page = ctx.pages()[0] || await ctx.newPage()
try {
  await page.addInitScript(() => { try { localStorage.setItem('noesis.install.dismissed', String(Date.now())); localStorage.setItem('noesis.settings.v1', JSON.stringify({ voiceEngine: 'system', readerView: 'pages' })) } catch { /* none */ } })
  await page.goto('http://localhost:5180/'); await page.waitForLoadState('networkidle'); await sleep(800)
  await page.evaluate(async () => { const at = p => performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes(p)) || p; (await import(at('/src/lib/nav.js'))).openSheet('add') }); await sleep(900)
  await page.locator('input[type=file]').first().setInputFiles(PDF); await sleep(600)
  await page.getByRole('button', { name: /^Add to library$/ }).first().click()
  for (let k = 0; k < 60 && await page.evaluate(() => /Reading the document/.test(document.body.innerText)); k++) await sleep(500)
  await sleep(2500)
  // play from the start of the text, as a listener does
  await page.goBack(); await sleep(1200) // the library, as a listener comes to a book
  await page.locator('[role=button]:not([aria-label^="Your listening"])', { hasText: /Attention|Rocket|\w/ }).first().click(); await sleep(2000)
  await page.getByRole('button', { name: 'Play', exact: true }).first().click()
  await sleep(1500)
  const cdp = await ctx.newCDPSession(page)
  let n = 0
  const times = []
  cdp.on('Page.screencastFrame', async f => {
    writeFileSync(`${OUT}/fp-${String(n).padStart(3, '0')}.png`, Buffer.from(f.data, 'base64'))
    times.push(Math.round(f.metadata.timestamp * 1000))
    n++
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
  })
  await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 })
  // a note per frame-time of what the page says: which sentence, which word
  const log = []
  if (process.env.TAP) { await page.mouse.click(206, +process.env.TAP); await sleep(150) } // a sentence lower on the page, tapped as a listener jumps ahead
  const t0 = Date.now()
  while (Date.now() - t0 < SECONDS * 1000) {
    log.push(await page.evaluate(() => {
      const ss = [...document.querySelectorAll('[data-testid="sentence-mark"]')].map(e => +getComputedStyle(e).opacity)
      const fill = [...document.querySelectorAll('[data-testid="word-mark"] > div')].find(e => e.style.display !== 'none')
      const anim = fill?.getAnimations()[0]
      return `${Math.round(performance.now())} sentence marks:${ss.length} strongest:${ss.length ? Math.max(...ss).toFixed(2) : '-'} word:${fill ? `filling ${anim ? Math.round(anim.effect.getComputedTiming().progress * 100) + '%' : 'no animation'}` : '-'} scrollY:${Math.round(scrollY)}${/Back to now/.test(document.body.innerText) ? ' BACK-TO-NOW' : ''} clock:${document.querySelector('[aria-label*="elapsed" i], [data-testid="elapsed"]')?.textContent || ''}`
    }))
    await sleep(60)
  }
  await cdp.send('Page.stopScreencast')
  writeFileSync(`${OUT}/fp-log.txt`, log.join('\n'))
  console.log(`${n} frames in ${SECONDS}s → ${OUT}/fp-*.png`)
} finally {
  await ctx.close()
  rmSync(profile, { recursive: true, force: true })
}
