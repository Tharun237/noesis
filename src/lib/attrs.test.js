// Two style sheets are written in script: the app's (press.js) and the welcome page's own (Landing.jsx). Both
// style things by a data- attribute. If they ever use the same name for different things, one silently
// restyles the other: on 2026-10-13 the lime that crosses a spoken word was named data-lit, which was already
// the welcome page's lit words, and the page's big sentence collapsed into one heap of letters for hours.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const names = file => new Set([...readFileSync(new URL(file, import.meta.url), 'utf8').matchAll(/\[data-([a-z-]+)/g)].map(m => m[1]))

test('the app and the welcome page never style the same data- attribute', () => {
  const app = names('../ui/press.js'), page = names('../ui/Landing.jsx')
  const both = [...page].filter(n => app.has(n))
  assert.deepEqual(both, [], `styled by both: ${both.join(', ')}`)
})
