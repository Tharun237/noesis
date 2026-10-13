// Two devices, one account: listening on one is counted on the other, added together, never twice.
//
//   node e2e/heard-sync.mjs
//
// Needs a freshly started dev server on port 5180 with DEV_LOGIN=1 in .dev.vars (see e2e/sync.mjs). Each device
// really plays a document with the natural voice (so each downloads the voice once: allow a minute or two).
import { chromium } from 'playwright-core'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const HOME = 'http://localhost:5180/'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const who = `heard${Date.now().toString(36)}`
const failures = []
const check = (what, ok, detail = '') => { console.log(`${ok ? '  ✔' : '  ✖'} ${what}${detail ? ` — ${detail}` : ''}`); if (!ok) failures.push(what) }
const BODY = Array.from({ length: 14 }, (_, k) => `The river ran past the mill and on toward the sea, and this is sentence number ${k + 1} about it.`).join(' ')

async function device(name) {
  const profile = `${tmpdir()}/noesis-heard-${name}`
  rmSync(profile, { recursive: true, force: true })
  const ctx = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true, viewport: { width: 1280, height: 800 }, args: ['--autoplay-policy=no-user-gesture-required'] })
  const page = ctx.pages()[0] || await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(String(e).slice(0, 160)))
  await page.addInitScript(() => { try { localStorage.setItem('noesis.install.dismissed', String(Date.now())) } catch { /* no storage */ } })
  await page.goto(HOME); await page.waitForLoadState('networkidle'); await sleep(800)
  const lib = expr => page.evaluate(async expr => {
    const at = path => performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes(path)) || path
    const m = { library: await import(at('/src/lib/library.js')), sync: await import(at('/src/lib/sync.js')), history: await import(at('/src/lib/history.js')), heard: await import(at('/src/lib/heard.js')), nav: await import(at('/src/lib/nav.js')) }
    return eval(expr)
  }, expr)
  const until = async (what, test, ms = 30000) => { const t0 = Date.now(); for (;;) { const v = await test(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`${name}: timed out waiting for ${what}`); await sleep(300) } }
  // seconds this device SHOWS for the document today (all devices together), and how many devices that is
  const shown = id => lib(`(() => { const s = m.history.historyStore.get(); return { seconds: s.log[m.heard.dayKey(new Date())]?.[${JSON.stringify(id)}] || 0, devices: s.devices } })()`)
  // really listen: open the document, press Play, let it sound for `ms`, press Pause
  const listen = async (id, ms) => {
    await lib(`(m.nav.go('reader', ${JSON.stringify(id)}), 0)`); await sleep(1200)
    await page.getByRole('button', { name: /^(Play|Resume)$/ }).first().click()
    await page.getByRole('button', { name: 'Pause', exact: true }).first().waitFor({ timeout: 240000 })
    await until('sound to be counted', async () => (await lib(`Object.values(m.history.historyStore.get().log).some(d => d && d[${JSON.stringify(id)}] > 0)`)), 60000).catch(() => {})
    await sleep(ms)
    await page.getByRole('button', { name: 'Pause', exact: true }).first().click(); await sleep(700)
  }
  return { name, ctx, page, errors, lib, until, shown, listen, sync: () => lib('m.sync.flush()') }
}

const a = await device('a')
const b = await device('b')
try {
  console.log(`account "${who}"`)
  const id = await a.lib(`m.library.addDocument({ kind: 'text', name: 'River notes', title: 'River notes', text: ${JSON.stringify(`# River notes\n\n${BODY}`)} })`)
  await a.until('the document to be prepared', () => a.lib(`m.library.library.get().docs.find(d => d.id === ${JSON.stringify(id)})?.total > 0`))
  await a.lib(`m.sync.devSignIn(${JSON.stringify(who)})`)
  await a.until('device A to finish its first round', () => a.lib("m.sync.syncState.get().status === 'idle' && m.sync.syncState.get().last > 0"))

  // device A listens
  await a.listen(id, 9000)
  const onA = await a.shown(id)
  check('device A counts its own listening', onA.seconds >= 8 && onA.seconds <= 16 && onA.devices === 1, `${onA.seconds} s, ${onA.devices} device`)
  await sleep(2500); await a.sync()

  // device B signs in: it shows A's listening without having listened at all
  await b.lib(`(m.sync.devSignIn(${JSON.stringify(who)}).catch(() => {}), 0)`)
  await b.until('the document to appear on device B', () => b.lib(`!!m.library.getDoc(${JSON.stringify(id)})`), 40000)
  const onB = await b.until("A's listening to reach device B", async () => { await b.sync(); const s = await b.shown(id); return s.seconds >= onA.seconds ? s : null })
  check('device B shows what was listened to on device A', onB.seconds === onA.seconds && onB.devices === 2, `${onB.seconds} s, ${onB.devices} devices`)

  // device B listens too: both now show the sum
  await b.until('the text to arrive on device B', () => b.lib(`m.library.loadDoc(${JSON.stringify(id)}).then(c => c?.segs?.length > 0)`), 40000)
  await b.listen(id, 6000)
  const sumB = await b.shown(id)
  const byB = sumB.seconds - onA.seconds
  check("device B adds its own listening to A's", byB >= 5 && byB <= 14, `${onA.seconds} s on A + ${byB} s on B = ${sumB.seconds} s`)
  await sleep(2500); await b.sync()
  const sumA = await a.until("B's listening to reach device A", async () => { await a.sync(); const s = await a.shown(id); return s.seconds >= sumB.seconds ? s : null })
  check('device A shows the same total', sumA.seconds === sumB.seconds && sumA.devices === 2, `${sumA.seconds} s, ${sumA.devices} devices`)

  // rounds upon rounds: the total must not creep (a record added into itself would double every time)
  for (let k = 0; k < 3; k++) { await a.sync(); await b.sync() }
  const againA = await a.shown(id), againB = await b.shown(id)
  check('more rounds change nothing: nothing is counted twice', againA.seconds === sumB.seconds && againB.seconds === sumB.seconds, `A ${againA.seconds} s, B ${againB.seconds} s`)

  // closing and opening device B: it still knows both
  await b.page.reload(); await b.page.waitForLoadState('networkidle'); await sleep(2500)
  const reopened = await b.shown(id)
  check('device B still shows the total after it is closed and opened', reopened.seconds === sumB.seconds && reopened.devices === 2, `${reopened.seconds} s, ${reopened.devices} devices`)

  check('no errors were thrown on either device', a.errors.length + b.errors.length === 0, [...a.errors, ...b.errors].join(' | '))
} catch (e) {
  check(String(e.message).split('\n')[0], false)
} finally {
  await a.ctx.close(); await b.ctx.close()
}
console.log(failures.length ? `\n${failures.length} failed` : '\nlistening is the same on both devices')
process.exit(failures.length ? 1 : 0)
