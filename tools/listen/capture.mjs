// Drives the live Noesis app in a fresh headless Chrome, like a user: add the text, wait until the voice has
// generated every sentence, then read each sentence's stored Opus record from IndexedDB and decode it in the page.
// The stretch is built the way src/lib/player.js stretchAt builds it (packets and frames of every sentence
// concatenated into one Ogg Opus file, starts[] = cumulative frames / 48000), so joins are measured in the file
// the listener actually hears. Decoding runs in the page because the browser's Opus decoder is the one that plays.
import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const APP_URL = process.env.NOESIS_URL || 'https://noesis-777.pages.dev' // NOESIS_URL=http://localhost:5180 to test before a deploy
const AUDIO_FORMAT_PATH = fileURLToPath(new URL('../../src/lib/audio-format.js', import.meta.url))
const RATE = 48000 // player.js frame counts are 48 kHz; the decoder resamples to this rate
const PREP_TIMEOUT_MS = 5 * 60 * 1000 // the first run also downloads the ~63 MB voice
const POLL_MS = 1500

// Runs in the page. Reads the stores that src/lib/db.js writes (noesis-content, noesis-audio) and decodes.
// Returns Float32 samples as base64, because the page-to-Node channel does not carry typed arrays.
async function readAndDecode({ docId, voice, audioSrc, rate }) {
  const doc = await window.__idbGet('noesis-content', 'content', 'doc:' + docId)
  if (!doc) throw new Error('no content stored for ' + docId)
  const texts = doc.blocks.flatMap(b => b.s)
  const records = []
  for (let i = 0; i < texts.length; i++) records.push(await window.__idbGet('noesis-audio', 'audio', docId + ':' + i))
  records.forEach((rec, i) => {
    if (!rec) throw new Error(`sentence ${i} has no stored audio`)
    if (rec.codec !== 'opus') throw new Error(`sentence ${i} is stored as "${rec.codec}", not Opus: the joined stretch needs Opus`)
    if (rec.v !== voice) throw new Error(`sentence ${i} was voiced by ${rec.v}, not ${voice}`)
    if (rec.rate !== records[0].rate) throw new Error('sentences have mixed sample rates')
  })

  const mod = await import(URL.createObjectURL(new Blob([audioSrc], { type: 'text/javascript' })))
  const ctx = new AudioContext({ sampleRate: rate })
  const decode = async ogg => {
    const buf = await ctx.decodeAudioData(ogg.buffer.slice(ogg.byteOffset, ogg.byteOffset + ogg.byteLength))
    return buf.getChannelData(0).slice()
  }
  const toB64 = f32 => {
    const bytes = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength)
    let s = ''
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
    return btoa(s)
  }

  const sentences = []
  const allPackets = [], allFrames = [], starts = [0]
  let frames = 0
  for (const rec of records) {
    const u = mod.unpackPackets(rec)
    sentences.push(toB64(await decode(mod.muxOggOpus(u.packets, u.frames, { inputRate: rec.rate }))))
    for (let k = 0; k < u.packets.length; k++) { allPackets.push(u.packets[k]); allFrames.push(u.frames[k]); frames += u.frames[k] }
    starts.push(frames / rate) // same as player.js stretchAt: the sentence's end, in seconds
  }
  const joined = await decode(mod.muxOggOpus(allPackets, allFrames, { inputRate: records[0].rate }))
  ctx.close()
  return {
    texts,
    sentences,
    stretch: { pcm: toB64(joined), starts, framesTotal: frames, decodedSamples: joined.length, sampleRate: rate },
  }
}

const fromB64 = b64 => {
  const bytes = new Uint8Array(Buffer.from(b64, 'base64')) // copy: the Float32Array needs its own aligned buffer
  return new Float32Array(bytes.buffer)
}

// → { sentences: [{ text, pcm: Float32Array, rate }], stretch: { pcm, rate, starts, framesTotal, decodedSamples }, pageErrors }
// framesTotal is the sum of packet frames; decodedSamples is what the decoder produced (framesTotal minus the Opus pre-skip
// of 312 samples in a single pass, so the difference shows how the stretch timeline relates to the decoded audio).
export async function capture({ text, voice, url = APP_URL, onStatus = () => {} }) {
  const audioSrc = readFileSync(AUDIO_FORMAT_PATH, 'utf8')
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    // bypassCSP: the page imports a blob: module (the audio-format source) for decoding.
    const context = await browser.newContext({ viewport: { width: 1360, height: 860 }, bypassCSP: true })
    const page = await context.newPage()
    const pageErrors = []
    page.on('pageerror', e => pageErrors.push(String(e)))

    await page.goto(url)
    // NOESIS_SETTINGS (JSON) adds settings for the run, e.g. a provider key for an online voice. Never put a key in this file.
    await page.evaluate(([v, extra]) => localStorage.setItem('noesis.settings.v1', JSON.stringify({ voice: v, voiceEngine: 'natural', ...extra })), [voice, JSON.parse(process.env.NOESIS_SETTINGS || '{}')])
    await page.reload()
    const addButton = page.getByRole('button', { name: 'Add document' }).first()
    await addButton.waitFor({ timeout: 60000 })
    await addButton.click()
    await page.getByRole('tab', { name: 'Text', exact: true }).click()
    await page.getByPlaceholder(/Paste any text/).fill(text)
    await page.getByRole('button', { name: 'Add to library' }).click()
    await page.waitForFunction(() => history.state && history.state.view === 'reader', null, { timeout: 15000 })
    const docId = await page.evaluate(() => history.state.docId)

    // IndexedDB reader used by both steps below (installed in the page, not in the app).
    await page.evaluate(() => {
      window.__idbGet = (name, store, key) => new Promise((resolve, reject) => {
        const open = indexedDB.open(name)
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const db = open.result
          const req = db.transaction(store, 'readonly').objectStore(store).get(key)
          req.onsuccess = () => { db.close(); resolve(req.result) }
          req.onerror = () => reject(req.error)
        }
      })
    })

    const started = Date.now()
    let last = ''
    for (;;) {
      const meta = await page.evaluate(id => window.__idbGet('noesis-meta', 'meta', id), docId)
      const key = meta ? `${meta.status} ${meta.done}/${meta.total}` : 'no metadata yet'
      if (key !== last) { onStatus(key); last = key }
      if (meta && meta.status === 'ready') break
      if (meta && meta.status === 'error') throw new Error(`Noesis could not voice the text: ${meta.error}`)
      if (Date.now() - started > PREP_TIMEOUT_MS) throw new Error(`timed out after 5 minutes at "${key}"`)
      await new Promise(r => setTimeout(r, POLL_MS))
    }

    const out = await page.evaluate(readAndDecode, { docId, voice, audioSrc, rate: RATE })
    return {
      sentences: out.texts.map((t, i) => ({ text: t, pcm: fromB64(out.sentences[i]), rate: RATE })),
      stretch: { pcm: fromB64(out.stretch.pcm), rate: RATE, starts: out.stretch.starts, framesTotal: out.stretch.framesTotal, decodedSamples: out.stretch.decodedSamples },
      pageErrors,
    }
  } finally {
    await browser.close()
  }
}
