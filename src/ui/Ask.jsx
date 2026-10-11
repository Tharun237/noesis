import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { T, label } from '../theme.js'
import { useStore } from '../lib/store.js'
import { go } from '../lib/nav.js'
import { settings, hasKey } from '../lib/settings.js'
import { db } from '../lib/db.js'
import { player, pause } from '../lib/player.js'
import { synthesize, recordToBlob } from '../lib/tts.js'
import { sentences } from '../lib/text.js'
import { Icon } from './icons.jsx'
import { Button, IconButton, Pulse } from './kit.jsx'

const STARTERS = ['What is this document about?', 'What are the key takeaways?', 'Explain what I just heard, simply.', 'What should I pay attention to?']

// Answers can be listened to in the document's own voice, so the user never has to switch to reading.
const voiceOut = new Audio()
let speakToken = 0
async function speak(text, voice, onState) {
  const my = ++speakToken
  pause()
  try {
    for (const s of sentences(text.replace(/[*#_`>]/g, ''))) {
      const url = URL.createObjectURL(recordToBlob(await synthesize(s, voice)))
      if (my !== speakToken) return URL.revokeObjectURL(url)
      voiceOut.src = url
      await voiceOut.play()
      if (my === speakToken) onState(true) // first sound: no longer preparing
      await new Promise(r => { voiceOut.onended = r; voiceOut.onpause = r })
      URL.revokeObjectURL(url)
      if (my !== speakToken) return
    }
  } finally {
    if (my === speakToken) onState(false)
  }
}
const stopSpeaking = () => { speakToken++; voiceOut.pause() }

export function AskPanel({ d, doc, onClose }) {
  const key = useStore(settings, s => s.geminiKey)
  const model = useStore(settings, s => s.geminiModel)
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
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }) }, [msgs])

  async function ask(question) {
    if (!question.trim() || busy || !doc) return
    const { askContext, askStream } = await import('../lib/gemini.js')
    const at = playId === d.id ? pi : d.pos || 0
    const history = msgs.filter(m => !m.error)
    const next = [...history, { role: 'user', text: question.trim() }, { role: 'model', text: '' }]
    setMsgs(next)
    setQ('')
    setBusy(true)
    abort.current = new AbortController()
    let answer = ''
    try {
      await askStream({
        key, model, title: d.title, context: askContext(doc.blocks, doc.starts, at), history, question: question.trim(),
        nowHearing: doc.segs[at]?.t, signal: abort.current.signal,
        onText: t => { answer += t; setMsgs(m => [...m.slice(0, -1), { role: 'model', text: answer }]) },
      })
      const done = [...next.slice(0, -1), { role: 'model', text: answer }]
      setMsgs(done)
      db.putChat(d.id, done)
    } catch (e) {
      if (e.name !== 'AbortError') {
        const offline = !navigator.onLine || /failed to fetch|networkerror|load failed|network request failed/i.test(e.message || '')
        const quota = e.status === 429 || /429|quota|rate limit/i.test(e.message || '')
        setMsgs(m => [...m.slice(0, -1), {
          role: 'model',
          text: quota ? "Google's free quota is full right now. Try again in a minute."
            : offline ? "You're offline. Your question is still in the box."
            : "Couldn't get an answer. Try again.",
          error: true,
        }])
        setQ(question.trim()) // keep the question for a retry
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 14px 10px 18px', borderBottom: `1px solid ${T.border}` }}>
        <Icon name="sparkle" size={18} style={{ color: T.accent }} />
        <div style={{ flex: 1, fontSize: 16, fontWeight: 700 }}>Ask about this document</div>
        {msgs.length > 0 && <IconButton icon="trash" label="Clear conversation" size={34} iconSize={16} onClick={() => { abort.current?.abort(); setMsgs([]); db.putChat(d.id, []) }} />}
        <IconButton icon="close" label="Close" size={34} iconSize={16} onClick={onClose} />
      </div>

      {!hasKey() ? (
        <div style={{ padding: 22, display: 'grid', gap: 14 }}>
          <div style={{ fontSize: 14, color: T.sub, lineHeight: 1.6 }}>
            Ask questions, get explanations of what you just heard, and hear the answers read aloud. This uses your own free Google Gemini key, which stays on this device.
          </div>
          <Button kind="primary" icon="settings" onClick={() => go('settings')}>Add a free Gemini key</Button>
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
                  <div style={{ marginTop: 6 }}>
                    <button type="button" onClick={() => {
                      if (speaking === k || preparingVoice === k) { stopSpeaking(); setSpeaking(null); setPreparingVoice(null) }
                      else { setPreparingVoice(k); speak(m.text, d.voice, on => { if (on) { setPreparingVoice(null); setSpeaking(k) } else { setSpeaking(null); setPreparingVoice(null) } }) }
                    }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px', borderRadius: T.r.pill, border: `1px solid ${T.border}`, background: 'transparent', color: speaking === k ? T.accent : T.sub, fontFamily: T.font, fontSize: 12, cursor: 'pointer' }}>
                      <Icon name={speaking === k ? 'stop' : 'speaker'} size={13} /> {preparingVoice === k ? 'Preparing the voice...' : speaking === k ? 'Stop' : 'Listen'}
                    </button>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
          <form onSubmit={e => { e.preventDefault(); ask(q) }} style={{ display: 'flex', gap: 8, padding: 12, borderTop: `1px solid ${T.border}` }}>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={doc ? 'Ask anything about this document' : 'Preparing the document…'} disabled={!doc}
              style={{ flex: 1, minWidth: 0, height: 44, padding: '0 14px', borderRadius: T.r.pill, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontFamily: T.font, fontSize: 14.5, outline: 'none' }} />
            <IconButton icon="send" label="Send" onClick={() => ask(q)} size={44} style={{ background: q.trim() ? T.text : T.surfaceHi, color: q.trim() ? T.bg : T.faint }} />
          </form>
        </>
      )}
    </div>
  )
}
