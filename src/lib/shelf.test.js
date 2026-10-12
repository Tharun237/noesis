// Which library opens when someone signs in (shelf.js). Wrong here means one person's library shown to,
// or uploaded into the Drive of, another.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shelfFor } from './shelf.js'

const GUEST = '(signed out)'

test('first sign-in on a device: what was added before signing in becomes theirs', () => {
  assert.equal(shelfFor({}, 'ann', ''), '')
  assert.equal(shelfFor({ [GUEST]: 'g1' }, 'ann', 'g1'), 'g1')
})

test('signing in again opens their own shelf, not the signed-out one', () => {
  assert.equal(shelfFor({ ann: '', [GUEST]: 'g1' }, 'ann', 'g1'), '')
})

test("a second person never gets the first person's shelf", () => {
  const all = { ann: '', [GUEST]: 'g1' }
  assert.equal(shelfFor(all, 'bob', 'g1'), 'g1') // the signed-out shelf is nobody's: bob takes it
  const got = shelfFor({ ann: '' }, 'bob', '') // ann's session ran out and bob signed in over her library
  assert.notEqual(got, '')
  assert.match(got, /^[a-z0-9]+$/)
})
