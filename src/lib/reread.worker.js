// Reads a document again from its own file, away from the screen's thread (library.js rereadOld).
// Measured at a phone's speed (4 times slower): done on the page's own thread, three books held the screen for
// 4.8 s in pieces of up to 0.6 s. Here it holds nothing: the file, the old text and the new text are read and
// written straight from and to the device's storage, and only a few numbers go back to the page.
//
// Two steps, so the page decides at the last moment whether the document may change:
//   { read, id, lang }         → { same } | { away } | { ask }     (the new text is kept here, nothing is written)
//   { write, id, pos, marks }  → { done, total, chars, pos, marks, note, scanned }
// The stores' names come from the page ({ stores }): whose library this is is known there, not here.
import { createStore, get, set, keys, delMany } from 'idb-keyval'
import { parseSource } from '../ingest/index.js'
import { takeRefs, withoutEmptyRefHeading } from './citations.js'
import { toListeningAsync, pause } from './text.js'
import { bookStart } from '../ingest/front.js'
import { carrier } from './carry.js'
import { carryMarks } from './marks.js'

let content, audio
const read = new Map() // id → the new text, waiting to be told it may replace the old

async function readIt({ id, lang }) {
  const src = await get('src:' + id, content)
  if (src?.kind !== 'pdf') return { id, away: true } // the file is on another device
  let parsed = null
  try {
    parsed = await parseSource(src, null, { cover: false })
    let blocks = parsed.blocks
    let refs = parsed.refs || []
    const taken = takeRefs(blocks)
    if (taken.refs.length) { blocks = taken.blocks; if (!refs.length) refs = taken.refs }
    if (refs.length) blocks = withoutEmptyRefHeading(blocks)
    let note
    if (parsed.scanned) {
      const { loadRepair } = await import('../ingest/ocrfix.js')
      const fix = await loadRepair()
      blocks = await fix.repairAsync(blocks, pause)
      note = `Scanned book: Noesis fixed ${fix.stats.fixed.toLocaleString()} OCR errors and removed ${fix.stats.dropped.toLocaleString()} garbled lines on this device.`
    }
    const listening = await toListeningAsync(blocks, lang)
    const old = await get('doc:' + id, content)
    const was = (old?.blocks || []).flatMap(b => b.s), now = listening.flatMap(b => b.s)
    if (!now.length || (was.length === now.length && was.every((t, i) => t === now[i]))) return { id, same: true }
    read.set(id, { listening, refs, was, now, note, scanned: !!parsed.scanned })
    return { id, ask: true }
  } finally {
    parsed?.pdf?.loadingTask.destroy()
  }
}

async function writeIt({ id, pos, marks, gone }) {
  const r = read.get(id)
  read.delete(id)
  const to = carrier(r.was, r.now)
  // not begun: the voice starts where the book does, after the copyright page and the contents (front.js)
  const at = pos ? to(pos) : r.listening.slice(0, bookStart(r.listening)).reduce((a, b) => a + b.s.length, 0)
  const kept = carryMarks({ marks, gone }, to)
  await delMany((await keys(audio)).filter(k => k.startsWith(id + ':')), audio)
  await set('doc:' + id, r.refs.length ? { blocks: r.listening, refs: r.refs } : { blocks: r.listening }, content)
  await set('durs:' + id, { durs: new Array(r.now.length).fill(0), tails: new Array(r.now.length).fill(0) }, content)
  return { id, done: true, total: r.now.length, chars: r.now.reduce((a, t) => a + t.length, 0), pos: at, marks: kept.marks, gone: kept.gone, note: r.note, scanned: r.scanned }
}

// Every answer carries the number of the question it answers (re). pdf.js, set up inside this worker, also
// speaks on this worker's line to the page: the page listens only for answers that carry its own number.
self.onmessage = async ({ data }) => {
  try {
    if (data.stores) { content = createStore(data.stores.content, 'content'); audio = createStore(data.stores.audio, 'audio') }
    else if (data.read) self.postMessage({ re: data.n, ...(await readIt(data)) })
    else if (data.write) self.postMessage({ re: data.n, ...(await writeIt(data)) })
    else if (data.drop) read.delete(data.id)
  } catch (e) {
    self.postMessage({ re: data.n, id: data.id, error: e?.message || String(e) })
  }
}
