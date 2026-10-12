// Voice commands: what people actually say, what a speech service actually hears, and the no-browser path.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseCommand, isEcho, speechLang, speechSupported, createListener } from './voicecmd.js'

const means = (cmd, sayings) => { for (const s of sayings) assert.deepEqual(parseCommand(s), { cmd }, `"${s}" should mean ${cmd}`) }

test('pausing, the ways people say it', () => {
  means('pause', ['pause', 'Pause.', 'stop', 'stop it', 'can you pause', 'please stop reading', 'wait', 'wait wait', 'hold on', 'one second', 'ok stop', 'shut up', "that's enough", 'pause the book please'])
})

test('playing again', () => {
  means('play', ['play', 'resume', 'continue', 'go on', 'carry on', 'keep going', 'start reading', 'continue reading', 'go ahead', 'play it', "don't stop", 'ok go'])
})

test('back and next, by sentence', () => {
  means('back', ['back', 'go back', 'go back a bit', 'repeat', 'repeat that', 'say that again', 'one more time', 'previous', 'rewind'])
  means('next', ['next', 'skip', 'skip that', 'next one', 'move on', 'forward', 'skip ahead'])
})

test('pages and chapters', () => {
  means('nextpage', ['next page', 'go to the next page', 'skip this page', 'turn the page'])
  means('prevpage', ['previous page', 'last page', 'go back a page'])
  means('nextchapter', ['next chapter', 'skip this chapter', 'skip this section', 'next section please'])
  means('prevchapter', ['previous chapter', 'back to the last section'])
  means('restart', ['start over', 'from the beginning', 'restart'])
})

test('speed, including complaints', () => {
  means('slower', ['slower', 'slow down', "that's too fast", 'too fast', 'a bit slower please'])
  means('faster', ['faster', 'speed up', 'too slow', 'go faster'])
  means('normal', ['normal speed'])
})

test('bookmarks and the AI commands', () => {
  means('bookmark', ['bookmark', 'bookmark that', 'save that', 'mark this', 'remember that'])
  means('explain', ['explain', 'explain that', 'what does that mean', 'what was that'])
  means('recap', ['recap', 'where was i', 'what did i miss', 'give me a summary'])
  means('skim', ['skim', 'skim this'])
  means('micoff', ['stop listening', 'mic off'])
})

test('what a speech service hears from an accent still counts', () => {
  means('pause', ['paws', 'pass', 'pos', 'paus', 'pawse']) // "pawse" is one letter from "pause"
  means('play', ['presume', 'resum', 'continu'])
  means('next', ['necks', 'nex page'.replace(' page', '')])
  means('bookmark', ['bookmarks that', 'bookmrk'])
})

test('ask and question carry the rest of the sentence', () => {
  assert.deepEqual(parseCommand('ask what is entropy'), { cmd: 'ask', arg: 'what is entropy' })
  assert.deepEqual(parseCommand('Question: why does this matter in the long run for the people living there?'), { cmd: 'ask', arg: 'why does this matter in the long run for the people living there' })
  assert.equal(parseCommand('ask'), null)
})

test("the app's name may be said first, however it was heard, and is never needed", () => {
  means('pause', ['noesis pause', 'hey noesis, pause', 'Noises stop', 'no thesis, wait', 'gnosis pause'])
  assert.equal(parseCommand('noesis'), null)
})

test('whole words only, and a long remark is not a command', () => {
  assert.equal(parseCommand('nonstop'), null)
  assert.equal(parseCommand('playground'), null)
  assert.equal(parseCommand('banana'), null)
  assert.equal(parseCommand(''), null)
  assert.equal(parseCommand(undefined), null)
  assert.equal(parseCommand('and so the army came to a stop at the river bank before the winter set in'), null)
})

test('the book is told from the listener', () => {
  const reading = 'The convoy had to stop at the border. Nobody knew what would come next, and the guards said wait.'
  assert.equal(isEcho('the convoy had to stop at the border', reading), true) // the microphone heard the loudspeaker
  assert.equal(isEcho('nobody knew what would come next', reading), true)
  assert.equal(isEcho('stop', reading), false) // one word alone is the listener
  assert.equal(isEcho('can you pause it please', reading), false)
  assert.equal(isEcho('go back a bit', reading), false)
})

test('which English to listen for', () => {
  assert.equal(speechLang('en-IN', 'Asia/Kolkata'), 'en-IN')
  assert.equal(speechLang('en-US', 'Asia/Kolkata'), 'en-IN') // a phone left on "English (US)", in India
  assert.equal(speechLang('en-GB', 'America/New_York'), 'en-GB')
  assert.equal(speechLang('en-US', 'America/New_York'), 'en-US')
  assert.equal(speechLang('te-IN', 'Asia/Kolkata'), 'en-IN')
})

test('no browser: speech is unsupported and stop ends off', () => {
  assert.equal(speechSupported(), false)
  const states = []
  const l = createListener({ onState: s => states.push(s) })
  l.start()
  l.stop()
  assert.deepEqual(states, ['unsupported', 'off'])
})
