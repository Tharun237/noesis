// Settings merged setting by setting (prefsmerge.js): the newest change to each wins; a device that never changed
// a setting never wins with it. Written after a device without the Gemini key wiped it from the account.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergePrefs } from './prefsmerge.js'

const KEYS = ['speed', 'geminiKey', 'nvidiaKey', 'readSize']
const DEF = { speed: 0.9, geminiKey: '', nvidiaKey: '', readSize: 19 }

test('a device that never had the key does not wipe it (16 October 2026)', () => {
  // the phone changed its text size; it never had the Gemini key: its whole record arrives at the laptop
  const r = mergePrefs(KEYS, DEF, { speed: 0.9, geminiKey: 'AIzaLAPTOPKEY', readSize: 19 }, { geminiKey: 100 },
    { speed: 0.9, geminiKey: '', readSize: 22 }, { readSize: 200 })
  assert.deepEqual(r.take, { readSize: 22 }, 'the size changed on the phone is taken')
  assert.equal(r.again, true, 'the key goes back out to the account')
})

test('the newest change to each setting wins, on either side', () => {
  const r = mergePrefs(KEYS, DEF, { speed: 1.2, readSize: 20 }, { speed: 300, readSize: 100 }, { speed: 1.5, readSize: 24 }, { speed: 200, readSize: 150 })
  assert.deepEqual(r.take, { readSize: 24 })
  assert.equal(r.again, true, 'the speed changed here later goes back out')
})

test('a key removed on purpose is removed everywhere', () => {
  const r = mergePrefs(KEYS, DEF, { nvidiaKey: 'nvapi-OLD' }, { nvidiaKey: 50 }, { nvidiaKey: '' }, { nvidiaKey: 60 })
  assert.deepEqual(r.take, { nvidiaKey: '' })
})

test('a new device takes everything the account has', () => {
  const r = mergePrefs(KEYS, DEF, { speed: 0.9, geminiKey: '', readSize: 19 }, {}, { speed: 1.3, geminiKey: 'AIzaKEY', readSize: 21 }, { speed: 10, geminiKey: 20, readSize: 30 })
  assert.deepEqual(r.take, { speed: 1.3, geminiKey: 'AIzaKEY', readSize: 21 })
  assert.equal(r.again, false)
})

test('a record from the older version (no times) never wipes a chosen key, and fills a default', () => {
  const r = mergePrefs(KEYS, DEF, { geminiKey: 'AIzaKEPT', speed: 0.9 }, {}, { geminiKey: '', speed: 1.4 }, null)
  assert.deepEqual(r.take, { speed: 1.4 }, 'the speed this device never chose is taken; its key is kept')
  assert.equal(r.again, true, 'and the key goes back out')
})
