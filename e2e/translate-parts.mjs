// A long document, no AI key: the customer chooses WHAT to translate (whole, this chapter, from here), is told
// how long it takes, sees where it has got to, and can pause and resume it.
// Needs the dev server (npx vite --port 5180 --strictPort --host) and the models' site.
import { chromium } from 'playwright-core'
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const HOME = 'http://localhost:5180/'
const PROFILE = fileURLToPath(new URL('../.translate-profile', import.meta.url))
const OUT = fileURLToPath(new URL('../.qa-out', import.meta.url))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const para = [
  'The river ran past the mill and on toward the sea, and the people who lived beside it measured their days by its sound.',
  'In 1905 a young clerk showed that mass and energy are two forms of the same thing, and it took the world a long time to understand what he had said.',
  'Reading is one road to understanding, but listening is another, and for a long time it was the main one for most people.',
  'A good teacher does not hand over an answer; she asks a question that makes the answer feel like your own discovery.',
  'Markets reward patience more often than cleverness, although every generation has to learn this again at its own expense.',
]
const TEXT = '# A long walk\n\n' + Array.from({ length: 60 }, (_, k) => `## Part ${k + 1}\n\n` + para.map((p, j) => `${p} ${para[(j + k) % 5]}`).join('\n\n')).join('\n\n')

const failures = []
const check = (what, ok, detail = '') => { console.log(`${ok ? '  ✔' : '  ✖'} ${what}${detail ? ` — ${detail}` : ''}`); if (!ok) failures.push(what) }
rmSync(PROFILE, { recursive: true, force: true })
const ctx = await chromium.launchPersistentContext(PROFILE, { channel: 'chrome', headless: true, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = ctx.pages()[0] || await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e).slice(0, 200)))
await page.addInitScript(() => { try { localStorage.setItem('noesis.install.dismissed', String(Date.now())); if (!localStorage.getItem('noesis.settings.v1')) localStorage.setItem('noesis.settings.v1', JSON.stringify({ voiceEngine: 'system' })) } catch { /* no storage */ } })
const lib = expr => page.evaluate(async expr => {
  const at = path => performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes(path)) || path
  const m = { library: await import(at('/src/lib/library.js')), nav: await import(at('/src/lib/nav.js')) }
  return eval(expr)
}, expr)
const docs = () => lib("m.library.library.get().docs.map(d => ({ id: d.id, title: d.title, status: d.status, stage: d.stage, prep: d.prep, eta: d.eta ?? null, total: d.total, target: d.target || null, part: d.part || null, error: d.error || null }))")
const until = async (what, test, ms = 120000) => { const t0 = Date.now(); for (;;) { const v = await test(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`); await sleep(250) } }
const openPicker = async () => {
  await page.getByRole('button', { name: 'Document menu', exact: true }).click(); await sleep(500)
  await page.getByRole('menuitem', { name: /Listen in another language/ }).click(); await sleep(900)
}
const card = () => page.evaluate(() => document.querySelector('[data-screen] [role=status]')?.innerText.replace(/\n+/g, ' / ') || '')

try {
  await page.goto(HOME); await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Add', exact: true }).first().click(); await sleep(500)
  await page.getByRole('dialog').getByRole('tab', { name: 'Text', exact: true }).click()
  await page.locator('[role=dialog] textarea').first().fill(TEXT)
  await page.getByRole('button', { name: 'Add to library' }).click()
  await page.waitForFunction(() => history.state?.view === 'reader', null, { timeout: 30000 })
  await page.locator('article [data-i]').first().waitFor({ timeout: 60000 }); await sleep(1500)
  const src = (await docs())[0]
  // the customer is in the middle of the book: Part 31
  const mid = await lib(`(async () => { const c = await m.library.loadDoc(${JSON.stringify(src.id)}); const bi = c.blocks.findIndex(b => b.k === 'h' && b.s.join(' ') === 'Part 31'); const pos = c.starts[bi + 2]; m.library.patch(${JSON.stringify(src.id)}, { pos }); return { chapterSentences: c.starts[c.blocks.findIndex((b, i) => i > bi && b.k === 'h')] - c.starts[bi], total: c.segs.length } })()`)

  await openPicker()
  const tabs = await page.getByRole('dialog').getByRole('tab').allInnerTexts()
  check('a long document asks what to translate', tabs.join('|') === 'All of it|This chapter|From here', tabs.join(' | '))
  const captionOf = async name => { await page.getByRole('dialog').getByRole('tab', { name, exact: true }).click(); await sleep(350); return page.evaluate(() => document.querySelector('[role=dialog] [data-fade]')?.innerText || '') }
  const whole = await captionOf('All of it'), here = await captionOf('From here'), chapter = await captionOf('This chapter')
  check('each choice says how long it takes on this device', / on this device/.test(whole) && / on this device/.test(here) && /Part 31/.test(chapter) && !/about about/.test(whole + here + chapter), `${whole} | ${here} | ${chapter}`)
  await page.screenshot({ path: `${OUT}/translate-parts-picker.png` })

  // 1. just this chapter
  await page.getByRole('dialog').getByRole('button', { name: 'Telugu', exact: true }).click()
  const part = await until('the chapter in Telugu', async () => (await docs()).find(d => d.target === 'te' && d.part && (d.status === 'voicing' || d.status === 'ready' || d.status === 'error')))
  check('the chapter alone is translated, and named', part.status !== 'error' && part.total === mid.chapterSentences && /Telugu, Part 31/.test(part.title), `${part.title}: ${part.total} sentences (the chapter has ${mid.chapterSentences}, the book ${mid.total}) ${part.error || ''}`)

  // 2. the whole document, paused and resumed
  await lib(`(m.nav.go('reader', ${JSON.stringify(src.id)}), 0)`); await sleep(1200)
  await openPicker()
  await page.getByRole('dialog').getByRole('tab', { name: 'All of it', exact: true }).click(); await sleep(300)
  await page.getByRole('dialog').getByRole('button', { name: 'Telugu', exact: true }).click()
  const going = await until('the whole book to be under way', async () => { const d = (await docs()).find(x => x.target === 'te' && !x.part); return d && d.status === 'narrating' && d.prep > 0.08 && d })
  // the time left is said once enough has been done to judge it by (a few seconds in)
  await until('a time left', async () => { const d = (await docs()).find(x => x.id === going.id); return d.eta != null || d.status !== 'narrating' }, 30000)
  const said = await card()
  check('while it works it says where it is and how long is left', /Translating into Telugu/.test(said) && /left\. It carries on/.test(said), said)
  await page.screenshot({ path: `${OUT}/translate-parts-working.png` })
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  const paused = await until('it to pause', async () => { const d = (await docs()).find(x => x.id === going.id); return d.status === 'paused' && d })
  await sleep(1500)
  const still = (await docs()).find(x => x.id === going.id)
  check('Pause stops it and keeps what is done', still.status === 'paused' && still.prep === paused.prep && paused.prep >= going.prep, `at ${Math.round(paused.prep * 100)}%: "${await card()}"`)
  await page.screenshot({ path: `${OUT}/translate-parts-paused.png` })
  await page.getByRole('button', { name: 'Resume', exact: true }).click()
  const after = await until('it to carry on', async () => { const d = (await docs()).find(x => x.id === going.id); return (d.status === 'narrating' && d.prep > paused.prep + 0.03) || d.status === 'voicing' || d.status === 'ready' ? d : null })
  check('Resume carries on from there, not from the start', after.status !== 'narrating' || after.prep > paused.prep, `${after.status} ${Math.round((after.prep || 0) * 100)}%`)
  const done = await until('the whole book in Telugu', async () => { const d = (await docs()).find(x => x.id === going.id); return d.status === 'voicing' || d.status === 'ready' || d.status === 'error' ? d : null }, 240000)
  check('the whole book is translated in the end', done.status !== 'error' && done.total > mid.total * 0.8, `${done.total} sentences (the original has ${mid.total}) ${done.error || ''}`)
  check('no errors were thrown', errors.length === 0, errors.join(' | '))
} catch (e) {
  check(String(e.message).split('\n')[0], false)
} finally {
  await ctx.close()
}
console.log(failures.length ? `\n${failures.length} failed` : '\nchoosing a part, time left, pause and resume all work')
process.exit(failures.length ? 1 : 0)
