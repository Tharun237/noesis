// M16 voice commands: transcript parsing and the no-browser listener path.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseCommand, speechSupported, createListener } from './voicecmd.js'

test('play phrases', () => {
  for (const p of ['play', 'resume', 'continue', 'go on']) assert.deepEqual(parseCommand(p), { cmd: 'play' }, p)
})

test('pause phrases', () => {
  for (const p of ['pause', 'stop', 'wait', 'hold on']) assert.deepEqual(parseCommand(p), { cmd: 'pause' }, p)
})

test('back phrases', () => {
  for (const p of ['back', 'go back', 'repeat', 'repeat that', 'say that again']) assert.deepEqual(parseCommand(p), { cmd: 'back' }, p)
})

test('next phrases', () => {
  for (const p of ['next', 'skip', 'skip that']) assert.deepEqual(parseCommand(p), { cmd: 'next' }, p)
})

test('bookmark phrases', () => {
  for (const p of ['bookmark', 'bookmark that', 'save that', 'mark that', 'remember that']) assert.deepEqual(parseCommand(p), { cmd: 'bookmark' }, p)
})

test('explain phrases', () => {
  for (const p of ['explain', 'explain that', 'what does that mean', 'what was that']) assert.deepEqual(parseCommand(p), { cmd: 'explain' }, p)
})

test('recap phrases', () => {
  for (const p of ['recap', 'where was i', 'what did i miss']) assert.deepEqual(parseCommand(p), { cmd: 'recap' }, p)
})

test('skim, slower and faster', () => {
  for (const p of ['skim', 'skim this']) assert.deepEqual(parseCommand(p), { cmd: 'skim' }, p)
  assert.deepEqual(parseCommand('slower'), { cmd: 'slower' })
  assert.deepEqual(parseCommand('faster'), { cmd: 'faster' })
})

test('ask and question carry the rest of the sentence as arg', () => {
  assert.deepEqual(parseCommand('ask what is a sandbar'), { cmd: 'ask', arg: 'what is a sandbar' })
  assert.deepEqual(parseCommand('question why is the sea salty'), { cmd: 'ask', arg: 'why is the sea salty' })
  assert.equal(parseCommand('ask'), null) // nothing to ask
  assert.equal(parseCommand('ask?'), null)
})

test('wake word is ignored', () => {
  assert.deepEqual(parseCommand('noesis pause'), { cmd: 'pause' })
  assert.deepEqual(parseCommand('hey noesis pause'), { cmd: 'pause' })
  assert.deepEqual(parseCommand('hey noesis ask who wrote this'), { cmd: 'ask', arg: 'who wrote this' })
  assert.equal(parseCommand('hey noesis'), null)
  assert.equal(parseCommand('noesis'), null)
})

test('punctuation and capitals do not matter', () => {
  assert.deepEqual(parseCommand('PLAY!'), { cmd: 'play' })
  assert.deepEqual(parseCommand('  Pause.  '), { cmd: 'pause' })
  assert.deepEqual(parseCommand('Hold on...'), { cmd: 'pause' })
  assert.deepEqual(parseCommand('Where was I?'), { cmd: 'recap' })
  assert.deepEqual(parseCommand('Hey, Noesis, bookmark that!'), { cmd: 'bookmark' })
})

test('the longer phrase wins over the shorter one', () => {
  assert.deepEqual(parseCommand('skip this section'), { cmd: 'skim' })
  assert.deepEqual(parseCommand('skip'), { cmd: 'next' })
  assert.deepEqual(parseCommand('skip that'), { cmd: 'next' })
  assert.deepEqual(parseCommand('repeat that'), { cmd: 'back' })
  assert.deepEqual(parseCommand('what was that'), { cmd: 'explain' })
})

test('a command phrase at the start is enough, whole words only', () => {
  assert.deepEqual(parseCommand('pause it please'), { cmd: 'pause' })
  assert.equal(parseCommand('playground'), null)
  assert.equal(parseCommand('stopwatch'), null)
})

test('nonsense is null', () => {
  assert.equal(parseCommand(''), null)
  assert.equal(parseCommand('   '), null)
  assert.equal(parseCommand(undefined), null)
  assert.equal(parseCommand('banana'), null)
  assert.equal(parseCommand('i want to pause'), null)
})

test('no browser: speech is unsupported and stop ends off', () => {
  assert.equal(speechSupported(), false)
  const states = []
  const l = createListener({ onState: s => states.push(s) })
  l.start()
  l.stop()
  assert.deepEqual(states, ['unsupported', 'off'])
})
