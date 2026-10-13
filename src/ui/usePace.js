// The speed a document is heard at, read from the stores that hold it (the rule itself: lib/pace.js).
import { useCallback } from 'react'
import { useStore } from '../lib/store.js'
import { player } from '../lib/player.js'
import { settings } from '../lib/settings.js'
import { docDuration } from '../lib/library.js'
import { paceFor, atPace } from '../lib/pace.js'

// → a function from a document's id to its speed. One look at the stores for a whole list: a list does not ask
// the stores once for each of its rows.
export function usePacer() {
  const id = useStore(player, s => s.id)
  const rate = useStore(player, s => s.rate)
  const speed = useStore(settings, s => s.speed)
  return useCallback(docId => paceFor(docId, { id, rate }, { speed }), [id, rate, speed])
}

export const usePace = docId => usePacer()(docId)

// → a function from a document to how long it takes the customer, at its pace (the number a card, a header
// and a total all show).
export function useLength() {
  const pace = usePacer()
  return useCallback(d => atPace(docDuration(d), pace(d.id)), [pace])
}
