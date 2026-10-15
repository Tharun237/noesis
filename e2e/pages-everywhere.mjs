// A document's pages on every device, not only the one it was added on (Tharun, 15 October 2026: the phone had
// no Pages for any book added on the laptop; "the customer should get the same experience across all devices").
//
//   node e2e/pages-everywhere.mjs
//
// Needs a freshly started dev server on port 5180 with DEV_LOGIN=1 (server/devdrive.js stands in for Google
// Drive, resumable uploads included). Two devices, one account:
//   1. the laptop adds a book and is closed half-way through sending its file: opened again, it carries on from
//      where the folder says it got to, and does not send it all again
//   2. the phone opens that book and chooses Pages: it says the pages are coming, how much has come, then shows
//      them; the file it keeps is the laptop's, byte for byte
//   3. a book whose file could not leave the laptop yet: the phone's Pages says where the pages are, not nothing
//   4. deleted on the laptop: its file leaves the folder too
import { chromium } from 'playwright-core'
import { rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

const HOME = 'http://localhost:5180/'
const BOOK = process.env.BOOK || 'C:/Users/tharu/AppData/Local/Temp/rocketfull.pdf' // 7.5 MB: two pieces of 4 MB
const SMALL = process.env.SMALL || 'C:/Users/tharu/AppData/Local/Temp/paper.pdf'
const SIZE = readFileSync(BOOK).length
const sleep = ms => new Promise(r => setTimeout(r, ms))
const who = `pages${Date.now().toString(36)}`
const failures = []
const check = (what, ok, detail = '') => { console.log(`${ok ? '  ✔' : '  ✖'} ${what}${detail ? ` — ${detail}` : ''}`); if (!ok) failures.push(what) }

async function device(name, keepProfile = false) {
  const profile = `${tmpdir()}/noesis-pages-${name}`
  if (!keepProfile) rmSync(profile, { recursive: true, force: true })
  const ctx = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true, viewport: { width: 412, height: 860 } })
  const page = ctx.pages()[0] || await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(String(e).slice(0, 160)))
  const sent = [] // every piece of a resumable upload, from the moment the browser opens
  page.on('request', r => { if (/\/upload\/session\//.test(r.url())) sent.push(r.headers()['content-range']) })
  await page.addInitScript(() => { try { localStorage.setItem('noesis.install.dismissed', String(Date.now())) } catch { /* no storage */ } })
  try { await page.goto(HOME); await page.waitForLoadState(keepProfile ? 'load' : 'networkidle'); await sleep(keepProfile ? 2500 : 800) } catch (e) { await ctx.close(); throw e } // opened again it may be busy sending at once: never idle
  const lib = expr => page.evaluate(async expr => {
    const at = path => performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes(path)) || path
    const m = { library: await import(at('/src/lib/library.js')), sync: await import(at('/src/lib/sync.js')), db: await import(at('/src/lib/db.js')), nav: await import(at('/src/lib/nav.js')), settings: await import(at('/src/lib/settings.js')) }
    return eval(expr)
  }, expr)
  const until = async (what, test, ms = 60000) => { const t0 = Date.now(); for (;;) { const v = await test().catch(() => null); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`${name}: timed out waiting for ${what}`); await sleep(400) } }
  return { name, ctx, page, errors, lib, until, profile, sent }
}
// what the folder holds, as the app itself would ask for it
const folder = d => d.page.evaluate(async () => {
  const pass = await (await fetch('/api/auth/token', { method: 'POST' })).json()
  return (await (await fetch(`${pass.api}/drive/v3/files`, { headers: { authorization: `Bearer ${pass.access_token}` } })).json()).files.map(f => f.name)
})
async function addPdf(d, path) {
  const before = await d.lib('m.library.library.get().docs.map(x => x.id)')
  await d.lib("m.nav.openSheet('add')"); await sleep(900) // the way in differs (the welcome page, the library's bar): the sheet is the same
  await d.page.locator('input[type=file]').first().setInputFiles(path); await sleep(600)
  await d.page.getByRole('button', { name: /^Add to library$/ }).first().click()
  return d.until('the PDF to be read', () => d.lib(`m.library.library.get().docs.find(x => x.kind === 'pdf' && x.total > 0 && !${JSON.stringify(before)}.includes(x.id))?.id`), 120000) // the one that was not there before
}

let a = await device('laptop')
let b = null
try {
  console.log(`account "${who}", book ${(SIZE / 1048576).toFixed(1)} MB`)
  await a.lib(`m.sync.devSignIn(${JSON.stringify(who)})`)
  await a.until('the laptop to finish its first round', () => a.lib("m.sync.syncState.get().last > 0"))

  // 1. closed half-way through sending the file
  // the second piece is held on the line, never answered: the laptop is closed while it is genuinely half-way
  let firstPiece = null, pieces = 0
  let half
  const held = new Promise(ok => { half = ok })
  a.page.on('response', r => { if (/\/upload\/session\//.test(r.url()) && r.status() === 308 && !firstPiece) firstPiece = r.headers().range })
  await a.page.route('**/upload/session/**', route => { if (pieces++ === 0) return route.continue(); half() }) // the rest hang
  const id = await addPdf(a, BOOK)
  await a.lib('m.sync.flushNow()')
  await Promise.race([held, sleep(90000)])
  check('the laptop starts sending the book\'s file to the folder, in pieces', !!firstPiece, `Drive has ${firstPiece}`)
  await a.ctx.close() // the laptop's lid closes half-way
  check('closed half-way: the folder does not hold the file yet', !(await (async () => { const t = await device('peek'); try { await t.lib(`m.sync.devSignIn(${JSON.stringify(who)})`); return (await folder(t)).includes(`file:${id}`) } finally { await t.ctx.close(); rmSync(t.profile, { recursive: true, force: true }) } })()))

  a = await device('laptop', true) // opened again: the same browser, still signed in
  const sent = a.sent
  await a.until('the file to reach the folder', async () => { await a.lib('m.sync.flushNow()'); return (await folder(a)).includes(`file:${id}`) }, 120000)
  check('opened again, it carries on: it asks Drive where it got to, then sends only the rest', sent[0] === `bytes */${SIZE}` && sent.slice(1).every(r => !r.startsWith('bytes 0-')), sent.join(' · '))

  // 2. the phone: Pages for a book it did not add
  b = await device('phone')
  await b.lib(`m.sync.devSignIn(${JSON.stringify(who)})`)
  await b.until('the book to reach the phone', () => b.lib(`!!m.library.getDoc(${JSON.stringify(id)})?.total`))
  check('the phone does not hold the file before it is wanted', !(await b.lib(`m.db.db.getSource(${JSON.stringify(id)}).then(s => !!s?.blob)`)))
  const cdpB = await b.ctx.newCDPSession(b.page)
  await cdpB.send('Network.enable')
  await cdpB.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: 2 * 1048576, uploadThroughput: -1 }) // a phone's line: it takes a few seconds
  await b.lib(`(m.settings.settings.set({ readerView: 'pages' }), m.nav.go('reader', ${JSON.stringify(id)}))`)
  const said = new Set()
  const shown = await b.until('the pages to show on the phone', async () => {
    const t = await b.page.evaluate(() => document.body.innerText)
    if (t.includes(' MB of ') && !said.has(' MB of ')) await b.page.screenshot({ path: '.qa-out/pages-phone-coming.png' })
    for (const w of ['Getting the pages from your Google Drive', ' MB of ']) if (t.includes(w)) said.add(w)
    return /Page \d+ of \d+/.test(t) && t.match(/Page \d+ of \d+/)[0]
  }, 120000)
  const options = await b.page.evaluate(() => [...document.querySelectorAll('button')].map(x => x.innerText.trim()).filter(t => /^(Text|Pages|Focus)$/.test(t)))
  check('the phone offers Pages for a book added on the laptop', options.includes('Pages'), options.join(' · '))
  check('while they come, it says so and how much has come', said.size === 2, [...said].join(' | ') || 'nothing said')
  check('then it shows the pages', !!shown, shown)
  await b.page.screenshot({ path: '.qa-out/pages-phone.png' })
  const kept = await b.lib(`m.db.db.getSource(${JSON.stringify(id)}).then(async s => { const x = new Uint8Array(await s.blob.arrayBuffer()); let h = 0; for (let i = 0; i < x.length; i += 997) h = (h * 31 + x[i]) >>> 0; return x.length + ':' + h })`)
  const mine = (() => { const x = readFileSync(BOOK); let h = 0; for (let i = 0; i < x.length; i += 997) h = (h * 31 + x[i]) >>> 0; return x.length + ':' + h })()
  check('the file the phone keeps is the laptop\'s, byte for byte', kept === mine, `${kept} against ${mine}`)

  // 3. a book whose file could not leave the laptop yet
  await a.page.route('**/upload/drive/v3/files?uploadType=resumable*', r => r.abort())
  const small = await addPdf(a, SMALL)
  await a.lib('m.sync.flushNow()')
  await b.until('the second book to reach the phone', async () => { await b.lib('m.sync.flushNow()'); return b.lib(`!!m.library.getDoc(${JSON.stringify(small)})?.total`) })
  await b.lib(`m.nav.go('reader', ${JSON.stringify(small)})`)
  const why = await b.until('the phone to say where those pages are', () => b.page.evaluate(() => /still on the device this was added on/.test(document.body.innerText) && 'said'), 30000)
  check('pages that cannot come yet: the phone says where they are, it does not hide Pages', why === 'said')
  await b.page.screenshot({ path: '.qa-out/pages-phone-notyet.png' })

  // 4. deleted on the laptop: its file leaves the folder
  await a.lib(`m.library.deleteDoc(${JSON.stringify(id)})`)
  await a.lib('m.sync.flushNow()'); await sleep(1500); await a.lib('m.sync.flushNow()')
  const left = await a.until('the file to leave the folder', async () => !(await folder(a)).includes(`file:${id}`) && 'gone', 30000).catch(() => null)
  check('a deleted book leaves no file behind in the customer\'s Drive', left === 'gone')

  check('no errors on either device', !a.errors.length && !b.errors.length, [...a.errors, ...b.errors].join(' | '))
} catch (e) {
  failures.push(String(e.message || e)); console.log('  ✖', e.message || e)
  await a.page.screenshot({ path: '.qa-out/pages-fail-laptop.png' }).catch(() => {})
  if (b) { await b.page.screenshot({ path: '.qa-out/pages-fail-phone.png' }).catch(() => {}); console.log('   phone shows:', (await b.page.evaluate(() => document.body.innerText.slice(0, 400)).catch(() => '?')).replace(/\s+/g, ' ')) }
  console.log('   laptop shows:', (await a.page.evaluate(() => document.body.innerText.slice(0, 300)).catch(() => '?')).replace(/\s+/g, ' '))
} finally {
  await a.ctx.close().catch(() => {}); await b?.ctx.close().catch(() => {})
  for (const n of ['laptop', 'phone', 'peek']) rmSync(`${tmpdir()}/noesis-pages-${n}`, { recursive: true, force: true })
}
console.log(failures.length ? `\n${failures.length} failed` : '\nPAGES ON EVERY DEVICE')
process.exit(failures.length ? 1 : 0)
