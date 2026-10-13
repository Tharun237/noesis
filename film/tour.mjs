// The app, from the inside, in under a minute: a real recording of the real app on a phone-sized screen, cut
// to the moments that matter, with one line of words for each. Nothing on the phone is drawn for the film: it
// is the app being used (a finger mark is added so a tap can be seen). What is cut out is waiting: reading the
// file, making the audio, translating. The sound is the app's own voice, taken from the page as it played.
//
//   node film/tour.mjs            rehearse (so voices and the translator are already on the "phone"), record,
//                                 then put it together: film/noesis-tour.mp4 (1080x1920) and -wide.mp4 (1920x1080)
//   node film/tour.mjs --again    put it together again from the last recording (after changing words or the frame)
//
// Needs the dev server on port 5180 and ffmpeg on the PATH. The book is film/book.html, a story written for
// this; the months of listening shown under "See how you listen" are put into the phone's storage for the film
// (nobody listened for four months to make it): everything else on screen happened as you see it.
import { chromium } from 'playwright-core'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

const HOME = 'http://localhost:5180/'
const here = name => fileURLToPath(new URL(`./${name}`, import.meta.url))
// the recording and its working files: large, and nobody's to keep (not inside the project, which is a synced folder)
const OUT = `${tmpdir().split(String.fromCharCode(92)).join('/')}/noesis-tour`
const PDF = `${OUT}/The Lighthouse Year.pdf`
const PROFILE = `${OUT}/phone`
const FRAMES = `${OUT}/frames`
const FPS = 30
const LIMIT_S = 59 // the film must be under a minute
const sleep = ms => new Promise(r => setTimeout(r, ms))
const LETTERS = '# Letters on Listening\n\nA voice is the oldest way a story has ever travelled. Before there were pages there were evenings, and someone who remembered. To be read to is to be given time by another person. The words arrive at the speed of breath, and they stay. A good reader does not hurry, and does not perform. She lets the sentence do its own work. That is all this small book has to say. The rest is listening.'

// ── the phone ────────────────────────────────────────────────────────────────────────────────────────────
async function phone(heard = null) {
  const ctx = await chromium.launchPersistentContext(PROFILE, { channel: 'chrome', headless: true, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    // the screen is recorded at the phone's real sharpness (two pixels to the point), not at half of it
    args: ['--autoplay-policy=no-user-gesture-required', '--force-device-scale-factor=2'] })
  const page = ctx.pages()[0] || await ctx.newPage()
  // What the app plays is handed out of the page as it happens: the page itself is left and opened again
  // during the tour, and would forget.
  await page.exposeFunction('__heardEvent', e => { heard?.events.push(e) })
  await page.exposeFunction('__heardBlob', (src, b64) => { if (heard) heard.files[src] = b64 })
  await page.addInitScript(() => {
    try { localStorage.setItem('noesis.install.dismissed', String(Date.now())) } catch { /* no storage */ }
    // where the finger is
    addEventListener('pointerdown', e => {
      const d = document.createElement('div')
      d.style.cssText = `position:fixed;left:${e.clientX - 22}px;top:${e.clientY - 22}px;width:44px;height:44px;border-radius:44px;background:rgba(255,255,255,.26);border:1.5px solid rgba(255,255,255,.62);pointer-events:none;z-index:2147483647;transition:transform .45s ease-out,opacity .45s ease-out`
      document.documentElement.appendChild(d)
      requestAnimationFrame(() => { d.style.transform = 'scale(1.7)'; d.style.opacity = '0' })
      setTimeout(() => d.remove(), 520)
    }, true)
    // what the app plays, and when: its own voice becomes the film's sound
    const make = URL.createObjectURL
    URL.createObjectURL = b => {
      const u = make.call(URL, b)
      if (b && /audio/.test(b.type || '')) b.arrayBuffer().then(buf => { const bytes = new Uint8Array(buf); let bin = ''; for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192)); window.__heardBlob?.(u, btoa(bin)) })
      return u
    }
    let n = 0
    const play = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function () {
      if (!this.__n) {
        this.__n = ++n
        for (const e of ['playing', 'pause', 'ended', 'emptied']) this.addEventListener(e, () => window.__heardEvent?.({ e, el: this.__n, at: performance.timeOrigin + performance.now(), t: this.currentTime, src: this.currentSrc || this.src, rate: this.playbackRate }))
      }
      return play.apply(this, arguments)
    }
  })
  return { ctx, page }
}

// ── the tour: what a customer does. `keep` is on camera; everything outside it is waiting that is cut ──────
async function tour(page, keep) {
  const lib = expr => page.evaluate(async expr => {
    const at = path => performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes(path)) || path
    const m = { library: await import(at('/src/lib/library.js')), nav: await import(at('/src/lib/nav.js')) }
    return eval(expr)
  }, expr)
  const docs = () => lib('m.library.library.get().docs.map(d => ({ id: d.id, title: d.title, status: d.status, done: d.done || 0, total: d.total || 0, target: d.target || null, voice: d.voice }))')
  const until = async (what, test, ms = 600000) => { const t0 = Date.now(); for (;;) { const v = await test(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`); await sleep(400) } }
  const voiced = (pick, some) => until('the audio', async () => { const d = (await docs()).find(pick); return d && d.total > 0 && (d.status === 'ready' || d.done >= Math.min(some, d.total)) ? d : null })
  const btn = name => page.getByRole('button', { name, exact: true }).first()
  const tab = name => page.getByRole('tab', { name, exact: true }).first()
  const play = () => page.getByRole('button', { name: /^(Play|Resume)$/ }).first().click()
  const pause = async () => { if (await btn('Pause').count()) await btn('Pause').click(); await sleep(400) }

  await page.goto(HOME); await page.waitForLoadState('networkidle'); await sleep(1500)
  await keep({ step: 'Open', head: 'It opens in your browser.', sub: 'Nothing to download first.' }, () => sleep(2200))

  await keep({ step: 'Add', head: 'Add a PDF, a book or a link.', sub: 'It stays on your own device.' }, async () => {
    await sleep(250); await btn('Add').click(); await sleep(1000)
    await page.locator('[role=dialog] input[type=file]').setInputFiles(PDF); await sleep(1200)
    await page.getByRole('button', { name: 'Add to library' }).click(); await sleep(1400)
  })
  await page.waitForFunction(() => history.state?.view === 'reader', null, { timeout: 60000 })
  await page.locator('article [data-i]').first().waitFor({ timeout: 180000 })
  const book = await voiced(d => !d.target, 60)
  await sleep(1200)

  await keep({ step: 'Listen', head: 'It reads to you.', sub: 'A natural voice, made on your phone.' }, async () => { await sleep(450); await play(); await sleep(6000) })
  await keep({ step: 'Pages', head: 'Follow on the real pages.', sub: 'The sentence being read is marked.' }, async () => { await tab('Pages').click(); await sleep(4000) })
  await keep({ step: 'Focus', head: 'Or one word at a time.', sub: 'The light takes the mood of the writing.' }, async () => { await tab('Focus').click(); await sleep(5000) })

  const TRANSLATE = { step: 'Translate', head: 'Hear it in your language.', sub: 'Translated on your device. No account.' }
  await keep(TRANSLATE, async () => {
    await pause()
    await btn('Document menu').click(); await sleep(850)
    await page.getByRole('menuitem', { name: /Listen in another language/ }).click(); await sleep(1400)
    await page.getByRole('dialog').getByRole('button', { name: 'Hindi', exact: true }).click(); await sleep(1100)
  })
  const hindi = await voiced(d => d.target === 'hi', 8)
  await tab('Text').click(); await sleep(700); await page.evaluate(() => scrollTo(0, 0)); await sleep(900)
  await keep(TRANSLATE, async () => { await sleep(300); await play(); await sleep(3700) })
  await pause()

  await page.goBack(); await sleep(1500)
  if (!(await lib(`m.nav.ui.get().docId === ${JSON.stringify(book.id)} || history.state?.docId === ${JSON.stringify(book.id)}`))) { await lib(`(m.nav.go('reader', ${JSON.stringify(book.id)}), 0)`); await sleep(1500) }
  const VOICE = { step: 'Voice', head: 'Pick the voice you like.', sub: 'Each one downloads once, then works offline.' }
  await keep(VOICE, async () => {
    await sleep(250); await btn('Document menu').click(); await sleep(850)
    await page.getByRole('menuitem', { name: /Change voice/ }).click(); await sleep(1500)
    await page.getByRole('dialog').getByRole('button', { name: /^Joe/ }).first().click(); await sleep(1100)
  })
  await voiced(d => d.id === book.id && /joe/.test(d.voice), 8)
  await sleep(600)
  await keep(VOICE, async () => { await sleep(250); await play(); await sleep(2500) })
  await pause()

  // a second book, and the months of listening (see the top of this file)
  const letters = await lib(`m.library.addDocument({ kind: 'text', name: 'Letters on Listening', title: 'Letters on Listening', text: ${JSON.stringify(LETTERS)} })`)
  await voiced(d => d.id === letters, 4)
  await page.goto(`${HOME}privacy.html`); await sleep(700)
  await page.evaluate(async ids => {
    const m = { db: await import('/src/lib/db.js'), heard: await import('/src/lib/heard.js') }
    const [book, hindi, letters] = ids, gone = 'gone-0001'
    const log = { titles: { [book]: 'The Lighthouse Year', [hindi]: 'The Lighthouse Year (Hindi)', [letters]: 'Letters on Listening', [gone]: 'Walden' }, finished: [], hours: {} }
    let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const now = new Date()
    for (let i = 0; i < 125; i++) {
      const d = new Date(now); d.setDate(now.getDate() - i)
      if (i && ((i > 23 && i < 29) || rnd() < 0.2)) continue
      const main = i < 16 ? book : i < 60 ? letters : gone
      const day = { [main]: Math.round(700 + rnd() * 2900) }
      if (rnd() < 0.4) day[i % 2 ? hindi : letters] = Math.round(300 + rnd() * 1300)
      if (i === 0) { day[book] = 1560; day[hindi] = 540 }
      log[m.heard.dayKey(d)] = day
      const y = String(d.getFullYear()); log.hours[y] ||= Array(24).fill(0)
      for (const s of Object.values(day)) log.hours[y][rnd() < 0.7 ? 20 + Math.floor(rnd() * 3) : rnd() < 0.6 ? 7 + Math.floor(rnd() * 2) : 13 + Math.floor(rnd() * 4)] += s
    }
    const ago = n => { const d = new Date(now); d.setDate(now.getDate() - n); return m.heard.dayKey(d) }
    log.finished = [{ id: letters, day: ago(18) }, { id: gone, day: ago(64) }]
    await m.db.db.putHistory(log)
  }, [book.id, hindi.id, letters])
  await page.goto(HOME); await page.waitForLoadState('networkidle'); await sleep(2600)

  await keep({ step: 'Library', head: 'Every book keeps its place.', sub: 'Sign in, and it is the same on every device.' }, async () => {
    await sleep(1500); await page.getByRole('button', { name: /Letters on Listening/ }).first().click(); await sleep(2300)
  })
  await page.goBack(); await sleep(1600)
  await keep({ step: 'Insights', head: 'See how you listen.', sub: 'Every day, every book, every hour.' }, async () => {
    await sleep(350); await page.getByRole('button', { name: /Your listening: open all of it/ }).click(); await sleep(2300)
    const sheet = page.getByRole('dialog')
    await sheet.evaluate(el => el.scrollTo({ top: 620, behavior: 'smooth' })); await sleep(2100)
    await sheet.evaluate(el => el.scrollTo({ top: 1240, behavior: 'smooth' })); await sleep(2300)
  })
}

// ── rehearse, then record ───────────────────────────────────────────────────────────────────────────────
async function record() {
  mkdirSync(OUT, { recursive: true })
  // the book, as a PDF
  const b = await chromium.launch({ channel: 'chrome', headless: true })
  const p = await b.newPage()
  await p.goto(`${HOME}film/book.html`)
  await p.pdf({ path: PDF, preferCSSPageSize: true, printBackground: false })
  await b.close()

  if (!existsSync(`${OUT}/rehearsed`)) {
    console.log('rehearsing: voices and the translator are downloaded to the phone')
    rmSync(PROFILE, { recursive: true, force: true })
    const { ctx, page } = await phone()
    await tour(page, async (_, act) => act())
    await ctx.close()
    writeFileSync(`${OUT}/rehearsed`, new Date().toISOString())
  }
  // a new customer's phone, except that what was downloaded is still there
  {
    const { ctx, page } = await phone()
    await page.goto(`${HOME}privacy.html`)
    await page.evaluate(async () => {
      for (const d of await indexedDB.databases()) if (d.name?.startsWith('noesis-')) await new Promise(done => { const r = indexedDB.deleteDatabase(d.name); r.onsuccess = r.onerror = r.onblocked = done })
      localStorage.clear()
    })
    await ctx.close()
  }
  console.log('recording')
  rmSync(FRAMES, { recursive: true, force: true }); mkdirSync(FRAMES, { recursive: true })
  const sound = { events: [], files: {} }
  const { ctx, page } = await phone(sound)
  const cdp = await ctx.newCDPSession(page)
  const frames = []
  // Frames are kept only while on camera, and no more than the film's own thirty a second; the last one seen
  // off camera is kept too, because it is what is on screen when the camera comes back.
  let rolling = false, latest = null, kept = 0
  const save = fr => { const file = `${String(frames.length).padStart(6, '0')}.jpg`; writeFileSync(`${FRAMES}/${file}`, Buffer.from(fr.data, 'base64')); frames.push({ t: fr.t, file }); kept = fr.t }
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    latest = { data, t: metadata.timestamp * 1000 }
    if (rolling && latest.t - kept >= 1000 / FPS - 3) { save(latest); latest = null }
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
  })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 93, everyNthFrame: 1 })
  const parts = []
  const errors = []; page.on('pageerror', e => errors.push(String(e).slice(0, 200)))
  await tour(page, async (words, act) => {
    if (latest) { save(latest); latest = null }
    rolling = true
    const from = Date.now(); await act(); parts.push({ from, to: Date.now(), ...words })
    rolling = false
  })
  await cdp.send('Page.stopScreencast')
  // the app's own sound: every stretch of audio it played, and when (handed out of the page as it happened)
  await sleep(500)
  const names = {}
  const played = new Set(sound.events.map(e => e.src))
  Object.entries(sound.files).filter(([src]) => played.has(src)).forEach(([src, b64], i) => { names[src] = `voice-${i}.ogg`; writeFileSync(`${OUT}/voice-${i}.ogg`, Buffer.from(b64, 'base64')) })
  writeFileSync(`${OUT}/take.json`, JSON.stringify({ frames, parts, sound: { events: sound.events, names } }))
  await ctx.close()
  console.log(`recorded: ${frames.length} frames, ${parts.length} parts, ${(parts.reduce((a, q) => a + q.to - q.from, 0) / 1000).toFixed(1)} s on camera, ${sound.events.length} sound events${errors.length ? `, errors: ${errors.join(' | ')}` : ''}`)
}

// ── put it together ─────────────────────────────────────────────────────────────────────────────────────
const TITLE = { card: { line: 'Any document, read to you.', under: 'This is the app, as it is.' }, seconds: 2.0 }
const END = { card: { line: 'Install it from your browser.', under: 'No Play Store. No App Store. Free to use.', where: 'noesisaudio.com' }, seconds: 3.8 }

function plan() {
  const take = JSON.parse(readFileSync(`${OUT}/take.json`, 'utf8'))
  const items = [TITLE, ...take.parts.map(q => ({ ...q, seconds: (q.to - q.from) / 1000 })), END]
  let at = 0
  for (const it of items) { it.at = at; at += it.seconds }
  return { take, items, total: at }
}

async function picture(wide, { take, items, total }) {
  const out = here(wide ? 'noesis-tour-wide.silent.mp4' : 'noesis-tour.silent.mp4')
  const size = wide ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 }
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 })
  await page.goto(`${HOME}film/tour.html${wide ? '?wide' : ''}`)
  await page.waitForFunction(() => window.READY === true, null, { timeout: 30000 })
  const ffmpeg = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] })
  const done = new Promise((resolve, reject) => ffmpeg.on('close', code => (code ? reject(new Error(`ffmpeg ended with ${code}`)) : resolve())))
  const frameAt = t => { let lo = 0, hi = take.frames.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (take.frames[mid].t <= t) lo = mid; else hi = mid - 1 } return take.frames[lo] }
  const same = (a, b) => a && b && !a.card && !b.card && a.head === b.head
  let last = null
  const n = Math.round(total * FPS)
  for (let f = 0; f < n; f++) {
    const t = f / FPS
    const i = items.findLastIndex(it => it.at <= t)
    const it = items[i]
    // words that carry on from the part before, or into the next, do not leave and come back
    const age = t - it.at + (same(items[i - 1], it) ? 9 : 0)
    const left = it.at + it.seconds - t + (same(it, items[i + 1]) ? 9 : 0)
    let img = null
    if (!it.card) { const fr = frameAt(it.from + (t - it.at) * 1000); if (fr.file !== last) { last = fr.file; img = `data:image/jpeg;base64,${readFileSync(`${FRAMES}/${fr.file}`).toString('base64')}` } }
    await page.evaluate(d => window.draw(d), { card: it.card || null, step: it.step, head: it.head, sub: it.sub, img, age, left, first: i === 1 })
    const jpg = await page.screenshot({ type: 'jpeg', quality: 96 })
    if (!ffmpeg.stdin.write(jpg)) await new Promise(r => ffmpeg.stdin.once('drain', r))
    if (f % 300 === 0) console.log(`${wide ? 'wide' : 'tall'} ${Math.round((f / n) * 100)}%`)
  }
  ffmpeg.stdin.end()
  await done
  await browser.close()
  return out
}

// The sound: the app's voice wherever it was playing on camera, over a quiet chord that opens and closes the film.
function soundtrack({ take, items, total }) {
  const out = `${OUT}/sound.m4a`
  const ev = take.sound.events
  const pieces = [] // { file, from (s in the file), to, at (s in the film) }
  ev.forEach((e, k) => {
    if (e.e !== 'playing' || !take.sound.names[e.src]) return
    const stop = ev.slice(k + 1).find(x => x.el === e.el && x.e !== 'playing')
    const until = stop ? stop.at : Infinity
    for (const it of items) {
      if (it.card) continue
      const a = Math.max(e.at, it.from), b = Math.min(until, it.to)
      if (b - a < 250) continue
      pieces.push({ file: take.sound.names[e.src], from: e.t + ((a - e.at) / 1000) * (e.rate || 1), to: e.t + ((b - e.at) / 1000) * (e.rate || 1), at: it.at + (a - it.from) / 1000 })
    }
  })
  const args = ['-y', '-loglevel', 'error']
  for (const q of pieces) args.push('-i', `${OUT}/${q.file}`)
  const D = total.toFixed(2)
  const chord = [73.42, 110, 146.83, 220, 293.66].map((f, i) => `sine=f=${f}:d=${D}[s${i}]`).join(';')
  const voices = pieces.map((q, i) => { const len = q.to - q.from; return `[${i}:a]atrim=start=${q.from.toFixed(3)}:end=${q.to.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:d=0.12,afade=t=out:st=${Math.max(0, len - 0.25).toFixed(3)}:d=0.25,aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(q.at * 1000)}:all=1[v${i}]` })
  const mix = `${chord};[s0][s1][s2][s3][s4]amix=inputs=5:normalize=0,volume=0.035,tremolo=f=0.13:d=0.45,afade=t=in:d=1.6,afade=t=out:st=${(total - 2.6).toFixed(2)}:d=2.6,aresample=48000,aformat=channel_layouts=stereo[bed];${voices.join(';')}${voices.length ? ';' : ''}[bed]${pieces.map((_, i) => `[v${i}]`).join('')}amix=inputs=${pieces.length + 1}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[a]`
  const r = spawnSync('ffmpeg', [...args, '-filter_complex', mix, '-map', '[a]', '-t', D, '-c:a', 'aac', '-b:a', '224k', out], { stdio: 'inherit' })
  if (r.status) throw new Error('the sound could not be made')
  console.log(`sound: the app's voice in ${pieces.length} places (${pieces.map(q => `${q.at.toFixed(1)}s for ${(q.to - q.from).toFixed(1)}s`).join(', ')})`)
  return out
}

if (!process.argv.includes('--again')) await record()
const p = plan()
console.log(`the film: ${p.total.toFixed(1)} s`)
if (p.total > LIMIT_S) throw new Error(`the film is ${p.total.toFixed(1)} s: it must be under a minute. Shorten a part in tour() and record again.`)
const sound = soundtrack(p)
for (const wide of [false, true]) {
  const silent = await picture(wide, p)
  const out = silent.replace('.silent', '')
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', silent, '-i', sound, '-c:v', 'copy', '-c:a', 'copy', '-shortest', '-movflags', '+faststart', out], { stdio: 'inherit' })
  if (r.status) throw new Error('the picture and the sound could not be joined')
  rmSync(silent)
  console.log(out)
}
