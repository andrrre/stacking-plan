import { useAppState } from '../../app/state/useAppState'
import { StackView } from '../stack/StackView'
import { TourOverlay } from '../tour/TourOverlay'
import styles from './three-d.module.css'

// The 2D stack standing in for the 3D building, with a one-line note on why. A suite tour carries on over it
// (the stack lights the stop and scrolls it into view), so losing WebGL never strands a tour without its controls.

export type FailReason = 'unavailable' | 'load' | 'lost'

const NOTES: Record<FailReason, string> = {
  unavailable: 'The 3D building needs WebGL, which this browser has turned off, so the 2D stack is shown.',
  load: 'The 3D building failed to load, so the 2D stack is shown.',
  lost: 'The 3D view stopped working (the graphics context was lost), so the 2D stack is shown.',
}

type Props = { reason: FailReason; onRetry?: () => void }

export function Fallback({ reason, onRetry }: Props) {
  const { state } = useAppState()
  const touring = state.tour !== null
  return (
    <div className={styles.fallback} data-testid="webgl-fallback" data-reason={reason} data-touring={touring || undefined} data-tour-return="" tabIndex={-1}>
      <p className={styles.note}>
        {NOTES[reason]}
        {onRetry && (
          <button type="button" className={styles.retry} data-testid="retry-3d" onClick={onRetry}>Try again</button>
        )}
      </p>
      {touring ? <div className={styles.fallbackScroll}><StackView /></div> : <StackView />}
      {state.tour && <TourOverlay tour={state.tour} />}
    </div>
  )
}
