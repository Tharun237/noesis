// Renders film/intro.html to a video, frame by frame: the page draws any moment on request (render(t)), so
// each frame is asked for, photographed and handed to ffmpeg. The result is exact and the same every time,
// whatever the speed of the machine.
//
//   node film/render.mjs                    film/noesis-intro.mp4, 1920x1080, 30 frames a second, with its sound
//   node film/render.mjs --stills           a contact sheet of moments instead (film/stills.png), to judge it
//   node film/render.mjs --where ""         without the address on the last card
//
// Needs the dev server on port 5180 (it serves the fonts and the wordmark) and ffmpeg on the PATH.
import { chromium } from 'playwright-core'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { renameSync, rmSync } from 'node:fs'
import { makeSound } from './sound.mjs'

const FPS = 30
const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1] ?? '' }
const where = arg('--where')
const out = fileURLToPath(new URL(process.argv.includes('--stills') ? './stills.png' : './noesis-intro.mp4', import.meta.url))

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
await page.goto(`http://localhost:5180/film/intro.html${where === undefined ? '' : `?where=${encodeURIComponent(where)}`}`)
await page.waitForFunction(() => window.READY === true, null, { timeout: 30000 })
const seconds = await page.evaluate(() => window.DURATION)

if (process.argv.includes('--stills')) {
  // moments spread over the film, laid side by side in a second page
  const moments = [0.9, 2.4, 4.3, 6.6, 8.6, 10.4, 12.2, 14.4, 16.0, 17.9, 19.0, 20.2, 21.6, 23.2, 24.2, 25.9, 26.9, 28.3, 29.6]
  const shots = []
  for (const t of moments) { await page.evaluate(t => window.render(t), t); shots.push([t, (await page.screenshot({ type: 'jpeg', quality: 80 })).toString('base64')]) }
  const sheet = await browser.newPage({ viewport: { width: 1960, height: 600 } })
  await sheet.setContent(`<body style="margin:0;padding:12px;background:#222;font:14px monospace;color:#bbb"><div style="display:grid;grid-template-columns:repeat(4,472px);gap:12px">${shots.map(([t, b]) => `<div><img src="data:image/jpeg;base64,${b}" style="width:472px;display:block;border:1px solid #444"><div>${t.toFixed(1)} s</div></div>`).join('')}</div></body>`)
  await sheet.screenshot({ path: out, fullPage: true })
} else {
  const ffmpeg = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] })
  const done = new Promise((resolve, reject) => ffmpeg.on('close', code => (code ? reject(new Error(`ffmpeg ended with ${code}`)) : resolve())))
  const frames = Math.round(seconds * FPS)
  for (let f = 0; f < frames; f++) {
    await page.evaluate(t => window.render(t), f / FPS)
    const jpg = await page.screenshot({ type: 'jpeg', quality: 97 })
    if (!ffmpeg.stdin.write(jpg)) await new Promise(r => ffmpeg.stdin.once('drain', r))
    if (f % 150 === 0) console.log(`${Math.round((f / frames) * 100)}%`)
  }
  ffmpeg.stdin.end()
  await done
  // the sound (film/sound.mjs), joined to the picture
  const silent = out.replace(/\.mp4$/, '.silent.mp4')
  renameSync(out, silent)
  const { out: wav } = makeSound()
  const join = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-i', silent, '-i', wav, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', out], { stdio: 'inherit' })
  await new Promise((resolve, reject) => join.on('close', code => (code ? reject(new Error(`ffmpeg ended with ${code}`)) : resolve())))
  rmSync(silent)
}
await browser.close()
console.log(out)
