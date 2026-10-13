import { useEffect, useState } from 'react'
import { T, label } from '../theme.js'
import { settings } from '../lib/settings.js'
import { activeEngine } from '../lib/engine.js'
import { engine } from '../lib/tts.js'
import { player, stretchInfo, audioState } from '../lib/player.js'
import { toast } from '../lib/nav.js'
import { Button } from './kit.jsx'

const probe = document.createElement('audio')
const plays = type => probe.canPlayType(type) || 'no'

function collect() {
  const s = settings.get()
  const p = player.get()
  const st = stretchInfo()
  const a = audioState()
  const supported = 'mediaSession' in navigator
  const ms = supported ? navigator.mediaSession : null
  return [
    ['App', [
      ['Version', String(__APP_VERSION__)],
      ['Build', String(__APP_BUILD__)],
      ['Installed as app', matchMedia('(display-mode: standalone)').matches ? 'yes' : 'no'],
      ['Service worker in control', navigator.serviceWorker?.controller ? 'yes' : 'no'],
      ['Cross-origin isolated', crossOriginIsolated ? 'yes' : 'no'],
      ['Page visible', document.visibilityState],
    ]],
    ['Voice', [
      ['Engine in use', activeEngine(s)],
      ['Voice', s.voice],
      ['Measured speed', String(s.voiceSpeed)],
      ['Voice engine status', engine.get().status],
    ]],
    ['Playback', [
      ['Player', `id ${p.id ? 'yes' : 'no'}, i ${p.i}, playing ${p.playing ? 'yes' : 'no'}, waiting ${p.waiting ? 'yes' : 'no'}, gate ${p.gate ?? 'none'}`],
      ['Loaded audio', st ? `sentences ${st.from}–${st.to}, ${Number(st.seconds).toFixed(1)}s` : 'none'],
      ['Audio element', `paused ${a.paused ? 'yes' : 'no'}, ended ${a.ended ? 'yes' : 'no'}, readyState ${a.readyState}, ${Number(a.currentTime).toFixed(1)}/${Number(a.duration).toFixed(1)}, muted ${a.muted ? 'yes' : 'no'}, volume ${a.volume}`],
      ['Last refused play', a.playError ?? 'none'],
      ['Audio formats', `Opus encoder ${typeof AudioEncoder === 'undefined' ? 'no' : 'yes'}, plays Ogg Opus ${plays('audio/ogg; codecs=opus')}, plays WAV ${plays('audio/wav')}`],
    ]],
    ['System media controls', [
      ['Media Session supported', supported ? 'yes' : 'no'],
      ['Media Session state', ms ? String(ms.playbackState) : 'unsupported'],
      ['Media Session title', ms?.metadata?.title ?? 'none'],
      ['Media Session artist', ms?.metadata?.artist ?? 'none'],
      ['Notifications permission', typeof Notification === 'undefined' ? 'unsupported' : Notification.permission],
    ]],
    ['Device', [
      ['User agent', navigator.userAgent],
      ['Cores', String(navigator.hardwareConcurrency ?? 'unknown')],
      ['Memory', navigator.deviceMemory ? `${navigator.deviceMemory} GB` : 'unknown'],
    ]],
  ]
}

function reportText(sections) {
  return sections.map(([h, rows]) => [h, ...rows.map(([k, v]) => `${k}: ${v}`)].join('\n')).join('\n\n')
}

export function DiagnosticsCard({ Card }) {
  const [open, setOpen] = useState(false)
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!open) return
    const t = setInterval(() => setTick(x => x + 1), 1000)
    return () => clearInterval(t)
  }, [open])
  const sections = collect()
  async function copy() {
    try {
      await navigator.clipboard.writeText(reportText(collect()))
      toast('Diagnostics copied')
    } catch {
      toast('Could not copy. Select the text instead.')
    }
  }
  return (
    <Card title="Diagnostics">
      <div><Button onClick={copy}>Copy report</Button></div>
      <details open={open} onToggle={e => setOpen(e.currentTarget.open)}>
        <summary style={{ cursor: 'pointer', fontFamily: T.font, fontSize: 14, fontWeight: 600, color: T.text }}>Show diagnostics</summary>
        {sections.map(([h, rows]) => (
          <div key={h} style={{ display: 'grid', gap: 6, marginTop: 12 }}>
            <div style={label}>{h}</div>
            {rows.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 8, fontSize: 12.5, lineHeight: 1.5 }}>
                <span style={{ color: T.sub, flexShrink: 0 }}>{k}:</span>
                <span style={{ color: T.text, fontFamily: T.code, wordBreak: 'break-word' }}>{String(v)}</span>
              </div>
            ))}
          </div>
        ))}
      </details>
    </Card>
  )
}
