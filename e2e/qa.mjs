// End-to-end QA: drives the real app in Chrome like a user (real clicks, real audio, real voice engine).
//   node e2e/qa.mjs [baseUrl]          default http://localhost:5180 (run `npm run dev` first)
// Uses the installed Chrome (playwright-core, no browser download). The profile persists in
// .qa-profile/ so the ~90 MB voice model downloads only on the first run.
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import JSZip from 'jszip'

const BASE = process.argv[2] || 'http://localhost:5180'
const OUT = new URL('../.qa-out/', import.meta.url)
mkdirSync(OUT, { recursive: true })
const results = []
const sleep = ms => new Promise(r => setTimeout(r, ms))

const ctx = await chromium.launchPersistentContext(new URL('../.qa-profile/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'), {
  channel: 'chrome',
  headless: true,
  viewport: { width: 1360, height: 860 },
  acceptDownloads: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
})
const page = ctx.pages()[0] || await ctx.newPage()
// Headless Chrome with a persistent profile exits on real downloads (reproduced with a plain 5-byte file),
// so exports are verified at the app's download boundary: capture the file name and the blob's real size.
await page.addInitScript(() => {
  window.__downloads = []
  const click = HTMLAnchorElement.prototype.click
  HTMLAnchorElement.prototype.click = function () {
    if (this.download && this.href.startsWith('blob:')) {
      const name = this.download
      fetch(this.href).then(r => r.blob()).then(b => window.__downloads.push({ name, size: b.size, type: b.type }))
      return
    }
    return click.call(this)
  }
})
const lastDownload = () => until(() => page.evaluate(() => window.__downloads.at(-1)), 8000, 'export file')
const errors = []
page.on('pageerror', e => errors.push(String(e)))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('dialog', d => d.accept(d.type() === 'prompt' ? 'Renamed by QA' : undefined))
page.on('crash', () => { errors.push('RENDERER CRASHED'); console.log('  !! renderer crashed') })
page.on('close', () => console.log('  !! page closed'))
ctx.on('close', () => console.log('  !! browser context closed'))

// Live app modules (dev server URLs may carry HMR ?t= versions; use the exact URL the app loaded).
const app = (expr) => page.evaluate(async expr => {
  const find = p => performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes(p)) || p
  const m = {
    lib: await import(find('/src/lib/library.js')), pl: await import(find('/src/lib/player.js')),
    nav: await import(find('/src/lib/nav.js')), settings: await import(find('/src/lib/settings.js')),
    sync: await import(find('/src/lib/sync.js')), tts: await import(find('/src/lib/tts.js')),
  }
  return (0, eval)(`(m) => (${expr})`)(m)
}, expr)

async function step(name, fn) {
  const t0 = Date.now()
  try {
    const note = await fn()
    results.push({ name, ok: true, ms: Date.now() - t0, note })
    console.log(`  ✔ ${name}${note ? ` — ${note}` : ''}`)
  } catch (e) {
    const file = `${String(results.length + 1).padStart(2, '0')}-${name.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.png`
    await page.screenshot({ path: new URL(file, OUT).pathname.replace(/^\/([A-Z]:)/, '$1') }).catch(() => {})
    results.push({ name, ok: false, ms: Date.now() - t0, error: e.message, shot: file })
    console.log(`  ✖ ${name} — ${e.message}`)
  }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg) }
async function until(fn, ms, what) {
  const end = Date.now() + ms
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`)
    await sleep(400)
  }
}
const click = (role, name) => page.getByRole(role, { name, exact: true }).first().click()
const playerState = () => app('({ ...m.pl.player.get(), clock: m.pl.audioClock() })')
const docBy = title => app(`m.lib.library.get().docs.find(d => d.title === ${JSON.stringify(title)})`)

console.log(`QA against ${BASE}`)
await page.goto(BASE)
await page.evaluate(() => { localStorage.setItem('noesis.settings.v1', JSON.stringify({})) }) // defaults: natural (Piper) voice
await page.goto(BASE)
await page.waitForLoadState('networkidle')

// Start every run from an empty library.
await app(`Promise.all(m.lib.library.get().docs.map(d => m.lib.deleteDoc(d.id)))`)
await page.reload()

await step('empty state renders', async () => {
  await page.getByRole('heading', { name: /Listen to\s*anything/ }).waitFor({ timeout: 8000 })
})

await step('add sample → reader opens', async () => {
  await click('button', 'Try a sample')
  await until(() => page.evaluate(() => history.state?.view === 'reader'), 5000, 'reader view')
})

await step('voice engine loads and voices the sample', async () => {
  await until(async () => (await docBy('On Listening'))?.status === 'ready', 240_000, 'sample to be fully voiced')
  const d = await docBy('On Listening')
  return `${d.total} sentences, ${d.vSec.toFixed(1)} s audio, voice ${(await app('m.tts.engine.get().voice'))}, ${(await app('m.settings.settings.get().voiceSpeed'))}× real time`
})

await step('play starts audio and highlights the sentence', async () => {
  await click('button', 'Play')
  await until(async () => (await playerState()).clock > 0.5, 15_000, 'audio clock to advance')
  const active = await page.evaluate(() => [...document.querySelectorAll('[data-i]')].some(e => e.style.background && e.style.background !== 'transparent'))
  expect(active, 'no highlighted sentence')
})

await step('plays one continuous stretch longer than 5 s (needed for the Android media notification)', async () => {
  const st = await until(async () => { const x = await app('m.pl.stretchInfo()'); return x && x.seconds > 0 && x }, 5000, 'a loaded stretch')
  expect(st.to - st.from > 1 && st.seconds > 5, `stretch is ${st.to - st.from} sentence(s), ${st.seconds?.toFixed(1)} s`)
  return `${st.to - st.from} sentences in one file, ${st.seconds.toFixed(1)} s`
})

await step('word highlighting follows speech', async () => {
  const words = new Set()
  for (let k = 0; k < 10; k++) {
    words.add(await page.evaluate(() => [...document.querySelectorAll('[data-i] > span')].find(s => s.style.color)?.textContent))
    await sleep(300)
  }
  words.delete(undefined)
  expect(words.size >= 2, `only saw ${words.size} highlighted words`)
  return `${words.size} distinct words lit`
})

await step('next / previous sentence', async () => {
  const a = (await playerState()).i
  await click('button', 'Next sentence')
  await until(async () => (await playerState()).i === a + 1, 5000, 'next sentence')
  await click('button', 'Previous sentence')
  await until(async () => (await playerState()).i === a, 5000, 'previous sentence')
})

await step('speed menu sets 1.5x on the audio', async () => {
  await page.getByRole('button', { name: 'Playback speed' }).click()
  await page.getByRole('menuitem', { name: '1.5x', exact: true }).click()
  expect((await playerState()).rate === 1.5, 'rate not 1.5')
  await page.getByRole('button', { name: 'Playback speed' }).click()
  const box = await page.getByRole('menu').boundingBox()
  expect(box.x >= 0 && box.x + box.width <= 1360 && box.y >= 0, `speed menu off-screen: ${JSON.stringify(box)}`)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Playback speed' }).click()
  await page.getByRole('menuitem', { name: /^1x( default)?$/ }).click()
})

await step('pause stops audio and saves position', async () => {
  await click('button', 'Pause')
  const c1 = (await playerState()).clock
  await sleep(800)
  const s = await playerState()
  expect(!s.playing && Math.abs(s.clock - c1) < 0.05, 'audio still advancing after pause')
  const d = await docBy('On Listening')
  expect(d.pos === s.i, `saved pos ${d.pos} ≠ player ${s.i}`)
})

await step('change voice mid-listening: same sentence restarts in the new voice', async () => {
  await click('button', 'Play')
  await until(async () => (await playerState()).clock > 0.3, 10_000, 'playback')
  const before = await playerState()
  const changedAt = Date.now()
  await page.getByRole('button', { name: 'Player menu' }).click()
  await page.getByRole('menuitem', { name: /Change voice/ }).click()
  await page.getByRole('button', { name: /^John/ }).click()
  await until(async () => (await docBy('On Listening')).voice === 'en_US-john-medium', 3000, 'voice saved')
  // The old voice must stop at once, and the SAME sentence must restart in the new voice.
  await until(async () => { const s = await playerState(); return s.waiting || s.gate != null || !s.playing || s.clock < 0.3 }, 3000, 'old voice to stop immediately')
  const resumed = await until(async () => {
    const s = await playerState()
    return s.playing && !s.waiting && s.clock > 0.2 && s
  }, 240_000, 'playback to resume in the new voice') // the readiness gate holds playback until it can't stall (device-speed dependent)
  expect(resumed.i === before.i, `resumed at sentence ${resumed.i}, expected the same sentence ${before.i}`)
  return `old voice stopped, sentence ${before.i} restarted in John after ${((Date.now() - changedAt) / 1000).toFixed(1)} s`
})

await step('scrubber seeks', async () => {
  await click('button', 'Pause')
  const slider = page.getByRole('slider', { name: 'Position' })
  const box = await slider.boundingBox()
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height / 2)
  await until(async () => (await playerState()).i >= 6, 5000, 'seek to ~80%')
  return `now at sentence ${(await playerState()).i}`
})

await step('sleep timer sets', async () => {
  await page.getByRole('button', { name: 'Player menu' }).click()
  await page.getByRole('menuitem', { name: 'Sleep in 10 minutes' }).click()
  const s = await playerState()
  expect(s.sleep?.until > Date.now(), 'sleep not set')
  await page.getByRole('button', { name: 'Player menu' }).click()
  await page.getByRole('menuitem', { name: 'Sleep timer off' }).click()
})

await step('bookmark current sentence', async () => {
  await page.getByRole('button', { name: 'Bookmark this sentence' }).click()
  await until(async () => (await docBy('On Listening')).marks.length === 1, 3000, 'bookmark saved')
  await page.getByRole('button', { name: 'Bookmarks & notes' }).click()
  await page.getByPlaceholder('Add a note').fill('QA note')
  await page.getByPlaceholder('Add a note').blur()
  await until(async () => (await docBy('On Listening')).marks[0].note === 'QA note', 3000, 'note saved')
  await page.keyboard.press('Escape')
})

await step('find in document', async () => {
  await page.getByRole('button', { name: 'Find in document' }).click()
  await page.getByRole('textbox', { name: 'Find in document' }).fill('voice')
  await until(() => page.getByText(/^1\/\d+$/).isVisible(), 3000, 'match counter')
  await page.getByRole('button', { name: 'Close search' }).click()
})

await step('reading settings: switch to DM Sans', async () => {
  await page.getByRole('button', { name: 'Reading settings' }).click()
  await page.getByRole('tab', { name: 'DM Sans' }).click()
  const font = await page.evaluate(() => getComputedStyle(document.querySelector('article p')).fontFamily)
  expect(/DM Sans/.test(font), `font is ${font}`)
  await page.getByRole('tab', { name: 'Literata' }).click()
  await page.keyboard.press('Escape')
})

await step('keyboard: space toggles playback', async () => {
  await until(async () => (await docBy('On Listening')).status === 'ready', 120_000, 'audio regenerated after the voice change')
  await page.evaluate(() => document.activeElement?.blur())
  await page.keyboard.press('Space')
  await until(async () => (await playerState()).playing, 5000, 'play via space')
  await page.keyboard.press('Space')
  await until(async () => !(await playerState()).playing, 5000, 'pause via space')
})

await step('export transcript downloads markdown', async () => {
  await page.getByRole('button', { name: 'Document menu' }).click()
  await page.evaluate(() => { window.__downloads = [] })
  await page.getByRole('menuitem', { name: 'Export transcript' }).click()
  const f = await lastDownload()
  expect(f.name.endsWith('.md') && f.size > 300, JSON.stringify(f))
  return `${f.name} ${f.size} B`
})

await step('save audio downloads one opus file', async () => {
  await until(async () => (await docBy('On Listening')).status === 'ready', 120_000, 'audio regenerated in the new voice')
  await page.getByRole('button', { name: 'Document menu' }).click()
  await page.evaluate(() => { window.__downloads = [] })
  await page.getByRole('menuitem', { name: /Save audio/ }).click()
  const f = await lastDownload()
  expect(f.name.endsWith('.opus') && f.size > 20_000, JSON.stringify(f))
  return `${f.name} ${(f.size / 1024).toFixed(0)} KB`
})

await step('back to library shows the card', async () => {
  await page.getByRole('button', { name: 'Back to library' }).click()
  await page.getByText('On Listening').first().waitFor({ timeout: 5000 })
  expect(await page.evaluate(() => history.state.view) === 'library', 'not in library')
})

await step('rename, collection, archive from the card menu', async () => {
  await page.getByRole('button', { name: 'More options for On Listening', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  await page.getByText('Renamed by QA').first().waitFor({ timeout: 3000 })
  await page.getByRole('button', { name: 'More options for Renamed by QA', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Add to collection' }).click()
  await page.getByPlaceholder('New collection').fill('QA shelf')
  await page.getByRole('button', { name: 'Create' }).click()
  await page.keyboard.press('Escape')
  const d = await docBy('Renamed by QA')
  expect(d.collections.length === 1, 'not in collection')
  await page.getByRole('button', { name: 'More options for Renamed by QA', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Archive' }).click()
  expect((await docBy('Renamed by QA')).archived, 'not archived')
  await page.getByRole('button', { name: /^Archived/ }).click() // archived docs leave the Queue view
  await page.getByRole('button', { name: 'More options for Renamed by QA', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Move to queue' }).click()
  expect(!(await docBy('Renamed by QA')).archived, 'still archived')
  await page.getByRole('button', { name: /^Queue/ }).click()
})

// ── every input type ──────────────────────────────────────────────────────────────
async function addViaSheet(fill) {
  // Start clean: close any open sheet/menu and return to the library, so one failure can't cascade.
  for (let k = 0; k < 3 && await page.locator('[role=dialog], [role=menu]').count(); k++) { await page.keyboard.press('Escape'); await sleep(400) }
  await page.evaluate(() => history.state.view !== 'library' && history.back())
  await sleep(300)
  await page.getByRole('button', { name: 'Add document' }).first().click()
  await fill()
  await page.getByRole('button', { name: 'Add to library' }).click()
  await until(() => page.evaluate(() => history.state?.view === 'reader'), 5000, 'reader')
  const id = await page.evaluate(() => history.state.docId)
  await until(async () => ['voicing', 'ready', 'error'].includes((await app(`m.lib.getDoc(${JSON.stringify(id)})`))?.status), 90_000, 'document prepared')
  const d = await app(`m.lib.getDoc(${JSON.stringify(id)})`)
  expect(d.status !== 'error', d.error)
  await page.getByRole('button', { name: 'Back to library' }).click()
  return d
}

await step('add pasted Markdown', async () => {
  const d = await addViaSheet(async () => {
    await page.getByRole('tab', { name: 'Text', exact: true }).click()
    // (title typed by the user must survive parsing — checked below)
    await page.getByPlaceholder('Title (optional)').fill('QA Markdown')
    await page.getByPlaceholder(/Paste any text/).fill('# Heading One\n\nSome **bold** text with $x^2$ math.\n\n- a list item\n\n```js\nconsole.log(1)\n```\n')
  })
  expect(d.title === 'QA Markdown', `user title replaced by "${d.title}"`)
  return `${d.total} sentences`
})

await step('add web link (Wikipedia)', async () => {
  const d = await addViaSheet(async () => {
    await page.getByRole('tab', { name: 'Link', exact: true }).click()
    await page.getByPlaceholder('https://').fill('https://en.wikipedia.org/wiki/Dad_joke')
  })
  return `"${d.title}", ${d.total} sentences`
})

await step('add scanned PDF (Traction)', async () => {
  const d = await addViaSheet(async () => {
    await page.locator('input[type=file]').setInputFiles(new URL('../testdata/traction.pdf', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'))
  })
  expect(d.scanned, 'scan not detected')
  return `${d.total} sentences, note: ${d.note?.slice(0, 70)}`
})

await step('add EPUB (generated)', async () => {
  const zip = new JSZip()
  zip.file('mimetype', 'application/epub+zip')
  zip.file('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
  zip.file('OEBPS/content.opf', '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>QA Epub</dc:title><dc:creator>Test Author</dc:creator></metadata><manifest><item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>')
  zip.file('OEBPS/ch1.xhtml', '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Chapter One</h1><p>It was a bright cold day in April. The clocks were striking a new hour.</p><p>Second paragraph of the first chapter, long enough to count as real prose.</p></body></html>')
  const file = new URL('qa.epub', OUT)
  writeFileSync(file, await zip.generateAsync({ type: 'nodebuffer' }))
  const d = await addViaSheet(() => page.locator('input[type=file]').setInputFiles(file.pathname.replace(/^\/([A-Z]:)/, '$1')))
  expect(d.title === 'QA Epub' && d.author === 'Test Author', `title/author: ${d.title} / ${d.author}`)
  return `${d.total} sentences`
})

await step('add DOCX (generated)', async () => {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>A Word document for QA. It has two sentences.</w:t></w:r></w:p></w:body></w:document>')
  const file = new URL('qa.docx', OUT)
  writeFileSync(file, await zip.generateAsync({ type: 'nodebuffer' }))
  const d = await addViaSheet(() => page.locator('input[type=file]').setInputFiles(file.pathname.replace(/^\/([A-Z]:)/, '$1')))
  return `${d.total} sentences`
})

await step('delete a document', async () => {
  const before = (await app('m.lib.library.get().docs.length'))
  await page.getByRole('button', { name: 'More options for QA Markdown', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await until(async () => (await app('m.lib.library.get().docs.length')) === before - 1, 3000, 'doc removed')
})

await step('settings: dev sign-in turns on sync', async () => {
  await page.getByRole('button', { name: 'Settings' }).first().click()
  await page.getByText('Account & sync', { exact: false }).first().waitFor({ timeout: 8000 })
  const dev = page.getByPlaceholder('test account name')
  await dev.waitFor({ timeout: 5000 }).catch(() => {})
  if (!(await dev.count())) return 'skipped (dev sign-in not enabled)'
  await dev.fill('qa')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await until(async () => (await app('m.sync.syncState.get().status')) === 'idle' && (await app('!!m.sync.account.get().user')), 15_000, 'synced')
  await page.getByRole('button', { name: 'Back', exact: true }).click()
})

// ── built-in voice (phones), readiness gate, back navigation ──────────────────────
const traction = () => app("m.lib.library.get().docs.find(d => d.title.startsWith('Traction'))")
const openDoc = async prefix => {
  await page.evaluate(() => history.state.view !== 'library' && document.querySelector('button[aria-label="Back to library"]')?.click())
  await sleep(500)
  await page.locator('[role=button]').filter({ hasText: prefix }).first().click()
  await until(() => page.evaluate(() => history.state?.view === 'reader'), 5000, 'reader')
}

await step('settings: switch to the built-in voice', async () => {
  await page.getByRole('button', { name: 'Settings' }).first().click().catch(() => {})
  await page.getByRole('tab', { name: 'Built-in' }).click()
  expect(await app("m.settings.settings.get().voiceEngine") === 'system', 'engine not system')
  await page.getByRole('button', { name: 'Back', exact: true }).click()
})

await step('built-in voice plays a book with exact word highlighting', async () => {
  await openDoc('Traction')
  await page.getByRole('button', { name: /^(Play|Resume)$/ }).first().click()
  await until(async () => (await playerState()).playing && await page.evaluate(() => speechSynthesis.speaking), 8000, 'speech to start')
  const words = new Set()
  for (let k = 0; k < 12; k++) { words.add((await playerState()).word); await sleep(250) }
  expect(words.size >= 3, `word position barely moved: ${[...words]}`)
  const lit = await page.evaluate(() => [...document.querySelectorAll('[data-i] > span')].find(s => s.style.color)?.textContent)
  expect(!!lit, 'no word highlighted')
  return `${words.size} word positions, lit "${lit}"`
})

await step('built-in voice: next sentence and pause', async () => {
  const a = (await playerState()).i
  await click('button', 'Next sentence')
  await until(async () => (await playerState()).i === a + 1 && await page.evaluate(() => speechSynthesis.speaking), 6000, 'next sentence speaking')
  await click('button', 'Pause')
  await until(async () => !(await page.evaluate(() => speechSynthesis.speaking)), 4000, 'speech to stop')
})

await step('no natural-voice generation while the built-in voice is active', async () => {
  const before = (await traction()).done
  await sleep(8000)
  const after = (await traction()).done
  expect(after === before, `natural generation still running: ${before} → ${after}`)
})

await step('back from a reader restored with no page behind it', async () => {
  const id = (await traction()).id
  await page.evaluate(id => history.replaceState({ view: 'reader', docId: id, depth: 0 }, ''), id)
  await page.reload()
  await until(() => page.evaluate(() => history.state?.view === 'reader' && !!document.querySelector('button[aria-label="Back to library"]')), 8000, 'restored reader')
  await page.getByRole('button', { name: 'Back to library' }).click()
  await until(() => page.evaluate(() => history.state?.view === 'library' && document.body.innerText.includes('Queue')), 4000, 'library after back')
})

await step('natural voice: readiness gate instead of stalling', async () => {
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('noesis.settings.v1')); s.voiceEngine = 'natural'; s.voiceSpeed = 0.05; localStorage.setItem('noesis.settings.v1', JSON.stringify(s)) })
  await page.reload()
  await openDoc('Traction')
  await page.getByRole('button', { name: /^(Play|Resume)$/ }).first().click()
  await until(() => page.getByText(/still being prepared on this device/).isVisible(), 5000, 'gate message')
  const s1 = await playerState()
  expect(!s1.playing && s1.gate > 0, `expected gated, got playing=${s1.playing} gate=${s1.gate}`)
  await page.getByRole('button', { name: 'Use built-in voice now' }).click()
  await until(async () => (await playerState()).playing && await page.evaluate(() => speechSynthesis.speaking), 8000, 'built-in voice to take over')
  await click('button', 'Pause')
  return `gated with ~${Math.round(s1.gate / 60)} min to wait, switched to built-in instantly`
})

const cardTitles = async () => {
  const all = (await app('m.lib.library.get().docs.map(d => d.title)')).sort((a, b) => b.length - a.length) // longest first: 'QA Short 2' before 'QA Short'
  return page.evaluate(all => [...document.querySelectorAll('div[role=button][tabindex="0"]')].map(e => all.find(t => e.innerText.includes(t))).filter(Boolean), all)
}
const addText = (title, text) => app(`m.lib.addDocument({ kind: 'text', name: ${JSON.stringify(title)}, text: ${JSON.stringify(text)} }, { title: ${JSON.stringify(title)}, renamed: true })`)
const SHORT = 'One sentence here. Two sentences there. And a third to end it.'

await step('library: sort by title, filter by file type', async () => {
  await page.getByRole('button', { name: 'Back to library' }).click()
  await app("m.nav.ui.set({ filter: 'all' })")
  await page.getByRole('button', { name: 'Sort and filter' }).first().click()
  await click('menuitem', 'Title')
  const titles = await cardTitles()
  expect(titles.length > 2 && titles.join('|') === [...titles].sort((a, b) => a.localeCompare(b)).join('|'), `not sorted by title: ${titles}`)
  await page.getByRole('button', { name: 'Sort and filter' }).first().click()
  await click('menuitem', 'PDF')
  await until(async () => { const t = await cardTitles(); return t.length === 1 && t[0].startsWith('Traction') }, 3000, 'only the PDF')
  await page.getByRole('button', { name: 'Sort and filter' }).first().click()
  await click('menuitem', 'Clear filters')
  await until(async () => (await cardTitles()).length === titles.length, 3000, 'filters cleared')
  return `${titles.length} docs in title order; PDF filter → 1`
})

await step('"ready to listen" toast when a document finishes preparing', async () => {
  await addText('QA Short', SHORT)
  await until(() => page.getByText('Ready to listen: QA Short').isVisible(), 15000, 'ready toast')
})

await step('end of document: archives it and plays the next in the queue', async () => {
  await app("m.settings.settings.set({ autoplayNext: true, archiveFinished: true, sort: 'title' })")
  const id = (await docBy('QA Short')).id
  await app(`m.pl.open(${JSON.stringify(id)}, { at: 2 })`)
  await until(async () => { const d = await docBy('QA Short'); return d.finished && d.archived }, 15000, 'finished and archived')
  await until(async () => { const s = await playerState(); return s.id !== id && s.playing }, 8000, 'next document playing')
  const next = await app('m.lib.getDoc(m.pl.player.get().id).title')
  await click('button', 'Pause')
  return `up next: ${next}`
})

await step('sleep at end of document stops instead of playing the next', async () => {
  await addText('QA Short 2', SHORT)
  await until(async () => ['voicing', 'ready'].includes((await docBy('QA Short 2'))?.status), 15000, 'text prepared')
  const id = (await docBy('QA Short 2')).id
  await app(`m.pl.open(${JSON.stringify(id)}, { at: 2, autoplay: false })`)
  await page.getByRole('button', { name: 'Player menu' }).click()
  await page.getByRole('menuitem', { name: 'Sleep at end of document' }).click()
  expect((await playerState()).sleep?.doc, 'sleep-at-end not set')
  await page.getByRole('button', { name: /^(Play|Resume)$/ }).first().click()
  await until(async () => (await docBy('QA Short 2')).finished, 15000, 'document finished')
  await sleep(1500)
  const s = await playerState()
  expect(s.id === id && !s.playing && !s.sleep, `kept going: id=${s.id === id} playing=${s.playing}`)
  await app("m.settings.settings.set({ autoplayNext: false, archiveFinished: false })")
})

await step('mobile layout: no horizontal overflow, mini player', async () => {
  await page.setViewportSize({ width: 390, height: 844 })
  await sleep(600)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  expect(!overflow, 'horizontal overflow on mobile')
  await page.setViewportSize({ width: 1360, height: 860 })
})

await step('no uncaught errors in console', async () => {
  const real = errors.filter(e => !/favicon|DevTools|Download the React/.test(e))
  expect(real.length === 0, real.slice(0, 3).join(' | '))
})

writeFileSync(new URL('results.json', OUT), JSON.stringify(results, null, 2))
const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? ` · failures screenshotted in .qa-out/` : ''}`)
await ctx.close()
process.exit(failed.length ? 1 : 0)
