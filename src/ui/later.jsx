// A part of the app that is fetched when it is first needed, or in a quiet moment before that (`.fetch()`),
// and drawn AT ONCE when it has already been fetched.
//
// React's own lazy() cannot do the second half: even for a part already fetched it shows the empty fallback
// first, and React then holds the real thing back for about a third of a second so the fallback does not
// flicker. Filmed (e2e/film.mjs, 2026-10-12): the first tap on Settings, and the first change to Pages, each
// showed an empty black screen for that long. A part that is ready must simply be there.
import { lazy, useState } from 'react'

export function later(load) {
  let Ready = null
  const fetch = () => load().then(C => { Ready = C; return { default: C } })
  const Lazy = lazy(fetch)
  // Which of the two it is, is settled when it is first drawn and kept: changing from one to the other while
  // on screen would throw away what the customer had typed or scrolled to inside it.
  function Later(props) {
    const [C] = useState(() => Ready || Lazy)
    return <C {...props} />
  }
  Later.fetch = fetch
  return Later
}
