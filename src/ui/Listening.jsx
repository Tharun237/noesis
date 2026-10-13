// Your listening, all of it: what the glance above the library opens.
//
// One page, read from the top: how much (the number), when (the chart, a bar a day or a month, each split by
// document in that document's own colour), what (the documents), how steadily (streak, best day, days
// listened, finished), at what hour, on which days (the calendar), how much is left in the library, and on
// which devices. The switch at the top says which stretch of time the first four are about; tapping a bar
// narrows them to that one day or month.
//
// Every number is a sum or a count of what was recorded (lib/listening.js, tested); nothing is estimated, and
// a part with nothing true to say yet is not shown. Colour is data here: a document's colour is its own
// (bookcolour.js), lime is today and how much.
//
// What it costs a phone (measured at a slow one's speed, 2026-10-13: opening it froze the screen for 0.3 s
// and every change of stretch for 0.15 s; "laggy and choppy", Tharun):
//   - only what is seen first is built as the sheet opens (the number, the chart, the documents); what is
//     further down (Below) is built once the sheet has landed, so the sheet's own arrival is not held up
//   - what does not depend on the stretch (hours, calendar, library, devices) is its own component and is
//     not built again when the stretch changes or a bar is tapped
//   - the bars grow as ONE thing (their holder, one transform run by the browser), not as thirty animations
//     driven by script; the number is written, not counted up frame by frame
//   - a calendar day is one element, and the calendar has one tap handler for all of them
import { memo, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { T, label } from '../theme.js'
import { useStore } from '../lib/store.js'
import { settings } from '../lib/settings.js'
import { hasAiKey } from '../lib/ai.js'
import { library, docDuration } from '../lib/library.js'
import { useHistory, historyStore, makeRetrospective, listeningPlaces } from '../lib/history.js'
import { dayKey } from '../lib/heard.js'
import { KINDS, stretch, summary, streaks, calendar, hours, hourName } from '../lib/listening.js'
import { go, closeSheet } from '../lib/nav.js'
import { colours, colourOf, hueOf } from './bookcolour.js'
import { Button, IconButton, Pulse, Appear, Segmented, SheetLanded, fmtDur } from './kit.jsx'

const CHART_H = 132 // px: the tallest a bar stands
const QUIET_S = 20 * 60 // a stretch of short listens is drawn against this, not blown up to full height
const DOCS_SHOWN = 5 // documents listed before "Show all"
const WEEKS = 17 // the calendar: about four months, and as many columns as a phone has room for
const HOURS_MIN_S = 10 * 60 // less than this by the hour says nothing about when
const PACE_DAYS = 14 // "your pace" is the last two weeks, days without listening included
const FAR_DAYS = 999
const NEXT_MS = 140 // what is furthest down is built this long after the sheet has come to rest
// the height the page holds from its first frame, when there is listening to show: the sheet's own tallest
const HELD = { phone: '92dvh', wide: 'calc(100dvh - 50px)' }
const BEFORE = { week: 'the 7 days before', month: 'the 30 days before', year: 'the 12 months before' }
const SPAN = { week: 'The last 7 days', month: 'The last 30 days', year: 'The last 12 months', all: 'All of it' }
const LIME = [1, 3, 5].map(i => parseInt(T.lime.slice(i, i + 2), 16)).join(' ')

const isDay = k => /^\d{4}-\d{2}-\d{2}$/.test(k)
const shortDay = key => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en', { day: 'numeric', month: 'short' }) }
const longDay = key => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric' }) }
const days = n => (n === 1 ? '1 day' : `${n} days`)
const shareOf = d => (d.finished ? 1 : d.total ? Math.min(1, d.pos / d.total) : 0)
const sub = { fontSize: 13, color: T.sub, lineHeight: 1.5 }
const mono = { fontFamily: T.mono, fontSize: 11, color: T.faint }

function Section({ title, children, aside }) {
  return (
    <section style={{ display: 'grid', gap: 12, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <div style={{ ...label, flex: 1 }}>{title}</div>
        {aside && <div style={mono}>{aside}</div>}
      </div>
      {children}
    </section>
  )
}

function Fact({ name, value, note }) {
  return (
    <div style={{ padding: '14px 14px 13px', borderRadius: T.r.md, border: `1px solid ${T.border}`, background: T.surface, minWidth: 0 }}>
      <div style={label}>{name}</div>
      <div style={{ marginTop: 8, fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1, color: T.text }}>{value}</div>
      <div style={{ marginTop: 5, fontSize: 12, color: T.sub, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{note}</div>
    </div>
  )
}

// A document's colour, wherever it is drawn. A deleted document keeps one (from its title).
function useColours(log) {
  const docs = useStore(library, s => s.docs)
  const known = useStore(colours)
  const byId = useMemo(() => new Map(docs.map(d => [d.id, d])), [docs])
  return { docs, known, byId, colourFor: id => (byId.has(id) ? colourOf(byId.get(id), known) : hueOf(log.titles?.[id] || id)) }
}

export function Listening({ wide }) {
  const log = useHistory()
  const { byId, colourFor } = useColours(log)
  const [kind, setKind] = useState('week')
  const [picked, setPicked] = useState(null) // the key of the bar tapped, or null: the whole stretch
  const [allDocs, setAllDocs] = useState(false)
  // 0: the sheet is arriving · 1: it has come to rest (the sheet says so: kit.jsx SheetLanded), the cards are
  // built · 2: the rest is built, a moment later (together they were one long stop). Nothing is built while
  // the sheet is moving, and nothing that is built changes the sheet's size: its height is held from the first
  // frame (HELD), so it does not jump taller as it fills. ("It's coming from bottom while lagging, doing some
  // kind of jump": it was built on a timer, which a slow phone reached while the sheet was still on its way,
  // and each piece made the sheet taller. Tharun, 2026-10-13.)
  const atRest = useContext(SheetLanded)
  const [landed, setLanded] = useState(0)
  useEffect(() => {
    if (!atRest) return undefined
    setLanded(1)
    const t = setTimeout(() => setLanded(2), NEXT_MS)
    return () => clearTimeout(t)
  }, [atRest])
  const any = useMemo(() => Object.keys(log).some(isDay), [log])
  const now = useMemo(() => new Date(), [log]) // eslint-disable-line react-hooks/exhaustive-deps

  const st = useMemo(() => stretch(log, kind, now), [log, kind, now])
  const whole = useMemo(() => summary(log, st.days), [log, st])
  const before = useMemo(() => (st.before ? summary(log, st.before).total : null), [log, st])
  const bar = picked ? st.bars.find(b => b.key === picked) : null
  const shown = useMemo(() => (bar ? summary(log, bar.days) : whole), [log, bar, whole])

  const byDay = kind === 'week' || kind === 'month'
  const tallest = Math.max(byDay ? QUIET_S : 1, ...st.bars.map(b => b.seconds))
  const perBar = whole.total / st.bars.length
  const change = before == null ? null : whole.total - before
  const head = bar ? bar.name : SPAN[kind]
  const under = bar
    ? (shown.total ? `${shown.docs.length === 1 ? 'One document' : `${shown.docs.length} documents`}. Tap the bar again for ${SPAN[kind].toLowerCase()}.` : `Nothing was listened to. Tap the bar again for ${SPAN[kind].toLowerCase()}.`)
    : [
      st.span > 1 && whole.total > 0 && `${fmtDur(whole.total / st.span)} a day`,
      change != null && (whole.total > 0 || before > 0) && (before === 0 ? `nothing in ${BEFORE[kind]}` : change === 0 ? `the same as ${BEFORE[kind]}` : `${fmtDur(Math.abs(change))} ${change > 0 ? 'more' : 'less'} than ${BEFORE[kind]}`),
    ].filter(Boolean).join(' · ') || 'Nothing listened to yet. Time is counted while sound plays.'
  const listed = allDocs ? shown.docs : shown.docs.slice(0, DOCS_SHOWN)
  const cols = { display: 'grid', gridTemplateColumns: `repeat(${st.bars.length}, minmax(0, 1fr))`, gap: st.bars.length > 14 ? 3 : 8 }

  return (
    <div style={{ padding: wide ? '26px 28px 30px' : '16px 20px 26px', display: 'grid', gap: 30, alignContent: 'start', minWidth: 0, minHeight: any ? (wide ? HELD.wide : HELD.phone) : undefined, boxSizing: 'border-box' }}>
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, fontSize: 20, fontWeight: 700, color: T.text }}>Your listening</div>
          <IconButton icon="close" label="Close" onClick={closeSheet} />
        </div>
        <Segmented value={kind} onChange={v => { setKind(v); setPicked(null); setAllDocs(false) }} options={KINDS} />
      </div>

      {/* how much, and when */}
      <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
        <div>
          <div style={label}>{head}</div>
          <div style={{ marginTop: 8, fontSize: wide ? 60 : 52, fontWeight: 800, letterSpacing: '-0.045em', lineHeight: 1, color: T.text }}>{fmtDur(shown.total)}</div>
          <div style={{ ...sub, marginTop: 10 }}>{under}</div>
        </div>
        <div style={{ position: 'relative' }}>
          {/* the bars grow together, as their holder: one movement the browser runs by itself */}
          <div key={kind} data-grow="" role="group" aria-label={`${SPAN[kind]}, a bar for each ${byDay ? 'day' : 'month'}`} style={{ ...cols, height: CHART_H }}>
            {st.bars.map(b => (
              <button key={b.key} type="button" aria-pressed={picked === b.key} aria-label={`${b.name}: ${fmtDur(b.seconds)}`} onClick={() => setPicked(picked === b.key ? null : b.key)}
                style={{ height: '100%', display: 'flex', alignItems: 'flex-end', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', minWidth: 0, opacity: picked && picked !== b.key ? 0.32 : 1 }}>
                {b.seconds > 0 ? (
                  <span style={{ width: '100%', height: `${Math.max(3, (b.seconds / tallest) * 100)}%`, display: 'flex', flexDirection: 'column-reverse', gap: 1.5, borderRadius: st.bars.length > 14 ? 3 : 5, overflow: 'hidden' }}>
                    {b.docs.map(([id, s]) => <span key={id} style={{ flex: `${s} 1 0`, minHeight: 2, background: colourFor(id) }} />)}
                  </span>
                ) : <span style={{ width: '100%', height: 3, borderRadius: 3, background: T.surfaceTop }} />}
              </button>
            ))}
          </div>
          <div aria-hidden="true" style={{ ...cols, marginTop: 7 }}>
            {st.bars.map(b => <div key={b.key} style={{ ...mono, fontSize: 10, textAlign: 'center', color: b.now ? T.lime : T.faint, height: 12, whiteSpace: 'nowrap' }}>{b.label}</div>)}
          </div>
          {/* The amount a day that the line above the chart gives, drawn across the days: a bar over it was a
              longer day than usual. (Only where a bar is a day: across months the line would mean something else.) */}
          {!picked && whole.total > 0 && byDay && (
            <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: CHART_H * (1 - perBar / tallest), borderTop: `1px dashed ${T.borderHi}`, pointerEvents: 'none' }} />
          )}
        </div>
      </div>

      {/* what */}
      {shown.docs.length > 0 && (
        <Section title={bar ? 'What you listened to' : 'Most listened'} aside={shown.docs.length > 1 ? `${shown.docs.length} documents` : null}>
          <div style={{ display: 'grid', gap: 14 }}>
            {listed.map(d => {
              const have = byId.has(d.id)
              return (
                <div key={d.id} role={have ? 'button' : undefined} tabIndex={have ? 0 : undefined} data-press={have ? '' : undefined}
                  onClick={have ? () => go('reader', d.id) : undefined} onKeyDown={have ? e => { if (e.key === 'Enter') go('reader', d.id) } : undefined}
                  style={{ '--press': T.tap.row, display: 'grid', gap: 7, minWidth: 0, cursor: have ? 'pointer' : 'default' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
                    <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 8, background: colourFor(d.id), flexShrink: 0, alignSelf: 'center' }} />
                    <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, color: have ? T.text : T.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</div>
                    <div style={{ fontFamily: T.mono, fontSize: 12.5, color: T.sub, flexShrink: 0 }}>{fmtDur(d.seconds)}</div>
                  </div>
                  <div style={{ height: 4, borderRadius: 4, background: T.surfaceHi, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.max(1.5, d.share * 100)}%`, height: '100%', borderRadius: 4, background: colourFor(d.id) }} />
                  </div>
                </div>
              )
            })}
          </div>
          {shown.docs.length > DOCS_SHOWN && <div><Button onClick={() => setAllDocs(!allDocs)}>{allDocs ? 'Show fewer' : `Show all ${shown.docs.length}`}</Button></div>}
        </Section>
      )}

      {/* how steadily: about the stretch chosen at the top */}
      {landed >= 1 && whole.total + (before || 0) > 0 && <Steadily log={log} now={now} whole={whole} span={st.span} kind={kind} />}
      {landed >= 2 && <Below log={log} now={now} />}
    </div>
  )
}

const Steadily = memo(function Steadily({ log, now, whole, span, kind }) {
  const run = useMemo(() => streaks(log, now), [log, now])
  const within = `in ${SPAN[kind].toLowerCase()}`
  return (
    <div data-fade="" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
      <Fact name="Streak" value={days(run.current)} note={run.longest > run.current ? `longest ${days(run.longest)}, to ${shortDay(run.ended)}` : run.current ? 'your longest yet' : 'a minute a day keeps one going'} />
      <Fact name="Best day" value={whole.best ? fmtDur(whole.best.seconds) : '0m'} note={whole.best ? `${shortDay(whole.best.key)}, ${within}` : within} />
      <Fact name="Days listened" value={`${whole.listened} of ${span}`} note="a minute or more counts" />
      <Fact name="Finished" value={String(whole.finished.length)} note={whole.finished.length ? whole.finished.map(f => f.title).join(', ') : within} />
    </div>
  )
})

// Everything that does not depend on the stretch chosen: built once, after the sheet has landed, and not again
// when the stretch changes or a bar is tapped.
const Below = memo(function Below({ log, now }) {
  useStore(settings)
  const devices = useStore(historyStore, s => s.devices)
  const { docs, known } = useColours(log)
  const rate = useStore(settings, s => s.speed) || 1
  const [cell, setCell] = useState(null) // the calendar day tapped
  const today = dayKey(now)
  const cal = useMemo(() => calendar(log, now, WEEKS), [log, now])
  const hrs = useMemo(() => hours(log), [log])
  const places = useMemo(() => (devices > 1 ? listeningPlaces() : []), [log, devices]) // eslint-disable-line react-hooks/exhaustive-deps
  const everyDay = useMemo(() => Object.keys(log).filter(isDay).sort(), [log])
  const total = useMemo(() => summary(log, everyDay).total, [log, everyDay])
  const month = useMemo(() => summary(log, stretch(log, 'month', now).days).total, [log, now])
  const since = everyDay[0] || null

  // the library: how much there is, how much is done, and how long what is left takes at the customer's own pace
  const shelf = useMemo(() => docs.filter(d => d.chars && !d.archived).map(d => ({ d, seconds: docDuration(d), share: shareOf(d) })), [docs])
  const inAll = shelf.reduce((a, s) => a + s.seconds, 0)
  const done = shelf.reduce((a, s) => a + s.seconds * s.share, 0)
  const pace = useMemo(() => { let s = 0; for (let i = 0; i < PACE_DAYS; i++) { const d = new Date(now); d.setDate(d.getDate() - i); for (const v of Object.values(log[dayKey(d)] || {})) s += v || 0 } return s / PACE_DAYS }, [log, now])
  const daysLeft = pace >= 60 && inAll > done ? Math.ceil((inAll - done) / rate / pace) : null

  const keyed = hasAiKey()
  const enough = month >= 600
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const abort = useRef(null)
  async function hear(period) {
    if (busy || !keyed || !enough) return
    abort.current?.abort()
    abort.current = new AbortController()
    setBusy(true)
    setError(null)
    try {
      go('reader', await makeRetrospective({ signal: abort.current.signal, period }))
    } catch (err) {
      if (err?.name !== 'AbortError') setError(err?.message || "Couldn't make the retrospective. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const flat = useMemo(() => cal.flat(), [cal])
  const calMax = Math.max(QUIET_S, ...flat.map(c => c.seconds))
  const calDays = flat.filter(c => !c.ahead)
  const calOn = calDays.filter(c => c.seconds >= 60).length
  const picks = cell && flat.find(c => c.key === cell)
  const hourMax = Math.max(1, ...hrs.by)

  return (
    <div data-fade="" style={{ display: 'grid', gap: 30, minWidth: 0 }}>
      {/* at what hour */}
      {hrs.total >= HOURS_MIN_S && (
        <Section title="When you listen" aside={`mostly around ${hourName(hrs.peak)}`}>
          <div data-grow="" role="img" aria-label={`By the hour of the day: mostly around ${hourName(hrs.peak)}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(24, minmax(0, 1fr))', gap: 3, alignItems: 'end', height: 56 }}>
            {hrs.by.map((s, h) => (
              <div key={h} style={{ height: `${Math.max(s > 0 ? 6 : 0, (s / hourMax) * 100)}%`, minHeight: 2, borderRadius: 2, background: h === hrs.peak ? T.lime : s > 0 ? T.text : T.surfaceTop, opacity: h === hrs.peak || !s ? 1 : 0.55 }} />
            ))}
          </div>
          <div style={{ ...mono, fontSize: 10, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>{['12 am', '6 am', '12 pm', '6 pm'].map(t => <span key={t}>{t}</span>)}</div>
        </Section>
      )}

      {/* on which days: one element a day, one tap handler for all of them */}
      {total > 0 && (
        <Section title={`The last ${WEEKS} weeks`} aside={picks ? `${shortDay(picks.key)} · ${fmtDur(picks.seconds)}` : `${calOn} of ${calDays.length} days`}>
          <div role="group" aria-label={`A square for each of the last ${calDays.length} days, brighter the more was listened to: ${calOn} with listening. Tap a day for its time.`}
            onClick={e => { const k = e.target.dataset?.day; if (k) setCell(cell === k ? null : k) }}
            style={{ display: 'grid', gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))`, gridTemplateRows: 'repeat(7, auto)', gridAutoFlow: 'column', gap: 4, cursor: 'pointer' }}>
            {flat.map(c => {
              const level = c.seconds >= 60 ? 0.28 + 0.72 * Math.min(1, c.seconds / calMax) : 0
              return <div key={c.key} data-day={c.ahead ? undefined : c.key} style={{ aspectRatio: '1', borderRadius: 4, background: c.ahead ? 'transparent' : level ? `rgb(${LIME} / ${level.toFixed(2)})` : T.surfaceHi, outline: c.key === today || c.key === cell ? `1.5px solid ${c.key === cell ? T.text : T.borderHi}` : 'none', outlineOffset: 1 }} />
            })}
          </div>
          <div style={{ ...mono, fontSize: 10, display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end' }}>
            less {[0, 0.28, 0.52, 0.76, 1].map(o => <span key={o} aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: o ? `rgb(${LIME} / ${o})` : T.surfaceHi }} />)} more
          </div>
        </Section>
      )}

      {/* how much is left */}
      {inAll > 0 && (
        <Section title="Your library" aside={`${shelf.length} ${shelf.length === 1 ? 'document' : 'documents'}`}>
          <div role="img" aria-label={`${fmtDur(done)} done of ${fmtDur(inAll)}`} style={{ display: 'flex', gap: 2, height: 12 }}>
            {shelf.map(({ d, seconds, share }) => (
              <div key={d.id} title={`${d.title} · ${Math.round(share * 100)}%`} style={{ position: 'relative', flex: `${seconds} 1 0`, minWidth: 3, borderRadius: 3, overflow: 'hidden', background: T.surfaceTop }}>
                <div style={{ width: `${share * 100}%`, height: '100%', background: colourOf(d, known) }} />
              </div>
            ))}
          </div>
          <div style={sub}>
            <span style={{ color: T.text }}>{fmtDur(inAll)}</span> to listen to, <span style={{ color: T.text }}>{fmtDur(done)}</span> done, <span style={{ color: T.text }}>{fmtDur(inAll - done)}</span> left.
            {daysLeft != null && daysLeft <= FAR_DAYS && ` At your last two weeks' pace (${fmtDur(pace)} a day${rate !== 1 ? ` at ${rate}x` : ''}) that is ${days(daysLeft)}.`}
          </div>
        </Section>
      )}

      {/* on which devices */}
      {places.length > 1 && (
        <Section title="Where you listen">
          <div style={{ display: 'grid', gap: 12 }}>
            {places.map((p, i) => (
              <div key={i} style={{ display: 'grid', gap: 7 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <div style={{ flex: 1, fontSize: 15, fontWeight: 600, color: T.text }}>{p.name}</div>
                  <div style={{ fontFamily: T.mono, fontSize: 12.5, color: T.sub }}>{fmtDur(p.seconds)}</div>
                </div>
                <div style={{ height: 4, borderRadius: 4, background: T.surfaceHi, overflow: 'hidden' }}>
                  <div style={{ width: `${total ? Math.max(1.5, (p.seconds / total) * 100) : 0}%`, height: '100%', borderRadius: 4, background: p.here ? T.lime : T.text }} />
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* two buttons share the row: each takes half. (Each was "full" width, so the second sat wholly off the
              side of the sheet on every phone: found by e2e/chaos.mjs, 2026-10-13.) */}
          <Button kind="primary" onClick={() => hear('month')} disabled={!keyed || !enough || busy} style={{ height: 50, fontSize: 15, flex: '1 1 0', minWidth: 0, padding: '0 10px' }}>Hear your month</Button>
          <Button onClick={() => hear('year')} disabled={!keyed || !enough || busy} style={{ height: 50, fontSize: 15, flex: '1 1 0', minWidth: 0, padding: '0 10px' }}>Hear your year</Button>
          {busy && <Button onClick={() => abort.current?.abort()}>Stop</Button>}
        </div>
        {!keyed && <Appear style={sub}>A retrospective needs an AI key. Add one in Settings.</Appear>}
        {keyed && !enough && <Appear style={sub}>Listen for a little longer first.</Appear>}
        {busy && <Appear style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: T.sub }}><Pulse /> Writing your retrospective</Appear>}
        {error && <Appear style={{ fontSize: 14, color: T.danger, lineHeight: 1.55 }}>{error}</Appear>}
        <div style={{ ...sub, color: T.faint }}>
          {since ? `Counted on ${devices > 1 ? `your ${devices} devices` : 'this device'} since ${longDay(since)}, while sound was playing.` : 'Nothing counted yet. Listening time is counted from now on, while sound is playing.'}
        </div>
      </div>
    </div>
  )
})
