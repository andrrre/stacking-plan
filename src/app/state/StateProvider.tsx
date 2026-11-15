import { useMemo, useReducer, type ReactNode } from 'react'
import { reducer } from './reducer'
import { AppStateContext } from './useAppState'
import { usePersistence } from './usePersistence'
import type { AppState } from './types'

type Props = { initialState: AppState; children: ReactNode }

/** Holds the one app reducer. Build `initialState` with `initState(location.search, browserStorage(), today)`. */
export function StateProvider({ initialState, children }: Props) {
  const [state, dispatch] = useReducer(reducer, initialState)
  usePersistence(state)
  const value = useMemo(() => ({ state, dispatch }), [state])
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}
