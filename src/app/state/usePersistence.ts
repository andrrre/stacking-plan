import { useEffect } from 'react'
import { browserStorage, saveImported, saveShortlist } from './storage'
import type { AppState } from './types'

/** Saves the shortlist and imported buildings to localStorage whenever either changes identity. */
export function usePersistence(state: Pick<AppState, 'shortlist' | 'importedBuildings'>): void {
  const { shortlist, importedBuildings } = state
  useEffect(() => {
    saveShortlist(browserStorage(), shortlist)
  }, [shortlist])
  useEffect(() => {
    saveImported(browserStorage(), importedBuildings)
  }, [importedBuildings])
}
