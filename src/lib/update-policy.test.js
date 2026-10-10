import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shouldSwitch } from './update-policy.js'

const base = { playing: false, preparing: false, sheetOpen: false, interacted: false, sinceLaunch: 1000, hidden: false }

test('switches right after launch, before the user does anything', () => assert.equal(shouldSwitch(base), true))
test('never while listening, even in the background', () => assert.equal(shouldSwitch({ ...base, playing: true, hidden: true }), false))
test('never while a document is being prepared', () => assert.equal(shouldSwitch({ ...base, preparing: true, hidden: true }), false))
test('never with a sheet open (mid-task)', () => assert.equal(shouldSwitch({ ...base, sheetOpen: true }), false))
test('waits once the user is active in the foreground', () => assert.equal(shouldSwitch({ ...base, interacted: true, sinceLaunch: 60_000 }), false))
test('switches when the app goes to the background, idle', () => assert.equal(shouldSwitch({ ...base, interacted: true, sinceLaunch: 60_000, hidden: true }), true))
