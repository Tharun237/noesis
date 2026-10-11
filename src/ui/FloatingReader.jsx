import { useEffect, useMemo, useRef, useState } from 'react'
import { T } from '../theme.js'
import { useStore } from '../lib/store.js'
import { player, toggle, nextSentence, prevSentence, audioClock } from '../lib/player.js'
import { settings } from '../lib/settings.js'
import { activeEngine } from '../lib/engine.js'
import { loadDoc } from '../lib/library.js'
import { wordWeights } from '../lib/words.js'
import { splitWords, wordIndexAt } from '../lib/focus.js'
import { IconButton } from './kit.jsx'

// What the floating window shows: the sentence being read, the word being spoken in lime, and
// previous / play-pause / next. Word timing matches FocusView: built-in voice follows player.word,
// natural voice follows audioClock() against the document's durs and tails.
export function FloatingReader() {
  const id = useStore(player, s => s.id)
  const i = useStore(player, s => s.i)
  const playing = useStore(player, s => s.playing)
  const word = useStore(player, s => s.word)
  const sys = useStore(settings, s => activeEngine(s) === 'system')

  const host = useRef(null)
  const [loaded, setLoaded] = useState({ id: null, doc: null })
  const [natWi, setNatWi] = useState(0)

  useEffect(() => {
    if (id == null) return
    let live = true
    loadDoc(id)
      .then(doc => { if (live) setLoaded({ id, doc }) })
      .catch(e => console.error('Floating reader: could not load the document', e))
    return () => { live = false }
  }, [id])

  const doc = id != null && loaded.id === id ? loaded.doc : null
  const seg = doc && i >= 0 ? doc.segs[i] : undefined
  const sentText = seg ? seg.t : ''
  const words = useMemo(() => splitWords(sentText), [sentText])
  const { ws, ends } = useMemo(() => wordWeights(sentText), [sentText])

  // Built-in voice: the device reports the character offset of the spoken word.
  const sysWi = useMemo(() => {
    let at = 0
    let idx = 0
    for (let k = 0; k < ws.length; k++) {
      if (at <= word) idx = k
      at += ws[k].length + 1
    }
    return Math.max(0, Math.min(idx, words.length - 1))
  }, [ws, word, words.length])

  // Natural voice: fraction of the sentence's audio time into a word. Runs on the floating window's own
  // frame clock: the app tab's frames stop while the reader is used from another tab or app.
  useEffect(() => {
    if (!playing || sys || !doc || !sentText) return
    const view = host.current.ownerDocument.defaultView
    let frame = 0
    const loop = () => {
      const dur = doc.durs[i]
      setNatWi(dur ? wordIndexAt(ends, (audioClock() - 0.06) / Math.max(0.2, dur - doc.tails[i])) : 0)
      frame = view.requestAnimationFrame(loop)
    }
    frame = view.requestAnimationFrame(loop)
    return () => view.cancelAnimationFrame(frame)
  }, [playing, sys, doc, i, sentText, ends])

  const lit = !playing ? -1 : sys ? sysWi : Math.min(natWi, words.length - 1)

  return (
    <div ref={host} style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 20px', boxSizing: 'border-box', background: T.bg, color: T.text, fontFamily: T.font }}>
      {id == null ? (
        <div style={{ margin: 'auto', fontSize: 14, color: T.sub, textAlign: 'center' }}>Nothing is playing.</div>
      ) : (
        <>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            <p style={{ margin: 'auto 0', fontSize: 18, lineHeight: 1.5, textAlign: 'center' }}>
              {words.map((w, k) => (
                <span key={k} style={{ color: k === lit ? T.lime : undefined }}>{w}{k < words.length - 1 ? ' ' : ''}</span>
              ))}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <IconButton icon="prev" label="Previous sentence" onClick={prevSentence} />
            <IconButton icon={playing ? 'pause' : 'play'} label={playing ? 'Pause' : 'Play'} onClick={toggle} />
            <IconButton icon="next" label="Next sentence" onClick={nextSentence} />
          </div>
        </>
      )}
    </div>
  )
}
