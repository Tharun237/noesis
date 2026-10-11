// M16 voice commands: a pure transcript parser and a Web Speech listener.
// Imports nothing and touches no browser global at import time, so Node can load it for tests.

// Command -> trigger phrases. A phrase matches whole words at the start of the utterance and the
// longest matching phrase wins ("skip this section" is skim, not next).
const COMMANDS = {
  play: ['play', 'resume', 'continue', 'go on'],
  pause: ['pause', 'stop', 'wait', 'hold on'],
  back: ['back', 'go back', 'repeat', 'repeat that', 'say that again'],
  next: ['next', 'skip', 'skip that'],
  bookmark: ['bookmark', 'bookmark that', 'save that', 'mark that', 'remember that'],
  explain: ['explain', 'explain that', 'what does that mean', 'what was that'],
  recap: ['recap', 'where was i', 'what did i miss'],
  skim: ['skim', 'skim this', 'skip this section'],
  slower: ['slower'],
  faster: ['faster'],
  ask: ['ask', 'question'],
}

const PHRASES = Object.entries(COMMANDS)
  .flatMap(([cmd, list]) => list.map(p => ({ cmd, words: p.split(' ') })))
  .sort((a, b) => b.words.length - a.words.length)

const WAKE_WORDS = [['hey', 'noesis'], ['noesis']]

// Lower-case, punctuation becomes a space, whole words only.
function tokens(text) {
  return String(text ?? '').toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, ' ').split(/\s+/).filter(Boolean)
}

// Returns { cmd, arg? } or null. `arg` is only set for `ask` (the rest of the sentence).
export function parseCommand(transcript) {
  let w = tokens(transcript)
  for (const wake of WAKE_WORDS) {
    if (wake.every((x, i) => w[i] === x)) { w = w.slice(wake.length); break }
  }
  for (const { cmd, words } of PHRASES) {
    if (words.length > w.length || !words.every((x, i) => w[i] === x)) continue
    if (cmd !== 'ask') return { cmd }
    const arg = w.slice(words.length).join(' ')
    return arg ? { cmd, arg } : null
  }
  return null
}

export function speechSupported() {
  return typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
}

// Continuous recognition, final results only. The browser ends a session after silence, so while the
// listener is still wanted it starts a new one, at most once a second.
export function createListener({ lang = 'en-US', onCommand, onHeard, onInterim, onState }) {
  let rec = null
  let wanted = false
  let lastStart = 0
  let timer = null

  const report = s => { if (onState) onState(s) }

  function Ctor() {
    if (typeof window === 'undefined') return undefined
    return window.SpeechRecognition || window.webkitSpeechRecognition
  }

  // Detach every handler before aborting, so a stopped session can never report again.
  function drop() {
    if (timer) { clearTimeout(timer); timer = null }
    if (rec) {
      const r = rec
      rec = null
      r.onstart = null
      r.onresult = null
      r.onerror = null
      r.onend = null
      r.abort()
    }
  }

  function begin() {
    const R = Ctor()
    const r = new R()
    rec = r
    lastStart = Date.now()
    r.lang = lang
    r.continuous = true
    r.interimResults = true // the words are shown while they are being said
    r.onstart = () => report('listening')
    r.onresult = e => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (!e.results[i].isFinal) { if (onInterim) onInterim(e.results[i][0].transcript.trim()); continue }
        const text = e.results[i][0].transcript.trim()
        if (!text) continue
        if (onHeard) onHeard(text)
        const cmd = parseCommand(text)
        if (cmd && onCommand) onCommand(cmd)
      }
    }
    r.onerror = e => {
      if (e.error === 'no-speech' || e.error === 'aborted') return // onend restarts the session
      wanted = false
      report(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'denied' : 'error')
    }
    r.onend = () => {
      if (rec === r) rec = null
      if (!wanted) return
      const wait = Math.max(0, lastStart + 1000 - Date.now())
      timer = setTimeout(() => { timer = null; if (wanted && !rec) begin() }, wait)
    }
    r.start()
  }

  return {
    start() {
      if (wanted) return
      if (!Ctor()) { report('unsupported'); return }
      wanted = true
      drop()
      begin()
    },
    stop() {
      wanted = false
      drop()
      report('off')
    },
  }
}
