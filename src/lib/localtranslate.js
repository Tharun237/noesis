// Translation on the customer's own device, free and with no key: the same bargain as the voices.
//
// The models are Mozilla's Firefox Translations models (MPL 2.0) and the engine is bergamot-translator
// compiled to WebAssembly (MPL 2.0; public/translate/, copied from its package by postinstall). A translator
// for one direction (English to Telugu, say) is 21 to 55 MB: fetched once from Noesis's own copy of the models
// (tools/translators.mjs builds and describes it), checked against its sha256, and kept on the device, after
// which translating works with no connection. Nothing of the document leaves the device.
//
// Everything heavy (the download, the checking, the storing, the translating) happens in a worker
// (public/translate/noesis-translate.js): this page-side module only passes small messages, so a phone's
// screen stays free. The worker and its 5 MB engine are fetched when a translation is first asked for,
// never with the app, and are let go when the document is done.
//
// Every model goes to or from English. Between two other languages the engine goes through English
// (two translators), which is how Firefox does it too.
import MODELS from './translators.json' with { type: 'json' }

const HOST = 'https://noesis-translate.pages.dev'
const ENGINE = '/translate/noesis-translate.js'
const BATCH = 6 // texts handed to the engine at once: it answers between batches, so progress moves

// The translators a document needs to get from one language to another: [] when they are the same, null when
// it cannot be done here. Pure.
export function route(from, to, models = MODELS) {
  if (from === to) return []
  if (models[from + to]) return [models[from + to]]
  const first = models[from + 'en'], second = models['en' + to]
  return first && second ? [first, second] : null
}
export const routeBytes = steps => steps.reduce((a, m) => a + m.size, 0)
export const canTranslateHere = (from, to) => typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined' && !!route(from, to)?.length

let worker = null
let seq = 0
let hearLoad = null // told { got, total } while a translator downloads
const waiting = new Map()

function call(name, ...args) {
  return new Promise((resolve, reject) => {
    const id = ++seq
    waiting.set(id, { resolve, reject })
    worker.postMessage({ id, name, args })
  })
}

async function engine() {
  if (worker) return
  worker = new Worker(ENGINE)
  worker.onmessage = ({ data }) => {
    if (data.load) return hearLoad?.(data.load)
    const w = waiting.get(data.id)
    if (!w) return
    waiting.delete(data.id)
    data.error ? w.reject(new Error(data.error.message || 'The translator stopped.')) : w.resolve(data.result)
  }
  worker.onerror = e => {
    const err = new Error(e.message || 'The translator could not start in this browser.')
    for (const w of waiting.values()) w.reject(err)
    waiting.clear()
  }
  await call('initialize', { cacheSize: 0 })
}

// texts → the same number of texts, in `to`. onLoad(gotBytes, totalBytes) while a translator is being
// downloaded (never called when it is already on the device).
export async function translateTexts(texts, from, to, { onLoad } = {}) {
  const steps = route(from, to)
  if (!steps) throw new Error('There is no translator for this pair of languages.')
  if (!steps.length || !texts.length) return [...texts]
  await engine()
  // Two translators (through English) are fetched one after the other: their bytes are counted as one download.
  let before = 0
  const all = routeBytes(steps)
  for (const model of steps) {
    hearLoad = ({ got }) => onLoad?.(before + got, all)
    await call('loadFromStore', { host: HOST, model })
    before += model.size
  }
  hearLoad = null
  const models = steps.map(m => ({ from: m.from, to: m.to }))
  const out = []
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = await call('translate', { models, texts: texts.slice(i, i + BATCH).map(text => ({ text, html: false })) })
    out.push(...batch.map(r => r.target.text))
  }
  return out
}

// The engine holds a translator in memory (tens of megabytes): let it go when a document is done.
export function doneTranslating() {
  worker?.terminate()
  worker = null
  hearLoad = null
  for (const w of waiting.values()) w.reject(new Error('Translation was stopped.'))
  waiting.clear()
}
