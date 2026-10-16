// The customer's own keys follow them; a device without the key never stores a book as silence.
// Tharun, 16 October 2026: on Edge (his key was only in Chrome) a book in an NVIDIA voice raced by stored as silent
// sentences, and every time on screen read 0:00; "a user has to carry the API key everywhere: absurd".
//
//   node e2e/keys-follow.mjs          (a freshly started dev server on port 5180 with DEV_LOGIN=1)
//
//   1. device B, a book in an NVIDIA voice and no key: nothing is stored as silent, and the reader says why
//   2. device A has the key; both sign in to one account: the key reaches B by itself
//   3. B never had a key: its empty one does not wipe A's
//   4. a sentence stored silent the old way is made again when its book opens
// The key is a made-up test value in NVIDIA's format, not a real one.
import { chromium } from 'playwright-core'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const HOME = 'http://localhost:5180/'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const who = `keys${Date.now().toString(36)}`
const KEY = 'nvapi-' + Array.from({ length: 64 }, (_, k) => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[(k * 37 + 11) % 62]).join('')
const JASON = 'nv:Magpie-Multilingual.EN-US.Jason'
const failures = []
const check = (what, ok, detail = '') => { console.log(`${ok ? '  ✔' : '  ✖'} ${what}${detail ? ` — ${detail}` : ''}`); if (!ok) failures.push(what) }

async function device(name) {
  const profile = `${tmpdir()}/noesis-keys-${name}`
  rmSync(profile, { recursive: true, force: true })
  const ctx = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true, viewport: { width: 1280, height: 800 } })
  const page = ctx.pages()[0] || await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(String(e).slice(0, 160)))
  await page.addInitScript(() => { try { localStorage.setItem('noesis.install.dismissed', String(Date.now())) } catch { /* none */ } })
  await page.goto(HOME); await page.waitForLoadState('networkidle'); await sleep(800)
  const lib = expr => page.evaluate(async expr => {
    const at = path => performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes(path)) || path
    const m = { library: await import(at('/src/lib/library.js')), sync: await import(at('/src/lib/sync.js')), settings: await import(at('/src/lib/settings.js')), db: await import(at('/src/lib/db.js')), nav: await import(at('/src/lib/nav.js')) }
    return eval(expr)
  }, expr)
  const until = async (what, test, ms = 30000) => { const t0 = Date.now(); for (;;) { const v = await test().catch(() => null); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`${name}: timed out waiting for ${what}`); await sleep(300) } }
  return { name, ctx, page, errors, lib, until, profile }
}
const addText = (d, title, n) => d.lib(`m.library.addDocument({ kind: 'text', name: ${JSON.stringify(title)}, title: ${JSON.stringify(title)}, text: ${JSON.stringify(`# ${title}\n\n` + Array.from({ length: n }, (_, k) => `Sentence ${k + 1} of the book is here to be spoken.`).join(' '))} })`)

const a = await device('a')
const b = await device('b')
try {
  // 1. B: a book in an NVIDIA voice, and no key on this device
  await b.lib(`m.settings.settings.set({ voice: ${JSON.stringify(JASON)} })`) // as a book arrives from the other browser: in its voice already
  const book = await addText(b, 'Keyless book', 30)
  await b.until('the book to be read', () => b.lib(`m.library.getDoc(${JSON.stringify(book)})?.total > 0`))
  await b.lib(`(m.library.patch(${JSON.stringify(book)}, { voice: ${JSON.stringify(JASON)}, status: 'voicing' }), m.library.kickVoice())`)
  await sleep(6000)
  const silent = await b.lib(`m.db.db.getAudios(${JSON.stringify(book)}, 0, 31).then(rs => rs.filter(r => r && r.codec === 'none').length)`)
  check('no key on this device: no sentence is stored as silence', silent === 0, `${silent} silent`)
  await b.lib(`m.nav.go('reader', ${JSON.stringify(book)})`); await sleep(1200)
  console.log('   B:', JSON.stringify(await b.lib(`(() => { const d = m.library.getDoc(${JSON.stringify(book)}); return { voice: d.voice, status: d.status, stage: d.stage, waits: m.library.keyWaitOf(${JSON.stringify(book)}), done: d.done } })()`)))
  const says = await b.page.evaluate(() => (document.body.innerText.match(/Your NVIDIA key is not on this device[^\n]*/) || [''])[0])
  check('the reader says why, instead of "Making the audio"', !!says, says)

  // 2. A has the key; both sign in to one account
  await a.lib(`m.settings.settings.set({ aiProvider: 'nvidia', nvidiaKey: ${JSON.stringify(KEY)}, nvidiaModel: 'test/model', readSize: 23, readFont: 'sans', ambientMode: 'calm' })`)
  await a.lib(`m.sync.devSignIn(${JSON.stringify(who)})`)
  await a.until('A to finish a round', () => a.lib("m.sync.syncState.get().last > 0"))
  await b.lib(`m.sync.devSignIn(${JSON.stringify(who)})`)
  const got = await b.until('the key to reach B', async () => { await a.lib('m.sync.flush()'); await b.lib('m.sync.flush()'); return b.lib(`m.settings.settings.get().nvidiaKey === ${JSON.stringify(KEY)} && 'here'`) }, 40000).catch(() => null)
  check('the key reaches the other device by itself', got === 'here')
  check('with it, the AI service and model', await b.lib("m.settings.settings.get().aiProvider === 'nvidia' && m.settings.settings.get().nvidiaModel === 'test/model'"))
  check('and how the reader looks and sounds', await b.lib("(s => s.readSize === 23 && s.readFont === 'sans' && s.ambientMode === 'calm')(m.settings.settings.get())"))
  // it tries again at once (the dev server has no NVIDIA relay, so its answer then is "not available": not the key)
  await sleep(3000)
  const now = await b.lib(`m.library.keyWaitOf(${JSON.stringify(book)}) || 'nothing'`)
  check('the book stops waiting for a key once it is here, and tries again', !/key is not on this device/.test(now), `now: ${now}`)

  // 3. B never had a key of its own: A's is not wiped by it
  for (let k = 0; k < 3; k++) { await a.lib('m.sync.flush()'); await b.lib('m.sync.flush()'); await sleep(600) }
  check('a device that never had the key does not wipe it on the other', await a.lib(`m.settings.settings.get().nvidiaKey === ${JSON.stringify(KEY)}`))

  // 4. a sentence stored silent the old way is made again when the book opens
  const healBook = await addText(a, 'Healing book', 6)
  await a.until('the second book to be read', () => a.lib(`m.library.getDoc(${JSON.stringify(healBook)})?.total > 0`))
  await a.lib(`m.db.db.putAudio(${JSON.stringify(healBook)}, 2, { codec: 'none', dur: 0, tail: 0 })`)
  await a.page.reload(); await a.page.waitForLoadState('networkidle'); await sleep(1500)
  const before = await a.lib(`m.db.db.getAudio(${JSON.stringify(healBook)}, 2).then(r => r ? r.codec : 'none stored')`)
  await a.lib(`m.library.ensureFresh(${JSON.stringify(healBook)})`); await sleep(1500)
  const after = await a.lib(`m.db.db.getAudio(${JSON.stringify(healBook)}, 2).then(r => r ? (r.codec === 'none' ? (r.why ? 'kept: the voice would not say it' : 'still silent') : 'made again') : 'removed, to be made again')`)
  check('a sentence stored silent the old way is made again', /removed|made again/.test(after), `${before} → ${after}`)

  check('no errors on either device', !a.errors.length && !b.errors.length, [...a.errors, ...b.errors].join(' | '))
} catch (e) {
  failures.push(String(e.message || e)); console.log('  ✖', e.message || e)
} finally {
  await a.ctx.close().catch(() => {}); await b.ctx.close().catch(() => {})
  for (const n of ['a', 'b']) rmSync(`${tmpdir()}/noesis-keys-${n}`, { recursive: true, force: true })
}
console.log(failures.length ? `\n${failures.length} failed` : '\nKEYS FOLLOW THE CUSTOMER')
process.exit(failures.length ? 1 : 0)
