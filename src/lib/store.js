import { useSyncExternalStore, useEffect, useState } from 'react'

// ponytail: 15-line store instead of a state library. Selectors must return primitives or stable refs.
export function createStore(initial) {
  let state = initial
  const subs = new Set()
  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }
      subs.forEach(f => f())
    },
    sub(f) { subs.add(f); return () => subs.delete(f) },
  }
}

export const useStore = (store, sel = s => s) => useSyncExternalStore(store.sub, () => sel(store.get()))

export function useWidth() {
  const [w, setW] = useState(() => window.innerWidth)
  useEffect(() => {
    const on = () => setW(window.innerWidth)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return w
}

export const uid = () => crypto.randomUUID().slice(0, 13)
