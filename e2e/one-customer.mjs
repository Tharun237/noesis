// One customer, three devices, one account: whatever they did on one is true on every other. Written after
// Tharun found, on a new install on his phone, settings forgotten, his key missing, listening he never did and
// times of 0:00 (16 October 2026): each part had been checked alone, never the person moving between devices.
//
//   node e2e/one-customer.mjs          (a freshly started dev server on port 5180 with DEV_LOGIN=1)
//
// The laptop sets things up and listens; the phone signs in for the first time; a brand-new browser signs in;
// the phone changes something; the phone signs out and in again. After each step, every device is compared.
import { chromium } from 'playwright-core'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const HOME = 'http://localhost:5180/'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const who = `one${Date.now().toString(36)}`
const KEY = 'nvapi-' + Array.from({ length: 64 }, (_, k) => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[(k * 29 + 5) % 62]).join('')
const failures = []
const check = (what, ok, detail = '') => { console.log(`${ok ? '  ✔' : '  ✖'} ${what}${detail ? ` — ${detail}` : ''}`); if (!ok) failures.push(what) }

async function device(name, phone = false) {
  const profile = `${tmpdir()}/noesis-one-${name}`
  rmSync(profile, { recursive: true, force: true })
  const ctx = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true, viewport: phone ? { width: 412, height: 860 } : { width: 1280, height: 800 }, ...(phone ? { isMobile: true, hasTouch: true } : {}) })
  const page = ctx.pages()[0] || await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(String(e).slice(0, 160)))
  await page.addInitScript(() => { try { localStorage.setItem('noesis.install.dismissed', String(Date.now())) } catch { /* none */ } })
  await page.goto(HOME); await page.waitForLoadState('networkidle'); await sleep(800)
  const lib = expr => page.evaluate(async expr => {
    const at = path => performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes(path)) || path
    const m = { library: await import(at('/src/lib/library.js')), sync: await import(at('/src/lib/sync.js')), settings: await import(at('/src/lib/settings.js')), history: await import(at('/src/lib/history.js')), listening: await import(at('/src/lib/listening.js')) }
    return eval(expr)
  }, expr)
  const until = async (what, test, ms = 40000) => { const t0 = Date.now(); for (;;) { const v = await test().catch(() => null); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(400) } }
  return { name, ctx, page, errors, lib, until, profile }
}
// what a customer sees and has chosen, on one device
const CHOSEN = ['speed', 'listenGoal', 'voice', 'voiceTone', 'sort', 'readSize', 'readFont', 'readerView', 'ambientMode', 'aiProvider', 'nvidiaKey', 'nvidiaModel']
const state = d => d.lib(`(async () => {
  const s = m.settings.settings.get()
  const docs = m.library.library.get().docs.filter(x => !x.deleted)
  const log = m.history.history?.get ? m.history.history.get() : null
  return {
    settings: Object.fromEntries(${JSON.stringify(CHOSEN)}.map(k => [k, s[k]])),
    books: docs.map(x => x.title).sort().join(' | '),
    places: Object.fromEntries(docs.map(x => [x.title, x.pos || 0])),
  }
})()`)
const same = (label, a, b) => {
  for (const k of Object.keys(a.settings)) if (JSON.stringify(a.settings[k]) !== JSON.stringify(b.settings[k])) return `${label}: ${k} is ${JSON.stringify(a.settings[k])} on one, ${JSON.stringify(b.settings[k])} on the other`
  if (a.books !== b.books) return `${label}: books differ (${a.books} / ${b.books})`
  for (const t of Object.keys(a.places)) if (a.places[t] !== b.places[t]) return `${label}: the place in "${t}" is ${a.places[t]} on one, ${b.places[t]} on the other`
  return null
}
const settle = async (...ds) => { for (let k = 0; k < 4; k++) { for (const d of ds) await d.lib('m.sync.flush()').catch(() => {}); await sleep(700) } }

const laptop = await device('laptop')
const phone = await device('phone', true)
let fresh = null
try {
  console.log(`account "${who}"`)
  // 1. the laptop: their choices, their key, a book, a place in it
  await laptop.lib(`m.settings.settings.set({ speed: 1.2, listenGoal: 240, voiceTone: 'warm', sort: 'title', readSize: 22, readFont: 'sans', readerView: 'focus', ambientMode: 'calm', aiProvider: 'nvidia', nvidiaKey: ${JSON.stringify(KEY)}, nvidiaModel: 'test/model' })`)
  const book = await laptop.lib(`m.library.addDocument({ kind: 'text', name: 'The lighthouse', title: 'The lighthouse', text: '# The lighthouse\\n\\n' + Array.from({ length: 40 }, (_, k) => 'Sentence ' + (k + 1) + ' of the keeper and the storm.').join(' ') })`)
  await laptop.until('the book to be read', () => laptop.lib(`m.library.getDoc(${JSON.stringify(book)})?.total > 0`))
  await laptop.lib(`m.library.patch(${JSON.stringify(book)}, { pos: 17, lastPlayed: Date.now() })`)
  await laptop.lib(`m.sync.devSignIn(${JSON.stringify(who)})`)
  await laptop.until('the laptop to finish a round', () => laptop.lib('m.sync.syncState.get().last > 0'))
  await settle(laptop)
  const L1 = await state(laptop)

  // 2. the phone signs in for the first time
  if (process.env.WHY) await phone.lib(`(() => { window.__pos = []; let last; m.library.library.sub(() => { const d = m.library.getDoc(${JSON.stringify(book)}); const now = d ? d.pos + '/' + d.status : 'none'; if (now !== last) { last = now; window.__pos.push(now + ' @' + new Error().stack.split('\\n').slice(2, 7).map(x => x.trim().replace(/[(]http[^)]*[/]src[/]/, '(').replace(/[?]t=[0-9]+/, '')).join(' < ')) } }) })()`)
  await phone.lib(`m.sync.devSignIn(${JSON.stringify(who)})`)
  await phone.until('the book to reach the phone', () => phone.lib(`!!m.library.getDoc(${JSON.stringify(book)})`))
  await settle(laptop, phone)
  const P2 = await state(phone), L2 = await state(laptop)
  if (process.env.WHY) console.log('   phone place changes:\n     ' + (await phone.page.evaluate(() => window.__pos)).join('\n     '))
  if (process.env.WHY) console.log('   in the folder:', JSON.stringify(await laptop.page.evaluate(async id => {
    const pass = await (await fetch('/api/auth/token', { method: 'POST' })).json()
    const files = (await (await fetch(`${pass.api}/drive/v3/files`, { headers: { authorization: `Bearer ${pass.access_token}` } })).json()).files
    const f = files.find(x => x.name === 'pos:' + id)
    if (!f) return { pos: 'no record' }
    const v = await (await fetch(`${pass.api}/drive/v3/files/${f.id}?alt=media`, { headers: { authorization: `Bearer ${pass.access_token}` } })).json()
    return { record: v, at: f.appProperties?.at }
  }, book)), '| laptop pos', await laptop.lib(`m.library.getDoc(${JSON.stringify(book)}).pos`), '| phone pos', await phone.lib(`m.library.getDoc(${JSON.stringify(book)}).pos`), '| laptop vers', await laptop.lib(`(d => ({ textVer: d.textVer, contentVer: d.contentVer, posVer: d.posVer }))(m.library.getDoc(${JSON.stringify(book)}))`), '| phone vers', await phone.lib(`(d => ({ textVer: d.textVer, contentVer: d.contentVer, posVer: d.posVer, status: d.status }))(m.library.getDoc(${JSON.stringify(book)}))`))
  check('the phone, signed in for the first time, has everything the laptop has', !same('phone vs laptop', L2, P2), same('phone vs laptop', L2, P2) || '')
  check('and the laptop lost nothing to the new phone', !same('laptop before vs after', L1, L2), same('laptop before vs after', L1, L2) || '')

  // 3. a brand-new browser signs in: nothing is reset anywhere
  fresh = await device('fresh')
  await fresh.lib(`m.sync.devSignIn(${JSON.stringify(who)})`)
  await fresh.until('the book to reach the new browser', () => fresh.lib(`!!m.library.getDoc(${JSON.stringify(book)})`))
  await settle(laptop, phone, fresh)
  const L3 = await state(laptop), P3 = await state(phone), F3 = await state(fresh)
  check('a brand-new browser signing in resets nothing on the laptop', !same('laptop', L1, L3), same('laptop', L1, L3) || '')
  check('…nor on the phone', !same('phone', L1, P3), same('phone', L1, P3) || '')
  check('…and has it all itself', !same('new browser', L1, F3), same('new browser', L1, F3) || '')

  // 4. the phone changes something: everyone follows
  await phone.lib(`m.settings.settings.set({ speed: 1.5, readSize: 18 })`)
  await phone.lib(`m.library.patch(${JSON.stringify(book)}, { pos: 30, lastPlayed: Date.now() })`)
  await settle(phone, laptop, fresh); await settle(laptop, fresh)
  const P4 = await state(phone), L4 = await state(laptop), F4 = await state(fresh)
  check('a change on the phone reaches the laptop', !same('laptop', P4, L4), same('laptop', P4, L4) || '')
  check('…and the new browser', !same('new browser', P4, F4), same('new browser', P4, F4) || '')

  // 5. the phone signs out and in again: nothing is lost
  await phone.lib('m.sync.signOut()').catch(() => {}); await sleep(2500)
  await phone.page.waitForLoadState('networkidle').catch(() => {}); await sleep(800)
  await phone.lib(`m.sync.devSignIn(${JSON.stringify(who)})`).catch(() => {}); await sleep(2500)
  await phone.page.waitForLoadState('networkidle').catch(() => {}); await sleep(1000)
  await settle(phone, laptop)
  const P5 = await state(phone)
  check('signing out and in again on the phone loses nothing', !same('phone', P4, P5), same('phone', P4, P5) || '')

  check('no errors on any device', ![laptop, phone, fresh].some(d => d.errors.length), [laptop, phone, fresh].flatMap(d => d.errors).join(' | '))
} catch (e) {
  failures.push(String(e.message || e)); console.log('  ✖', e.message || e)
} finally {
  for (const d of [laptop, phone, fresh]) await d?.ctx.close().catch(() => {})
  for (const n of ['laptop', 'phone', 'fresh']) rmSync(`${tmpdir()}/noesis-one-${n}`, { recursive: true, force: true })
}
console.log(failures.length ? `\n${failures.length} failed` : '\nONE CUSTOMER, EVERY DEVICE THE SAME')
process.exit(failures.length ? 1 : 0)
