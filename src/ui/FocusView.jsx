import { useEffect, useMemo, useRef, useState } from 'react'
import { T } from '../theme.js'
import { useStore } from '../lib/store.js'
import { player, audioClock } from '../lib/player.js'
import { settings } from '../lib/settings.js'
import { library, patch } from '../lib/library.js'
import { ui } from '../lib/nav.js'
import { activeEngine } from '../lib/engine.js'
import { VISUAL_KINDS } from '../lib/text.js'
import { wordWeights } from '../lib/words.js'
import { pivot, wordDelay, emphatic, splitWords, wordIndexAt } from '../lib/focus.js'
import { Button, IconButton } from './kit.jsx'

// One word at a time. While the voice plays the word follows the speech;
// otherwise this is a speed reader on a per-word timer.
const PIVOT_AT = 38 // percent of the width: a little left of centre, because most of a word lies after its pivot

export function FocusView({ doc, active, onSeek, playing }) {
  const id = useStore(ui, s => s.docId)
  const wpm = useStore(settings, s => s.focusWpm ?? 300)
  const sys = useStore(settings, s => activeEngine(s) === 'system')
  const spoken = useStore(player, s => s.word)
  const skip = useStore(settings, s => s.skipVisuals)
  const docs = useStore(library, s => s.docs)
  const savedPos = useMemo(() => docs.find(x => x.id === id)?.pos ?? 0, [docs, id])

  const [run, setRun] = useState(false)
  const [sent, setSent] = useState(null)
  const [wi, setWi] = useState(0)
  const [natWi, setNatWi] = useState(0)
  const timer = useRef(0)
  const lastSave = useRef(0)

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

  // Built-in voice: the device reports the character offset of the spoken word.
  const sysWi = useMemo(() => {
    if (!playing || !sys || curSent < 0) return 0
    const { ws } = wordWeights(sentText)
    if (!ws.length) return 0
    let at = 0
    let idx = 0
    for (let k = 0; k < ws.length; k++) {
      if (at <= spoken) idx = k
      at += ws[k].length + 1
    }
    return Math.max(0, Math.min(idx, Math.max(0, words.length - 1)))
  }, [playing, sys, curSent, sentText, spoken, words.length])

  // Natural voice: fraction of the sentence's audio time into a word.
  useEffect(() => {
    if (!playing || sys) return
    if (curSent < 0 || !doc) return
    let raf = 0
    const loop = () => {
      const text = doc.segs[curSent]?.t ?? ''
      const dur = doc.durs?.[curSent] ?? 0
      const tail = doc.tails?.[curSent] ?? 0
      if (!dur) setNatWi(0)
      else {
        const { ends } = wordWeights(text)
        const f = (audioClock() - 0.06) / Math.max(0.2, dur - (tail || 0))
        setNatWi(wordIndexAt({ ends }, f))
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing, sys, curSent, doc])

  useEffect(() => { if (playing) setNatWi(0) }, [playing, curSent])

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

  if (!doc || curSent == null || curSent < 0 || !words.length) {
    return (
      <div style={{ maxWidth: 560, margin: '12vh auto 0', textAlign: 'center', fontSize: 14, color: T.sub, lineHeight: 1.6 }}>
        {!doc ? 'Preparing the text.' : 'Nothing readable in this document yet.'}
      </div>
    )
  }

  const curWi = playing ? (sys ? sysWi : natWi) : wi
  const showWi = Math.max(0, Math.min(curWi, words.length - 1))
  const word = words[showWi] ?? ''
  const pi = Math.max(0, Math.min(pivot(word), Math.max(0, word.length - 1)))
  const big = emphatic(word)
  const size = big ? 60 : 48

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

  const fit = word.length > 14 ? Math.round(size * 14 / word.length) : size // a very long word is shown smaller rather than cut
  return (
    <div style={{ maxWidth: 640, margin: '10vh auto 0', padding: '0 20px 40px' }}>
      {/* The lime letter's left edge sits at one fixed spot (PIVOT_AT of the width) for every word: the part
          before it is right-aligned up to that spot, the rest starts there. Words may run past the edges of
          their halves; nothing moves the spot. */}
      <div style={{ position: 'relative', height: 110, fontFamily: T.font, fontWeight: 700, fontSize: fit, lineHeight: '110px', whiteSpace: 'pre' }}>
        <span style={{ position: 'absolute', right: `${100 - PIVOT_AT}%`, color: T.text }}>{word.slice(0, pi)}</span>
        <span style={{ position: 'absolute', left: `${PIVOT_AT}%`, color: T.text }}><span data-pivot style={{ color: T.lime }}>{word.slice(pi, pi + 1)}</span>{word.slice(pi + 1)}</span>
      </div>
      <div style={{ marginTop: 26, fontSize: 14, lineHeight: 1.7, color: T.faint, textAlign: 'center' }}>
        {words.map((w, k) => (
          <span key={k} style={{ color: k === showWi ? T.text : undefined }}>{w}{k < words.length - 1 ? ' ' : ''}</span>
        ))}
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
