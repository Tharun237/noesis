// Noesis's side of the translation worker. The engine itself is Mozilla's bergamot-translator, used unchanged:
// translator-worker.js (copied here from its package at install) makes a `worker` object and answers messages
// of the form { id, name, args } by calling worker[name](...args).
//
// This file adds one thing that object can be asked to do: fetch a translator's files (or take them from the
// device), check them, and load them. All of it happens HERE, in the worker. A translator is 20 to 55 MB:
// downloading, copying, hashing and storing that on the page's own thread froze a slow phone for a third of a
// second at a time (measured, 2026-10-13). The page now only sends and receives small messages.
importScripts('translator-worker.js')

const KEPT = 'noesis-translators' // Cache Storage: the files as fetched, in their parts
const TOLD_EVERY_MS = 200

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
const urlsOf = (host, model, f) => Array.from({ length: f.parts }, (_, k) => `${host}/${model.from}${model.to}/${f.name}.${k}`)

// → nothing; posts { load: { got, total } } while bytes arrive over the network (never when the translator
// is already on the device). Throws a sentence the customer can be shown.
worker.loadFromStore = async function ({ host, model }) {
  if (this.hasTranslationModel({ from: model.from, to: model.to })) return
  const cache = await caches.open(KEPT)
  // what is not on the device yet, in bytes: a file's parts are equal but for the last
  const part = f => Math.ceil(f.size / f.parts)
  let total = 0
  const have = new Map()
  for (const f of model.files) {
    const urls = urlsOf(host, model, f)
    for (let k = 0; k < urls.length; k++) {
      const hit = await cache.match(urls[k])
      have.set(urls[k], hit || null)
      if (!hit) total += k < urls.length - 1 ? part(f) : f.size - part(f) * (urls.length - 1)
    }
  }
  let got = 0, told = 0
  const tell = force => { if (!total) return; const now = Date.now(); if (force || now - told > TOLD_EVERY_MS) { told = now; self.postMessage({ load: { got: Math.min(got, total), total } }) } }
  tell(true)
  const files = {}
  for (const f of model.files) {
    const whole = new Uint8Array(f.size)
    let at = 0
    for (const url of urlsOf(host, model, f)) {
      let res = have.get(url)
      if (!res) {
        const fetched = await fetch(url, { credentials: 'omit' }).catch(() => null)
        if (!fetched || !fetched.ok) throw new Error('The translator could not be downloaded. Check your connection and try again.')
        const keep = fetched.clone()
        const reader = fetched.body.getReader()
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          if (at + value.length > whole.length) throw new Error('The translator did not download correctly. Try again.')
          whole.set(value, at); at += value.length; got += value.length; tell(false)
        }
        await cache.put(url, keep)
        continue
      }
      const bytes = new Uint8Array(await res.arrayBuffer())
      if (at + bytes.length > whole.length) { at = -1; break }
      whole.set(bytes, at); at += bytes.length
    }
    // A file that is not the one that was published is never used: a damaged download would give nonsense,
    // or stop the engine, with no way for the customer to know why. It is thrown away so the next try is clean.
    if (at !== f.size || hex(await crypto.subtle.digest('SHA-256', whole)) !== f.sha256) {
      for (const url of urlsOf(host, model, f)) await cache.delete(url)
      throw new Error('The translator did not download correctly. Try again.')
    }
    files[f.type] = whole.buffer
  }
  tell(true)
  this.loadTranslationModel({ from: model.from, to: model.to }, {
    model: files.model, shortlist: files.lex, vocabs: files.vocab ? [files.vocab] : [files.srcvocab, files.trgvocab],
  })
}
