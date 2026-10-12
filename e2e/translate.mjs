// A customer with NO AI key listens in another language: the device translates, free.
// Needs the dev server (npx vite --port 5180 --strictPort --host) and the models' site to be up.
//   node e2e/translate.mjs [te hi es ...]      default: te hi
import { chromium } from 'playwright-core'
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const HOME = process.env.NOESIS_URL || 'http://localhost:5180/'
const PROFILE = fileURLToPath(new URL('../.translate-profile', import.meta.url))
const OUT = fileURLToPath(new URL('../.qa-out', import.meta.url))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const want = process.argv.slice(2).length ? process.argv.slice(2) : ['te', 'hi']
const NAME = { te: 'Telugu', hi: 'Hindi', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', vi: 'Vietnamese', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', ar: 'Arabic' }
const SCRIPT = { te: /\p{Script=Telugu}/u, hi: /\p{Script=Devanagari}/u, ar: /\p{Script=Arabic}/u, ko: /\p{Script=Hangul}/u, zh: /\p{Script=Han}/u, ja: /[\p{Script=Hiragana}\p{Script=Katakana}]/u }
const TEXT = `# The river and the mill

The river ran past the mill and on toward the sea. The people who lived beside it measured their days by its sound.

In 1905 a young clerk showed that mass and energy are two forms of the same thing. It took the world a long time to understand what he had said.

Reading is one road to understanding. Listening is another, and for a long time it was the main one.`

const failures = []
const check = (what, ok, detail = '') => { console.log(`${ok ? '  ✔' : '  ✖'} ${what}${detail ? ` — ${detail}` : ''}`); if (!ok) failures.push(what) }

rmSync(PROFILE, { recursive: true, force: true })
const ctx = await chromium.launchPersistentContext(PROFILE, { channel: 'chrome', headless: true, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, args: ['--autoplay-policy=no-user-gesture-required'] })
const page = ctx.pages()[0] || await ctx.newPage()
const errors = [], asked = []
page.on('pageerror', e => errors.push(String(e).slice(0, 200)))
page.on('request', r => { if (/\/api\/(nvidia|fetch)|generativelanguage/.test(r.url())) asked.push(r.url().slice(0, 80)) })
await page.addInitScript(() => { try { localStorage.setItem('noesis.install.dismissed', String(Date.now())) } catch { /* no storage */ } })
const btn = n => page.getByRole('button', { name: n, exact: true }).first()
const lib = expr => page.evaluate(async expr => {
  const at = path => performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes(path)) || path
  const m = { library: await import(at('/src/lib/library.js')), ai: await import(at('/src/lib/ai.js')) }
  return eval(expr)
}, expr)

try {
  await page.goto(HOME); await page.waitForLoadState('networkidle')
  await btn('Add').click(); await sleep(500)
  await page.getByRole('dialog').getByRole('tab', { name: 'Text', exact: true }).click()
  await page.locator('[role=dialog] textarea').first().fill(TEXT)
  await page.getByRole('button', { name: 'Add to library' }).click()
  await page.waitForFunction(() => history.state?.view === 'reader', null, { timeout: 20000 })
  await page.locator('article [data-i]').first().waitFor({ timeout: 30000 })
  check('there is no AI key', (await lib('m.ai.hasAiKey()')) === false)
  const originalId = await page.evaluate(() => history.state.docId)

  for (const code of want) {
    const t0 = Date.now()
    await page.evaluate(id => history.replaceState({ ...history.state, docId: id }, ''), originalId)
    await lib(`(async () => { const nav = await import(performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes('/src/lib/nav.js'))); nav.go('reader', ${JSON.stringify(originalId)}) })()`)
    await sleep(800)
    await btn('Document menu').click(); await sleep(500)
    await page.getByRole('menuitem', { name: /Listen in another language/ }).click(); await sleep(700)
    const row = page.getByRole('dialog').getByRole('button', { name: NAME[code], exact: true })
    check(`${NAME[code]} can be chosen without a key`, await row.isEnabled())
    if (code === want[0]) await page.screenshot({ path: `${OUT}/translate-picker.png` })
    await row.click()
    // what the reader says while it works, then the text
    const said = new Set()
    let text = ''
    for (let k = 0; k < 600; k++) {
      await sleep(250)
      const now = await page.evaluate(() => ({ status: [...document.querySelectorAll('[data-screen] [role=status]')].map(e => e.innerText.split('\n')[0].replace(/\d+%/, 'N%')).join(' | '), text: [...document.querySelectorAll('article [data-i]')].map(e => e.innerText).join(' ') }))
      if (now.status) said.add(now.status)
      const d = await lib(`(() => { const d = m.library.library.get().docs.find(x => x.target === ${JSON.stringify(code)}); return d ? { status: d.status, lang: d.lang, error: d.error, voice: d.voice } : null })()`)
      if (d?.status === 'error') { check(`${NAME[code]}: translated`, false, d.error); break }
      if (d && (d.status === 'voicing' || d.status === 'ready') && now.text.length > 40) { text = now.text; check(`${NAME[code]}: the document is in ${NAME[code]}`, d.lang === code, `voice ${d.voice}`); break }
    }
    const letters = [...text].filter(ch => /\p{L}/u.test(ch))
    const right = SCRIPT[code] ? letters.filter(ch => SCRIPT[code].test(ch)).length / Math.max(1, letters.length) : 1
    check(`${NAME[code]}: the text is written in its own script`, text.length > 40 && right > (code === 'ja' ? 0.3 : 0.7), `${Math.round(right * 100)}% of letters; ${((Date.now() - t0) / 1000).toFixed(1)} s`)
    // and it is spoken: sentences of it are turned into sound by the language's own voice
    let made = null
    for (let k = 0; k < 480; k++) {
      made = await lib(`(() => { const d = m.library.library.get().docs.find(x => x.target === ${JSON.stringify(code)}); return d ? { done: d.done, total: d.total, voice: d.voice, sec: Math.round(d.vSec || 0), error: d.error || null } : null })()`)
      if (made?.done >= Math.min(3, made.total) || made?.error) break
      await sleep(500)
    }
    check(`${NAME[code]}: its voice makes the audio`, !!made && made.done >= Math.min(3, made.total) && made.sec > 0, made ? `${made.voice}: ${made.done} of ${made.total} sentences, ${made.sec} s of sound` : 'no document')
    console.log('     said while working:', [...said].join('  →  ') || '(nothing)')
    console.log('     first words:', text.slice(0, 150))
    await page.screenshot({ path: `${OUT}/translate-${code}.png` })
  }
  check('no AI service was asked for anything', asked.length === 0, asked.join(', '))
  check('no errors were thrown', errors.length === 0, errors.join(' | '))
} catch (e) {
  check(String(e.message).split('\n')[0], false)
} finally {
  await ctx.close()
}
console.log(failures.length ? `\n${failures.length} failed` : '\nlistening in another language works with no key')
process.exit(failures.length ? 1 : 0)
