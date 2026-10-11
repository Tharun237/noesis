import { useRef, useState } from 'react'
import { T } from '../theme.js'
import { useStore } from '../lib/store.js'
import { settings } from '../lib/settings.js'
import { hasAiKey } from '../lib/ai.js'
import { library } from '../lib/library.js'
import { makeBriefing } from '../lib/briefing.js'
import { go, closeSheet } from '../lib/nav.js'
import { Button, IconButton, Pulse } from './kit.jsx'

export function Briefing({ wide }) {
  useStore(settings)
  const docs = useStore(library, s => s.docs.filter(d => d.status === 'voicing' || d.status === 'ready'))
  const keyed = hasAiKey()
  const [checked, setChecked] = useState([])
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState(null)
  const [wait, setWait] = useState(null)
  const [error, setError] = useState(null)
  const abort = useRef(null)

  const toggle = id => setChecked(c => (c.includes(id) ? c.filter(x => x !== id) : [...c, id]))
  const valid = checked.length >= 2 && checked.length <= 5

  async function submit() {
    if (!valid || busy || !keyed) return
    abort.current?.abort()
    abort.current = new AbortController()
    setBusy(true)
    setStage(null)
    setWait(null)
    setError(null)
    try {
      const id = await makeBriefing(checked, {
        signal: abort.current.signal,
        onStage: s => {
          if (s.step === 'waiting') setWait(s.seconds)
          else { setStage(s); setWait(null) }
        },
      })
      go('reader', id)
    } catch (err) {
      if (err?.name !== 'AbortError') setError(err?.message || "Couldn't make the briefing. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: wide ? '28px 28px 30px' : '18px 20px 24px', display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, fontSize: 20, fontWeight: 700, color: T.text }}>Make a briefing</div>
        <IconButton icon="close" label="Close" onClick={closeSheet} />
      </div>
      {!keyed && (
        <div style={{ display: 'grid', gap: 10, padding: 14, borderRadius: T.r.md, border: `1px solid ${T.border}`, background: T.surface }}>
          <div style={{ fontSize: 14, color: T.sub, lineHeight: 1.55 }}>A briefing needs an AI key. Add one in Settings.</div>
          <div><Button icon="settings" onClick={() => go('settings')}>Settings</Button></div>
        </div>
      )}
      {docs.length === 0 ? (
        <div style={{ fontSize: 14, color: T.sub, lineHeight: 1.55 }}>No documents with text yet.</div>
      ) : (
        <div style={{ display: 'grid', gap: 2 }}>
          {docs.map(d => (
            <label key={d.id}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: T.r.sm, background: checked.includes(d.id) ? T.surfaceHi : 'transparent', color: T.text, cursor: 'pointer', fontSize: 15 }}>
              <input type="checkbox" checked={checked.includes(d.id)} onChange={() => toggle(d.id)}
                aria-label={d.title} style={{ width: 18, height: 18, accentColor: T.lime, flexShrink: 0 }} />
              <span style={{ flex: 1, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
            </label>
          ))}
        </div>
      )}
      <div style={{ fontSize: 13, color: valid ? T.sub : T.danger, lineHeight: 1.5 }}>
        {valid ? `${checked.length} selected` : 'Choose 2 to 5 documents.'}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button kind="primary" full onClick={submit} disabled={!valid || busy || !keyed} style={{ height: 50, fontSize: 15 }}>Make the briefing</Button>
        {busy && <Button onClick={() => abort.current?.abort()}>Stop</Button>}
      </div>
      {busy && wait != null && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: T.sub }}><Pulse /> Retrying in about {wait} s</div>
      )}
      {busy && wait == null && stage?.step === 'reading' && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: T.sub }}><Pulse /> Reading {stage.n} of {stage.total}: {stage.title}</div>
      )}
      {busy && wait == null && stage?.step === 'writing' && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: T.sub }}><Pulse /> Writing the briefing</div>
      )}
      {error && <div style={{ fontSize: 14, color: T.danger, lineHeight: 1.55 }}>{error}</div>}
    </div>
  )
}
