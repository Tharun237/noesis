import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { T } from '../theme.js'
import { useStore } from '../lib/store.js'
import { go, openSheet, toast } from '../lib/nav.js'
import { settings } from '../lib/settings.js'
import { library, loadDoc, toggleMark } from '../lib/library.js'
import { player, toggle, nextSentence, prevSentence, setRate, setSleep, seekTime, timeline } from '../lib/player.js'
import { voiceName } from '../lib/voices.js'
import { activeEngine, pickSystemVoice, systemVoiceLabel, systemVoices } from '../lib/engine.js'

const fmtWait = w => (w < 90 ? '< 2 min' : w < 3600 ? `${Math.round(w / 60)} min` : `${(w / 3600).toFixed(1)} h`)

// Which voice is actually speaking on this device right now.
function useVoiceLabel(d) {
  const sys = useStore(settings, s => activeEngine(s) === 'system')
  useStore(settings, s => s.systemVoice)
  useStore(systemVoices, s => s.list)
  return sys ? systemVoiceLabel(pickSystemVoice()) : voiceName(d.voice)
}
import { Icon } from './icons.jsx'
import { IconButton, Menu, Progress, fmtTime, fmtDur, Swap } from './kit.jsx'
import { Cover } from './Library.jsx'
import { ArcScrubber } from './ArcScrubber.jsx'

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]
const SLEEP = [[10, '10 minutes'], [20, '20 minutes'], [30, '30 minutes'], [45, '45 minutes'], [60, '1 hour'], [90, '1½ hours'], [120, '2 hours']]

function useTimeline(id) {
  const d = useStore(library, s => s.docs.find(x => x.id === id))
  const [c, setC] = useState(null)
  useEffect(() => { let live = true; setC(null); if (id && d?.total) loadDoc(id).then(x => live && setC(x)); return () => { live = false } }, [id, d?.total, d?.status === 'voicing'])
  const offs = useMemo(() => (d && c ? timeline(d, c) : null), [d?.done, d?.vSec, c])
  return { d, c, offs }
}

export function PlayerBar({ wide, full }) {
  const id = useStore(player, s => s.id)
  const i = useStore(player, s => s.i)
  const t = useStore(player, s => s.t)
  const { d, c, offs } = useTimeline(id)
  const [drag, setDrag] = useState(null)
  const gate = useStore(player, s => s.gate)
  const waiting = useStore(player, s => s.waiting)
  const sleep = useStore(player, s => s.sleep)
  const voiceLabel = useVoiceLabel(d || {})
  if (!id || !d) return null
  const total = offs ? offs[offs.length - 1] : 0
  const pos = offs ? Math.min(total, offs[Math.min(i, offs.length - 1)] + t) : 0
  const shown = drag ?? pos
  const remaining = Math.max(0, total - shown) / player.get().rate
  const est = d.vChars <= 400
  const left = total ? `${est ? '~' : ''}${fmtDur(remaining)} left` : ''
  const sleepLine = sleepText(sleep)

  const scrubber = (
    <div style={{ display: 'grid', gap: 2 }}>
      {waiting && <div style={{ fontSize: 12, color: T.sub }}>Waiting for the next sentence to generate</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontFamily: T.mono, fontSize: 11.5, color: T.sub }}>
      <span style={{ minWidth: 52, whiteSpace: 'nowrap', flexShrink: 0 }}>{fmtTime(shown)}</span>
      <ArcScrubber d={d} value={shown} max={total} disabled={!c} onChange={setDrag} onCommit={v => { if (drag !== null) { seekTime(v); setDrag(null) } }} />
      <span style={{ minWidth: 60, textAlign: 'right', whiteSpace: 'nowrap', flexShrink: 0 }}>-{fmtTime(remaining)}</span>
      </div>
    </div>
  )

  if (!wide && !full) return <MiniPlayer d={d} progress={total ? pos / total : 0} voiceLabel={voiceLabel} gate={gate} waiting={waiting} left={left} sleepLine={sleepLine} />

  return (
    <motion.div layoutRoot {...playerEnter()}
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 30, background: T.bg, borderTop: `1px solid ${T.border}`,
        padding: `10px ${wide ? 24 : 16}px calc(env(safe-area-inset-bottom) + 10px)`, display: 'grid', gap: wide ? 6 : 10,
      }}>
      <PlayerLeft />
      {scrubber}
      <div style={{ display: 'grid', gridTemplateColumns: wide ? '1fr auto 1fr' : 'auto 1fr auto', alignItems: 'center', gap: 8 }}>
        {wide ? (
          <button type="button" onClick={() => go('reader', id)}
            style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, border: 'none', background: 'transparent', color: T.text, cursor: 'pointer', textAlign: 'left', padding: 0 }}>
            <Cover d={d} w={34} h={44} />
            <span style={{ minWidth: 0, display: 'grid', gap: 2 }}>
              <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: T.font }}>{d.title}</span>
              <span style={{ fontSize: 11.5, color: T.faint, fontFamily: T.mono, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{voiceLabel}</span>
            </span>
          </button>
        ) : <SpeedMenu />}
        <Transport />
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 2 }}>
          {wide && total > 0 && <span style={{ fontFamily: T.mono, fontSize: 12, color: T.sub, marginRight: 8, whiteSpace: 'nowrap' }}>{gate != null ? `Ready in ${fmtWait(gate)}` : left}{sleepLine ? ` · ${sleepLine}` : ''}</span>}
          <BookmarkButton d={d} i={i} />
          {wide && <SpeedMenu />}
          <SleepMenu />
        </div>
      </div>
    </motion.div>
  )
}

function Transport({ size = 58 }) {
  const playing = useStore(player, s => s.playing)
  const waiting = useStore(player, s => s.waiting || s.gate != null)
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
      <IconButton icon="prev" label="Previous sentence" onClick={prevSentence} size={46} iconSize={22} />
      <PlayButton playing={playing} waiting={waiting} size={size} />
      <IconButton icon="next" label="Next sentence" onClick={nextSentence} size={46} iconSize={22} />
    </div>
  )
}

function PlayButton({ playing, waiting, size }) {
  return (
    <button type="button" aria-label={playing ? 'Pause' : 'Play'} onClick={toggle} data-press=""
      style={{ '--press': T.tap.icon, width: size, height: size, borderRadius: T.r.pill, border: 'none', background: T.text, color: T.bg, display: 'grid', placeItems: 'center', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
      {waiting && (
        <span data-spin style={{ position: 'absolute', inset: -4, borderRadius: T.r.pill, border: '2px solid transparent', borderTopColor: T.accent }} />
      )}
      <motion.span key={playing ? 'pause' : 'play'} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={T.spring} style={{ display: 'grid' }}>
        <Icon name={playing ? 'pause' : 'play'} size={size * 0.4} stroke={playing ? 2.6 : 1.6} fill={!playing} style={{ marginLeft: playing ? 0 : 2 }} />
      </motion.span>
    </button>
  )
}

function SpeedMenu() {
  const rate = useStore(player, s => s.rate)
  const def = useStore(settings, s => s.speed)
  return (
    <Menu up align="left" trigger={t => (
      <button type="button" onClick={t} aria-label="Playback speed"
        style={{ height: 36, minWidth: 54, padding: '0 10px', borderRadius: T.r.pill, border: `1px solid ${T.border}`, background: 'transparent', color: T.text, fontFamily: T.mono, fontSize: 13, cursor: 'pointer' }}>
        <Swap>{`${rate}x`}</Swap>
      </button>
    )} items={[
      ...SPEEDS.map(s => ({ label: `${s}x`, icon: s === rate ? 'check' : undefined, right: s === def ? 'default' : undefined, onClick: () => setRate(s) })),
      '-',
      { label: 'Slower (−0.1x)', onClick: () => setRate(rate - 0.1) },
      { label: 'Faster (+0.1x)', onClick: () => setRate(rate + 0.1) },
      { label: `Make ${rate}x the default`, disabled: rate === def, onClick: () => settings.set({ speed: rate }) },
    ]} />
  )
}

function BookmarkButton({ d, i }) {
  const on = (d.marks || []).some(m => m.i === i)
  return <IconButton icon="bookmark" label={on ? 'Remove bookmark' : 'Bookmark this sentence'} active={on} fill={on} onClick={() => toast(toggleMark(d.id, i) ? 'Bookmarked' : 'Bookmark removed')} />
}

export function sleepText(sleep) {
  if (!sleep) return null
  if (sleep.until) return `Sleep in ${Math.max(1, Math.round((sleep.until - Date.now()) / 60000))} min`
  if (sleep.chapter) return 'Sleep at end of chapter'
  if (sleep.doc) return 'Sleep at end of document'
  return null
}

// One formatter, made once. Asking the browser for a fresh one on every render of the player (which is what
// toLocaleTimeString does) took 111 ms of a short session on a slowed processor: measured, e2e/feel.mjs.
const CLOCK = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' })

// The player's one extra is the sleep timer, shown as what it is. There is no "more" menu here: the reader
// already has one (the document's), and two "..." on one screen left the customer guessing which held what.
// What used to hide in it is where it belongs: the bookmark is its own button beside this, the voice and
// the choice about figures are in the document's menu.
function SleepMenu() {
  const sleep = useStore(player, s => s.sleep)
  const running = sleep?.until || sleep?.chapter || sleep?.doc
  const minsLeft = sleep?.until ? Math.max(1, Math.round((sleep.until - Date.now()) / 60000)) : null
  const runningRight = sleep?.until ? `${minsLeft} min left` : sleep?.chapter ? 'at end of chapter' : sleep?.doc ? 'at end of document' : 'off'
  const at = m => CLOCK.format(Date.now() + m * 60000)
  return (
    <Menu up trigger={t => <IconButton icon="moon" label={running ? `Sleep timer: ${runningRight}` : 'Sleep timer'} active={!!running} onClick={t} />} items={[
      ...(running ? [{ label: 'Turn sleep timer off', icon: 'moon', right: runningRight, onClick: () => setSleep(null) }] : []),
      ...SLEEP.map(([m, l]) => ({ label: `Sleep in ${l}`, icon: minsLeft === m ? 'check' : undefined, right: at(m), onClick: () => setSleep({ until: Date.now() + m * 60000 }) })),
      { label: 'Sleep at end of chapter', icon: sleep?.chapter ? 'check' : undefined, onClick: () => setSleep({ chapter: true }) },
      { label: 'Sleep at end of document', icon: sleep?.doc ? 'check' : undefined, onClick: () => setSleep({ doc: true }) },
    ]} />
  )
}

// The player rises in once, when something starts to play. Going between the library and a document swaps
// the small player for the full one: that is the same player changing shape, so it cross-fades in place
// instead of sliding up again on every page change.
let playersShown = 0 // counted while mounted: when the new shape renders, the old one is still on screen
function playerEnter() {
  const swap = playersShown > 0
  return {
    initial: swap ? { opacity: 0 } : { y: 24, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    transition: { duration: swap ? 0.16 : 0.24, ease: T.ease },
  }
}
function PlayerLeft() {
  useEffect(() => { playersShown++; return () => { playersShown-- } }, [])
  return null
}

function MiniPlayer({ d, progress, voiceLabel, gate, waiting, left, sleepLine }) {
  return (
    <motion.div layoutRoot {...playerEnter()}
      style={{ position: 'fixed', left: 8, right: 8, bottom: `calc(env(safe-area-inset-bottom) + ${T.tabH + 6}px)`, zIndex: 31, borderRadius: T.r.lg, background: T.bg, border: `1px solid ${T.borderHi}`, overflow: 'hidden', boxShadow: '0 16px 40px rgba(0,0,0,0.9)' }}>
      <PlayerLeft />
      <Progress value={progress} height={2} track={T.surface} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px 8px 10px' }}>
        <button type="button" onClick={() => go('reader', d.id)}
          style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, border: 'none', background: 'transparent', color: T.text, padding: 0, cursor: 'pointer', textAlign: 'left' }}>
          <Cover d={d} w={36} h={46} />
          <span style={{ minWidth: 0, display: 'grid', gap: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: T.font }}>{d.title}</span>
            <span style={{ fontSize: 11.5, color: T.faint, fontFamily: T.mono, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[voiceLabel, waiting ? 'waiting for the next sentence' : gate != null ? `ready in ${fmtWait(gate)}` : left, sleepLine].filter(Boolean).join(' · ')}</span>
          </span>
        </button>
        <MiniTransport />
      </div>
    </motion.div>
  )
}

function MiniTransport() {
  const playing = useStore(player, s => s.playing)
  const waiting = useStore(player, s => s.waiting || s.gate != null)
  return (
    <>
      <PlayButton playing={playing} waiting={waiting} size={44} />
      <IconButton icon="next" label="Next sentence" onClick={nextSentence} size={42} />
    </>
  )
}

// Space reserved at the bottom of the page: the player, plus the tab bar on phones outside the reader.
export const playerHeight = (wide, full, active) => (wide ? (active ? T.playerHDesktop : 0) : full ? (active ? T.playerH : 0) : T.tabH + (active ? T.miniH : 0))
