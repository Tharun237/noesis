// A book whose voice cannot be asked (Gemini's free day used up) and its listener choosing another voice: the book
// must go on in that voice at once, and every place that names the voice must name the one that is heard. Written
// after Tharun's book stayed silent for a minute while he chose voice after voice, its menu saying "Zephyr" while
// Edge's Ava spoke (16 October 2026): the hold had been kept by document, not by the voice it was about.
//
//   node e2e/voice-switch.mjs          (the dev server on port 5180)
import { chromium } from 'playwright-core'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const HOME = 'http://localhost:5180/'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const failures = []
const check = (what, ok, detail = '') => { console.log(`${ok ? '  ✔' : '  ✖'} ${what}${detail ? ` — ${detail}` : ''}`); if (!ok) failures.push(what) }

const profile = `${tmpdir()}/noesis-voice-switch`
rmSync(profile, { recursive: true, force: true })
const ctx = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true, viewport: { width: 1280, height: 860 } })
const page = ctx.pages()[0] || await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e).slice(0, 160)))
await page.addInitScript(() => { try { localStorage.setItem('noesis.install.dismissed', String(Date.now())) } catch { /* none */ } })
const lib = expr => page.evaluate(async expr => {
  const at = path => performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes(path)) || path
  const m = { library: await import(at('/src/lib/library.js')), settings: await import(at('/src/lib/settings.js')), engine: await import(at('/src/lib/engine.js')), player: await import(at('/src/lib/player.js')) }
  return eval(expr)
}, expr)
const until = async (test, ms) => { const t0 = Date.now(); for (;;) { const v = await test().catch(() => null); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(500) } }

try {
  await page.goto(HOME); await page.waitForLoadState('networkidle'); await sleep(800)
  // Gemini's day used up for every speech model of the key (as cloudvoice.js records it): nothing goes to Google.
  const model = 'gemini-3.8-flash-tts'
  await lib(`m.settings.settings.set({ voiceEngine: 'natural', geminiKey: 'AIza-not-a-real-key-for-this-test', voice: 'gm:Zephyr', servicePlans: { gemini: { models: [${JSON.stringify(model)}], listedAt: Date.now(), spent: { ${JSON.stringify(model)}: Date.now() + 12 * 3600000 } } } })`)
  const id = await lib(`m.library.addDocument({ kind: 'text', name: 'The keeper', title: 'The keeper', text: '# The keeper\\n\\n' + Array.from({ length: 12 }, (_, k) => 'The keeper climbed the stairs for the ' + (k + 1) + 'th time tonight.').join(' ') }, { voice: 'gm:Zephyr' })`)
  const held = await until(() => lib(`m.library.keyWaitOf(${JSON.stringify(id)})`), 90000)
  check('the book in Zephyr waits, and says why', /daily limit/i.test(held || ''), held || `no words; ${JSON.stringify(await lib(`(d => ({ status: d.status, stage: d.stage, voice: d.voice, engine: m.engine.activeEngine() }))(m.library.getDoc(${JSON.stringify(id)}))`))}`)

  check('a book added in Zephyr is still in Zephyr once read', await lib(`m.library.getDoc(${JSON.stringify(id)}).voice`) === 'gm:Zephyr')

  // 1. the listener chooses a voice made on the device: the book goes on in it
  await lib(`m.library.changeVoice(${JSON.stringify(id)}, 'en_GB-alba-medium')`)
  check('the old voice\'s wait is no longer the book\'s', !(await lib(`m.library.keyWaitOf(${JSON.stringify(id)})`)))
  const made = await until(() => lib(`m.library.getDoc(${JSON.stringify(id)}).done > 0`), 180000)
  check('audio is made in the chosen voice', !!made, made ? '' : 'nothing made in 3 minutes')

  // 2. back to Zephyr: the day is still used up there, so the wait is its own again
  await lib(`m.library.changeVoice(${JSON.stringify(id)}, 'gm:Zephyr')`)
  const again = await until(() => lib(`m.library.keyWaitOf(${JSON.stringify(id)})`), 30000)
  check('back in Zephyr, the book waits for Gemini again', /daily limit/i.test(again || ''), again || 'no words')

  // 3. the built-in voice speaks: the player, the menu and the reader all name it, not Zephyr
  await lib(`m.settings.settings.set({ voiceEngine: 'system' })`)
  await lib(`m.player.open(${JSON.stringify(id)}, { autoplay: false })`)
  await page.evaluate(id => { history.pushState({ view: 'reader', docId: id, depth: 1 }, ''); dispatchEvent(new PopStateEvent('popstate', { state: history.state })) }, id)
  await sleep(1500)
  const heard = await lib(`m.engine.heardVoice(m.library.getDoc(${JSON.stringify(id)}))`)
  check('the voice heard is the built-in one', !/Zephyr/.test(heard), heard)
  await page.getByRole('button', { name: 'Document menu' }).first().click(); await sleep(500)
  const row = await page.getByRole('menuitem', { name: /Change voice/ }).first().innerText().catch(() => page.getByText('Change voice').first().locator('..').innerText())
  check('the menu names the voice that is heard', row.includes(heard.replace(/ · online$/, '')) && !/Zephyr/.test(row), row.replace(/\s+/g, ' '))
  const body = await page.locator('body').innerText()
  check('nowhere on the page says Zephyr', !/Zephyr/.test(body), (body.match(/.{0,40}Zephyr.{0,20}/) || [''])[0])
  check('no errors', !errors.length, errors.join(' | '))
} catch (e) {
  failures.push(String(e.message || e)); console.log('  ✖', e.message || e)
} finally {
  await ctx.close().catch(() => {})
  rmSync(profile, { recursive: true, force: true })
}
console.log(failures.length ? `\n${failures.length} failed` : '\nA CHOSEN VOICE IS THE VOICE')
process.exit(failures.length ? 1 : 0)
