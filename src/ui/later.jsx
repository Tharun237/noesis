// A part of the app that is fetched when it is first needed, or in a quiet moment before that (`.fetch()`),
// and drawn AT ONCE when it has already been fetched.
//
// React's own lazy() cannot do the second half: even for a part already fetched it shows the empty fallback
// first, and React then holds the real thing back for about a third of a second so the fallback does not
// flicker. Filmed (e2e/film.mjs, 2026-10-12): the first tap on Settings, and the first change to Pages, each
// showed an empty black screen for that long. A part that is ready must simply be there.
import { lazy, useState } from 'react'

// A file that does not arrive (a weak connection, or the site was updated a moment ago and its files are still
// spreading; seen on the live site seconds after a deploy, where a new visitor would have had an empty page).
// Asking for it again from the same page is no use: the browser remembers that the file failed and answers
// from that memory (tried, with the file dropped twice: it was fetched once). Only a page that starts again
// asks the network again. So when a part is needed on screen and cannot be had, the page waits a moment and
// starts again, at most twice; after that the failure is a real one and is left to show.
const STARTS = 2
const WAIT_MS = 1200
const STARTED = 'noesis.started-again-for-a-file'
function startAgain(e) {
  try {
    const n = +sessionStorage.getItem(STARTED) || 0
    if (n < STARTS) {
      sessionStorage.setItem(STARTED, String(n + 1))
      return new Promise(() => { setTimeout(() => location.reload(), WAIT_MS) }) // never settles: the page is about to go
    }
  } catch { /* no storage: nothing more to try */ }
  throw e
}

export function later(load) {
  let Ready = null
  const fetch = () => load().then(C => {
    Ready = C
    try { sessionStorage.removeItem(STARTED) } catch { /* no storage */ }
    return { default: C }
  })
  const Lazy = lazy(() => fetch().catch(startAgain))
  // Which of the two it is, is settled when it is first drawn and kept: changing from one to the other while
  // on screen would throw away what the customer had typed or scrolled to inside it.
  function Later(props) {
    const [C] = useState(() => Ready || Lazy)
    return <C {...props} />
  }
  Later.fetch = () => fetch().catch(() => {}) // fetching ahead of time is a kindness: if it fails, nothing is owed yet
  return Later
}
