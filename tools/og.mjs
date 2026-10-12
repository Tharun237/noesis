// Draws public/og.png: the picture a link to Noesis shows when it is shared (WhatsApp, X, LinkedIn, Slack) and
// that Google may show beside a result. 1200 x 630, in the app's own look: black, the wordmark, the headline.
//   node tools/og.mjs
import { chromium } from 'playwright-core'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const { WORDMARK } = await import('../src/ui/brand-paths.js')
const { w, h, d } = WORDMARK
const fontDir = root + 'node_modules/@fontsource-variable/dm-sans/files/'
// the fonts go in as data: a page made from a string may not read files
const inline = file => 'data:font/woff2;base64,' + readFileSync(file).toString('base64')
const sans = inline(fontDir + readdirSync(fontDir).find(f => /latin-wght-normal\.woff2$/.test(f)))
const serifDir = root + 'node_modules/@fontsource-variable/literata/files/'
const serif = inline(serifDir + readdirSync(serifDir).find(f => /latin-wght-italic\.woff2$/.test(f)))

const html = `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: Sans; src: url('${sans}'); font-weight: 100 1000; }
@font-face { font-family: Serif; src: url('${serif}'); font-weight: 200 900; font-style: italic; }
html, body { margin: 0; width: 1200px; height: 630px; background: #000; color: #fff; font-family: Sans; }
.page { position: absolute; inset: 0; padding: 70px 84px; display: flex; flex-direction: column; justify-content: space-between;
  background: radial-gradient(900px 520px at 88% 8%, rgba(170,255,0,0.10), transparent 62%), #000; }
h1 { margin: 0; font-size: 104px; line-height: 0.98; letter-spacing: -0.058em; font-weight: 800; }
.under { margin-top: 14px; font-family: Serif; font-style: italic; font-size: 46px; letter-spacing: -0.02em; color: rgba(255,255,255,0.6); }
.say { font-size: 27px; line-height: 1.45; color: rgba(255,255,255,0.62); max-width: 860px; }
.foot { display: flex; align-items: center; justify-content: space-between; }
.where { font-size: 24px; color: rgba(255,255,255,0.5); letter-spacing: 0.01em; display: flex; align-items: center; gap: 12px; }
.dot { width: 9px; height: 9px; border-radius: 9px; background: #AAFF00; }
</style><div class="page">
  <svg height="44" style="align-self: flex-start" viewBox="0 0 ${w} ${h}"><path fill-rule="evenodd" fill="#F8F4EF" d="${d}"/></svg>
  <div><h1>Listen to anything.</h1><div class="under">Understand it.</div></div>
  <div class="foot">
    <div class="say">Papers, books and articles, read to you in a natural voice that is made on your own device.</div>
    <div class="where"><span class="dot"></span>noesisaudio.com</div>
  </div>
</div>`

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.setContent(html)
await page.evaluate(() => document.fonts.ready)
await page.screenshot({ path: root + 'public/og.png' })
await browser.close()
console.log('wrote public/og.png')
