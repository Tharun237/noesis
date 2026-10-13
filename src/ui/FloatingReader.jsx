import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { T } from '../theme.js'
import { useStore } from '../lib/store.js'
import { player, toggle, nextSentence, prevSentence } from '../lib/player.js'
import { library, loadDoc } from '../lib/library.js'
import { pivot, emphatic, splitWords } from '../lib/focus.js'
import { floatingLayout, captionGroups } from '../lib/floating.js'
import { IconButton } from './kit.jsx'
import { useLitWord } from './litword.js'
import { Spoken } from './Spoken.jsx'
import { useArc, moodAt, moodColour } from './ArcScrubber.jsx'

// The floating window is Focus, at the size of a window that floats over other work (Tharun, 2026-10-13: "It
// should just look like focus mode being size at this in-picture scale". It had been the whole sentence in
// small type with a scroll bar beside it).
//   the word      one at a time, as large as the window carries, its pivot letter in lime on one fixed spot
//                 marked by two ticks; a word said with force is larger and lands harder
//   the light     behind it, in the colour of the writing's mood here; it breathes while the voice reads
//   the sentence  under it, two lines at a time like a caption, filling as it is said (Spoken.jsx). A long
//                 sentence is shown in pieces that follow the voice: nothing here ever scrolls
// Every size comes from the window's own (floating.js floatingLayout): made larger, all of it grows.
// The clock is the floating window's own: the app's tab may be hidden behind what the customer is working in.
const PIVOT_AT = 38 // percent of the width, as in Focus
const LETTER_EM = 0.58 // about how wide a bold letter is: a long word is shown smaller rather than cut
const WORD_SMALLEST = 14
const FORCE = 1.14 // how much larger a word said with force is
const HIT_MS = 300
const TOO_FAST_MS = 170 // words coming faster than this just appear
const LIGHT_STILL = 0.4
const LIGHT_EVEN = 0.14, LIGHT_FELT = 0.26
const EASE = `cubic-bezier(${T.ease.join(',')})`

export function FloatingReader() {
  const id = useStore(player, s => s.id)
  const i = useStore(player, s => s.i)
  const playing = useStore(player, s => s.playing)
  const d = useStore(library, s => s.docs.find(x => x.id === id))

  const host = useRef(null)
  const row = useRef(null)
  const [view, setView] = useState(null) // the floating window: its size, and its clock
  const [size, setSize] = useState({ w: 420, h: 190 })
  const [loaded, setLoaded] = useState({ id: null, doc: null })

  useLayoutEffect(() => {
    const v = host.current?.ownerDocument.defaultView
    if (!v) return undefined
    setView(v)
    const fit = () => setSize({ w: v.innerWidth, h: v.innerHeight })
    fit()
    v.addEventListener('resize', fit)
    return () => v.removeEventListener('resize', fit)
  }, [])

  useEffect(() => {
    if (id == null) return
    let live = true
    loadDoc(id)
      .then(doc => { if (live) setLoaded({ id, doc }) })
      .catch(e => console.error('Floating reader: could not load the document', e))
    return () => { live = false }
  }, [id, d?.contentVer])

  const doc = id != null && loaded.id === id ? loaded.doc : null
  const seg = doc && i >= 0 ? doc.segs[i] : undefined
  const sentText = seg ? seg.t : ''
  const words = useMemo(() => splitWords(sentText), [sentText])
  // The word the voice is on, from the one clock every view uses, run on this window's timers.
  const said = useLitWord(sentText, playing && seg ? doc.durs[i] ?? 0 : 0, playing && seg ? doc.tails[i] ?? 0 : 0, playing, view)
  const line = useArc(d || { id, lang: '-' })

  const L = floatingLayout(size.w, size.h)
  const groups = useMemo(() => captionGroups(words, L.letters), [words, L.letters])
  const some = words.length > 0
  const showWi = Math.max(0, Math.min(playing ? said.lit : 0, words.length - 1))
  const word = some ? words[showWi] ?? '' : ''
  const ms = said.ms
  const big = emphatic(word)

  // A word said with force lands from larger (rare: capitals, ! or ?).
  useLayoutEffect(() => {
    if (!some || !playing || !big || ms < TOO_FAST_MS) return
    row.current?.animate([{ opacity: 0.5, transform: 'scale(1.12)' }, { opacity: 1, transform: 'scale(1)' }], { duration: HIT_MS, easing: EASE })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, showWi, playing])

  const shell = { height: '100%', display: 'flex', flexDirection: 'column', padding: L.pad, overflow: 'hidden', background: T.bg, color: T.text, fontFamily: T.font }
  if (id == null || !some) {
    return (
      <div ref={host} style={shell}>
        <div style={{ margin: 'auto', fontSize: 14, color: T.sub, textAlign: 'center' }}>{id == null ? 'Nothing is playing.' : ''}</div>
      </div>
    )
  }

  const width = size.w - L.pad * 2
  const pi = Math.max(0, Math.min(pivot(word), Math.max(0, word.length - 1)))
  const before = word.slice(0, pi), letter = word.slice(pi, pi + 1), after = word.slice(pi + 1)
  // The pivot letter stands on its spot; a word too long for the room on either side of it is shown smaller.
  const want = L.word * (big ? FORCE : 1)
  const room = (letters, px) => (letters ? (px - (want * LETTER_EM) / 2) / (letters.length * LETTER_EM) : want)
  const type = Math.max(WORD_SMALLEST, Math.floor(Math.min(want, room(before, (width * PIVOT_AT) / 100), room(after, (width * (100 - PIVOT_AT)) / 100))))
  const rowH = Math.round(L.word * 1.3)
  const mood = moodAt(line, doc.segs.length > 1 ? i / (doc.segs.length - 1) : 0)
  const glow = LIGHT_EVEN + LIGHT_FELT * Math.min(1, Math.abs(mood)) ** 0.6
  const lightW = Math.min(width, L.stageH * 3.2)
  const g = groups.find(([from, to]) => showWi >= from && showWi < to) || groups[0]
  const tick = { position: 'absolute', left: `${PIVOT_AT}%`, width: 2, height: Math.max(3, Math.round(L.word * 0.14)), marginLeft: -1, borderRadius: 1, background: T.borderHi }
  const side = { position: 'absolute', top: 0, color: T.text }

  return (
    <div ref={host} style={shell}>
      <div data-testid="float-word" style={{ position: 'relative', flex: 'none', height: L.stageH }}>
        <div aria-hidden="true" data-breathe={playing ? '' : undefined} style={{
          position: 'absolute', left: '50%', top: '50%', width: lightW, height: L.stageH, marginLeft: -lightW / 2, marginTop: -L.stageH / 2,
          background: `radial-gradient(closest-side, ${moodColour(mood, glow)}, ${moodColour(mood, glow / 3)} 55%, ${moodColour(mood, 0)})`,
          opacity: LIGHT_STILL, willChange: 'transform, opacity', pointerEvents: 'none',
        }} />
        <span aria-hidden="true" style={{ ...tick, top: Math.max(0, (L.stageH - rowH) / 2 - tick.height) }} />
        <span aria-hidden="true" style={{ ...tick, bottom: Math.max(0, (L.stageH - rowH) / 2 - tick.height) }} />
        <div ref={row} style={{ position: 'absolute', left: 0, right: 0, top: (L.stageH - rowH) / 2, height: rowH, fontWeight: 700, fontSize: type, lineHeight: `${rowH}px`, letterSpacing: '-0.02em', whiteSpace: 'pre', transformOrigin: `${PIVOT_AT}% 55%` }}>
          <span style={{ position: 'absolute', left: `${PIVOT_AT}%`, top: 0, width: 0, display: 'flex', justifyContent: 'center' }}>
            <span style={{ position: 'relative' }}>
              <span style={{ ...side, right: '100%' }}>{before}</span>
              <span data-pivot style={{ color: T.lime }}>{letter}</span>
              <span style={{ ...side, left: '100%' }}>{after}</span>
            </span>
          </span>
        </div>
      </div>
      <div key={`${i}:${g[0]}`} data-fade="" data-testid="float-line" style={{ flex: 'none', height: L.capH, overflow: 'hidden', fontSize: L.capFont, lineHeight: `${L.capLine}px`, fontWeight: 500, textAlign: 'center', textWrap: 'balance' }}>
        <Spoken ws={words.slice(g[0], g[1])} lit={playing ? showWi - g[0] : Infinity} ms={ms} ahead={T.faint} wipe={playing && ms >= TOO_FAST_MS} />
      </div>
      <div style={{ flex: 'none', height: L.controls, marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <IconButton icon="prev" label="Previous sentence" size={L.controls} iconSize={16} onClick={prevSentence} />
        <IconButton icon={playing ? 'pause' : 'play'} label={playing ? 'Pause' : 'Play'} size={L.controls} iconSize={18} onClick={toggle} />
        <IconButton icon="next" label="Next sentence" size={L.controls} iconSize={16} onClick={nextSentence} />
      </div>
    </div>
  )
}
