// The page a component belongs to. A page that is animating out must keep showing ITS document, not the
// one being opened: it reads the route it was rendered with (frozen in context) rather than the live store.
import { createContext, useContext } from 'react'
import { ui } from './nav.js'

export const Route = createContext(null)
export const useRoute = () => useContext(Route) || ui.get()
