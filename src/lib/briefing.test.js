// Pure parts of the briefing (src/lib/briefing.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'

// briefing.js statically imports the library store, which touches browser-only
// globals at load time. Stub the ones it reads while loading; this file runs in
// its own process, so nothing leaks into other tests. (Static imports above load
// first; the briefing module itself is loaded dynamically below, after the stubs.)
if (typeof globalThis.document === 'undefined') {
  globalThis.document = { addEventListener: () => {}, visibilityState: 'visible' }
}
if (typeof globalThis.addEventListener === 'undefined') {
  globalThis.addEventListener = () => {}
}
if (typeof globalThis.navigator === 'undefined') {
  globalThis.navigator = {}
}
if (typeof globalThis.location === 'undefined') {
  globalThis.location = { href: '' }
}

const { briefingTitle, notesPrompt, briefingPrompt } = await import('./briefing.js')

test('briefingTitle names the first document and counts the rest', () => {
  assert.equal(briefingTitle(['Alpha', 'Beta']), 'Briefing: Alpha + 1 more')
  assert.equal(briefingTitle(['Alpha', 'Beta', 'Gamma']), 'Briefing: Alpha + 2 more')
  assert.equal(
    briefingTitle(['One', 'Two', 'Three', 'Four', 'Five']),
    'Briefing: One + 4 more',
  )
})

test('briefingTitle cuts a long first title at 60 characters with an ellipsis', () => {
  const long = 'A'.repeat(80)
  const title = briefingTitle([long, 'Beta'])
  assert.equal(title, `Briefing: ${'A'.repeat(60)}… + 1 more`)
  assert.ok(title.includes('…'))
})

test('notesPrompt carries the title, the words budget and the text', () => {
  const p = notesPrompt('On Liberty', 'Some text here.', 250)
  assert.ok(p.includes('On Liberty'))
  assert.ok(p.includes('250'))
  assert.ok(p.includes('Some text here.'))
  assert.match(p, /no tables/i)
})

test('briefingPrompt holds every title, the five parts in order, and the leave-out rule', () => {
  const items = [
    { title: 'Alpha', notes: 'Notes on alpha.' },
    { title: 'Beta', notes: 'Notes on beta.' },
    { title: 'Gamma', notes: 'Notes on gamma.' },
  ]
  const p = briefingPrompt(items)
  for (const t of ['Alpha', 'Beta', 'Gamma']) assert.ok(p.includes(t), `missing title ${t}`)
  const parts = [
    'What each one says',
    'Where they agree',
    'Where they disagree',
    'Shared methods and ideas',
    'What to read first and why',
  ]
  let at = -1
  for (const name of parts) {
    const k = p.indexOf(name)
    assert.ok(k > at, `${name} missing or out of order`)
    at = k
  }
  assert.match(p, /leave .* out/i)
})
