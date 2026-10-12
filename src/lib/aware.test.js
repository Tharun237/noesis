// M25: aware listening. The level maths, the tracker's events, and the microphone lifecycle, all in Node.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { levelDb, createTracker, awareSupported, startAwareness } from './aware.js'

// Feeds one reading every `step` ms from `from` to `to` inclusive. Returns the events, each with its time.
function run(tracker, from, to, db, step = 100) {
  const events = []
  for (let t = from; t <= to; t += step) for (const e of tracker.feed(db, t)) events.push({ type: e.type, t })
  return events
}

const square = amplitude => Float32Array.from({ length: 2048 }, (_, i) => (i % 2 === 0 ? amplitude : -amplitude))

test('levelDb reads silence and an empty block as -100 dB', () => {
  assert.equal(levelDb(new Float32Array(2048)), -100)
  assert.equal(levelDb([]), -100)
})

test('levelDb reads a full-scale square wave as 0 dB and a half-scale one as about -6 dB', () => {
  assert.ok(Math.abs(levelDb(square(1))) < 1e-9)
  assert.ok(Math.abs(levelDb(square(0.5)) + 6.0206) < 0.001)
})

test('the floor follows a steady level and ignores a loud burst', () => {
  const tr = createTracker()
  run(tr, 0, 100, -50)
  run(tr, 200, 30000, -45)
  assert.ok(Math.abs(tr.floor() + 45) < 0.01, `floor was ${tr.floor()}`)
  const before = tr.floor()
  run(tr, 30100, 31000, -20)
  assert.equal(tr.floor(), before)
})

test('the floor moves by the real time between readings, so uneven feed times still work', () => {
  const tr = createTracker()
  tr.feed(-50, 0)
  assert.equal(tr.floor(), -50)
  tr.feed(-40, 3000) // one time constant later: the floor covers 1 - 1/e of the gap
  assert.ok(Math.abs(tr.floor() - (-50 + 10 * (1 - Math.exp(-1)))) < 1e-9)
})

test('noisy comes after 4 s of loud background, not before, and only once', () => {
  const tr = createTracker()
  assert.deepEqual(run(tr, 0, 3900, -30), [])
  assert.deepEqual(run(tr, 4000, 4000, -30), [{ type: 'noisy', t: 4000 }])
  assert.equal(tr.noisy(), true)
  assert.deepEqual(run(tr, 4100, 30000, -30), [])
})

test('quiet comes only after 6 s below the quiet level, and only after noisy', () => {
  // floorSeconds is tiny here so the background drops to the new level at once and the 6 s count is what is tested.
  const tr = createTracker({ floorSeconds: 0.01 })
  run(tr, 0, 4000, -30)
  assert.deepEqual(run(tr, 4100, 10000, -55), [])
  assert.deepEqual(run(tr, 10100, 10100, -55), [{ type: 'quiet', t: 10100 }])
  assert.equal(tr.noisy(), false)
})

test('a room that was never noisy never reports quiet', () => {
  const tr = createTracker({ floorSeconds: 0.01 })
  assert.deepEqual(run(tr, 0, 20000, -55), [])
  assert.equal(tr.noisy(), false)
})

test('between the two thresholds nothing changes', () => {
  const tr = createTracker({ floorSeconds: 0.01 })
  run(tr, 0, 4000, -30)
  assert.deepEqual(run(tr, 4100, 20000, -42), [])
  assert.equal(tr.noisy(), true)
})

test('speech comes after 350 ms of a level 20 dB above the background', () => {
  const tr = createTracker()
  run(tr, 0, 1900, -50)
  assert.deepEqual(run(tr, 2000, 2300, -30), [])
  assert.deepEqual(run(tr, 2400, 2400, -30), [{ type: 'speech', t: 2400 }])
})

test('a 200 ms click is not speech', () => {
  const tr = createTracker()
  run(tr, 0, 1900, -50)
  assert.deepEqual(run(tr, 2000, 2200, -30), [])
  assert.deepEqual(run(tr, 2300, 4000, -50), [])
})

test('speech is not reported again inside the 4 s cooldown', () => {
  const tr = createTracker()
  const heard = [
    ...run(tr, 0, 900, -50), ...run(tr, 1000, 1600, -30), ...run(tr, 1700, 1800, -50),
    ...run(tr, 1900, 2400, -30), ...run(tr, 2500, 5300, -50), ...run(tr, 5400, 6000, -30),
  ]
  assert.deepEqual(heard, [{ type: 'speech', t: 1400 }, { type: 'speech', t: 5800 }])
})

// Node has no microphone or Web Audio: each test installs the globals it needs and puts the real ones back.
async function withBrowser({ navigator: nav, AudioContext: Ctx }, fn) {
  const savedNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const savedCtx = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext')
  Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true })
  Object.defineProperty(globalThis, 'AudioContext', { value: Ctx, configurable: true, writable: true })
  try {
    return await fn()
  } finally {
    if (savedNav) Object.defineProperty(globalThis, 'navigator', savedNav)
    else delete globalThis.navigator
    if (savedCtx) Object.defineProperty(globalThis, 'AudioContext', savedCtx)
    else delete globalThis.AudioContext
  }
}

test('awareSupported is false where there is no microphone API, as in Node', () => {
  assert.equal(awareSupported(), false)
})

test('awareSupported needs getUserMedia and an AudioContext', async () => {
  const mic = { getUserMedia() {} }
  class Ctx {}
  assert.equal(await withBrowser({ navigator: { mediaDevices: mic }, AudioContext: Ctx }, () => awareSupported()), true)
  assert.equal(await withBrowser({ navigator: { mediaDevices: {} }, AudioContext: Ctx }, () => awareSupported()), false)
  assert.equal(await withBrowser({ navigator: { mediaDevices: mic }, AudioContext: undefined }, () => awareSupported()), false)
})

test('startAwareness rejects with the microphone message when refused, and closes its AudioContext', async () => {
  let closed = false
  class Ctx {
    close() { closed = true; return Promise.resolve() }
  }
  const mic = { getUserMedia: () => Promise.reject(new Error('NotAllowedError')) }
  await withBrowser({ navigator: { mediaDevices: mic }, AudioContext: Ctx }, () =>
    assert.rejects(startAwareness(), { message: "Noesis could not use the microphone. Allow it in the browser's site settings." }))
  assert.equal(closed, true)
})

test('startAwareness reads the level every 100 ms, and stop() ends the microphone once', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  let stopped = 0
  let closed = 0
  const track = { stop() { stopped++ } }
  class Ctx {
    createAnalyser() {
      return { fftSize: 0, getFloatTimeDomainData(buf) { buf.fill(0.5) }, connect() {} }
    }
    createMediaStreamSource() {
      return { connect() {} }
    }
    close() { closed++; return Promise.resolve() }
  }
  const mic = { getUserMedia: () => Promise.resolve({ getTracks: () => [track] }) }
  const levels = []
  await withBrowser({ navigator: { mediaDevices: mic }, AudioContext: Ctx }, async () => {
    const handle = await startAwareness({ onLevel: db => levels.push(db) })
    t.mock.timers.tick(300)
    assert.equal(levels.length, 3)
    assert.ok(Math.abs(levels[0] + 6.0206) < 0.001)
    handle.stop()
    handle.stop()
    t.mock.timers.tick(300)
    assert.equal(levels.length, 3)
  })
  assert.equal(stopped, 1)
  assert.equal(closed, 1)
})

test('a room that becomes loud and stays loud is one burst of speech at most, then the new background, then noisy', () => {
  const t = createTracker()
  const events = []
  for (let ms = 0; ms <= 2000; ms += 100) events.push(...t.feed(-60, ms))
  for (let ms = 2100; ms <= 12000; ms += 100) events.push(...t.feed(-30, ms))
  assert.deepEqual(events.map(e => e.type), ['speech', 'noisy'])
  assert.ok(t.floor() > -32)
  assert.equal(t.noisy(), true)
})

test('speech that goes on is reported once, and again only after it has stopped', () => {
  const t = createTracker({ adoptMs: 60000 })
  const events = []
  for (let ms = 0; ms <= 1000; ms += 100) events.push(...t.feed(-60, ms))
  for (let ms = 1100; ms <= 9000; ms += 100) events.push(...t.feed(-35, ms))
  assert.equal(events.filter(e => e.type === 'speech').length, 1)
  for (let ms = 9100; ms <= 9500; ms += 100) events.push(...t.feed(-60, ms))
  for (let ms = 9600; ms <= 10500; ms += 100) events.push(...t.feed(-35, ms))
  assert.equal(events.filter(e => e.type === 'speech').length, 2)
})
