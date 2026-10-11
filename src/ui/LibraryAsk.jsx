import { useRef, useState } from 'react'
import { T } from '../theme.js'
import { useStore } from '../lib/store.js'
import { settings } from '../lib/settings.js'
import { hasAiKey, providerName } from '../lib/ai.js'
import { askLibrary, openPassage } from '../lib/libraryask.js'
import { go, closeSheet } from '../lib/nav.js'
import { Button, IconButton, Pulse, inputStyle, Appear } from './kit.jsx'

export function LibraryAsk({ wide }) {
  useStore(settings)
  const keyed = hasAiKey()
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState(null)
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(0)
  const [answer, setAnswer] = useState('')
  const [passages, setPassages] = useState([])
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState(null)
  const abort = useRef(null)

  async function submit(e) {
    e?.preventDefault()
    const question = q.trim()
    if (!question || busy) return
    abort.current?.abort()
    abort.current = new AbortController()
    setBusy(true)
    setStage(null)
    setAnswer('')
    setPassages([])
    setSearched(false)
    setError(null)
    try {
      await askLibrary(question, {
        signal: abort.current.signal,
        onStage: (s, d, t) => { setStage(s); if (s === 'reading' && d != null) { setDone(d); setTotal(t) } },
        onPassages: p => { setPassages(p); setSearched(true) },
        onText: t => setAnswer(a => a + t),
      })
    } catch (err) {
      if (err?.name !== 'AbortError') setError(err?.message || "Couldn't get an answer. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: wide ? '28px 28px 30px' : '18px 20px 24px', display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, fontSize: 20, fontWeight: 700, color: T.text }}>Ask your library</div>
        <IconButton icon="close" label="Close" onClick={closeSheet} />
      </div>
      {!keyed && (
        <div style={{ display: 'grid', gap: 10, padding: 14, borderRadius: T.r.md, border: `1px solid ${T.border}`, background: T.surface }}>
          <div style={{ fontSize: 14, color: T.sub, lineHeight: 1.55 }}>Asking your library needs an AI key. Add one in Settings.</div>
          <div><Button icon="settings" onClick={() => go('settings')}>Settings</Button></div>
        </div>
      )}
      <form onSubmit={submit} style={{ display: 'flex', gap: 8 }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Ask about your library" aria-label="Ask about your library"
          style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
        <Button kind="primary" type="submit" disabled={!q.trim() || busy}>Ask</Button>
        {busy && <Button onClick={() => abort.current?.abort()}>Stop</Button>}
      </form>
      {busy && stage === 'reading' && (
        <Appear style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: T.sub }}><Pulse /> Reading your library: {done} of {total}</Appear>
      )}
      {busy && stage === 'asking' && (
        <Appear style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: T.sub }}><Pulse /> Asking {providerName()}</Appear>
      )}
      {error && <Appear style={{ fontSize: 14, color: T.danger, lineHeight: 1.55 }}>{error}</Appear>}
      {answer && <Appear style={{ fontSize: 14.5, color: T.text, lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{answer}</Appear>}
      {searched && !busy && passages.length === 0 && (
        <Appear style={{ fontSize: 14, color: T.sub, lineHeight: 1.55 }}>Nothing in your library matches that.</Appear>
      )}
      {passages.length > 0 && (
        <Appear style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontFamily: T.mono, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.faint }}>{keyed ? 'Passages' : 'Passages that match'}</div>
          {passages.map(p => (
            <button key={`${p.doc}:${p.block}`} type="button" onClick={() => openPassage(p)}
              style={{ textAlign: 'left', padding: '11px 14px', borderRadius: T.r.md, border: `1px solid ${T.border}`, background: T.surface, cursor: 'pointer', fontFamily: T.font, display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}><span style={{ fontFamily: T.mono, fontSize: 12.5, color: T.lime, marginRight: 8 }}>[{p.n}]</span>{p.title}</span>
              <span style={{ fontSize: 13, color: T.sub, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.text}</span>
            </button>
          ))}
        </Appear>
      )}
    </div>
  )
}
