// M23: plot sonification. Number reading, tone mapping, the spoken description, and playTones' lifecycle.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { numbersIn, toTones, describe, playTones, columnsIn } from './sonify.js'

test('numbersIn reads thousands separators and decimals', () => {
  assert.deepEqual(numbersIn('Exports reached 21,000 tonnes, 3.5 times more.'), [21000, 3.5])
})

test('numbersIn reads negatives, and a minus between two numbers is not a sign', () => {
  assert.deepEqual(numbersIn('Range -5 to 3, then dipped −2.5.'), [-5, 3, -2.5])
  assert.deepEqual(numbersIn('From 2019-2021 only.'), [2019, 2021])
})

test('numbersIn drops the percent sign', () => {
  assert.deepEqual(numbersIn('Share rose 12% and 0.5%.'), [12, 0.5])
})

test('numbersIn scales million, billion and thousand, with decimals', () => {
  assert.deepEqual(numbersIn('Sales 1.2 million, 3 billion, 5 thousand and 2 millions.'), [1200000, 3000000000, 5000, 2000000])
})

test('numbersIn ignores years when the text has other numbers, and keeps them when it has none', () => {
  assert.deepEqual(numbersIn('In 2018 we sold 40 tonnes and 1,950 in 2020.'), [40, 1950])
  assert.deepEqual(numbersIn('Between 2018 and 2020.'), [2018, 2020])
})

test('numbersIn ignores numbers that are part of a label', () => {
  assert.deepEqual(numbersIn('See Table 3 and Figure 2: 14 vendors, 9 ports.'), [14, 9])
  assert.deepEqual(numbersIn('Fig. 4 shows 7 bars.'), [7])
  assert.deepEqual(numbersIn('No figures here.'), [])
})

test('toTones maps the lowest value to low and the highest to high, on a log scale', () => {
  const tones = toTones([10, 20, 40])
  assert.deepEqual(tones[0], { freq: 220, start: 0, duration: 0.28, value: 10 })
  assert.equal(tones[2].freq, 880)
  assert.ok(Math.abs(tones[1].freq - 220 * Math.cbrt(4)) < 1e-9, 'one third of the span is one third of the octaves')
})

test('toTones gives equal values the middle pitch', () => {
  assert.deepEqual(toTones([5, 5, 5]).map(t => t.freq), [440, 440, 440])
})

test('toTones keeps at most 40 tones and always keeps the first and last value', () => {
  const values = Array.from({ length: 100 }, (_, i) => i)
  const tones = toTones(values)
  assert.equal(tones.length, 40)
  assert.equal(tones[0].value, 0)
  assert.equal(tones[39].value, 99)
  assert.equal(tones[0].freq, 220)
  assert.equal(tones[39].freq, 880)
})

test('toTones starts each tone one step after the last', () => {
  assert.deepEqual(toTones([1, 2, 3], { seconds: 0.5 }).map(t => t.start), [0, 0.5, 1])
})

test('describe says it rises overall, with the highest at the end', () => {
  assert.equal(describe([3, 9, 21000]), '3 values, from 3 up to 21,000; it rises overall, with the highest at the end.')
})

test('describe says it falls overall, with the highest at the start', () => {
  assert.equal(describe([21000, 9, 3]), '3 values, from 3 up to 21,000; it falls overall, with the highest at the start.')
})

test('describe says it goes up and down, with the highest in the middle', () => {
  assert.equal(describe([3, 21000, 9, 12]), '4 values, from 3 up to 21,000; it goes up and down, with the highest in the middle.')
})

test('describe says it stays level when every value is the same', () => {
  assert.equal(describe([4, 4, 4]), '3 values, all 4; it stays level.')
})

// A stand-in AudioContext: records what playTones does with it, so the lifecycle can be checked in Node.
let made = null
class FakeAudioContext {
  constructor() {
    made = this
    this.currentTime = 0
    this.destination = {}
    this.closed = false
    this.oscillators = 0
  }
  createOscillator() {
    this.oscillators++
    return { type: '', frequency: { value: 0 }, connect() {}, start() {}, stop() {} }
  }
  createGain() {
    return {
      gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} },
      connect() {},
    }
  }
  resume() { return Promise.resolve() }
  close() { this.closed = true; return Promise.resolve() }
}

test('playTones calls onTone for each tone, then closes its AudioContext', async t => {
  globalThis.AudioContext = FakeAudioContext
  t.after(() => { delete globalThis.AudioContext })
  const heard = []
  await playTones(toTones([1, 2, 3], { seconds: 0.01 }), { onTone: i => heard.push(i) })
  assert.deepEqual(heard, [0, 1, 2])
  assert.equal(made.oscillators, 3)
  assert.equal(made.closed, true)
})

test('playTones stops at once when aborted, and closes its AudioContext', async t => {
  globalThis.AudioContext = FakeAudioContext
  t.after(() => { delete globalThis.AudioContext })
  const controller = new AbortController()
  const heard = []
  await playTones(toTones([1, 2, 3], { seconds: 0.2 }), {
    signal: controller.signal,
    onTone: i => { heard.push(i); controller.abort() },
  })
  assert.deepEqual(heard, [0])
  assert.equal(made.closed, true)
})

test('playTones resolves at once with no tones, and rejects where there is no Web Audio', async () => {
  await playTones([])
  await assert.rejects(playTones(toTones([1, 2])), /Web Audio/)
})

test('describe says it rises overall when one dip does not change where it ends up', () => {
  assert.equal(describe([2, 5, 4, 9, 12]), '5 values, from 2 up to 12; it rises overall, with the highest at the end.')
})

test('columnsIn reads each numeric column of a table and leaves out the axis column', () => {
  const rows = [['Year', 'Sales', 'Region', 'Growth'], ['2019', '1,200', 'North', '4%'], ['2020', '1,800', 'South', '50%'], ['2021', '2,100', 'East', '16.7%']]
  assert.deepEqual(columnsIn(rows), [{ name: 'Sales', values: [1200, 1800, 2100] }, { name: 'Growth', values: [4, 50, 16.7] }])
})

test('columnsIn keeps the only numeric column even when it counts in even steps, and needs three numbers', () => {
  assert.deepEqual(columnsIn([['Step', 'Note'], ['1', 'a'], ['2', 'b'], ['3', 'c']]), [{ name: 'Step', values: [1, 2, 3] }])
  assert.deepEqual(columnsIn([['Name', 'Score'], ['A', '4'], ['B', '9']]), [])
  assert.deepEqual(columnsIn(undefined), [])
})
