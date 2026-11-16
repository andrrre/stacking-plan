import { useAppState } from '../../app/state/useAppState'
import { HintButton } from '../layout/HintButton'
import { useStartTour, useTourStops } from './useTour'

/** Why there is nothing to tour: no shortlisted option, no match and no available suite. */
export const NO_STOPS_HINT = 'No space to tour: nothing is shortlisted, matched or available on this date.'

/** The header's Tour control while presenting: starts a suite tour, or ends the one running. */
export function TourButton({ className }: { className?: string }) {
  const { state, dispatch } = useAppState()
  const stops = useTourStops()
  const start = useStartTour()
  if (!state.presenting) return null
  const touring = state.tour !== null
  return (
    <HintButton
      className={className} testId="tour" pressed={touring} hint={!touring && stops.length === 0 ? NO_STOPS_HINT : null}
      onClick={() => (touring ? dispatch({ type: 'tour/exit' }) : start())}
    >
      {touring ? 'End tour' : 'Tour'}
    </HintButton>
  )
}
