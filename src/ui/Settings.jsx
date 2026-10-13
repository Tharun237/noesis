// Settings, as a short list of sections that each open their own page (a sidebar and a page on a wide
// screen). It used to be twelve cards in one long scroll, with settings about the same thing in three
// different cards (design skill: what is this screen for, is there one of everything, no repetition).
// Every setting lives in exactly one section, and a section's row says what it is set to.
import { shelvesAway, removeShelvesAway } from '../lib/shelf.js'
import { useEffect, useRef, useState } from 'react'
import { T, label } from '../theme.js'
import { useStore } from '../lib/store.js'
import { ui, toast, goBack, openSheet, pushPanel, popPanel, showWelcome } from '../lib/nav.js'
import { settings } from '../lib/settings.js'
import { account } from '../lib/sync.js'
import { hasAiKey, providerName } from '../lib/ai.js'
import { activeEngine } from '../lib/engine.js'
import { AiCard } from './AiCard.jsx'
import { deleteAllAudio } from '../lib/library.js'
import { Button, IconButton, Segmented, Toggle, Field } from './kit.jsx'
import { Icon } from './icons.jsx'
import { AccountCard } from './AccountCard.jsx'
import { VoiceCard } from './VoiceCard.jsx'
import { DiagnosticsCard } from './Diagnostics.jsx'
import { CreditsCard } from './Credits.jsx'
import { AmbientCard } from './AmbientCard.jsx'
import { AwarenessCard } from './AwarenessCard.jsx'
import { askAware } from '../lib/extras.js'
import SUPPORT from '../lib/support.json'
import { speedLabel } from '../lib/speed.js'
import { SpeedSlider } from './SpeedSlider.jsx'
import { updateState, updateNow } from '../lib/updates.js'

const SOUND_NAMES = { off: 'Off', focus: 'Focus', calm: 'Calm', brown: 'Brown noise' }

// The sections, in the order they are listed. `group` puts a gap between kinds of thing: you, how it sounds,
// the app. `now` is what the row says the section is set to.
const SECTIONS = [
  { id: 'account', group: 0, icon: 'person', title: 'Account', now: (s, user) => (user ? user.name || user.email : 'Sign in') },
  { id: 'voice', group: 1, icon: 'speaker', title: 'Voice', now: s => (activeEngine(s) === 'system' ? 'Built-in' : 'Natural') },
  { id: 'listening', group: 1, icon: 'play', title: 'Listening', now: s => `${s.speed}x` },
  { id: 'sound', group: 1, icon: 'waves', title: 'Sounds and haptics', now: s => SOUND_NAMES[s.ambientMode || 'off'] },
  { id: 'ai', group: 2, icon: 'sparkle', title: 'AI', now: s => (hasAiKey(s) ? providerName() : 'Not set up') },
  { id: 'storage', group: 3, icon: 'archive', title: 'Storage', now: () => null },
  { id: 'about', group: 3, icon: 'info', title: 'About', now: () => `v${__APP_VERSION__}` },
]
const PANEL = 'settings:' // a section open on a phone is a history entry, so Back returns to the list
const sectionOf = state => (typeof state?.panel === 'string' && state.panel.startsWith(PANEL) ? state.panel.slice(PANEL.length) : null)
const SIDEBAR_W = 300

export function Settings({ wide }) {
  const s = useStore(settings)
  const user = useStore(account, a => a.user)
  const [open, setOpen] = useState(() => sectionOf(history.state))
  const listTop = useRef(0)
  useEffect(() => {
    const onPop = e => setOpen(sectionOf(e.state))
    addEventListener('popstate', onPop)
    return () => removeEventListener('popstate', onPop)
  }, [])
  // On a phone the list and a section are two pages: each starts where it should (a section at its top, the
  // list where it was left).
  useEffect(() => { if (!wide) window.scrollTo(0, open ? 0 : listTop.current) }, [open, wide])
  const choose = id => {
    if (wide) return setOpen(id)
    listTop.current = window.scrollY
    pushPanel(PANEL + id)
    setOpen(id)
  }
  const current = SECTIONS.find(x => x.id === open) || (wide ? SECTIONS[0] : null)
  const list = <SectionList s={s} user={user} current={wide ? current.id : null} onChoose={choose} chevrons={!wide} />

  if (wide) {
    return (
      <div style={{ minHeight: '100%' }}>
        <header style={{ position: 'sticky', top: 0, zIndex: 20, background: T.bg, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 20px', borderBottom: `1px solid ${T.border}` }}>
          <IconButton icon="back" label="Back" onClick={goBack} />
          <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>Settings</div>
        </header>
        <div style={{ display: 'flex', alignItems: 'flex-start', maxWidth: 1040, margin: '0 auto', padding: '28px 24px 140px', gap: 32 }}>
          <div style={{ width: SIDEBAR_W, flexShrink: 0, position: 'sticky', top: 84 }}>{list}</div>
          <div key={current.id} data-rise="0" style={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 20 }}>
            <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.1, color: T.text }}>{current.title}</h1>
            <SectionBody id={current.id} s={s} />
          </div>
        </div>
      </div>
    )
  }
  if (current) {
    return (
      <div style={{ minHeight: '100%' }}>
        <header style={{ position: 'sticky', top: 0, zIndex: 20, background: T.bg, display: 'flex', alignItems: 'center', gap: 2, height: 56, padding: '0 6px', paddingTop: 'env(safe-area-inset-top)', borderBottom: `1px solid ${T.border}` }}>
          <IconButton icon="back" label="Back to Settings" onClick={popPanel} />
          <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{current.title}</div>
        </header>
        <div key={current.id} data-rise="0" style={{ padding: '20px 16px 40px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 20 }}>
          <SectionBody id={current.id} s={s} />
        </div>
      </div>
    )
  }
  return (
    <div style={{ minHeight: '100%', padding: 'calc(env(safe-area-inset-top) + 28px) 16px 40px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 22, alignContent: 'start' }}>
      <h1 style={{ margin: 0, padding: '0 4px', fontSize: 34, fontWeight: 800, letterSpacing: '-0.045em', lineHeight: 1, color: T.text }}>Settings</h1>
      {list}
    </div>
  )
}

// The list of sections: grouped, each row an icon, a name, what it is set to, and (on a phone) a chevron.
function SectionList({ s, user, current, onChoose, chevrons }) {
  const groups = [...new Set(SECTIONS.map(x => x.group))]
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {groups.map(g => (
        <div key={g} style={{ borderRadius: T.r.lg, border: `1px solid ${T.border}`, background: T.surface, overflow: 'hidden' }}>
          {SECTIONS.filter(x => x.group === g).map((x, i) => {
            const now = x.now(s, user)
            const on = x.id === current
            return (
              <button key={x.id} type="button" data-press="" onClick={() => onChoose(x.id)} aria-current={on ? 'page' : undefined}
                style={{
                  '--press': T.tap.row, display: 'flex', alignItems: 'center', gap: 14, width: '100%', minHeight: 54, padding: '0 14px', border: 'none',
                  borderTop: i ? `1px solid ${T.border}` : 'none', background: on ? T.surfaceHi : 'transparent', color: T.text, fontFamily: T.font, fontSize: 15, fontWeight: 600, textAlign: 'left', cursor: 'pointer',
                }}>
                <Icon name={x.icon} size={19} style={{ color: on ? T.text : T.sub }} />
                <span style={{ flex: 1, minWidth: 0 }}>{x.title}</span>
                {now && <span style={{ fontSize: 13.5, fontWeight: 500, color: T.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '50%' }}>{now}</span>}
                {chevrons && <Icon name="next1" size={16} style={{ color: T.faint }} />}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// A section's own controls. The older cards are used as they are, without their card or their own title
// (the page already says what it is); a page with several kinds of thing groups them under small titles.
function SectionBody({ id, s }) {
  if (id === 'account') return <AccountCard Card={Bare} />
  if (id === 'voice') return <VoiceCard Card={Bare} />
  if (id === 'ai') return <AiCard Card={Bare} />
  if (id === 'storage') return <StorageBody />
  if (id === 'sound') {
    return (
      <AmbientCard Card={Bare} mode={s.ambientMode || 'off'} volume={s.ambientVolume ?? 0.5} haptics={!!s.haptics}
        onChange={c => settings.set({ ...('mode' in c ? { ambientMode: c.mode } : {}), ...('volume' in c ? { ambientVolume: c.volume } : {}), ...('haptics' in c ? { haptics: c.haptics } : {}) })} />
    )
  }
  if (id === 'listening') {
    return (
      <>
        <Group title="Playback">
          <Field title={`Speed · ${speedLabel(s.speed)}`}>
            <SpeedSlider value={s.speed} onChange={speed => settings.set({ speed })} />
          </Field>
          <Toggle checked={s.autoplayNext} onChange={v => settings.set({ autoplayNext: v })} labelText="Play the next document automatically"
            hint="When a document ends, the next unfinished one in your queue starts." />
          <Toggle checked={s.archiveFinished} onChange={v => settings.set({ archiveFinished: v })} labelText="Archive documents when finished"
            hint="Keeps your queue to what you haven't heard yet." />
          <Toggle checked={s.skipVisuals} onChange={v => settings.set({ skipVisuals: v })} labelText="Skip figures, tables, equations and code"
            hint="They stay in the text; the voice jumps over them." />
        </Group>
        <Group title="Lock screen">
          <Toggle checked={s.lockScreenWords} onChange={v => settings.set({ lockScreenWords: v })} labelText="Show the words being read"
            hint="The notification follows the voice, a few words at a time." />
          {/Android/i.test(navigator.userAgent) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: T.text }}>Controls on the lock screen</div>
              <Button onClick={() => openSheet('lockscreen')}>Show me how</Button>
            </div>
          )}
        </Group>
        {/* A switch turned on asks for the microphone there and then; it stays off if the answer is no. */}
        <AwarenessCard Card={Group} slow={!!s.awareSlow} clear={!!s.awareClear} pauseOnSpeech={!!s.awarePause}
          onChange={async c => {
            const next = 'slow' in c ? { awareSlow: c.slow } : 'clear' in c ? { awareClear: c.clear } : { awarePause: c.pauseOnSpeech }
            if (Object.values(next)[0] && !(await askAware())) return
            settings.set(next)
          }} />
      </>
    )
  }
  return (
    <>
      <InstallBody />
      <VersionCard />
      {/* Paying is voluntary and changes nothing in the app (.claude/skills/goods-and-services). It is offered here,
          once, and nowhere else: no banner, no reminder. Shown only when there is somewhere to pay (support.json). */}
      {SUPPORT.url && (
        <Group title="Support Noesis">
          <div style={{ fontSize: 14, lineHeight: 1.55, color: T.sub }}>Noesis is free to use, whether you pay or not. If it is worth something to you, you can pay any amount, once. Nothing in the app changes.</div>
          <div><Button kind="primary" onClick={() => { location.href = '/support' }}>Support Noesis</Button></div>
        </Group>
      )}
      <CreditsCard Card={Group} />
      <DiagnosticsCard Card={Group} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <Button onClick={showWelcome}>See the welcome page</Button>
        <Button onClick={() => { location.href = '/privacy' }}>Privacy</Button>
      </div>
    </>
  )
}

// A section that is one thing: its controls, with no box and no second title.
function Bare({ children, right }) {
  return (
    <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 18 }}>
      {right && <div style={{ display: 'flex' }}>{right}</div>}
      {children}
    </section>
  )
}
// One kind of thing inside a section that holds several: a small title and a box.
// Which version this is, and a way to get the newest by hand. Noesis updates itself (lib/updates.js); this is
// for when it has not, or when the customer wants to be sure.
const UPDATE_SAYS = {
  checking: 'Checking for a newer version.',
  getting: 'Getting the new version. The app will open again by itself.',
  ready: 'A newer version is ready.',
  current: 'This is the newest version.',
  unreachable: 'Could not reach Noesis. Check your connection and try again.',
}
function VersionCard() {
  const { status } = useStore(updateState)
  const busy = status === 'checking' || status === 'getting'
  return (
    <Group title="Version">
      <div style={{ fontSize: 14, lineHeight: 1.55, color: T.sub }}>
        Noesis {__APP_VERSION__}, built {__APP_BUILD__.slice(0, 16).replace('T', ' at ')} UTC. It updates itself when you are not in the middle of something.
      </div>
      {UPDATE_SAYS[status] && <div role="status" data-fade="" key={status} style={{ fontSize: 14, color: status === 'unreachable' ? T.danger : T.text }}>{UPDATE_SAYS[status]}</div>}
      <div><Button kind={status === 'ready' ? 'primary' : undefined} busy={busy} disabled={busy} onClick={updateNow}>{status === 'ready' ? 'Update now' : 'Check for updates'}</Button></div>
    </Group>
  )
}

function Group({ title, children, right }) {
  return (
    <section style={{ padding: 18, borderRadius: T.r.lg, border: `1px solid ${T.border}`, background: T.surface, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}><div style={{ ...label, flex: 1 }}>{title}</div>{right}</div>
      {children}
    </section>
  )
}

// Where the voice worker caches downloaded voices (tts.worker.js): separate from the library database.
const MODEL_CACHE = 'noesis-voices'

function StorageBody() {
  const [est, setEst] = useState(null)
  const [hasModel, setHasModel] = useState(false)
  const [away, setAway] = useState(() => shelvesAway().length)
  const refresh = () => {
    navigator.storage?.estimate?.().then(setEst)
    globalThis.caches?.has(MODEL_CACHE).then(setHasModel)
  }
  useEffect(refresh, [])
  const gb = n => (n > 1073741824 ? `${(n / 1073741824).toFixed(1)} GB` : `${Math.round(n / 1048576)} MB`)
  return (
    <Bare>
      <div style={{ fontSize: 14, color: T.sub, lineHeight: 1.55 }}>
        {est ? <>Using <span style={{ color: T.text, fontFamily: T.mono }}>{gb(est.usage)}</span> of {gb(est.quota)} available. </> : null}
        Noesis asked your browser to keep this storage. You can still clear it in browser settings.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button kind="danger" icon="trash" onClick={async () => {
          if (!confirm('Delete all generated audio? Your documents stay; audio regenerates when you play them.')) return
          await deleteAllAudio(); refresh(); toast('Audio deleted')
        }}>Delete generated audio</Button>
        {away > 0 && (
          <Button kind="danger" icon="trash" onClick={async () => {
            if (!confirm(`Remove ${away === 1 ? 'the library' : `the ${away} libraries`} of signed-out accounts from this device? They stay in those accounts' Google Drive; their audio is made again after signing in.`)) return
            await removeShelvesAway(); setAway(0); refresh(); toast('Removed from this device')
          }}>Remove signed-out {away === 1 ? 'library' : 'libraries'}</Button>
        )}
        {hasModel && (
          <Button kind="danger" icon="trash" onClick={async () => {
            if (!confirm('Remove the downloaded natural voices? Your documents and audio stay. A voice downloads again the next time it is needed.')) return
            await caches.delete(MODEL_CACHE); toast('Downloaded voices removed'); setTimeout(() => location.reload(), 900) // also frees it from memory
          }}>Remove downloaded voices</Button>
        )}
      </div>
    </Bare>
  )
}

function InstallBody() {
  const evt = useStore(ui, s => s.installEvt)
  const installed = useStore(ui, s => s.installed)
  const ios = /iPhone|iPad/.test(navigator.userAgent)
  return (
    <Group title="The app">
      <div style={{ fontSize: 14, color: T.sub, lineHeight: 1.55 }}>
        {installed ? 'Noesis is installed on this device.'
          : evt ? 'Install Noesis for a full-screen app with its own icon, offline use and lock-screen controls. No app store needed.'
          : ios ? 'To install: tap Share, then "Add to Home Screen".'
          : 'Open your browser menu and choose "Install app" or "Add to Home screen".'}
      </div>
      {evt && !installed && (
        <div><Button kind="primary" icon="install" onClick={async () => { evt.prompt(); const r = await evt.userChoice; if (r.outcome === 'accepted') ui.set({ installEvt: null }) }}>Install Noesis</Button></div>
      )}
    </Group>
  )
}
