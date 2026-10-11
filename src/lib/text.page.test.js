// M3: toListening keeps the source page on each block (as `p`) so Pages view can
// follow the audio — and omits it for blocks that have no page (old documents).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toListening } from './text.js'

test('toListening keeps p for blocks with a page and omits it for blocks without', () => {
  const out = toListening([
    { k: 'p', text: 'First page, one sentence here.', page: 1 },
    { k: 'p', text: 'No page info on this one, two sentences here.' },
  ])
  assert.equal(out[0].p, 1)
  assert.ok(!('p' in out[1]), 'blocks without a page must not gain p')
})
