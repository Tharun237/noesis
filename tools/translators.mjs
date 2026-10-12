// Builds Noesis's own copy of the free translation models, so that listening in another language needs no
// AI key and costs nothing: the customer's device translates, the way it already speaks.
//
// The models are Mozilla's (the ones inside Firefox), under the MPL 2.0, which allows passing them on. Mozilla's
// own servers do not let another website read them (no cross-origin permission), so Noesis serves a copy:
// a separate static site on Cloudflare Pages (free, with no charge for what static files send), kept apart
// from the app so that an app deploy stays small.
//
//   node tools/translators.mjs            builds translate-site/ and writes src/lib/translators.json
//   cd translate-site && npx wrangler pages deploy . --project-name noesis-translate --branch main
//   (from INSIDE translate-site: run from the app's folder, wrangler also attaches the app's server
//   functions to this site, which is only files)
//
// What Firefox ships is listed in its public settings service; each file is checked against the sha256 given
// there. A file larger than Cloudflare Pages allows (25 MiB) is cut into parts; the app joins them again and
// checks the whole against the same sha256.
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const SITE = join(root, 'translate-site')
const KEPT = join(root, '.translators-cache') // downloads kept between runs
const LIST = 'https://firefox.settings.services.mozilla.com/v1/buckets/main/collections/translations-models/records'
const FILES = 'https://firefox-settings-attachments.cdn.mozilla.net/'
const PART = 20 * 1024 * 1024
// Noesis's language codes → Mozilla's
const THEIRS = { en: 'en', hi: 'hi', te: 'te', es: 'es', fr: 'fr', de: 'de', it: 'it', pt: 'pt', vi: 'vi', zh: 'zh-Hans', ja: 'ja', ko: 'ko', ar: 'ar' }
const others = Object.keys(THEIRS).filter(l => l !== 'en')
const pairs = [...others.map(l => ['en', l]), ...others.map(l => [l, 'en'])]

const records = (await (await fetch(LIST)).json()).data
mkdirSync(KEPT, { recursive: true })
rmSync(SITE, { recursive: true, force: true })
mkdirSync(SITE, { recursive: true })

const manifest = {}
let total = 0
for (const [from, to] of pairs) {
  const all = records.filter(r => r.fromLang === THEIRS[from] && r.toLang === THEIRS[to])
  if (!all.length) { console.log(`${from} → ${to}: Mozilla has no model`); continue }
  const version = all.map(r => r.version).sort((a, b) => parseFloat(b) - parseFloat(a))[0]
  const dir = from + to
  mkdirSync(join(SITE, dir), { recursive: true })
  const files = []
  for (const r of all.filter(r => r.version === version)) {
    const a = r.attachment
    const kept = join(KEPT, a.hash)
    if (!existsSync(kept)) writeFileSync(kept, Buffer.from(await (await fetch(FILES + a.location)).arrayBuffer()))
    const bytes = readFileSync(kept)
    if (bytes.length !== a.size || createHash('sha256').update(bytes).digest('hex') !== a.hash) throw new Error(`${a.filename}: not the file Mozilla lists`)
    const parts = Math.max(1, Math.ceil(bytes.length / PART))
    for (let k = 0; k < parts; k++) writeFileSync(join(SITE, dir, `${a.filename}.${k}`), bytes.subarray(k * PART, (k + 1) * PART))
    files.push({ type: r.fileType, name: a.filename, size: a.size, sha256: a.hash, parts })
    total += a.size
  }
  manifest[dir] = { from, to, version, size: files.reduce((s, f) => s + f.size, 0), files }
  console.log(`${from} → ${to}: v${version}, ${(manifest[dir].size / 1e6).toFixed(1)} MB, ${files.map(f => f.type).join(' ')}`)
}

writeFileSync(join(SITE, '_headers'), `/*
  Access-Control-Allow-Origin: *
  Cross-Origin-Resource-Policy: cross-origin
  Cache-Control: public, max-age=31536000, immutable
  X-Robots-Tag: noindex
`)
writeFileSync(join(SITE, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Noesis translation models</title>
<body style="font: 16px/1.6 system-ui; max-width: 640px; margin: 48px auto; padding: 0 20px">
<h1>Translation models for Noesis</h1>
<p>These are the neural translation models from Mozilla's Firefox Translations, unchanged except that large
files are cut into parts. They are licensed under the <a href="https://www.mozilla.org/MPL/2.0/">Mozilla Public
License 2.0</a>. Source and training: <a href="https://github.com/mozilla/translations">github.com/mozilla/translations</a>.</p>
<p><a href="https://www.noesisaudio.com/">Noesis</a> uses them to translate a document on your own device.</p>
</body>
`)
writeFileSync(join(root, 'src/lib/translators.json'), JSON.stringify(manifest, null, 1) + '\n')
console.log(`\n${Object.keys(manifest).length} translators, ${(total / 1e6).toFixed(0)} MB in translate-site/; manifest in src/lib/translators.json`)
