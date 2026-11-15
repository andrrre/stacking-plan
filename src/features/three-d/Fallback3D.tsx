import { StackView } from '../stack/StackView'
import styles from './three-d.module.css'

// The 2D stack standing in for the 3D building, with a one-line note on why.

export type FailReason = 'unavailable' | 'load' | 'lost'

const NOTES: Record<FailReason, string> = {
  unavailable: 'The 3D building needs WebGL, which this browser has turned off, so the 2D stack is shown.',
  load: 'The 3D building failed to load, so the 2D stack is shown.',
  lost: 'The 3D view stopped working (the graphics context was lost), so the 2D stack is shown.',
}

type Props = { reason: FailReason; onRetry?: () => void }

export function Fallback({ reason, onRetry }: Props) {
  return (
    <div className={styles.fallback} data-testid="webgl-fallback" data-reason={reason}>
      <p className={styles.note}>
        {NOTES[reason]}
        {onRetry && (
          <button type="button" className={styles.retry} data-testid="retry-3d" onClick={onRetry}>Try again</button>
        )}
      </p>
      <StackView />
    </div>
  )
}
