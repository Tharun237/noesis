// The words of the sentence being said, as the voice goes through them: what has been said is bright, what is
// coming waits in `ahead`, and the word being said fills with lime from its first letter to its last in the
// time the voice takes to say it, then lets the lime go. (It used to switch colour whole: "no proper motion
// of letter to letter", Tharun, 2026-10-13.)
//
// The lime is a second copy of the word laid exactly over the first and uncovered by two transforms (press.js,
// [data-fill]): nothing is laid out again and nothing is repainted while it moves, and the browser moves it
// without the thread that builds the page (measured; press.js says which way of writing it does not).
// The copy is drawn by the style sheet from an attribute, so the page's text is still each word once: copying,
// finding and a screen reader meet nothing new.
import { T } from '../theme.js'

// The copy is one unbroken line. A word that the page may split over two lines (a hyphen, a dash or a slash in
// it, or very long) is lit the plain way: whole, at once.
const ONE_LINE = x => x.length < 25 && !/[-‐–—/\u00AD\u200B]/.test(x)
// The copy and its word are held on one line: without this the copy can be left at the end of the line above
// (measured). The word had nowhere to break anyway, so the page's lines stay exactly where they were.
const HELD = { whiteSpace: 'nowrap' }

// brk: the word that starts on a new line (a figure's description, after its caption), or -1.
export function Spoken({ ws, lit, ms, ahead, wipe = true, brk = -1 }) {
  return ws.map((x, k) => (k === brk ? [<br key="br" />, word(x, k)] : word(x, k)))

  function word(x, k) {
    const gap = k < ws.length - 1 ? ' ' : ''
    const moves = wipe && ONE_LINE(x)
    if (k === lit) {
      return moves
        ? <span key={k} style={{ color: ahead }}><span style={HELD}><span key="lit" aria-hidden="true" data-fill={x} style={{ '--ms': `${ms}ms` }}><span><i data-w={x} /></span></span>{x}</span>{gap}</span>
        : <span key={k} style={{ color: T.lime }}>{x}{gap}</span>
    }
    if (k === lit - 1 && moves) return <span key={k}><span style={HELD}><span key="said" aria-hidden="true" data-filled={x}><i data-w={x} /></span>{x}</span>{gap}</span>
    return <span key={k} style={{ color: k > lit ? ahead : undefined }}>{x}{gap}</span>
  }
}
