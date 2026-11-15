import { createContext, useContext, type Dispatch } from 'react'
import type { Action, AppState } from './types'

export type AppStateValue = { state: AppState; dispatch: Dispatch<Action> }

export const AppStateContext = createContext<AppStateValue | null>(null)

export function useAppState(): AppStateValue {
  const value = useContext(AppStateContext)
  if (!value) throw new Error('useAppState must be used inside <StateProvider>')
  return value
}
