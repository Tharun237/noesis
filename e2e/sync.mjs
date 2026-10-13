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
    const m = { library: await import(at('/src/lib/library.js')), sync: await import(at('/src/lib/sync.js')), player: await import(at('/src/lib/player.js')), settings: await import(at('/src/lib/settings.js')), db: await import(at('/src/lib/db.js')) }
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

  // (c) A device that has lost its place. An older version moved its mark in the folder's list of changes past
  // records it then failed to take, and never looked at them again: Tharun's phone showed 7 of his 21 books for
  // good, however often it synced. Here B's mark is moved past a document it has not taken, as that version
  // left it; opened again, B must still get the document.
  const missed = await addText(a, 'The one that was passed over', 'It was sent while the other device was not looking. It is still in the folder.')
  await a.until('that document to be prepared', () => a.lib(`m.library.getDoc(${JSON.stringify(missed)})?.total > 0`))
  await sleep(2500); await a.sync()
  await b.page.evaluate(async () => {
    const at = path => performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes(path)) || path
    const drive = await import(at('/src/lib/drive.js'))
    const ahead = await drive.startToken() // the folder's newest mark: everything A just sent lies before it
    for (const { name } of (await indexedDB.databases()).filter(d => d.name.startsWith('noesis-sync'))) {
      await new Promise(done => {
        const open = indexedDB.open(name)
        open.onsuccess = () => {
          const store = open.result.transaction('sync', 'readwrite').objectStore('sync')
          const got = store.get('state')
          got.onsuccess = () => { if (got.result?.uid) store.put({ ...got.result, cursor: ahead }, 'state'); store.transaction.oncomplete = done }
        }
      })
    }
  })
  await b.page.reload(); await b.page.waitForLoadState('domcontentloaded'); await sleep(2000)
  const found = await b.until('the passed-over document to appear on device B', async () => (await b.titles()).includes('The one that was passed over'), 25000).then(() => true, () => false)
  check('a device that had lost its place still gets what it missed, when it is opened again', found)

  // (d) The place of a book is where it was last LISTENED to, or moved to by hand. A device that only opens the
  // book has not moved it. (It used to write its own, older place as the newest: Tharun's phone opened a book
  // at the start before the laptop's place had reached it, and the place was then lost on both.)
  await b.until('the long document to be whole on device B', () => b.lib(`m.library.getDoc(${JSON.stringify(slow)})?.total > 100`))
  await a.lib(`m.player.open(${JSON.stringify(slow)}, { autoplay: false }).then(() => m.player.seekTo(40))`)
  await sleep(1800); await a.lib('m.sync.flushNow()'); await sleep(1500)
  const stale = await b.lib(`m.library.getDoc(${JSON.stringify(slow)}).pos`) // B has not looked yet: it still has the old place
  await b.lib(`m.player.open(${JSON.stringify(slow)}, { autoplay: false })`)
  await sleep(1800) // the time after which a place is written
  await b.sync(); await sleep(1200); await b.sync(); await a.sync(); await sleep(800); await a.sync()
  const places = { a: await a.lib(`m.library.getDoc(${JSON.stringify(slow)}).pos`), b: await b.lib(`m.library.getDoc(${JSON.stringify(slow)}).pos`), bPlayer: await b.lib('m.player.player.get().i') }
  check('opening a book does not claim its place: the place listened to on A is the place on both', places.a === 40 && places.b === 40 && places.bPlayer === 40, `A ${places.a}, B ${places.b}, B's player ${places.bPlayer} (B had ${stale} when it opened the book)`)

  // (e) A bookmark made on one device, and the note written on it, is on the other.
  await b.lib(`(m.library.toggleMark(${JSON.stringify(slow)}, 55), m.library.setMarkNote(${JSON.stringify(slow)}, 55, 'come back to this'))`)
  await sleep(2000); await b.sync()
  const mark = await a.until('the bookmark to reach device A', async () => { await a.sync(); return a.lib(`m.library.getDoc(${JSON.stringify(slow)}).marks.find(x => x.i === 55)?.note`) }).catch(() => null)
  check('a bookmark and its note made on B are on A', mark === 'come back to this', String(mark))
  await a.lib(`m.library.toggleMark(${JSON.stringify(slow)}, 55)`)
  await sleep(2000); await a.sync()
  const gone = await b.until('the bookmark to be removed on device B', async () => { await b.sync(); return b.lib(`m.library.getDoc(${JSON.stringify(slow)}).marks.length === 0`) }).catch(() => false)
  check('removed on A, it is removed on B', gone === true)

  // (g) A bookmark made on each device before either has heard of the other's: both are kept on both.
  await a.lib(`m.library.toggleMark(${JSON.stringify(slow)}, 10)`)
  await b.lib(`m.library.toggleMark(${JSON.stringify(slow)}, 20)`)
  await sleep(2000); await a.sync(); await b.sync(); await sleep(1800); await a.sync(); await sleep(1800); await b.sync(); await a.sync()
  const both = { a: await a.lib(`m.library.getDoc(${JSON.stringify(slow)}).marks.map(x => x.i)`), b: await b.lib(`m.library.getDoc(${JSON.stringify(slow)}).marks.map(x => x.i)`) }
  check('a bookmark made on each device at the same time: both are on both', String(both.a) === '10,20' && String(both.b) === '10,20', `A ${both.a}, B ${both.b}`)

  // (h) What the customer sets that is theirs follows them: how fast they listen.
  await a.lib('m.settings.settings.set({ speed: 1.5, sort: "title" })')
  await sleep(2000); await a.sync()
  const set = await b.until('the setting to reach device B', async () => { await b.sync(); const s = await b.lib('m.settings.settings.get()'); return s.speed === 1.5 && s.sort === 'title' ? s : null }).catch(() => null)
  check('the listening speed and the sort order set on A are set on B', !!set, set ? `speed ${set.speed}, sort ${set.sort}` : 'not arrived')

  // (i) The text of a book changes on A (it is prepared again and comes out with five more sentences at its
  // start). A place and a bookmark are sentence numbers: on BOTH devices they must end on the same words.
  const words = i => `m.library.loadDoc(${JSON.stringify(slow)}).then(c => c.segs[${i}]?.t)`
  const placeWords = await a.lib(words(40)), markWords = await a.lib(words(20))
  await a.lib(`m.db.db.getSource(${JSON.stringify(slow)}).then(src => m.db.db.putSource(${JSON.stringify(slow)}, { ...src, text: src.text.replace('\\n\\n', '\\n\\nFive. New. Sentences. Come. First. ') })).then(() => m.library.reprocess(${JSON.stringify(slow)}))`)
  await a.until('the changed text to be prepared on A', () => a.lib(`m.library.getDoc(${JSON.stringify(slow)}).total > 800 && ['voicing', 'ready'].includes(m.library.getDoc(${JSON.stringify(slow)}).status)`), 60000)
  const at = async d => ({ pos: await d.lib(`m.library.getDoc(${JSON.stringify(slow)}).pos`), marks: await d.lib(`m.library.getDoc(${JSON.stringify(slow)}).marks.map(x => x.i)`), total: await d.lib(`m.library.getDoc(${JSON.stringify(slow)}).total`) })
  const onA = await at(a)
  const aWords = { place: await a.lib(words(onA.pos)), mark: await a.lib(words(onA.marks[1])) }
  await sleep(2500); await a.sync()
  await b.until('the changed text to reach device B', async () => { await b.sync(); return b.lib(`m.library.loadDoc(${JSON.stringify(slow)}).then(c => c?.segs?.length === ${onA.total})`) }, 60000)
  await sleep(1500); await b.sync(); await sleep(1000)
  const onB = await at(b)
  const bState = await b.lib(`(d => ({ contentVer: d.contentVer, textVer: d.textVer, posVer: d.posVer, marksVer: d.marksVer, status: d.status }))(m.library.getDoc(${JSON.stringify(slow)}))`)
  const bWords = { place: await b.lib(words(onB.pos)), mark: await b.lib(words(onB.marks[1])) }
  check('a text prepared again on A: the place is on the same words on A', aWords.place === placeWords && onA.pos !== 40, `sentence 40 → ${onA.pos}`)
  check('and on B, which only received the new text', bWords.place === placeWords, `B at ${onB.pos}: "${String(bWords.place).slice(0, 40)}" ${JSON.stringify(bState)}`)
  check('the bookmarks are on the same words on both', aWords.mark === markWords && bWords.mark === markWords && onB.marks.length === 2, `A ${onA.marks}, B ${onB.marks}`)

  // (f) A finished book that is only opened stays finished. (Opening it marked it unfinished, at the start, on
  // every device: looking at a book is not beginning it again.)
  await a.lib(`m.library.patch(${JSON.stringify(slow)}, { finished: true, pos: 0, posF: 0 })`)
  await sleep(2000); await a.sync()
  await b.until('the finished book to be finished on device B', async () => { await b.sync(); return b.lib(`m.library.getDoc(${JSON.stringify(slow)}).finished === true`) })
  await b.lib(`m.player.open(${JSON.stringify(first)}, { autoplay: false }).catch(() => {})`) // another book in the player first, so the next is a fresh opening
  await b.lib(`m.player.open(${JSON.stringify(slow)}, { autoplay: false })`)
  await sleep(2000); await b.sync(); await sleep(1000); await a.sync(); await sleep(800); await a.sync()
  const fin = { a: await a.lib(`m.library.getDoc(${JSON.stringify(slow)}).finished`), b: await b.lib(`m.library.getDoc(${JSON.stringify(slow)}).finished`) }
  check('a finished book that is only opened stays finished, on both devices', fin.a === true && fin.b === true, `A ${fin.a}, B ${fin.b}`)
  check('no errors were thrown on either device', a.errors.length + b.errors.length === 0, [...a.errors, ...b.errors].join(' | '))
} catch (e) {
  check(String(e.message).split('\n')[0], false)
} finally {
  await a.ctx.close(); await b.ctx.close()
}
console.log(failures.length ? `\n${failures.length} failed` : '\nsync works between two devices')
process.exit(failures.length ? 1 : 0)
