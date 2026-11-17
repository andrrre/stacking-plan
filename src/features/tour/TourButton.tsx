import { useEffect, useRef, type RefObject } from 'react'
import { useAppState } from '../../app/state/useAppState'
import { HintButton } from '../layout/HintButton'
import { useStartTour, useTourStops } from './useTour'

/** Why there is nothing to tour: no shortlisted option, no match and no available suite. */
export const NO_STOPS_HINT = 'No space to tour: nothing is shortlisted, matched or available on this date.'

/** Where focus goes when a tour ends and its bar takes focus with it: no Tour button (presentation over) → the stage. */
export const TOUR_RETURN = '[data-tour-return]'

/** A tour that ends with focus lost (its bar unmounted under it) hands focus to the Tour button, else the stage. */
function useFocusAfterTour(touring: boolean, button: RefObject<HTMLButtonElement | null>): void {
  const was = useRef(touring)
  useEffect(() => {
    const ended = was.current && !touring
    was.current = touring
    const active = document.activeElement
    if (!ended || (active !== null && active !== document.body)) return
    const to = button.current ?? document.querySelector<HTMLElement>(TOUR_RETURN)
    to?.focus()
  }, [touring, button])
}

/** The header's Tour control while presenting: starts a suite tour, or ends the one running. */
export function TourButton({ className }: { className?: string }) {
  const { state, dispatch } = useAppState()
  const stops = useTourStops()
  const start = useStartTour()
  const button = useRef<HTMLButtonElement>(null)
  const touring = state.tour !== null
  useFocusAfterTour(touring, button)
  if (!state.presenting) return null
  return (
    <HintButton
      className={className} testId="tour" buttonRef={button} hint={!touring && stops.length === 0 ? NO_STOPS_HINT : null}
      onClick={() => (touring ? dispatch({ type: 'tour/exit' }) : start())}
    >
      {touring ? 'End tour' : 'Tour'}
    </HintButton>
  )
}
