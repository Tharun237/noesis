// The impatient customer. A real customer does not follow a script: they tap whatever is on screen, in any
// order, several things in a row before the first has finished, fling the page, press Back in the middle of
// an animation, turn the phone. This walks the app that way, at random but repeatably (a seed), and after
// every burst of actions looks at the screen the way a person would: is it blank, is something stuck, is
// there a way back to what is playing, did the app throw. Scripted walks (qa.mjs, sweep.mjs) only prove the
// paths their author thought of; this finds the others.
//
//   node e2e/chaos.mjs                    phone, 240 actions, a new seed
//   node e2e/chaos.mjs --seed 7           the same walk again (to reproduce a finding)
//   node e2e/chaos.mjs --wide --steps 400 desktop, longer
//
// Needs a freshly started dev server on port 5180. It uses its own browser profile (.chaos-profile), never
// the QA one, so it may delete, rename and re-voice freely. Every finding prints the last actions before it
// and saves a screenshot in .qa-out. Exit code 1 when something was found.
import { chromium } from 'playwright-core'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'

const arg = name => { const i = process.argv.indexOf('--' + name); return i < 0 ? null : process.argv[i + 1] ?? true }
const WIDE = process.argv.includes('--wide')
const SEED = +(arg('seed') || Math.floor(Math.random() * 100000))
const STEPS = +(arg('steps') || 240)
const OUT = fileURLToPath(new URL('../.qa-out', import.meta.url))
const PROFILE = fileURLToPath(new URL('../.chaos-profile', import.meta.url))
const HOME = 'http://localhost:5180/'
mkdirSync(OUT, { recursive: true })

// a small repeatable random source
let seed = SEED >>> 0
const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const pick = list => list[Math.floor(rnd() * list.length)]
const between = (a, b) => a + rnd() * (b - a)
const sleep = ms => new Promise(r => setTimeout(r, ms))

const PHONE = { width: 390, height: 844 }
const SIZES = WIDE ? [{ width: 1360, height: 860 }, { width: 1100, height: 720 }, { width: 900, height: 900 }] : [PHONE, { width: 844, height: 390 }, { width: 360, height: 740 }]
const ctx = await chromium.launchPersistentContext(PROFILE, {
  channel: 'chrome', headless: true, viewport: SIZES[0], deviceScaleFactor: WIDE ? 1 : 2, isMobile: !WIDE, hasTouch: !WIDE,
  // a microphone that says yes and hears nothing much, so the voice and aware-listening buttons can be pressed
  args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
})
const page = ctx.pages()[0] || await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
const errors = []
page.on('pageerror', e => errors.push('threw: ' + String(e).slice(0, 220)))
page.on('console', m => { if (m.type() === 'error' && !/favicon|net::ERR|Failed to load resource|\/api\//.test(m.text())) errors.push('console error: ' + m.text().slice(0, 220)) })
page.on('dialog', d => (rnd() < 0.5 ? d.accept(d.type() === 'prompt' ? 'Chaos ' + Math.floor(rnd() * 99) : undefined) : d.dismiss()).catch(() => {}))
// the longest the screen went without drawing a frame, and how much the page changed (for taps that do nothing)
await page.addInitScript(() => {
  window.__gap = 0; window.__mut = 0
  let last = performance.now()
  const frame = t => { if (!document.hidden) window.__gap = Math.max(window.__gap, t - last); last = t; requestAnimationFrame(frame) }
  requestAnimationFrame(frame)
  addEventListener('DOMContentLoaded', () => new MutationObserver(list => { window.__mut += list.length }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true }))
})

// ---- the library the customer starts with: a long text, a document with a table, an equation and citations,
// and a real PDF. Added once through the app itself; later runs find them there.
const body = () => page.locator('body').innerText()
async function fixtures() {
  await page.goto(HOME); await page.waitForLoadState('networkidle'); await sleep(600)
  // The app reopens where the last walk left it (a document, Settings, a sheet): go to the library first.
  for (let k = 0; k < 4; k++) {
    const at = await page.evaluate(() => ({ view: history.state?.view, over: !!(history.state?.sheet || history.state?.panel || history.state?.searching) }))
    if (at.view === 'library' && !at.over) break
    if (at.over) await page.goBack().catch(() => {})
    else if (await page.getByRole('button', { name: 'Back to library', exact: true }).count()) await page.getByRole('button', { name: 'Back to library', exact: true }).first().click()
    else await page.getByRole('button', { name: 'Library', exact: true }).first().click().catch(() => page.goBack().catch(() => {}))
    await sleep(700)
  }
  const src = await page.evaluate(() => performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes('/src/lib/nav.js')))
  if (src) await page.evaluate(async s => (await import(s)).ui.set({ filter: 'all', query: '' }), src)
  // and in the plain text view, with motion as the phone has it: the last walk may have left Focus or Less on
  const set = await page.evaluate(() => performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes('/src/lib/settings.js')))
  if (set) await page.evaluate(async s => (await import(s)).settings.set({ readerView: 'text', motion: 'system' }), set)
  await sleep(300)
  const have = await body()
  const add = async (text, wait) => {
    await page.getByRole('button', { name: WIDE ? 'Add document' : 'Add', exact: true }).first().click(); await sleep(500)
    await page.getByRole('tab', { name: 'Text', exact: true }).click()
    await page.locator('[role=dialog] textarea').first().fill(text)
    await page.getByRole('button', { name: 'Add to library' }).click()
    await page.waitForFunction(() => history.state?.view === 'reader', null, { timeout: 20000 })
    await page.locator('article [data-i]').first().waitFor({ timeout: 30000 }); await sleep(wait)
    await page.getByRole('button', { name: 'Back to library' }).click(); await sleep(600)
  }
  const para = n => Array.from({ length: n }, (_, i) => `Section ${Math.floor(i / 12) + 1}, paragraph ${i + 1}. The river ran past the mill and on toward the sea, and the people who lived beside it measured their days by its sound. Nothing in the valley moved faster than the water, and nothing was in a hurry to.`).join('\n\n')
  if (!have.includes('The long river')) await add(`# The long river\n\n${Array.from({ length: 30 }, (_, k) => `## Part ${k + 1}\n\n${para(12)}`).join('\n\n')}`, 1500)
  if (!have.includes('Energy and sales')) await add('# Energy and sales\n\nEinstein showed that mass and energy are two forms of the same thing [1].\n\n$$E = mc^2$$\n\nHere E is energy, m is mass and c is the speed of light.\n\n| Year | Sales | Growth |\n|------|-------|--------|\n| 2019 | 1,200 | 4% |\n| 2020 | 1,800 | 50% |\n| 2021 | 2,100 | 16.7% |\n| 2022 | 1,500 | -28.6% |\n\nSales fell once, in 2022.\n\n## References\n\n[1] A. Einstein. Does the inertia of a body depend upon its energy content? Annalen der Physik, 1905.', 1200)
  if (!have.includes('Attention and Sequence Models')) {
    const file = OUT + '/chaos-paper.pdf'
    const b = await chromium.launch({ channel: 'chrome', headless: true })
    const p = await b.newPage()
    const text = (lead, n) => `<p>${lead} ${'The method is described in plain steps so that each stage can be repeated by another group with the same data. '.repeat(n)}</p>`
    await p.setContent(`<html><body style="font:12pt/1.5 Georgia,serif"><h1 style="font-size:22pt">Attention and Sequence Models</h1><h2>1 Introduction</h2>${text('Recurrent networks were the usual choice for sequences.', 6)}<p>The Transformer replaced recurrence with attention alone [1].</p>${text('This paper looks at what changed.', 7)}<h2 style="page-break-before:always">2 Method</h2>${text('We compare both families on one task.', 8)}${text('The second experiment repeats the first.', 8)}<h2 style="page-break-before:always">3 Results</h2>${text('Attention models were faster to train.', 8)}<h2>References</h2><p>[1] A. Vaswani et al. Attention is all you need. NeurIPS, 2017. arXiv:1706.03762</p></body></html>`)
    await p.pdf({ path: file, format: 'A4', margin: { top: '22mm', bottom: '22mm', left: '24mm', right: '24mm' } })
    await b.close()
    await page.getByRole('button', { name: WIDE ? 'Add document' : 'Add', exact: true }).first().click(); await sleep(500)
    await page.locator('[role=dialog] input[type=file]').setInputFiles(file); await sleep(400)
    await page.getByRole('button', { name: 'Add to library' }).click()
    await page.waitForFunction(() => history.state?.view === 'reader', null, { timeout: 20000 })
    await page.locator('article [data-i]').first().waitFor({ timeout: 40000 }); await sleep(1200)
    await page.getByRole('button', { name: 'Back to library' }).click(); await sleep(600)
  }
}

// ---- what can be touched right now: everything a finger could land on, as the page really is
const targets = () => page.evaluate(() => {
  // not for this walk: things that leave the app, start a download, or ask the outside world
  const LEAVE = /sign in with google|open the paper|search for it|install|get the noesis|export|save audio|notify me|look it up|hear your (month|year)|sync now|show credits/i
  const vw = innerWidth, vh = innerHeight
  const out = []
  const seen = new Set()
  for (const el of document.querySelectorAll('button, [role=button], [role=tab], [role=menuitem], [role=slider], input, textarea, select, summary, label, [data-i], [data-tool], canvas, svg text')) {
    if (el.disabled || el.getAttribute('aria-disabled') === 'true' || el.matches('input[type=file]')) continue
    const r = el.getBoundingClientRect()
    if (r.width < 6 || r.height < 6 || r.right < 2 || r.left > vw - 2) continue
    const x = Math.min(vw - 3, Math.max(3, r.left + r.width / 2))
    const y = r.top + r.height / 2
    if (y < 3 || y > vh - 3) continue
    const top = document.elementFromPoint(x, y)
    if (!top || !(el === top || el.contains(top))) continue // something else is on top of it: a finger cannot reach it
    const label = (el.getAttribute('aria-label') || el.innerText || el.value || el.placeholder || el.tagName || '').trim().replace(/\s+/g, ' ').slice(0, 48)
    if (LEAVE.test(label)) continue
    const key = Math.round(x / 4) + ',' + Math.round(y / 4)
    if (seen.has(key)) continue
    seen.add(key)
    const tag = el.tagName.toLowerCase()
    out.push({ x, y, label, left: r.left, width: r.width, kind: el.hasAttribute('data-i') ? 'sentence' : tag === 'input' && el.type === 'range' ? 'range' : tag === 'textarea' || (tag === 'input' && /text|url|search|password|^$/.test(el.type)) ? 'type' : tag === 'select' ? 'select' : 'control' })
  }
  return out
})

const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: Math.round(x), y: Math.round(y) }] })
const tap = (x, y) => (WIDE ? page.mouse.click(x, y) : page.touchscreen.tap(x, y))
async function drag(x1, y1, x2, y2, steps = 6) {
  if (WIDE) { await page.mouse.move(x1, y1); await page.mouse.down(); await page.mouse.move(x2, y2, { steps }); await page.mouse.up(); return }
  await touch('touchStart', x1, y1)
  for (let k = 1; k <= steps; k++) { await touch('touchMove', x1 + (x2 - x1) * k / steps, y1 + (y2 - y1) * k / steps); await sleep(12) }
  await touch('touchEnd')
}
const hammered = [] // findings from hammering, picked up at the next look
const WORDS = ['river', 'energy', 'Transformer', 'the', 'sales 2021', 'zzzz', 'attention', '   ', 'a', 'mill and the sea']

// ---- one thing a customer might do next
async function act() {
  const size = page.viewportSize()
  const r = rnd()
  if (r < 0.60) {
    const all = await targets()
    if (!all.length) return 'nothing to tap'
    const controls = all.filter(t => t.kind !== 'sentence')
    const t = controls.length && rnd() < 0.82 ? pick(controls) : pick(all)
    if (t.kind === 'range') { await drag(t.left + 4, t.y, t.left + between(4, t.width - 4), t.y); return `slide "${t.label}"` }
    if (t.kind === 'select') {
      await page.evaluate(([x, y, f]) => { const s = document.elementFromPoint(x, y)?.closest('select'); if (s && s.options.length) { s.selectedIndex = Math.floor(f * s.options.length); s.dispatchEvent(new Event('change', { bubbles: true })) } }, [t.x, t.y, rnd()])
      return `choose in "${t.label}"`
    }
    await tap(t.x, t.y)
    if (t.kind === 'type') { await page.keyboard.type(pick(WORDS), { delay: 8 }); if (rnd() < 0.4) await page.keyboard.press('Enter'); return `type in "${t.label}"` }
    if (rnd() < 0.12) {
      // Hammering one spot may close one thing. It must never go back two steps (out of the document, or out
      // of the app): a second tap on a sheet that is already closing once did exactly that.
      const before = await page.evaluate(() => history.state?.depth || 0).catch(() => 0)
      for (let k = 0; k < 2 + Math.floor(rnd() * 3); k++) { await sleep(between(25, 70)); await tap(t.x, t.y) }
      await sleep(700)
      const after = await page.evaluate(() => history.state?.depth || 0).catch(() => 0)
      if (after < before - 1) hammered.push(`hammering "${t.label}" went back ${before - after} steps at once`)
      return `hammer "${t.label}"`
    }
    return `tap ${t.kind === 'sentence' ? 'a sentence' : `"${t.label}"`}`
  }
  if (r < 0.76) {
    // A fling: real finger swipes (the page keeps moving after each, as on a phone), one or many in a row.
    // (Chrome's ready-made scroll gesture was tried first and moved nothing in this browser: measured.)
    const up = rnd() < 0.35
    const swipes = pick([1, 1, 2, 3, 6, 10, 16])
    const x = size.width / 2
    const from = up ? size.height * 0.25 : size.height * 0.8
    const to = up ? size.height * 0.8 : size.height * 0.2
    for (let k = 0; k < swipes; k++) {
      if (WIDE) { await page.mouse.move(x, size.height / 2); await page.mouse.wheel(0, (up ? -1 : 1) * between(600, 2400)); await sleep(between(10, 60)); continue }
      await touch('touchStart', x, from)
      for (let m = 1; m <= 5; m++) { await touch('touchMove', x, from + (to - from) * m / 5); await sleep(9) }
      await touch('touchEnd')
      await sleep(between(30, 160))
    }
    return `fling ${up ? 'up' : 'down'} ×${swipes}`
  }
  if (r < 0.86) {
    const inside = await page.evaluate(() => { const s = history.state || {}; return (s.depth || 0) > 0 || !!s.sheet || !!s.panel || !!s.searching })
    if (!inside) return 'Back (at the start: skipped)'
    await page.goBack().catch(() => {})
    return 'Back'
  }
  if (r < 0.90) { await page.keyboard.press('Escape'); return 'Escape' }
  if (r < 0.94) {
    const box = await page.evaluate(() => { const d = document.querySelector('[role=dialog][aria-modal=true]'); if (!d) return null; const b = d.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + 14 } })
    if (!box) return 'pull a sheet (none open)'
    await drag(box.x, box.y, box.x, box.y + between(40, 420), 8)
    return 'pull the sheet down'
  }
  if (r < 0.97) { const s = pick(SIZES); await page.setViewportSize(s); return `turn the screen to ${s.width}x${s.height}` }
  await sleep(5600)
  return 'wait and watch for 5 s'
}

// ---- look at the screen the way a person would
const inspect = () => page.evaluate(async () => {
  const problems = []
  const st = history.state || {}
  const screen = document.querySelector('[data-screen]')
  if (!screen) return { problems: ['there is no page on screen'], st }
  const modal = [...document.querySelectorAll('[role=dialog][aria-modal=true]')]
  const menus = document.querySelectorAll('[role=menu]').length
  if (modal.length > 1) problems.push(`${modal.length} sheets are open at once`)
  if (menus > 1) problems.push(`${menus} menus are open at once`)
  if (st.sheet && !modal.length) problems.push(`the app thinks the "${st.sheet}" sheet is open, but nothing is on screen`)
  if (!st.sheet && !st.panel && modal.length) problems.push(`the "${modal[0].getAttribute('aria-label')}" sheet is on screen with no history entry: Back will leave the page instead of closing it`)
  const over = document.documentElement.scrollWidth - innerWidth
  if (over > 1) problems.push(`the page is ${over}px wider than the screen`)
  if (+getComputedStyle(screen).opacity < 0.99) problems.push(`the page is stuck part-faded (opacity ${getComputedStyle(screen).opacity})`)
  if ([...document.body.children].some(e => e.style.position === 'fixed' && e.style.zIndex === '40')) problems.push('a flying cover was left on screen')
  const heads = document.querySelectorAll('button[aria-label="Back to library"]').length
  if (st.view === 'reader' && heads !== 1) problems.push(`the reader shows ${heads} header bars`)
  if (st.view !== 'reader' && heads) problems.push('a reader header is on screen outside the reader')
  if (scrollY > document.documentElement.scrollHeight - innerHeight + 2) problems.push('scrolled past the end of the page')

  // blank? sample the area between the header and the bottom bars
  const header = document.querySelector('header')
  const top = Math.max(0, header ? header.getBoundingClientRect().bottom : 0)
  const dock = parseFloat(getComputedStyle(screen.parentElement).getPropertyValue('--dock')) || 0
  const bottom = innerHeight - dock
  const ownText = n => [...n.childNodes].some(k => k.nodeType === 3 && k.data.trim().length > 1)
  // (The Focus view's word is pinned so that it cannot scroll away: pinned, but it IS the content.)
  // Content is what the page is FOR: text and pictures in the flow of the page. A floating button ("Back to
  // now"), a header or a bottom bar over an empty page is not content. (The first version counted them, and
  // so called an empty reader with one floating button "not blank": caught by putting a known bug back.)
  const floating = n => { for (let e = n; e && e !== screen && e !== document.body; e = e.parentElement) { if (e.dataset.testid === 'focus-word') return false; if (e.tagName === 'BUTTON' || e.tagName === 'HEADER') return true; const pos = getComputedStyle(e).position; if (pos === 'fixed' || pos === 'sticky') return true } return false }
  let hits = 0, canvases = 0, drawn = 0
  for (let r = 1; r <= 7; r++) for (let c = 1; c <= 4; c++) {
    let n = document.elementFromPoint(innerWidth * c / 5, top + (bottom - top) * r / 8)
    if (!n) continue
    if (n.tagName === 'CANVAS') { canvases++; if (n.width > 0) drawn++; continue }
    while (n && n !== document.body) { if (ownText(n) || n.tagName === 'IMG' || n.tagName === 'INPUT' || n.tagName === 'TEXTAREA') { if (modal.length || !floating(n)) hits++; break } n = n.parentElement }
  }
  if (!hits && !canvases) {
    // nothing under the sample points: look properly before calling it blank
    for (const n of document.querySelectorAll('[data-screen] *, [role=dialog] *')) {
      if (!ownText(n) && n.tagName !== 'IMG' && n.tagName !== 'CANVAS') continue
      const b = n.getBoundingClientRect()
      if (b.height > 0 && b.width > 0 && b.bottom > top + 1 && b.top < bottom - 1 && (modal.length || !floating(n))) { hits++; break }
    }
    // the Focus view's word can be one or two letters ("a", or a word split around its pivot letter): it is content
    const word = document.querySelector('[data-testid="focus-word"]')
    if (word && word.innerText.trim() && word.getBoundingClientRect().bottom > top && word.getBoundingClientRect().top < bottom) hits++
    if (!hits) problems.push('the page is blank between the header and the bottom bar')
  }
  if (canvases && !drawn) problems.push('pages are on screen but none of them is drawn')

  // the place being read: on screen, or a way back to it
  const src = performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes('/src/lib/player.js'))
  const pl = src ? (await import(src)).player.get() : null
  const tab = document.querySelector('[role=tab][aria-selected="true"]')?.innerText || ''
  if (pl?.playing && pl.id && st.view === 'reader' && st.docId === pl.id && !modal.length && tab !== 'Focus') {
    const now = tab === 'Pages' ? document.querySelector('[data-testid="page-view"] [data-testid="sentence-mark"]') : document.querySelector(`article [data-i="${pl.i}"]`)
    const b = now?.getBoundingClientRect()
    const seen = !!b && b.bottom > top && b.top < bottom
    const offered = !!document.querySelector('button[aria-label="Scroll to what is playing"]')
    if (!seen && !offered) problems.push(`it is reading sentence ${pl.i} (${tab}), which is not on screen, and there is no "Back to now"`)
  }
  const gap = Math.round(window.__gap); window.__gap = 0
  const mut = window.__mut; window.__mut = 0
  return { problems, st: { view: st.view, sheet: st.sheet || null, panel: st.panel || null, depth: st.depth || 0 }, gap, mut, tab }
}).catch(e => ({ problems: ['could not look at the page: ' + String(e.message).split('\n')[0].slice(0, 120)], st: {}, gap: 0, mut: 1 }))

// ---- the walk
await fixtures()
console.log(`chaos: seed ${SEED}, ${STEPS} actions, ${WIDE ? 'desktop' : 'phone'}`)
const findings = []
const quiet = new Map() // taps after which nothing on the page changed
const slow = []
const trail = []
let done = 0
let burstNo = 0
while (done < STEPS) {
  burstNo++
  const burst = []
  await page.evaluate(() => { window.__mut = 0 }).catch(() => {})
  const n = 1 + Math.floor(rnd() * 4) // a customer does not wait for one thing to finish before the next
  for (let k = 0; k < n && done < STEPS; k++) {
    let what
    try { what = await act() } catch (e) { what = 'could not: ' + String(e.message).split('\n')[0].slice(0, 80) }
    burst.push(what); done++
    await sleep(pick([0, 0, 30, 60, 120, 260]))
  }
  trail.push(...burst)
  if (process.argv.includes('--show')) console.log(`  ${String(done).padStart(4)}  ${burst.join(' → ')}`)
  if (!page.url().startsWith(HOME)) { findings.push({ at: done, what: `the app was left for ${page.url().slice(0, 80)}`, trail: trail.slice(-8) }); await page.goto(HOME); await sleep(800) }
  await sleep(900)
  const before = errors.length
  let seen = await inspect()
  if (seen.problems.length) {
    await sleep(1600) // give a slow phone its due: is it still wrong?
    const again = await inspect()
    const still = seen.problems.filter(p => again.problems.includes(p))
    for (const p of seen.problems) if (!still.includes(p)) slow.push(`${p} (for over a second, after: ${burst.join(' → ')})`)
    seen = { ...again, problems: still }
  }
  const all = [...seen.problems, ...hammered.splice(0), ...errors.slice(before), ...errors.splice(0, before)]
  errors.length = 0
  if (seen.gap > 700) slow.push(`the screen froze for ${seen.gap} ms after: ${burst.join(' → ')}`)
  if (burst.length === 1 && /^tap "/.test(burst[0]) && seen.mut === 0) quiet.set(burst[0], (quiet.get(burst[0]) || 0) + 1)
  if (all.length) {
    const shot = `${OUT}/chaos-${SEED}-${String(findings.length + 1).padStart(2, '0')}.png`
    await page.screenshot({ path: shot }).catch(() => {})
    for (const what of all) findings.push({ at: done, what, where: `${seen.st.view || '?'}${seen.st.sheet ? '+' + seen.st.sheet : ''}${seen.st.panel ? '+' + seen.st.panel : ''} ${seen.tab || ''}`.trim(), trail: trail.slice(-8), shot })
    // start the next stretch from a clean place, so one fault is not counted over and over
    await page.goto(HOME).catch(() => {}); await sleep(900)
  }
}

// ---- what was found
const grouped = new Map()
for (const f of findings) { const k = f.what.replace(/\d+/g, 'N'); if (!grouped.has(k)) grouped.set(k, []); grouped.get(k).push(f) }
console.log(`\n${done} actions in ${burstNo} bursts.`)
if (!grouped.size) console.log('Nothing broke.')
for (const [, list] of grouped) {
  const f = list[0]
  console.log(`\n!! ${f.what}`)
  console.log(`   ${list.length} time${list.length === 1 ? '' : 's'}; first after action ${f.at}, on: ${f.where || '?'}`)
  console.log(`   the actions before it: ${f.trail.join(' → ')}`)
  if (f.shot) console.log(`   ${f.shot}`)
}
if (slow.length) { console.log('\nSlow or passing (look, but not counted as broken):'); for (const s of [...new Set(slow)].slice(0, 12)) console.log('  - ' + s) }
const dead = [...quiet.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
if (dead.length) { console.log('\nTaps after which nothing on the page changed (a dead control, or a legitimate no-op):'); for (const [k, c] of dead) console.log(`  - ${k}${c > 1 ? ` ×${c}` : ''}`) }
console.log(`\nTo walk this again: node e2e/chaos.mjs --seed ${SEED} --steps ${STEPS}${WIDE ? ' --wide' : ''}`)
const src = await page.evaluate(() => performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes('/src/lib/player.js'))).catch(() => null)
if (src) await page.evaluate(async s => (await import(s)).pause(), src).catch(() => {})
await ctx.close()
process.exit(grouped.size ? 1 : 0)
