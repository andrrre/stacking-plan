import { useAppState } from '../../app/state/useAppState'
import { ClientSummary } from './ClientSummary'
import { CompareDialog } from './CompareDialog'

/** Mounted outside the app shell (App.tsx), so the summary can print alone. */
export function Overlays() {
  const { state } = useAppState()
  if (state.overlay === 'compare') return <CompareDialog />
  if (state.overlay === 'summary') return <ClientSummary />
  return null
}
