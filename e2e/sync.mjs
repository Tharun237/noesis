// Two devices, one account: what one does, the other gets.
//
//   node e2e/sync.mjs
//
// Needs a freshly started dev server on port 5180 with DEV_LOGIN=1 in .dev.vars (sign-in by a development
// name, and server/devdrive.js standing in for Google Drive). The app runs exactly the code it runs against
// Google: only the address of "Drive" differs. Each device is a browser profile that is thrown away.
import { chromium } from 'playwright-core'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const HOME = 'http://localhost:5180/'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const who = `sync${Date.now().toString(36)}` // a new account each run: the stand-in keeps its files until the server stops
const failures = []
const check = (what, ok, detail = '') => { console.log(`${ok ? '  ✔' : '  ✖'} ${what}${detail ? ` — ${detail}` : ''}`); if (!ok) failures.push(what) }

async function device(name) {
  const profile = `${tmpdir()}/noesis-sync-${name}`
  rmSync(profile, { recursive: true, force: true })
  const ctx = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true, viewport: { width: 1280, height: 800 } })
  const page = ctx.pages()[0] || await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(String(e).slice(0, 160)))
  await page.addInitScript(() => { try { localStorage.setItem('noesis.install.dismissed', String(Date.now())) } catch { /* no storage */ } })
  await page.goto(HOME); await page.waitForLoadState('networkidle'); await sleep(800)
  const lib = expr => page.evaluate(async expr => {
    const at = path => performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes(path)) || path
    const m = { library: await import(at('/src/lib/library.js')), sync: await import(at('/src/lib/sync.js')) }
    return eval(expr)
  }, expr)
  const titles = () => lib('m.library.library.get().docs.map(d => d.title).sort()')
  const until = async (what, test, ms = 20000) => { const t0 = Date.now(); for (;;) { const v = await test(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`${name}: timed out waiting for ${what}`); await sleep(300) } }
  return { name, ctx, page, errors, lib, titles, until, sync: () => lib('m.sync.flush()') }
}
const addText = (d, title, body) => d.lib(`m.library.addDocument({ kind: 'text', name: ${JSON.stringify(title)}, title: ${JSON.stringify(title)}, text: ${JSON.stringify(`# ${title}\n\n${body}`)} })`)

const a = await device('a')
const b = await device('b')
try {
  console.log(`account "${who}"`)
  // device A has a document before it signs in; signing in sends it
  const first = await addText(a, 'River notes', 'The river ran past the mill. It ran on toward the sea. People measured their days by its sound.')
  await a.until('the document to be prepared', () => a.lib(`m.library.library.get().docs.find(d => d.id === ${JSON.stringify(first)})?.total > 0`))
  await a.lib(`m.sync.devSignIn(${JSON.stringify(who)})`)
  await a.until('device A to finish its first round', () => a.lib("m.sync.syncState.get().status === 'idle' && m.sync.syncState.get().last > 0"))
  check('device A signs in and sends its library', (await a.lib('m.sync.syncState.get().error')) == null, await a.lib('m.sync.account.get().user.name'))

  // device B signs in to the same account and gets it, text and all
  await b.lib(`m.sync.devSignIn(${JSON.stringify(who)})`)
  await b.until('the document to appear on device B', async () => (await b.titles()).includes('River notes'))
  const text = await b.until('its text to arrive on device B', () => b.lib(`m.library.loadDoc(${JSON.stringify(first)}).then(c => c?.segs?.length ? c.segs.map(s => s.t).join(' ') : null)`))
  check('device B gets the document and its text', /river ran past the mill/.test(text), `${text.length} characters`)

  // where A stopped is where B is
  await a.lib(`(m.library.patch(${JSON.stringify(first)}, { pos: 2, lastPlayed: Date.now() }), m.sync.flushNow())`)
  await sleep(1500); await b.sync()
  const pos = await b.until('the place to reach device B', async () => { await b.sync(); return b.lib(`m.library.getDoc(${JSON.stringify(first)})?.pos === 2`) })
  check('the place A stopped at reaches B', pos === true)

  // a document added on B reaches A
  const second = await addText(b, 'Second device', 'Written on the second device. It should appear on the first.')
  await b.until('the second document to be prepared', () => b.lib(`m.library.library.get().docs.find(d => d.id === ${JSON.stringify(second)})?.total > 0`))
  await b.sync(); await sleep(500)
  await a.until('the second document to reach device A', async () => { await a.sync(); return (await a.titles()).includes('Second device') })
  check('a document added on B reaches A', true, (await a.titles()).join(', '))

  // deleted on A: gone on B, and nothing of it left in the folder
  await a.lib(`m.library.deleteDoc(${JSON.stringify(first)})`)
  await a.sync(); await sleep(500)
  await b.until('the deletion to reach device B', async () => { await b.sync(); return !(await b.titles()).includes('River notes') })
  const left = await a.page.evaluate(async id => {
    const pass = await (await fetch('/api/auth/token', { method: 'POST' })).json()
    const files = (await (await fetch(`${pass.api}/drive/v3/files`, { headers: { authorization: `Bearer ${pass.access_token}` } })).json()).files
    return files.filter(f => f.name.startsWith(`doc:${id}:`)).length
  }, first)
  check('a deletion on A reaches B, and its text is taken out of the folder', left === 0, `${left} parts of it left`)

  // the folder emptied behind a device's back (the customer chose "Delete hidden app data" in Drive): the next
  // round puts the library back instead of failing on files that are no longer there
  const emptied = await a.page.evaluate(async () => {
    const pass = await (await fetch('/api/auth/token', { method: 'POST' })).json()
    const head = { authorization: `Bearer ${pass.access_token}` }
    const files = (await (await fetch(`${pass.api}/drive/v3/files`, { headers: head })).json()).files
    for (const f of files) await fetch(`${pass.api}/drive/v3/files/${f.id}`, { method: 'DELETE', headers: head })
    return files.length
  })
  await a.lib(`(m.library.patch(${JSON.stringify(second)}, { pos: 1, lastPlayed: Date.now() }), 0)`)
  await a.sync(); await sleep(400); await a.sync()
  const back = await a.page.evaluate(async () => {
    const pass = await (await fetch('/api/auth/token', { method: 'POST' })).json()
    return (await (await fetch(`${pass.api}/drive/v3/files`, { headers: { authorization: `Bearer ${pass.access_token}` } })).json()).files.map(f => f.name.split(':')[0])
  })
  check('an emptied folder is filled again on the next round', emptied > 0 && back.includes('meta') && back.includes('pos') && back.includes('doc') && (await a.lib('m.sync.syncState.get().error')) == null, `${emptied} files removed, ${back.length} back`)

  const had = await b.titles()
  await b.lib('(m.sync.signOut(), 0)') // the page starts again on an empty shelf
  await b.page.getByRole('heading', { name: /Listen to\s*anything/ }).waitFor({ timeout: 15000 })
  const after = await b.page.evaluate(async () => ({ me: (await (await fetch('/api/auth/me')).json()).user, pass: (await fetch('/api/auth/token', { method: 'POST' })).status }))
  check('signing out ends the session and opens a fresh, empty app (the welcome page)', after.me === null && after.pass === 401 && (await b.titles()).length === 0, `had ${had.length} documents`)
  await addText(b, 'Added while signed out', 'This belongs to nobody yet.')
  await b.lib(`(m.sync.devSignIn(${JSON.stringify(who)}).catch(() => {}), 0)`) // the page starts again on the account's shelf
  const again = await b.until('the library to be back', async () => { const t = await b.titles().catch(() => []); return had.every(x => t.includes(x)) && t })
  await sleep(800)
  check('signing in again brings the library back, without what was added while signed out', had.every(t => again.includes(t)) && !again.includes('Added while signed out'), again.join(', '))
  const audioKept = await b.page.evaluate(async () => (await indexedDB.databases()).map(d => d.name).filter(n => n.startsWith('noesis-audio')).length)
  check('each library has its own storage on the device', audioKept === 2, `${audioKept} audio stores`)
  // A document is told to the other device only when its text exists: B must never hold one it cannot get.
  // (It used to appear at once and stand there as "waiting for your other device" until A had finished: for
  // ever, if A was closed or the file failed.)
  // (a) one that can never be prepared (a link that cannot be fetched): it must not appear on B at all
  const bad = await a.lib(`m.library.addDocument({ kind: 'url', url: 'http://localhost:5180/there-is-no-such-page-${who}', title: 'A link that fails' })`)
  await a.until('the bad link to fail on device A', () => a.lib(`m.library.getDoc(${JSON.stringify(bad)})?.status === 'error'`), 60000)
  // renaming it is a change to its record: that is what used to send it out, text or no text
  await a.lib(`(m.library.patch(${JSON.stringify(bad)}, { title: 'A link that fails, renamed', renamed: true }), 0)`)
  await sleep(2500); await a.sync(); await b.sync(); await sleep(800); await b.sync()
  check('a document that could not be read is not shown on the other device', !(await b.lib(`!!m.library.getDoc(${JSON.stringify(bad)})`)), await a.lib(`m.library.getDoc(${JSON.stringify(bad)})?.error || 'failed'`))
  // (b) one that is prepared arrives whole, and nothing on B is left waiting
  const big = Array.from({ length: 800 }, (_, k) => `Sentence number ${k + 1} of a long document that takes a moment to prepare.`).join(' ')
  const slow = await addText(a, 'A long one', big)
  await a.until('the long document to be prepared', () => a.lib(`m.library.getDoc(${JSON.stringify(slow)})?.total > 0`), 60000)
  await sleep(2500); await a.sync()
  await b.until('the long document to reach device B with its text', async () => { await b.sync(); return b.lib(`m.library.loadDoc(${JSON.stringify(slow)}).then(c => c?.segs?.length > 100)`) }, 60000)
  const stuck = await b.lib("m.library.library.get().docs.filter(d => d.status === 'syncing' && !d.contentVer).length")
  check('once prepared it arrives, text and all, and nothing is left waiting', stuck === 0, `${stuck} waiting`)
  check('no errors were thrown on either device', a.errors.length + b.errors.length === 0, [...a.errors, ...b.errors].join(' | '))
} catch (e) {
  check(String(e.message).split('\n')[0], false)
} finally {
  await a.ctx.close(); await b.ctx.close()
}
console.log(failures.length ? `\n${failures.length} failed` : '\nsync works between two devices')
process.exit(failures.length ? 1 : 0)
