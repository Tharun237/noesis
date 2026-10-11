import { useMemo, useRef, useState } from 'react'
import { T } from '../theme.js'
import { useStore } from '../lib/store.js'
import { settings } from '../lib/settings.js'
import { hasAiKey } from '../lib/ai.js'
import { useHistory, summarise, makeRetrospective } from '../lib/history.js'
import { go, closeSheet } from '../lib/nav.js'
import { Button, IconButton, Pulse } from './kit.jsx'

function fmtListened(s) {
  s = Math.max(0, Math.floor(s || 0))
  if (s > 0 && s < 60) return 'under 1 min' // some listening is not none
  if (s < 3600) return `${Math.floor(s / 60)} min`
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h} h ${m} min`
}

const fmtSince = since => {
  const [y, m, d] = since.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric' })
}

export function Listening({ wide }) {
  useStore(settings)
  const log = useHistory()
  const summary = useMemo(() => summarise(log, new Date()), [log])
  const keyed = hasAiKey()
  const enough = summary.month >= 600
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const abort = useRef(null)

  async function submit() {
    if (busy || !keyed || !enough) return
    abort.current?.abort()
    abort.current = new AbortController()
    setBusy(true)
    setError(null)
    try {
      const id = await makeRetrospective({ signal: abort.current.signal })
      go('reader', id)
    } catch (err) {
      if (err?.name !== 'AbortError') setError(err?.message || "Couldn't make the retrospective. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const rows = [
    ['Today', fmtListened(summary.today)],
    ['Last 7 days', fmtListened(summary.week)],
    ['This month', fmtListened(summary.month)],
    ['Total', fmtListened(summary.total)],
    ['Finished this month', String(summary.finishedThisMonth)],
    ['Day streak', summary.streak === 1 ? '1 day' : `${summary.streak} days`],
  ]

  return (
    <div style={{ padding: wide ? '28px 28px 30px' : '18px 20px 24px', display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, fontSize: 20, fontWeight: 700, color: T.text }}>Your listening</div>
        <IconButton icon="close" label="Close" onClick={closeSheet} />
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <div style={{ flex: 1, fontSize: 14, color: T.sub }}>{k}</div>
            <div style={{ fontFamily: T.mono, fontSize: 14, color: T.text }}>{v}</div>
          </div>
        ))}
      </div>
      {summary.top.length > 0 && (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ fontFamily: T.mono, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.faint }}>Most listened this month</div>
          {summary.top.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'baseline', gap: 12, minWidth: 0 }}>
              <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
              <div style={{ fontFamily: T.mono, fontSize: 13, color: T.sub, flexShrink: 0 }}>{fmtListened(t.seconds)}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.5 }}>
        {summary.since ? `Counted on this device since ${fmtSince(summary.since)}.` : 'Nothing counted yet. Listening time is counted from now on, on this device.'}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button kind="primary" full onClick={submit} disabled={!keyed || !enough || busy} style={{ height: 50, fontSize: 15 }}>Hear your month</Button>
        {busy && <Button onClick={() => abort.current?.abort()}>Stop</Button>}
      </div>
      {!keyed && <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.5 }}>A retrospective needs an AI key. Add one in Settings.</div>}
      {keyed && !enough && <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.5 }}>Listen for a little longer first.</div>}
      {busy && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: T.sub }}><Pulse /> Writing your retrospective</div>}
      {error && <div style={{ fontSize: 14, color: T.danger, lineHeight: 1.55 }}>{error}</div>}
    </div>
  )
}
