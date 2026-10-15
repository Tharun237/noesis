// Listening, shown where the customer already is, as bars and not as a page of numbers to go and visit
// (Tharun, 2026-10-12: "a bar of insight for each one rather than text: how much completed, how much pending,
// how can we complete, today... and the same for all files, placed between Queue and the files. The customer
// shouldn't separately go and see insights").
//
//   DocBar         a document's card in the library: how far, how much of that was today, how much is left
//   DocInsight     the same document at the top of its reader, larger: and what is left is cut into the days
//                  it will take at the customer's own pace, so "how do I finish this" is something seen
//   LibraryGlance  above the library's list: today, the week (each day a column, split by document), and the
//                  shelf (every document a block as wide as it is long, lit as far as it has been heard).
//                  Tapping it opens all of it (Listening.jsx): the glance is the door, not a second copy
//
// One colour per document (bookcolour.js, from its cover) in all three, so the eye joins them up. In a bar,
// what was heard before today is that colour dimmed and today's stretch is that colour at full strength.
import { useEffect, useMemo, useRef } from 'react'
import { motion } from 'motion/react'
import { T } from '../theme.js'
import { useStore } from '../lib/store.js'
import { library, docDuration } from '../lib/library.js'
import { historyStore } from '../lib/history.js'
import { dayKey, weekOf, docListening, docBar, shelfOf, shareOf } from '../lib/heard.js'
import { colours, colourOf, hueOf } from './bookcolour.js'
import { fmtDur } from './kit.jsx'
import { usePace, useLength } from './usePace.js'
import { openSheet } from '../lib/nav.js'
import { player } from '../lib/player.js'
import { settings } from '../lib/settings.js'
import { ringOf, streaks, GOAL_USUAL_MIN } from '../lib/listening.js'

const BEFORE = 0.5 // heard before today: the document's colour, dimmed
const grow = { initial: { scaleX: 0 }, animate: { scaleX: 1 }, transition: { duration: T.dur.slow, ease: T.ease } }
const mono = { fontFamily: T.mono, fontSize: 11.5, color: T.faint, whiteSpace: 'nowrap' }

// The two lit parts of a document's bar, laid on its track: heard before today, then today's stretch.
function Lit({ bar, colour }) {
  return (
    <motion.div {...grow} style={{ position: 'absolute', inset: 0, transformOrigin: '0 50%' }}>
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${(bar.heard - bar.today) * 100}%`, background: colour, opacity: BEFORE }} />
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${(bar.heard - bar.today) * 100}%`, width: `${bar.today * 100}%`, background: colour }} />
    </motion.div>
  )
}

// `rate`: the speed the document is heard at (pace.js), so what is done and left are in the listener's own time.
function useDocBar(d, rate) {
  const log = useStore(historyStore, s => s.log)
  const colour = colourOf(d, useStore(colours))
  const duration = d.chars ? docDuration(d) : 0
  const listening = useMemo(() => docListening(log, d.id, new Date()), [log, d.id])
  return { bar: docBar({ duration, share: shareOf(d), rate }, listening), colour, heardToday: listening.today, duration }
}

const DAY_GAP_PX = 2 // the cut between one day's listening and the next, in what is left
const DAY_MIN_SHARE = 0.025 // days thinner than this (of what is left) would be a blur of cuts: left whole

// A document's timeline: what has been heard (today's stretch brightest), then what is left, cut into the
// days it takes at the customer's own pace: "how do I finish this" is seen, not worked out.
function Bar({ bar, colour, h }) {
  const perDay = bar.left > 0 ? bar.dayShare / bar.left : 0 // one day's listening, as a share of what is left
  const cut = perDay >= DAY_MIN_SHARE && perDay < 1
  const said = `${Math.round(bar.heard * 100)}% done, ${fmtDur(bar.leftSeconds)} left${bar.days != null ? `, about ${bar.days} more day${bar.days === 1 ? '' : 's'} at your pace` : ''}`
  return (
    <div role="img" aria-label={said} style={{ display: 'flex', height: h, gap: bar.heard > 0 && bar.left > 0 ? Math.max(2, h / 3) : 0 }}>
      <div style={{ position: 'relative', flex: `${bar.heard} 1 0`, minWidth: bar.heard > 0 ? h * 1.5 : 0, borderRadius: h / 2, overflow: 'hidden', background: T.surfaceTop }}>
        <Lit bar={{ heard: 1, today: bar.heard > 0 ? bar.today / bar.heard : 0 }} colour={colour} />
      </div>
      <div style={{
        flex: `${bar.left} 1 0`, borderRadius: h / 2,
        background: cut ? `repeating-linear-gradient(to right, ${T.surfaceTop} 0, ${T.surfaceTop} calc(${perDay * 100}% - ${DAY_GAP_PX}px), transparent calc(${perDay * 100}% - ${DAY_GAP_PX}px), transparent ${perDay * 100}%)` : T.surfaceTop,
      }} />
    </div>
  )
}

// `pace`: the speed this document is heard at (pace.js). Every document with listening today says so, whether
// or not it has a bar: the strip above the library counts every second of today, and the cards must add up to it.
// "listened", not "today" alone: beside a progress bar, a bare "12m today" read as progress.
export function DocBar({ d, pace }) {
  const { bar, colour, heardToday, duration } = useDocBar(d, pace)
  const drawn = duration > 0 && !d.finished && bar.heard > 0 // not begun, or done: the card already says so
  if (!drawn && !(heardToday > 0)) return null
  const today = heardToday > 0 && <span style={{ color: colour }}>{fmtDur(heardToday)} listened today</span>
  return (
    <div style={{ display: 'grid', gap: 5, minWidth: 0, marginTop: 2 }}>
      {drawn && <Bar bar={bar} colour={colour} h={3} />}
      {/* wraps on a narrow phone: the two halves are one line when they fit and two when they do not */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '2px 10px', minWidth: 0, ...mono, fontSize: 11 }}>
        <span>{today}</span>
        {drawn && <span>{fmtDur(bar.leftSeconds)} left</span>}
      </div>
    </div>
  )
}

export function DocInsight({ d }) {
  const { bar, colour, heardToday, duration } = useDocBar(d, usePace(d.id))
  if (!duration || d.finished || !(bar.heard > 0 || heardToday > 0)) return null
  return (
    <div data-rise="3" style={{ display: 'grid', gap: 9, margin: '-8px 0 30px' }}>
      <Bar bar={bar} colour={colour} h={8} />
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '2px 16px', ...mono }}>
        <span>
          {/* how far through the document the place is: a place can be jumped to, so it is not called "heard";
              what WAS listened to, today, is the number beside it */}
          <span style={{ color: T.sub }}>{fmtDur(bar.heardSeconds)} done</span>
          {heardToday > 0 && <span style={{ color: colour }}> · {fmtDur(heardToday)} listened today</span>}
        </span>
        <span>
          <span style={{ color: T.sub }}>{fmtDur(bar.leftSeconds)} left</span>
          {bar.days != null && <span> · {bar.days === 1 ? 'one more day' : `${bar.days} days`} at your pace</span>}
        </span>
      </div>
    </div>
  )
}

// The rings (Apple Watch's Activity rings, for listening): today against the daily goal, the last 7 days against
// seven of them, and the book being listened to. Each is one colour (T.ring, the book's own) over a dim track of
// that colour, with round ends, the leading end shadowed where it laps the start.
// Only transform moves: an arc is two halves, each half a ring turned behind a window on the other side (up to
// 180° each), and the leading end rides an arm turned to the same angle. All three turn at one steady speed, so
// they stay together; a ring that grows while it is watched (listening now) turns on from where it was.
const RING_TURN_S = 1.1 // a whole ring, empty to closed
const RING_STAGGER_S = 0.12 // each ring starts this long after the one outside it
function Arc({ share, size, w, colour, at, wait }) {
  const theta = Math.min(1, Math.max(0, share)) * 360
  const last = useRef(0)
  const from = last.current
  useEffect(() => { last.current = theta })
  const span = Math.abs(theta - from), speed = 360 / RING_TURN_S
  const r0 = Math.min(from, 180), r1 = Math.min(theta, 180), l0 = Math.max(0, from - 180), l1 = Math.max(0, theta - 180)
  const rT = Math.abs(r1 - r0) / speed, lT = Math.abs(l1 - l0) / speed, up = theta >= from
  const move = (d, after) => ({ duration: d, delay: wait + after, ease: 'linear' })
  const ring = { position: 'absolute', inset: 0, borderRadius: '50%', border: `${w}px solid ${colour}`, boxSizing: 'border-box' }
  const dot = { position: 'absolute', top: 0, left: '50%', width: w, height: w, marginLeft: -w / 2, borderRadius: '50%', background: colour }
  const turn = deg => ({ transform: `rotate(${deg}deg)` })
  return (
    <div style={{ position: 'absolute', top: at, left: at, width: size, height: size }}>
      <div style={{ ...ring, borderColor: `color-mix(in srgb, ${colour} 22%, transparent)` }} />
      <div style={{ position: 'absolute', inset: 0, clipPath: 'inset(0 0 0 50%)' }}>
        <motion.div initial={turn(0)} animate={{ ...turn(r1), transition: move(rT, up ? 0 : lT) }} style={{ ...ring, clipPath: 'inset(0 50% 0 0)' }} />
      </div>
      <div style={{ position: 'absolute', inset: 0, clipPath: 'inset(0 50% 0 0)' }}>
        <motion.div initial={turn(0)} animate={{ ...turn(l1), transition: move(lT, up ? rT : 0) }} style={{ ...ring, clipPath: 'inset(0 0 0 50%)' }} />
      </div>
      <div style={{ ...dot, opacity: theta > 0 ? 1 : 0 }} />
      <motion.div initial={turn(0)} animate={{ ...turn(theta), transition: move(span / speed, 0) }} style={{ position: 'absolute', inset: 0, opacity: theta > 0 ? 1 : 0 }}>
        <div style={{ ...dot, boxShadow: `0 0 ${w * 0.6}px ${w * 0.1}px rgba(0, 0, 0, 0.6)` }} />
      </motion.div>
    </div>
  )
}

// rings: [{ share, colour }], outermost first
export function Rings({ rings, size, name }) {
  const w = Math.round(size * 0.12), gap = Math.max(2, Math.round(size * 0.03))
  return (
    <div role="img" aria-label={name} style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {rings.map((r, k) => {
        const at = k * (w + gap)
        return <Arc key={k} share={r.share} colour={r.colour} w={w} size={size - 2 * at} at={at} wait={k * RING_STAGGER_S} />
      })}
    </div>
  )
}

// The one sentence under the ring: the truest reason to listen a little more today. A book about to end comes
// first when finishing it closes the ring too; a closed ring says how long it has been closed in a row.
const NEAR_S = 30 * 60 // a book this close to its end is named
const ends = near => (near.left < 60 ? `${near.title} ends in under a minute` : `${fmtDur(near.left)} finishes ${near.title}`)
function nudgeOf(ring, near, run) {
  if (!ring.closed) return near && near.left <= ring.left ? ends(near) : `${fmtDur(ring.left)} to close your ring`
  if (near) return `Ring closed · ${ends(near)}`
  return run > 1 ? `Ring closed · ${run} days in a row` : 'Ring closed for today'
}

const COL_H = 46 // the tallest a day's column stands
const QUIET_DAY_S = 20 * 60 // a week of short listens is drawn against this, not blown up to full height
const OTHER_DAY = 0.5 // days before today stand back

// Reads the whole library, not the list it sits above: its done and left are the listening page's (shelfOf),
// which a filter, a search or the Archived shelf must not change.
export function LibraryGlance({ wide }) {
  const log = useStore(historyStore, s => s.log)
  const known = useStore(colours)
  const docs = useStore(library, s => s.docs)
  const playing = useStore(player, s => s.id)
  const length = useLength()
  const now = new Date()
  const week = useMemo(() => weekOf(log, now), [log, dayKey(now)]) // eslint-disable-line react-hooks/exhaustive-deps
  const { shelf, all, heard } = useMemo(() => shelfOf(docs, length), [docs, length])
  const byId = useMemo(() => new Map(docs.map(d => [d.id, d])), [docs])
  const colourFor = id => (byId.has(id) ? colourOf(byId.get(id), known) : hueOf(log.titles?.[id] || id)) // a deleted document keeps a colour
  const goalMin = useStore(settings, s => s.listenGoal) || GOAL_USUAL_MIN
  const ring = useMemo(() => ringOf(log, now, goalMin), [log, goalMin, dayKey(now)]) // eslint-disable-line react-hooks/exhaustive-deps
  const run = useMemo(() => streaks(log, now, goalMin * 60).current, [log, goalMin, dayKey(now)]) // eslint-disable-line react-hooks/exhaustive-deps
  const going = shelf.filter(x => !x.d.finished && x.share > 0 && x.share < 1)
  const near = going.map(x => ({ title: x.d.title, left: x.seconds * (1 - x.share) })).filter(x => x.left <= NEAR_S).sort((a, b) => a.left - b.left)[0]
  // the book ring: the book in the player, else the one listened to last, if it is under way
  const book = going.find(x => x.d.id === playing) || [...going].sort((a, b) => (b.d.lastPlayed || 0) - (a.d.lastPlayed || 0))[0]
  const weekSeconds = week.reduce((a, d) => a + d.seconds, 0)
  if (!(weekSeconds >= 60) && !(heard >= 60)) return null // under a minute listened to: nothing worth saying yet ("0m")
  const today = week[6].seconds
  const weekGoal = ring.goal * 7
  const own = book && colourOf(book.d, known)
  const bookColour = own && own !== T.ring.today && own !== T.ring.week ? own : T.mood.dark // never the colour of another ring
  const rings = [
    { share: ring.share, colour: T.ring.today, name: 'Today', value: `${fmtDur(today)} of ${goalMin}m` },
    { share: Math.min(1, weekSeconds / weekGoal), colour: T.ring.week, name: '7 days', value: `${fmtDur(weekSeconds)} of ${fmtDur(weekGoal)}` },
    ...(book ? [{ share: book.share, colour: bookColour, name: book.d.title, value: `${Math.floor(book.share * 100)}% · ${fmtDur(book.seconds * (1 - book.share))} left` }] : []),
  ]
  const nudge = nudgeOf(ring, near, run)
  const tallest = Math.max(QUIET_DAY_S, ring.goal * 1.2, ...week.map(d => d.seconds))
  return (
    <section data-rise="0" role="button" tabIndex={0} data-press="" aria-label="Your listening: open all of it" onClick={() => openSheet('listening')} onKeyDown={e => { if (e.key === 'Enter') openSheet('listening') }} style={{ '--press': T.tap.card, cursor: 'pointer', margin: wide ? '0 0 26px' : '2px 16px 14px', padding: wide ? '18px 22px' : 16, borderRadius: T.r.lg, border: `1px solid ${T.border}`, background: T.surface, display: 'grid', gridTemplateColumns: wide ? 'auto auto minmax(0, 1fr)' : 'minmax(0, 1fr)', columnGap: 36, rowGap: 14, alignItems: 'center' }}>
      {/* the rings, and a line for each in its colour: what it is, and how far */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
        <Rings rings={rings} size={wide ? 92 : 88} name={rings.map(r => `${r.name}: ${r.value}`).join('. ')} />
        <div style={{ display: 'grid', gap: 5, minWidth: 0, maxWidth: wide ? 190 : undefined, flex: 1 }}>
          {rings.map(r => (
            <div key={r.name} style={{ minWidth: 0, display: 'grid' }}>
              <span style={{ fontSize: 11.5, color: T.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
              <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.2, color: r.colour, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.value}</span>
            </div>
          ))}
        </div>
      </div>
      {/* the week: a column a day, split by what was listened to; a day over the line closed its ring */}
      <div role="img" aria-label={`The last seven days: ${week.map(d => `${d.letter} ${Math.round(d.seconds / 60)} minutes`).join(', ')}. The line is your daily goal.`} style={{ position: 'relative', width: wide ? 210 : '100%', display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 7, alignSelf: 'end' }}>
        <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: COL_H * (1 - ring.goal / tallest), borderTop: `1px dashed ${T.borderHi}`, pointerEvents: 'none' }} />
        {week.map((day, i) => (
          <div key={day.key} style={{ display: 'grid', gap: 6, justifyItems: 'stretch' }}>
            <div style={{ height: COL_H, display: 'flex', alignItems: 'flex-end' }}>
              {day.seconds > 0 ? (
                <motion.div initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: T.dur.slow, ease: T.ease, delay: i * 0.04 }}
                  style={{ width: '100%', height: `${Math.max(8, (day.seconds / tallest) * 100)}%`, display: 'flex', flexDirection: 'column-reverse', gap: 1.5, borderRadius: 4, overflow: 'hidden', transformOrigin: '50% 100%', opacity: day.today ? 1 : OTHER_DAY }}>
                  {day.docs.slice(0, 4).map(([id, s]) => <div key={id} style={{ flex: `${s} 1 0`, minHeight: 0, background: colourFor(id) }} />)}
                  {day.docs.length > 4 && <div style={{ flex: `${day.docs.slice(4).reduce((a, [, s]) => a + s, 0)} 1 0`, minHeight: 0, background: T.faint }} />}
                </motion.div>
              ) : <div style={{ width: '100%', height: 3, borderRadius: 3, background: T.surfaceTop }} />}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: 10, textAlign: 'center', color: day.today ? T.text : T.faint }}>{day.letter}</div>
          </div>
        ))}
      </div>
      {/* the library, and under it the one sentence that says why to listen a little more today */}
      <div style={{ display: 'grid', gap: 8, minWidth: 0, alignSelf: wide ? 'end' : undefined }}>
        {all > 0 && (
          <>
            <div role="img" aria-label={`${fmtDur(heard)} done of ${fmtDur(all)} in these documents`} style={{ display: 'flex', gap: 2, height: 10 }}>
              {shelf.map(({ d, seconds, share }) => (
                <div key={d.id} title={`${d.title} · ${Math.round(share * 100)}%`} style={{ position: 'relative', flex: `${seconds} 1 0`, minWidth: 3, borderRadius: 3, overflow: 'hidden', background: T.surfaceTop }}>
                  <motion.div {...grow} style={{ position: 'absolute', inset: 0, transformOrigin: '0 50%' }}>
                    <div style={{ width: `${share * 100}%`, height: '100%', background: colourOf(d, known) }} />
                  </motion.div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, ...mono }}>
              <span style={{ color: T.sub }}>{fmtDur(heard)} done</span>
              <span>{fmtDur(all - heard)} left</span>
            </div>
          </>
        )}
        <div style={{ fontSize: 13.5, fontWeight: 600, color: ring.closed ? T.ring.today : T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: all > 0 ? 4 : 0 }}>{nudge}</div>
      </div>
    </section>
  )
}
