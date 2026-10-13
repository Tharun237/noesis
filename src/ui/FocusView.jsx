import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { T } from '../theme.js'
import { useRoute } from '../lib/route.js'
import { useStore, useWidth } from '../lib/store.js'
import { settings } from '../lib/settings.js'
import { library, patch } from '../lib/library.js'
import { VISUAL_KINDS } from '../lib/text.js'
import { pivot, wordDelay, emphatic, splitWords } from '../lib/focus.js'
import { Button, IconButton } from './kit.jsx'
import { useLitWord } from './litword.js'
import { Spoken } from './Spoken.jsx'
import { useArc, moodAt, moodColour } from './ArcScrubber.jsx'

// One word at a time, as large as the screen can carry it. While the voice plays the word follows the speech;
// otherwise this is a speed reader on a per-word timer.
//
// What the eye is given (it was a 48 px word alone on a black screen: "small in size, not catching the eyes",
// Tharun, 2026-10-13):
//   the word      sized from the screen's width, its pivot letter in lime at one fixed spot marked by two ticks,
//                 so the eye never moves; a word said with force (capitals, ! or ?) is larger and lands harder
//   the light     behind the word, in the colour of the writing's mood at this point of the book: the same
//                 feeling, from the same count, as the player's line (ArcScrubber). It breathes while
//                 something is being read and rests when nothing is
//   the sentence  under it at a size that can be read, filling as it is said (Spoken.jsx): the rhythm of the
//                 speech can be seen there as well as heard
// The word itself does not move: the eye is resting on it. (A landing for every word and a beat of the light
// with it were tried: an animation started three times a second is worked out on the thread that builds the
// page for most of its short life, and reading cost twice the work. Measured, then taken out.) What moves is a
// transform or an opacity the browser runs by itself; the light is repainted only when the mood changes,
// which is once a sentence at most.
const PIVOT_AT = 38 // percent of the width: a little left of centre, because most of a word lies after its pivot
const COLUMN = 900 // px: the widest the stage gets
const WORD_VW = 0.18 // the word's size as a share of the screen's width...
const WORD_MIN = 56 // ...and never smaller...
const WORD_MAX = 136 // ...or larger than this
const LETTER_EM = 0.58 // about how wide a bold letter is: a long word is shown smaller rather than cut
const WORD_SMALLEST = 20
const FORCE = 1.14 // how much larger a word said with force is
const HIT_MS = 300 // a word said with force lands over this long, from larger
const TOO_FAST_MS = 170 // words coming faster than this just appear: there is no time for anything to move
const LIGHT_STILL = 0.4 // the light while nothing is being read (reading, it breathes: press.js, [data-breathe])
const LIGHT_EVEN = 0.14 // how strong the light is at its centre where the writing is even...
const LIGHT_FELT = 0.26 // ...and how much stronger where it is at its brightest or darkest: feeling is what colours it
const EASE = `cubic-bezier(${T.ease.join(',')})`

export function FocusView({ doc, active, onSeek, playing, stickTop = 0 }) {
  const id = useRoute().docId
  const wpm = useStore(settings, s => s.focusWpm ?? 300)
  const skip = useStore(settings, s => s.skipVisuals)
  const docs = useStore(library, s => s.docs)
  const d = useMemo(() => docs.find(x => x.id === id), [docs, id])
  const savedPos = d?.pos ?? 0
  const vw = useWidth()

  const [run, setRun] = useState(false)
  const [sent, setSent] = useState(null)
  const [wi, setWi] = useState(0)
  const [col, setCol] = useState(0) // the stage's own width: narrower than the screen beside an open panel
  const timer = useRef(0)
  const lastSave = useRef(0)
  const host = useRef(null)
  const row = useRef(null)

  const readable = useMemo(() => {
    if (!doc?.segs?.length) return []
    const out = []
    for (let i = 0; i < doc.segs.length; i++) {
      const s = doc.segs[i]
      if (!s || !splitWords(s.t).length) continue
      if (skip && VISUAL_KINDS.has(s.k)) continue
      out.push(i)
    }
    return out
  }, [doc, skip])

  const fallback = useMemo(() => {
    if (!readable.length) return -1
    const from = active >= 0 ? active : savedPos
    for (const i of readable) if (i >= from) return i
    return readable[readable.length - 1]
  }, [readable, active, savedPos])

  const curSent = playing ? active : (sent ?? fallback)
  const sentText = curSent >= 0 ? (doc?.segs[curSent]?.t ?? '') : ''
  const words = useMemo(() => splitWords(sentText), [sentText])
  // The word the voice is on, from the one clock every view uses.
  const said = useLitWord(sentText, playing && curSent >= 0 ? doc?.durs?.[curSent] ?? 0 : 0, playing && curSent >= 0 ? doc?.tails?.[curSent] ?? 0 : 0, playing)

  const save = (i, force = false) => {
    if (id == null || i == null || i < 0) return
    const now = Date.now()
    if (force || now - lastSave.current > 1000) {
      lastSave.current = now
      patch(id, { pos: i })
    }
  }

  const nextAfter = from => {
    for (const i of readable) if (i > from) return i
    return null
  }
  const prevBefore = from => {
    let out = null
    for (const i of readable) {
      if (i >= from) break
      out = i
    }
    return out
  }

  // The player's play stops the speed reader and hands over to the voice.
  useEffect(() => {
    if (playing && run) {
      setRun(false)
      if (sent != null) save(sent, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing])

  // Chained per-word timer; cleared on pause, voice start, unmount and view change.
  useEffect(() => {
    if (!run || playing || curSent == null || curSent < 0 || !doc) return
    const ws = splitWords(doc.segs[curSent]?.t ?? '')
    if (!ws.length) {
      const nxt = nextAfter(curSent)
      if (nxt == null) {
        setRun(false)
        save(curSent, true)
      } else {
        setSent(nxt)
        setWi(0)
        save(nxt, false)
      }
      return
    }
    const w = ws[Math.min(wi, ws.length - 1)]
    timer.current = setTimeout(() => {
      if (wi + 1 < ws.length) setWi(wi + 1)
      else {
        const nxt = nextAfter(curSent)
        if (nxt == null) {
          setRun(false)
          save(curSent, true)
        } else {
          setSent(nxt)
          setWi(0)
          save(nxt, false)
        }
      }
    }, wordDelay(w, wpm))
    return () => clearTimeout(timer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, playing, curSent, wi, wpm, doc])

  useEffect(() => () => clearTimeout(timer.current), [])

  const some = !!doc && curSent != null && curSent >= 0 && words.length > 0
  useLayoutEffect(() => {
    const el = host.current
    if (!el) return undefined
    const ro = new ResizeObserver(() => setCol(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [some])

  const showWi = Math.max(0, Math.min(playing ? said.lit : wi, words.length - 1))
  const word = some ? words[showWi] ?? '' : ''
  const going = playing || run
  // how long this word is on screen: the voice's own time, or the speed reader's
  const ms = playing ? said.ms : wordDelay(word, wpm)
  const big = emphatic(word)

  // A word said with force lands from larger. It is rare (capitals, ! or ?), so it costs nothing to speak of.
  useLayoutEffect(() => {
    if (!some || !going || !big || ms < TOO_FAST_MS) return
    row.current?.animate([{ opacity: 0.5, transform: 'scale(1.12)' }, { opacity: 1, transform: 'scale(1)' }], { duration: HIT_MS, easing: EASE })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curSent, showWi, going])

  const line = useArc(d || { id })
  if (!some) {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center', fontSize: 14, color: T.sub, lineHeight: 1.6 }}>
        {!doc ? 'Reading the document.' : 'Nothing readable in this document yet.'}
      </div>
    )
  }

  const width = col || Math.min(vw - 40, COLUMN)
  const base = Math.round(Math.max(WORD_MIN, Math.min(WORD_MAX, vw * WORD_VW)))
  const pi = Math.max(0, Math.min(pivot(word), Math.max(0, word.length - 1)))
  const before = word.slice(0, pi), letter = word.slice(pi, pi + 1), after = word.slice(pi + 1)
  // The pivot letter stands on its spot; what comes before it has the room to its left, the rest the room to
  // its right. A word too long for its side is shown smaller.
  const want = base * (big ? FORCE : 1)
  const room = (letters, px) => (letters ? (px - (want * LETTER_EM) / 2) / (letters.length * LETTER_EM) : want)
  const size = Math.max(WORD_SMALLEST, Math.floor(Math.min(want, room(before, (width * PIVOT_AT) / 100), room(after, (width * (100 - PIVOT_AT)) / 100))))
  const rowH = Math.round(base * 1.5)
  const stageH = Math.round(base * 2.9)
  const wide = vw >= T.split
  const mood = moodAt(line, doc.segs.length > 1 ? curSent / (doc.segs.length - 1) : 0)
  const felt = Math.min(1, Math.abs(mood)) ** 0.6
  const glow = LIGHT_EVEN + LIGHT_FELT * felt

  const start = () => {
    const s0 = sent ?? fallback
    if (s0 == null || s0 < 0) return
    setSent(s0)
    setWi(0)
    setRun(true)
  }
  const toggleRun = () => {
    if (run) {
      setRun(false)
      save(sent ?? curSent, true)
    } else start()
  }
  const back = () => {
    if (playing) {
      const p = prevBefore(active)
      if (p != null) onSeek(p)
      return
    }
    const p = prevBefore(curSent)
    if (p == null) return
    setSent(p)
    setWi(0)
    save(p, true)
  }
  const setWpm = v => settings.set({ focusWpm: Math.min(900, Math.max(200, v)) })

  const tick = { position: 'absolute', left: `${PIVOT_AT}%`, width: 2, height: Math.round(base * 0.16), marginLeft: -1, borderRadius: 1, background: T.borderHi }
  const side = { position: 'absolute', top: 0, color: T.text }
  return (
    <div ref={host} style={{ width: '100%', maxWidth: COLUMN, margin: '0 auto' }}>
      <div data-testid="focus-word" style={{ position: 'sticky', top: stickTop, zIndex: 1, background: T.bg, height: stageH }}>
        <div aria-hidden="true" data-breathe={going ? '' : undefined} style={{
          position: 'absolute', left: '50%', top: '50%', width: Math.min(width, stageH * 2.6), height: stageH, marginLeft: -Math.min(width, stageH * 2.6) / 2, marginTop: -stageH / 2,
          background: `radial-gradient(closest-side, ${moodColour(mood, glow)}, ${moodColour(mood, glow / 3)} 55%, ${moodColour(mood, 0)})`,
          opacity: LIGHT_STILL, willChange: 'transform, opacity', pointerEvents: 'none',
        }} />
        <span aria-hidden="true" style={{ ...tick, top: (stageH - rowH) / 2 - tick.height }} />
        <span aria-hidden="true" style={{ ...tick, bottom: (stageH - rowH) / 2 - tick.height }} />
        {/* The pivot letter is centred on its spot (a holder with no width, its content centred, overflows it
            equally to both sides); the rest of the word hangs off the letter's two edges. */}
        <div ref={row} style={{ position: 'absolute', left: 0, right: 0, top: (stageH - rowH) / 2, height: rowH, fontFamily: T.font, fontWeight: 700, fontSize: size, lineHeight: `${rowH}px`, letterSpacing: '-0.02em', whiteSpace: 'pre', transformOrigin: `${PIVOT_AT}% 55%` }}>
          <span style={{ position: 'absolute', left: `${PIVOT_AT}%`, top: 0, width: 0, display: 'flex', justifyContent: 'center' }}>
            <span style={{ position: 'relative' }}>
              <span style={{ ...side, right: '100%' }}>{before}</span>
              <span data-pivot style={{ color: T.lime }}>{letter}</span>
              <span style={{ ...side, left: '100%' }}>{after}</span>
            </span>
          </span>
        </div>
      </div>
      <div key={curSent} data-fade="" style={{ maxWidth: '32em', margin: '6px auto 0', padding: '0 4px', fontSize: wide ? 23 : 19, lineHeight: 1.55, fontWeight: 500, color: T.text, textAlign: 'center', textWrap: 'balance' }}>
        <Spoken ws={words} lit={showWi} ms={ms} ahead={T.faint} wipe={going && ms >= TOO_FAST_MS} />
      </div>
      {!playing && (
        <div style={{ marginTop: 34, display: 'grid', justifyItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Button kind="primary" icon={run ? 'pause' : 'play'} onClick={toggleRun}>{run ? 'Stop reading' : 'Start reading'}</Button>
            <Button icon="prev" onClick={back}>Back a sentence</Button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <IconButton icon="minus" label="Slower" onClick={() => setWpm(wpm - 50)} />
            <span style={{ fontFamily: T.mono, fontSize: 12, color: T.sub, minWidth: 104, textAlign: 'center' }}>{wpm} words a minute</span>
            <IconButton icon="plus" label="Faster" onClick={() => setWpm(wpm + 50)} />
          </div>
        </div>
      )}
    </div>
  )
}
