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
import { useMemo } from 'react'
import { motion } from 'motion/react'
import { T, label } from '../theme.js'
import { useStore } from '../lib/store.js'
import { library, docDuration } from '../lib/library.js'
import { historyStore } from '../lib/history.js'
import { dayKey, weekOf, docListening, docBar, shelfOf, shareOf } from '../lib/heard.js'
import { colours, colourOf, hueOf } from './bookcolour.js'
import { fmtDur } from './kit.jsx'
import { usePace, useLength } from './usePace.js'
import { openSheet } from '../lib/nav.js'

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

const COL_H = 46 // the tallest a day's column stands
const QUIET_DAY_S = 20 * 60 // a week of short listens is drawn against this, not blown up to full height
const OTHER_DAY = 0.5 // days before today stand back

// Reads the whole library, not the list it sits above: its done and left are the listening page's (shelfOf),
// which a filter, a search or the Archived shelf must not change.
export function LibraryGlance({ wide }) {
  const log = useStore(historyStore, s => s.log)
  const known = useStore(colours)
  const docs = useStore(library, s => s.docs)
  const length = useLength()
  const now = new Date()
  const week = useMemo(() => weekOf(log, now), [log, dayKey(now)]) // eslint-disable-line react-hooks/exhaustive-deps
  const byId = useMemo(() => new Map(docs.map(d => [d.id, d])), [docs])
  const colourFor = id => (byId.has(id) ? colourOf(byId.get(id), known) : hueOf(log.titles?.[id] || id)) // a deleted document keeps a colour
  const { shelf, all, heard } = useMemo(() => shelfOf(docs, length), [docs, length])
  const weekSeconds = week.reduce((a, d) => a + d.seconds, 0)
  if (!(weekSeconds >= 60) && !(heard >= 60)) return null // under a minute listened to: nothing worth saying yet ("0m")
  const tallest = Math.max(QUIET_DAY_S, ...week.map(d => d.seconds))
  const today = week[6].seconds
  return (
    <section data-rise="0" role="button" tabIndex={0} data-press="" aria-label="Your listening: open all of it" onClick={() => openSheet('listening')} onKeyDown={e => { if (e.key === 'Enter') openSheet('listening') }} style={{ '--press': T.tap.card, cursor: 'pointer', margin: wide ? '0 0 26px' : '2px 16px 14px', padding: wide ? '18px 22px' : 16, borderRadius: T.r.lg, border: `1px solid ${T.border}`, background: T.surface, display: 'grid', gridTemplateColumns: wide ? 'auto minmax(0, 1fr)' : 'minmax(0, 1fr)', columnGap: 40, rowGap: 16, alignItems: 'end' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20 }}>
        <div style={{ flexShrink: 0, minWidth: 92 }}>
          <div style={label}>Today</div>
          <div style={{ marginTop: 6, fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, color: T.text }}>{fmtDur(today)}</div>
          <div style={{ marginTop: 7, fontSize: 12.5, color: T.sub, whiteSpace: 'nowrap' }}>{fmtDur(weekSeconds)} in 7 days</div>
        </div>
        {/* the week: a column a day, split by what was listened to */}
        <div role="img" aria-label={`The last seven days: ${week.map(d => `${d.letter} ${Math.round(d.seconds / 60)} minutes`).join(', ')}`} style={{ flex: wide ? '0 0 210px' : 1, display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 7 }}>
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
      </div>
      {/* the shelf: every document a block as wide as it is long, lit as far as it has been heard */}
      {all > 0 && (
        <div style={{ display: 'grid', gap: 8, minWidth: 0, paddingBottom: wide ? 16 : 0 }}>
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
        </div>
      )}
    </section>
  )
}
