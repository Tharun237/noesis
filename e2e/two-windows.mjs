// The promise: a setting changed in one window of Noesis (the installed app) is the setting in every other open
// window (a tab), and no window writes its old copy back over it. A key saved in one was undone by the other.
//   npx vite --port 5180 --strictPort --host     then     node e2e/two-windows.mjs
import { chromium } from 'playwright-core'
const BASE = process.argv[2] || 'http://localhost:5180'
const ctx = await chromium.launchPersistentContext(new URL('../.qa-profile/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'), { channel: 'chrome', headless: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const open = async () => { const p = await ctx.newPage(); await p.goto(BASE); await p.waitForFunction(() => document.body.innerText.length > 50, null, { timeout: 20000 }); return p }
const set = (p, patch) => p.evaluate(async patch => { const find = x => performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes(x)); (await import(find('/src/lib/settings.js'))).settings.set(patch) }, patch)
const get = (p, k) => p.evaluate(async k => { const find = x => performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes(x)); return (await import(find('/src/lib/settings.js'))).settings.get()[k] }, k)
const app = await open(), tab = await open()
const before = await get(app, 'customModel')
await set(app, { customModel: 'saved-in-the-app' }) // a harmless setting stands in for the key
await sleep(500)
const seen = await get(tab, 'customModel')
await set(tab, { speed: 1.25 }) // the tab changes something else
await sleep(500)
const kept = JSON.parse(await app.evaluate(() => localStorage.getItem('noesis.settings.v1'))).customModel
const ok = seen === 'saved-in-the-app' && kept === 'saved-in-the-app'
console.log(`  ${seen === 'saved-in-the-app' ? '✔' : '✘'} the other window has it: ${seen}`)
console.log(`  ${kept === 'saved-in-the-app' ? '✔' : '✘'} after the other window changed something else, it is still: ${kept}`)
await set(app, { customModel: before, speed: 0.9 })
await ctx.close()
process.exit(ok ? 0 : 1)
