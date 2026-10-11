import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { T, label } from '../theme.js'
import { useStore } from '../lib/store.js'
import { go } from '../lib/nav.js'
import { settings } from '../lib/settings.js'
import { hasAiKey, providerName, contextChars } from '../lib/ai.js'
import { db } from '../lib/db.js'
import { player, pause, play } from '../lib/player.js'
import { speak, stopSpeaking, voiceForText } from '../lib/aside.js'
import { scrollBehavior } from '../lib/motion.js'
import { Icon } from './icons.jsx'
import { Button, IconButton, Pulse } from './kit.jsx'

const STARTERS = ['Recap what I have heard so far.', 'Explain what I just heard, simply.', 'What are the key takeaways?', 'What should I pay attention to next?']

// One-tap helpers: asked and answered aloud, so the listener need not look at the screen. The book pauses
// for the answer and carries on afterwards.
export const QUICK = [
  { id: 'explain', label: 'Explain that', q: 'Explain what I just heard, simply, in under 90 words. Answer in the language of the document.' },
  { id: 'recap', label: 'Recap so far', q: 'Recap what I have heard so far in under 100 words, so I can pick up where I left off. Answer in the language of the document.' },
  { id: 'people', label: 'Who is who', q: 'List the people, groups or characters that have appeared so far in what I have heard, each with one short line saying who they are and why they matter. Only up to the point I have reached. Under 120 words. Answer in the language of the document.' },
  { id: 'argument', label: 'The argument so far', q: 'State the main argument or story so far, up to the point I have reached, as three or four plain sentences: the claim, the reasons given, and what is still open. Answer in the language of the document.' },
  { id: 'words', label: 'Hard words here', q: 'Pick the five hardest or most technical words in the passage I am listening to now and explain each in one plain sentence. Answer in the language of the document.' },
  { id: 'skim', label: 'Skim this section', q: 'I want to skip ahead. Summarise the rest of the section I am in, in under 120 words. Answer in the language of the document.', skim: true },
]

export function AskPanel({ d, doc, onClose, auto, onSeek }) {
  useStore(settings)
  const keyed = hasAiKey()
  const playId = useStore(player, s => s.id)
  const pi = useStore(player, s => s.i)
  const [msgs, setMsgs] = useState([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [speaking, setSpeaking] = useState(null)
  const [preparingVoice, setPreparingVoice] = useState(null)
  const scroller = useRef(null)
  const abort = useRef(null)

  useEffect(() => { db.getChat(d.id).then(m => setMsgs(m || [])) }, [d.id])
  useEffect(() => () => { abort.current?.abort(); stopSpeaking() }, [])
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: scrollBehavior() }) }, [msgs])

  // opts: { label } shows a short line instead of the full instruction; { aloud } speaks the answer when
  // it is complete and then lets the book carry on; { skim } offers the jump to the next section.
  async function ask(question, opts = {}) {
    if (!question.trim() || busy || !doc) return
    const { askContext, askStream } = await import('../lib/gemini.js')
    const at = playId === d.id ? pi : d.pos || 0
    const history = msgs.filter(m => !m.error)
    const next = [...history, { role: 'user', text: opts.label || question.trim() }, { role: 'model', text: '' }]
    setMsgs(next)
    setQ('')
    setBusy(true)
    abort.current = new AbortController()
    let answer = ''
    try {
      await askStream({
        title: d.title, context: askContext(doc.blocks, doc.starts, at, contextChars()), history, question: question.trim(),
        nowHearing: doc.segs[at]?.t, signal: abort.current.signal,
        onText: t => { answer += t; setMsgs(m => [...m.slice(0, -1), { role: 'model', text: answer }]) },
      })
      const done = [...next.slice(0, -1), { role: 'model', text: answer, ...(opts.skim ? { skim: true } : {}) }]
      setMsgs(done)
      db.putChat(d.id, done)
      if (opts.aloud && answer.trim()) {
        const k = done.length - 1
        const wasPlaying = player.get().id === d.id && player.get().playing
        setPreparingVoice(k)
        speak(answer, voiceForText(answer, d), on => {
          if (on) { setPreparingVoice(null); setSpeaking(k) } else { setSpeaking(null); setPreparingVoice(null); if (wasPlaying && !opts.skim) play() }
        })
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        const offline = !navigator.onLine || /failed to fetch|networkerror|load failed|network request failed/i.test(e.message || '')
        const quota = e.status === 429 || /429|quota|rate limit/i.test(e.message || '')
        setMsgs(m => [...m.slice(0, -1), {
          role: 'model',
          text: quota ? `${providerName()}'s free quota is full right now. Try again in a minute.`
            : offline ? "You're offline. Your question is still in the box."
            : "Couldn't get an answer. Try again.",
          error: true,
        }])
        if (!opts.label) setQ(question.trim()) // keep a typed question for a retry
      }
    } finally {
      setBusy(false)
    }
  }

  const quick = qk => ask(qk.q, { label: qk.label, aloud: true, skim: qk.skim })
  // At an equation or a code listing, one more helper: the idea first, then the parts, in plain words.
  const here = doc ? doc.blocks[doc.segs[Math.min(playId === d.id ? pi : d.pos || 0, doc.segs.length - 1)]?.b]?.k : null
  const breakdown = here === 'math' || here === 'code'
    ? { id: 'break', label: here === 'code' ? 'Walk through this code' : 'Break this equation down',
        q: `I am at ${here === 'code' ? 'a code listing' : 'an equation'}. First say in one or two plain sentences what it is for and why it matters. Then walk through its parts in order, in plain words, without reading symbols aloud one by one. Under 140 words. Answer in the language of the document.` }
    : null
  // Opened from a one-tap action elsewhere (the reader's menu, the welcome-back card): ask it at once.
  const ran = useRef(0)
  useEffect(() => {
    if (!auto || !doc || !keyed || ran.current === auto.n) return
    const qk = QUICK.find(x => x.id === auto.id)
    if (qk) { ran.current = auto.n; quick(qk) }
    else if (auto.q) { ran.current = auto.n; ask(auto.q, { aloud: true }) } // a question asked by voice is answered aloud
  }, [auto, doc, keyed]) // eslint-disable-line react-hooks/exhaustive-deps
  const nextSection = () => {
    const at = playId === d.id ? pi : d.pos || 0
    const from = doc.segs[Math.min(at, doc.segs.length - 1)].b
    const b = doc.blocks.findIndex((x, bi) => bi > from && x.k === 'h')
    return b < 0 ? -1 : doc.starts[b]
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 14px 10px 18px', borderBottom: `1px solid ${T.border}` }}>
        <Icon name="sparkle" size={18} style={{ color: T.accent }} />
        <div style={{ flex: 1, fontSize: 16, fontWeight: 700 }}>Ask about this document</div>
        {msgs.length > 0 && <IconButton icon="trash" label="Clear conversation" size={34} iconSize={16} onClick={() => { abort.current?.abort(); setMsgs([]); db.putChat(d.id, []) }} />}
        <IconButton icon="close" label="Close" size={34} iconSize={16} onClick={onClose} />
      </div>

      {!keyed ? (
        <div style={{ padding: 22, display: 'grid', gap: 14 }}>
          <div style={{ fontSize: 14, color: T.sub, lineHeight: 1.6 }}>
            Ask questions, get explanations of what you just heard, and hear the answers read aloud. This uses your own free AI key, which stays on this device.
          </div>
          <Button kind="primary" icon="settings" onClick={() => go('settings')}>Add a free AI key</Button>
        </div>
      ) : (
        <>
          <div ref={scroller} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 16px 8px', display: 'grid', alignContent: 'start', gap: 14 }}>
            {msgs.length === 0 && (
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ ...label, marginBottom: 4 }}>Try asking</div>
                {STARTERS.map(s => (
                  <button key={s} type="button" onClick={() => ask(s)}
                    style={{ textAlign: 'left', padding: '11px 14px', borderRadius: T.r.md, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontFamily: T.font, fontSize: 14, cursor: 'pointer' }}>{s}</button>
                ))}
              </div>
            )}
            {msgs.map((m, k) => (
              <motion.div key={k} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: T.dur.fast }}
                style={{
                  justifySelf: m.role === 'user' ? 'end' : 'stretch', maxWidth: m.role === 'user' ? '85%' : '100%',
                  padding: m.role === 'user' ? '10px 14px' : '2px 2px', borderRadius: T.r.lg,
                  background: m.role === 'user' ? T.surfaceHi : 'transparent', color: m.error ? T.danger : T.text,
                  fontSize: 14.5, lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                {m.text || (busy && k === msgs.length - 1 ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: T.sub }}><Pulse /> Thinking</span> : null)}
                {m.role === 'model' && m.text && !m.error && !(busy && k === msgs.length - 1) && (
                  <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => {
                      if (speaking === k || preparingVoice === k) { stopSpeaking(); setSpeaking(null); setPreparingVoice(null) }
                      else { setPreparingVoice(k); speak(m.text, voiceForText(m.text, d), on => { if (on) { setPreparingVoice(null); setSpeaking(k) } else { setSpeaking(null); setPreparingVoice(null) } }) }
                    }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px', borderRadius: T.r.pill, border: `1px solid ${T.border}`, background: 'transparent', color: speaking === k ? T.accent : T.sub, fontFamily: T.font, fontSize: 12, cursor: 'pointer' }}>
                      <Icon name={speaking === k ? 'stop' : 'speaker'} size={13} /> {preparingVoice === k ? 'Preparing the voice...' : speaking === k ? 'Stop' : 'Listen'}
                    </button>
                    {m.skim && onSeek && doc && nextSection() >= 0 && (
                      <button type="button" onClick={() => { stopSpeaking(); setSpeaking(null); setPreparingVoice(null); onSeek(nextSection()) }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 12px', borderRadius: T.r.pill, border: 'none', background: T.text, color: T.bg, fontFamily: T.font, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                        Skip to the next section
                      </button>
                    )}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, padding: '10px 12px 0', borderTop: `1px solid ${T.border}`, overflowX: 'auto', flexShrink: 0 }}>
            {[...(breakdown ? [breakdown] : []), ...QUICK].map(qk => (
              <button key={qk.id} type="button" disabled={busy || !doc} onClick={() => quick(qk)}
                style={{ flexShrink: 0, height: 34, padding: '0 14px', borderRadius: T.r.pill, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontFamily: T.font, fontSize: 13.5, fontWeight: 600, cursor: busy ? 'default' : 'pointer', opacity: busy || !doc ? 0.5 : 1 }}>
                {qk.label}
              </button>
            ))}
          </div>
          <form onSubmit={e => { e.preventDefault(); ask(q) }} style={{ display: 'flex', gap: 8, padding: 12 }}>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={doc ? 'Ask anything about this document' : 'Preparing the document…'} disabled={!doc}
              style={{ flex: 1, minWidth: 0, height: 44, padding: '0 14px', borderRadius: T.r.pill, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontFamily: T.font, fontSize: 14.5, outline: 'none' }} />
            <IconButton icon="send" label="Send" onClick={() => ask(q)} size={44} style={{ background: q.trim() ? T.text : T.surfaceHi, color: q.trim() ? T.bg : T.faint }} />
          </form>
        </>
      )}
    </div>
  )
}
