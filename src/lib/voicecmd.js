// Voice commands: what a listener says, turned into what they meant, and a Web Speech listener.
// Imports nothing and touches no browser global at import time, so Node can load it for tests.
//
// People do not speak in commands. They say "can you pause", "stop it", "wait wait", "go back a bit", "next
// page please", "that's too fast". And a speech service does not hear an accent it was not trained on very
// well: "pause" arrives as "paws" or "pass", "resume" as "presume". Tharun on his phone, 2026-10-12: "it is
// listening but unable to understand user voice or accent properly, and when it hears right it acts nothing."
// So the words of a command may sit anywhere in a short sentence, common mis-hearings count, a word one
// letter off counts, and every guess the speech service offers is tried, not only its first.

// What the speech service writes when it mis-hears one of our words.
const MISHEARD = {
  paws: 'pause', pos: 'pause', pass: 'pause', paus: 'pause', pose: 'pause', porch: 'pause', boss: 'pause', pausing: 'pause', paused: 'pause',
  plays: 'play', playing: 'play', played: 'play', presume: 'resume', resumed: 'resume', resuming: 'resume', continues: 'continue', continued: 'continue',
  stopped: 'stop', stopping: 'stop', stops: 'stop', necks: 'next', nex: 'next', nest: 'next', skipped: 'skip', skipping: 'skip',
  bookmarks: 'bookmark', bookmarked: 'bookmark', explains: 'explain', explained: 'explain', summarize: 'summary', summarise: 'summary', summarised: 'summary', summarized: 'summary',
  backwards: 'back', backward: 'back', forwards: 'forward', pages: 'page', chapters: 'chapter', sections: 'section', quicker: 'faster', slowly: 'slow',
  dont: 'dont', "don't": 'dont', prev: 'previous', prior: 'previous',
}
// The words the rules below look for: a heard word one letter away from one of these is taken to be it.
const VOCABULARY = ['pause', 'resume', 'continue', 'bookmark', 'explain', 'recap', 'summary', 'faster', 'slower', 'previous', 'forward', 'chapter', 'section', 'repeat', 'rewind', 'restart', 'beginning', 'silence', 'proceed', 'remember']
const NAME = /^(?:(?:hey|hi|ok|okay)\s+)?(?:noesis|no\s?esis|gnosis|no\s?thesis|know\s?esis|noises|new\s?asis|no\s?asis)\b\s*/ // the app's name, however it was heard: allowed, never needed
const LONGEST = 9 // words: more than this is a remark or the book, not a command

// What was meant, first match wins. Order matters: "go back" is not "go", "stop reading" is not "read",
// "too fast" asks for slower.
const RULES = [
  ['micoff', /\b(stop listening|mic off|microphone off|voice off)\b/],
  ['restart', /\b(start over|start again|restart|from the (beginning|start|top)|beginning)\b/],
  ['prevpage', /\b(previous|last|back)\b.*\bpage\b|\bpage (back|before)\b/],
  ['nextpage', /\b(next|skip|forward|turn)\b.*\bpage\b|\bpage (forward|ahead)\b/],
  ['prevchapter', /\b(previous|last|back)\b.*\b(chapter|section|part)\b/],
  ['nextchapter', /\b(next|skip|forward)\b.*\b(chapter|section|part)\b/],
  ['normal', /\bnormal speed\b/],
  ['faster', /\b(too slow|speed up)\b/],
  ['slower', /\b(too fast|slow down|slower|slow)\b/],
  ['faster', /\b(faster|fast|quick)\b/],
  ['play', /\b(dont|do not|never) (stop|pause)\b/],
  ['bookmark', /\b(bookmark|mark|save|remember|note)\b/],
  ['explain', /\b(explain|meaning|mean|define|what was that|what is that)\b/],
  ['recap', /\b(recap|summary|where was i|what did i miss|catch me up)\b/],
  ['skim', /\bskim\b/],
  ['back', /\b(go back|back|previous|rewind|repeat|again|one more time|pardon|come again)\b/],
  ['pause', /\b(pause|stop|wait|hold|halt|quiet|silence|shut up|enough|one (second|sec|minute|moment))\b/],
  ['play', /\b(go ahead|go on|carry on|keep going|keep reading)\b/],
  ['next', /\b(next|skip|forward|ahead|move on)\b/],
  ['play', /\b(play|resume|continue|start|go on|go ahead|carry on|keep going|keep reading|read|proceed|unpause|begin|go)\b/],
]

// Lower-case, punctuation becomes a space, whole words only.
export function tokens(text) {
  return String(text ?? '').toLowerCase().replace(/[’']/g, '').replace(/[^\p{L}\p{N}\s]+/gu, ' ').split(/\s+/).filter(Boolean)
}

// One letter added, dropped, or changed.
function near(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  let j = 0
  let edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue }
    if (++edits > 1) return false
    if (a.length > b.length) i++
    else if (b.length > a.length) j++
    else { i++; j++ }
  }
  return edits + (a.length - i) + (b.length - j) <= 1
}
const KNOWN = new Set(VOCABULARY)
const heardAs = w => MISHEARD[w] || (w.length >= 5 && !KNOWN.has(w) && VOCABULARY.find(v => near(w, v))) || w

// Returns { cmd, arg? } or null. `arg` is only set for `ask` (the rest of the sentence).
export function parseCommand(transcript) {
  const said = tokens(transcript).join(' ').replace(NAME, '')
  const asked = /^(?:ask|question)\b\s*(.*)$/.exec(said)
  if (asked) return asked[1] ? { cmd: 'ask', arg: asked[1] } : null
  const words = said.split(' ').filter(Boolean)
  if (!words.length || words.length > LONGEST) return null
  const meant = words.map(heardAs).join(' ')
  for (const [cmd, rule] of RULES) if (rule.test(meant)) return { cmd }
  return null
}

// Was that the book? While it plays through a loudspeaker the microphone hears the book too, and books say
// "stop" and "next" all the time. What was heard is the book when most of its words are words the voice is
// reading at this moment. (This is what lets a listener just say "pause". Having to say the app's name
// first, a made-up word no speech service knows, is why commands did nothing.) One or two words alone are
// always taken as the listener: a speech service does not hand over a single word out of a flowing sentence.
const ECHO_SHARE = 0.7
const ECHO_SHORTEST = 3
export function isEcho(heard, beingRead) {
  const said = tokens(heard)
  if (said.length < ECHO_SHORTEST) return false
  const book = new Set(tokens(beingRead))
  return said.filter(w => book.has(w)).length / said.length >= ECHO_SHARE
}

export function speechSupported() {
  return typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
}

// Which English the listener most likely speaks. The phone's own language, when it names a kind of English
// other than American (a phone left on its factory "English (US)" says nothing about its owner); otherwise
// where the phone is: in India, Indian English, which is what makes an Indian accent understood.
const ENGLISH_HERE = { 'Asia/Kolkata': 'en-IN', 'Asia/Calcutta': 'en-IN', 'Europe/London': 'en-GB', 'Australia/Sydney': 'en-AU', 'Australia/Melbourne': 'en-AU' }
export function speechLang(language = typeof navigator === 'undefined' ? '' : navigator.language, zone = typeof Intl === 'undefined' ? '' : Intl.DateTimeFormat().resolvedOptions().timeZone) {
  if (/^en-(?!US)/i.test(language || '')) return language
  return ENGLISH_HERE[zone] || 'en-US'
}
const GUESSES = 4 // how many readings of each sentence the speech service is asked for

// Continuous recognition, final results only. The browser ends a session after silence, so while the
// listener is still wanted it starts a new one, at most once a second.
export function createListener({ lang = speechLang(), onCommand, onHeard, onInterim, onState }) {
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
    r.maxAlternatives = GUESSES
    r.onstart = () => report('listening')
    r.onresult = e => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (!res.isFinal) { if (onInterim) onInterim(res[0].transcript.trim()); continue }
        // every reading the service offers, best first: the second or third is often the right one for an accent
        const guesses = Array.from({ length: res.length }, (_, n) => res[n].transcript.trim()).filter(Boolean)
        if (!guesses.length) continue
        if (onHeard) onHeard(guesses[0], guesses)
        const cmd = guesses.map(parseCommand).find(Boolean)
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
