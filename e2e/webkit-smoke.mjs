// WebKit smoke test for Noesis: Playwright's WebKit build with the iPhone 15 device profile.
// This is WebKit on Windows, NOT iOS Safari. Each check is independent and prints one line; a failure
// never stops the run. See docs/research/webkit-report.md for what this can and cannot show.
//   node e2e/webkit-smoke.mjs [baseUrl]     default https://noesis-777.pages.dev
import { webkit, devices } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = process.argv[2] || 'https://noesis-777.pages.dev'
const OUT = fileURLToPath(new URL('../.qa-out/', import.meta.url))
mkdirSync(OUT, { recursive: true })
const SAMPLE_TITLE = 'On Listening' // the document that "Try a sample" creates
const sleep = ms => new Promise(r => setTimeout(r, ms))

const tally = { PASS: 0, FAIL: 0, SKIP: 0, INFO: 0 }
function report(status, name, detail = '') {
  tally[status]++
  console.log(`${status.padEnd(4)} ${name}${detail ? ` - ${detail}` : ''}`)
}
// One check. A thrown error fails this check only.
async function check(name, fn) {
  try {
    const r = await fn()
    report(r.status, name, r.detail)
    return r
  } catch (e) {
    const msg = String(e && e.message ? e.message : e).split('\n')[0]
    report('FAIL', name, `threw: ${msg}`)
    return { status: 'FAIL', detail: msg }
  }
}

// Runs in the page before any app code: records the app's <audio> events and the blobs it creates.
const instrument = () => {
  window.__media = []
  window.__audios = []
  window.__blobs = []
  const RealAudio = window.Audio
  const PatchedAudio = function (...args) {
    const el = new RealAudio(...args)
    window.__audios.push(el)
    for (const ev of ['loadedmetadata', 'canplay', 'playing', 'pause', 'ended', 'waiting', 'stalled', 'error']) {
      el.addEventListener(ev, () => window.__media.push({
        ev, t: +el.currentTime.toFixed(2), code: el.error ? el.error.code : null, msg: el.error ? el.error.message : null, at: Date.now(),
      }))
    }
    return el
  }
  PatchedAudio.prototype = RealAudio.prototype
  window.Audio = PatchedAudio
  const realPlay = HTMLMediaElement.prototype.play
  HTMLMediaElement.prototype.play = function () {
    const p = realPlay.call(this)
    p.catch(e => window.__media.push({ ev: 'play() rejected', name: e.name, msg: e.message, at: Date.now() }))
    return p
  }
  const realCreate = URL.createObjectURL
  URL.createObjectURL = function (obj) {
    window.__blobs.push({ type: obj.type, size: obj.size })
    return realCreate.call(URL, obj)
  }
}

const errors = [] // console errors, uncaught page errors, crashes, failed requests, verbatim
const badHttp = [] // HTTP 400+ responses

let browser
try {
  browser = await webkit.launch()
} catch (e) {
  report('FAIL', 'launch WebKit', String(e.message).split('\n')[0])
  process.exit(1)
}

try {
  report('INFO', 'browser', `WebKit ${browser.version()}`)
  const ctx = await browser.newContext({ ...devices['iPhone 15'] })
  await ctx.addInitScript(instrument)
  const page = await ctx.newPage()

  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}${e.stack ? `\n    ${e.stack.split('\n').slice(0, 3).join('\n    ')}` : ''}`))
  page.on('crash', () => errors.push('crash: page crashed'))
  page.on('requestfailed', r => errors.push(`requestfailed: ${r.method()} ${r.url()} - ${r.failure() ? r.failure().errorText : '?'}`))
  page.on('response', r => { if (r.status() >= 400) badHttp.push(`${r.status()} ${r.url()}`) })

  const shot = async name => {
    try { await page.screenshot({ path: join(OUT, name) }); return name } catch (e) { return `${name} not saved: ${String(e.message).split('\n')[0]}` }
  }
  const audioEvents = () => page.evaluate(() => window.__media.slice(-8))
  // Overflow check: scrollWidth > innerWidth means the page scrolls sideways on a phone.
  const layout = (name, file) => check(`5 horizontal overflow - ${name}`, async () => {
    await sleep(600)
    const m = await page.evaluate(() => {
      const iw = innerWidth
      const sw = document.documentElement.scrollWidth
      const wide = [...document.querySelectorAll('body *')]
        .filter(e => e.getBoundingClientRect().right > iw + 1)
        .slice(0, 4)
        .map(e => {
          const cls = typeof e.className === 'string' && e.className ? `.${e.className.split(' ')[0]}` : ''
          return `${e.tagName.toLowerCase()}${cls} right=${Math.round(e.getBoundingClientRect().right)} "${(e.innerText || '').slice(0, 30)}"`
        })
      return { iw, sw, wide }
    })
    const saved = await shot(file)
    const over = m.sw > m.iw
    return { status: over ? 'FAIL' : 'PASS', detail: `scrollWidth ${m.sw} / innerWidth ${m.iw}${over ? `; wider than screen: ${m.wide.join(' | ')}` : ''}; ${saved}` }
  })

  // ── open the app ─────────────────────────────────────────────────────────────────
  await check('page load', async () => {
    const res = await page.goto(BASE, { waitUntil: 'load', timeout: 60000 })
    return { status: res.ok() ? 'PASS' : 'FAIL', detail: `${BASE} HTTP ${res.status()}` }
  })
  const env = await page.evaluate(() => ({ ua: navigator.userAgent, w: innerWidth, h: innerHeight, dpr: devicePixelRatio, touch: navigator.maxTouchPoints }))
  report('INFO', 'device profile', `${env.w}x${env.h} @${env.dpr}x, maxTouchPoints ${env.touch}`)
  report('INFO', 'user agent', env.ua)

  // ── 1. first-run screen ──────────────────────────────────────────────────────────
  await check('1 first-run screen renders (heading "Listen to anything")', async () => {
    await page.getByRole('heading', { name: /Listen to\s*anything/ }).waitFor({ timeout: 30000 })
    return { status: 'PASS', detail: 'heading visible' }
  })
  await layout('library (empty)', 'webkit-library-empty.png')

  // ── 2. feature probe ─────────────────────────────────────────────────────────────
  const probe = await page.evaluate(async () => {
    const r = {}
    const t = (k, f) => { try { r[k] = f() } catch (e) { r[k] = `threw: ${e.message}` } }
    t('AudioEncoder', () => typeof AudioEncoder)
    t('AudioData', () => typeof AudioData)
    t('MediaMetadata', () => typeof MediaMetadata)
    t('SpeechSynthesisUtterance', () => typeof SpeechSynthesisUtterance)
    t('speechSynthesis', () => typeof speechSynthesis)
    t('serviceWorker in navigator', () => 'serviceWorker' in navigator)
    t('mediaSession in navigator', () => 'mediaSession' in navigator)
    t('navigator.vibrate', () => typeof navigator.vibrate)
    t('IntersectionObserver', () => typeof IntersectionObserver)
    t("'scheduler' in window", () => 'scheduler' in window)
    t('crossOriginIsolated', () => crossOriginIsolated)
    t('SharedArrayBuffer', () => typeof SharedArrayBuffer)
    t("CSS.supports('content-visibility','auto')", () => CSS.supports('content-visibility', 'auto'))
    t("CSS.supports('text-wrap','pretty')", () => CSS.supports('text-wrap', 'pretty'))
    t('documentPictureInPicture', () => typeof documentPictureInPicture)
    t('document.pictureInPictureEnabled', () => document.pictureInPictureEnabled)
    t('navigator.storage.persist', () => typeof navigator.storage?.persist)
    t('canPlayType audio/ogg; codecs=opus', () => document.createElement('audio').canPlayType('audio/ogg; codecs=opus'))
    t('canPlayType audio/wav', () => document.createElement('audio').canPlayType('audio/wav'))
    t('canPlayType audio/mp4; codecs=opus', () => document.createElement('audio').canPlayType('audio/mp4; codecs=opus'))
    t("'caches' in window", () => 'caches' in window)
    t('Intl.Segmenter', () => typeof Intl.Segmenter)
    t('Array.prototype.findLastIndex', () => typeof Array.prototype.findLastIndex)
    t('isSecureContext', () => isSecureContext)
    t('navigator.userAgentData', () => (navigator.userAgentData ? 'present' : 'absent'))
    if (typeof AudioEncoder !== 'undefined') {
      for (const sampleRate of [22050, 16000]) {
        try {
          const s = await AudioEncoder.isConfigSupported({ codec: 'opus', sampleRate, numberOfChannels: 1, bitrate: 32000 })
          r[`AudioEncoder.isConfigSupported opus ${sampleRate} Hz`] = `supported=${s.supported}`
        } catch (e) { r[`AudioEncoder.isConfigSupported opus ${sampleRate} Hz`] = `threw: ${e.message}` }
      }
    }
    if (typeof speechSynthesis !== 'undefined') {
      let v = speechSynthesis.getVoices()
      if (!v.length) {
        v = await new Promise(res => {
          const done = () => res(speechSynthesis.getVoices())
          speechSynthesis.addEventListener('voiceschanged', done, { once: true })
          setTimeout(done, 3000)
        })
      }
      r['speechSynthesis.getVoices().length'] = v.length
      r['English voices'] = v.filter(x => /^en/i.test(x.lang)).slice(0, 6).map(x => `${x.name} (${x.lang}, local=${x.localService})`)
    }
    r['navigator.storage.persisted()'] = navigator.storage?.persisted ? await navigator.storage.persisted() : 'n/a'
    r['navigator.storage.estimate().quota'] = navigator.storage?.estimate ? (await navigator.storage.estimate()).quota : 'n/a'
    return r
  })
  for (const [k, v] of Object.entries(probe)) report('INFO', `probe ${k}`, JSON.stringify(v))
  const present = v => v === true || v === 'function' || v === 'object'
  const required = ['AudioEncoder', 'AudioData', 'MediaMetadata', 'SpeechSynthesisUtterance', 'speechSynthesis', 'serviceWorker in navigator',
    'mediaSession in navigator', 'IntersectionObserver', "'caches' in window", 'Intl.Segmenter', 'Array.prototype.findLastIndex']
  const missing = required.filter(k => !present(probe[k]))
  await check('2a app-required APIs present (encode, playback, service worker, caches)', async () => ({
    status: missing.length ? 'FAIL' : 'PASS', detail: missing.length ? `missing: ${missing.join(', ')}` : `all ${required.length} present`,
  }))
  await check('2b Opus encoding for Piper rates (encode.js)', async () => {
    const ok = probe['AudioEncoder.isConfigSupported opus 22050 Hz'] === 'supported=true'
    return { status: ok ? 'PASS' : 'FAIL', detail: `22050 Hz: ${probe['AudioEncoder.isConfigSupported opus 22050 Hz']}, 16000 Hz: ${probe['AudioEncoder.isConfigSupported opus 16000 Hz']}` }
  })
  await check('2c <audio> can play Ogg/Opus (player.js builds audio/ogg blobs)', async () => {
    const ogg = probe['canPlayType audio/ogg; codecs=opus']
    return { status: ogg ? 'PASS' : 'FAIL', detail: `canPlayType('audio/ogg; codecs=opus') = ${JSON.stringify(ogg)}; mp4/opus = ${JSON.stringify(probe['canPlayType audio/mp4; codecs=opus'])}; wav = ${JSON.stringify(probe['canPlayType audio/wav'])}` }
  })

  // ── 3. sample → reader → natural voice generation ────────────────────────────────
  const opened = await check('3a "Try a sample" opens the reader', async () => {
    await page.getByRole('button', { name: 'Try a sample', exact: true }).click({ timeout: 15000 })
    await page.waitForFunction(() => history.state && history.state.view === 'reader', null, { timeout: 8000 })
    return { status: 'PASS', detail: 'history.state.view === "reader"' }
  })
  await sleep(1000)
  await shot('webkit-reader.png')

  const metaRecord = () => page.evaluate(title => new Promise((resolve, reject) => {
    const r = indexedDB.open('noesis-meta')
    r.onerror = () => reject(String(r.error))
    r.onsuccess = () => {
      const db = r.result
      if (!db.objectStoreNames.contains('meta')) { db.close(); return resolve(null) }
      const q = db.transaction('meta', 'readonly').objectStore('meta').getAll()
      q.onerror = () => reject(String(q.error))
      q.onsuccess = () => {
        db.close()
        const d = q.result.find(x => x.title === title)
        resolve(d ? { id: d.id, status: d.status, stage: d.stage, done: d.done, total: d.total, error: d.error, voice: d.voice } : null)
      }
    }
  }), SAMPLE_TITLE)

  let ready = false
  let docId = null
  if (opened.status === 'PASS') {
    await check('3b natural voice downloads and voices the sample (<= 4 min)', async () => {
      const phrases = new Set()
      const t0 = Date.now()
      let meta = null
      while (Date.now() - t0 < 240000) {
        meta = await metaRecord()
        const txt = await page.evaluate(() => document.body.innerText)
        for (const m of txt.matchAll(/(Downloading|Starting the|Making the audio|Preparing|Generating audio|Opening|Ready to play|Reading document|still being prepared)[^\n]{0,60}/gi)) phrases.add(m[0].slice(0, 70))
        if (meta && (meta.status === 'ready' || meta.status === 'error')) break
        await sleep(3000)
      }
      const secs = ((Date.now() - t0) / 1000).toFixed(0)
      if (meta) docId = meta.id
      const blobs = await page.evaluate(() => window.__blobs.map(b => `${b.type || '(no type)'} ${b.size} B`).slice(0, 6))
      report('INFO', 'page text phases seen', [...phrases].slice(0, 8).join(' | ') || '(none matched)')
      report('INFO', 'blobs created by the app', blobs.join(' | ') || '(none)')
      ready = !!meta && meta.status === 'ready'
      return {
        status: ready ? 'PASS' : 'FAIL',
        detail: `after ${secs} s: status=${meta ? meta.status : 'no meta record'}, stage=${meta ? meta.stage : '-'}, ${meta ? `${meta.done}/${meta.total}` : ''}${meta && meta.error ? `, error=${meta.error}` : ''}`,
      }
    })
  } else {
    report('SKIP', '3b natural voice generation', 'reader did not open')
  }

  if (docId) {
    await check('3c audio records in IndexedDB: codec and size', async () => {
      const s = await page.evaluate(id => new Promise((resolve, reject) => {
        const r = indexedDB.open('noesis-audio')
        r.onerror = () => reject(String(r.error))
        r.onsuccess = () => {
          const db = r.result
          const tx = db.transaction('audio', 'readonly')
          const st = tx.objectStore('audio')
          const ks = st.getAllKeys()
          const vs = st.getAll()
          tx.oncomplete = () => {
            db.close()
            const sz = x => (x && x.byteLength) || 0
            const out = { count: 0, codecs: {}, bytes: 0, firstCodec: null, firstBytes: 0, firstRate: null }
            ks.result.forEach((k, n) => {
              if (!String(k).startsWith(id + ':')) return
              const rec = vs.result[n]
              out.count++
              out.codecs[rec.codec] = (out.codecs[rec.codec] || 0) + 1
              out.bytes += sz(rec.data) + sz(rec.lens) + sz(rec.frames) + sz(rec.bytes)
            })
            const first = vs.result[ks.result.indexOf(id + ':0')]
            if (first) { out.firstCodec = first.codec; out.firstRate = first.rate || null; out.firstBytes = sz(first.data) + sz(first.bytes) }
            resolve(out)
          }
          tx.onerror = () => reject(String(tx.error))
        }
      }), docId)
      const ok = s.count > 0
      return {
        status: ok ? 'PASS' : 'FAIL',
        detail: `${s.count} records, codecs ${JSON.stringify(s.codecs)}, ${(s.bytes / 1024).toFixed(0)} KB total, sentence 0 = ${s.firstCodec}${s.firstRate ? ` @${s.firstRate} Hz` : ''} ${(s.firstBytes / 1024).toFixed(1)} KB`,
      }
    })
  }

  // ── 4. play, audio output, highlight ─────────────────────────────────────────────
  const audioState = () => page.evaluate(() => {
    const a = window.__audios.filter(x => x.currentSrc).at(-1)
    return a ? { t: a.currentTime, paused: a.paused, rs: a.readyState, dur: a.duration, err: a.error ? `${a.error.code} ${a.error.message}` : null, src: a.currentSrc.slice(0, 40) } : null
  })
  const played = await check('4a Play button becomes Pause (app started playback)', async () => {
    await page.getByRole('button', { name: 'Play', exact: true }).first().click({ timeout: 15000 })
    const refused = page.getByText("couldn't play the audio").first().waitFor({ timeout: 15000 }).then(() => true, () => false)
    const started = await page.getByRole('button', { name: 'Pause', exact: true }).first().waitFor({ timeout: 15000 }).then(() => true, () => false)
    if (await refused) return { status: 'FAIL', detail: 'play() was refused by this browser, and the app said so on screen' }
    if (!started) {
      const diag = await page.evaluate(() => ({
        media: window.__media.slice(-6),
        blobs: window.__blobs.slice(-3),
        text: (document.body.innerText.match(/[^\n]*(prepared|Audio|play|Play|error|Failed)[^\n]*/gi) || []).slice(0, 4),
        labels: [...document.querySelectorAll('button[aria-label]')].map(b => b.getAttribute('aria-label')).filter(l => /Play|Pause|Resume/.test(l)),
      }))
      return { status: 'FAIL', detail: `Play did not start (aria-label never became Pause); the app said so: ${(await refused) ? 'yes' : 'NO'}: ${JSON.stringify(diag)}` }
    }
    const ms = await page.evaluate(() => (navigator.mediaSession ? navigator.mediaSession.playbackState : 'n/a'))
    return { status: 'PASS', detail: `aria-label is Pause; mediaSession.playbackState = ${ms}` }
  })
  if (played.status === 'PASS') {
    await check('4b <audio> element plays (currentTime advances)', async () => {
      const a0 = await audioState()
      await sleep(4000)
      const a1 = await audioState()
      const advanced = a0 && a1 && a1.t - a0.t > 1 && !a1.paused
      const ev = await audioEvents()
      return {
        status: advanced ? 'PASS' : 'FAIL',
        detail: `t ${a0 ? a0.t.toFixed(2) : '-'} → ${a1 ? a1.t.toFixed(2) : '-'} s, paused=${a1 ? a1.paused : '-'}, readyState=${a1 ? a1.rs : '-'}, duration=${a1 ? a1.dur : '-'}, src=${a1 ? a1.src : '-'}, error=${a1 ? a1.err : '-'}${advanced ? '' : `; last media events ${JSON.stringify(ev)}`}`,
      }
    })
    await check('4c highlighted sentence advances within 20 s', async () => {
      const seen = []
      const t0 = Date.now()
      while (Date.now() - t0 < 20000) {
        const i = await page.evaluate(() => {
          const el = [...document.querySelectorAll('[data-i]')].find(e => e.style.background && e.style.background !== 'transparent')
          return el ? +el.dataset.i : null
        })
        if (i !== null && seen.at(-1) !== i) seen.push(i)
        await sleep(400)
      }
      return { status: seen.length >= 2 ? 'PASS' : 'FAIL', detail: `highlight visited sentences [${seen.join(', ')}] in 20 s` }
    })
    await shot('webkit-reader-playing.png')
    await check('4d Pause stops playback', async () => {
      await page.getByRole('button', { name: 'Pause', exact: true }).first().click()
      await sleep(800)
      const a = await audioState()
      return { status: a && a.paused ? 'PASS' : 'FAIL', detail: `audio paused=${a ? a.paused : '-'}` }
    })
  } else {
    report('SKIP', '4b-4d playback checks', 'Play did not start')
  }

  // ── 5. layout at iPhone size: reader, library, settings ───────────────────────────
  await layout('reader', 'webkit-reader-overflow.png')
  await check('5 back to library from reader', async () => {
    await page.getByRole('button', { name: 'Back to library', exact: true }).click({ timeout: 10000 })
    await page.waitForFunction(() => history.state && history.state.view === 'library', null, { timeout: 8000 })
    return { status: 'PASS', detail: 'history.state.view === "library"' }
  })
  await sleep(800)
  await layout('library (with sample)', 'webkit-library.png')
  const settingsOpen = await check('5 open Settings', async () => {
    await page.getByRole('button', { name: 'Settings' }).first().click({ timeout: 10000 })
    await page.getByText('Account & sync', { exact: false }).first().waitFor({ timeout: 8000 })
    return { status: 'PASS', detail: 'Settings visible' }
  })
  if (settingsOpen.status === 'PASS') {
    await layout('settings', 'webkit-settings.png')
    await page.getByRole('button', { name: 'Back', exact: true }).click({ timeout: 8000 }).catch(() => {})
  } else report('SKIP', '5 settings layout', 'Settings did not open')

  // ── 6. errors, verbatim ──────────────────────────────────────────────────────────
  const real = errors.filter(e => !/favicon|DevTools|Download the React/.test(e))
  report(real.length ? 'FAIL' : 'PASS', `6 console/page errors (${real.length})`)
  for (const e of real) console.log(`    ${e}`)
  if (badHttp.length) {
    report('INFO', `HTTP responses >= 400 (${badHttp.length})`)
    for (const b of [...new Set(badHttp)]) console.log(`    ${b}`)
  }
  const ev = await audioEvents().catch(() => [])
  report('INFO', 'last audio events', JSON.stringify(ev))
  await ctx.close()
} finally {
  await browser.close()
  console.log(`\nTALLY PASS ${tally.PASS} · FAIL ${tally.FAIL} · SKIP ${tally.SKIP} · INFO ${tally.INFO}`)
  console.log(`screenshots: ${OUT}`)
}
