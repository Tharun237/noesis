// The rings filling, measured on every frame at a phone's speed (CDP slows the page 4×): for each ring, the angle
// of its leading end and of its two halves. They must stay together (right half = the end's angle up to 180°,
// left half = what is past 180°), never step backwards, and arrive where the numbers say.
//   node e2e/ring-film.mjs [url]
import { chromium } from 'playwright-core'

const ctx = await chromium.launchPersistentContext(new URL('../.qa-profile/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'), { channel: 'chrome', headless: true, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true })
const page = ctx.pages()[0] || await ctx.newPage()
await page.goto(process.argv[2] || 'http://localhost:5180')
await page.waitForSelector('[aria-label="Your listening: open all of it"]', { timeout: 20000 })
const cdp = await ctx.newCDPSession(page)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
// from the first frame after a reload: every frame, every ring's angles
await page.addInitScript(() => {
  const angle = el => { const m = getComputedStyle(el).transform; if (!m || m === 'none') return 0; const [a, b] = m.slice(7, -1).split(',').map(Number); return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 }
  window.__frames = []
  const t0 = performance.now()
  const look = () => {
    const holder = document.querySelector('[aria-label="Your listening: open all of it"] [role=img]')
    if (holder) {
      window.__frames.push({ t: performance.now() - t0, rings: [...holder.children].map(arc => {
        const [, right, left, , arm] = arc.children
        return { right: angle(right.firstChild), left: angle(left.firstChild), arm: angle(arm) }
      }) })
    }
    if (window.__frames.length < 150 && performance.now() - t0 < 20000) requestAnimationFrame(look) // 150 frames from the first one with rings
  }
  requestAnimationFrame(look)
})
await page.reload()
await page.waitForFunction(() => window.__frames && window.__frames.length >= 150, null, { timeout: 40000 })
const frames = await page.evaluate(() => window.__frames)
await ctx.close()

const n = frames[0].rings.length
let worst = 0, back = 0
for (let k = 0; k < frames.length; k++) {
  for (let r = 0; r < n; r++) {
    const { right, left, arm } = frames[k].rings[r]
    const a = arm > 359.5 ? 360 : arm
    // the halves follow the end: right = min(a, 180), left = max(0, a - 180) (0° and 360° read the same; a full
    // ring reads 0 on the arm, so it is judged by its halves)
    const off = Math.max(Math.abs(right - Math.min(a, 180)) % 360, Math.abs(left - Math.max(0, a - 180)) % 360)
    if (!(a === 0 && right >= 179.5 && left >= 179.5)) worst = Math.max(worst, Math.min(off, 360 - off))
    if (k && a + 0.5 < frames[k - 1].rings[r].arm && frames[k - 1].rings[r].arm < 359.5) back++
  }
}
const moving = frames.filter((f, k) => k && f.rings.some((r, i) => Math.abs(r.arm - frames[k - 1].rings[i].arm) > 0.1))
const gaps = moving.map((f, k) => (k ? f.t - moving[k - 1].t : 0)).slice(1)
const ends = frames.at(-1).rings.map(r => Math.round(r.arm))
console.log(`${frames.length} frames over ${Math.round(frames.at(-1).t)} ms, ${moving.length} of them moving; rings end at ${ends.join('°, ')}°`)
console.log(`halves apart from the end by at most ${worst.toFixed(1)}° · steps backwards: ${back} · longest gap between moving frames: ${gaps.length ? Math.round(Math.max(...gaps)) : 0} ms`)
console.log(worst <= 3 && back === 0 ? 'TOGETHER' : 'APART')
process.exit(worst <= 3 && back === 0 ? 0 : 1)
