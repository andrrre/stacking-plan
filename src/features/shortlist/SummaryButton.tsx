import { useAppState } from '../../app/state/useAppState'
import { useShortlist } from './useShortlist'

type Props = { className?: string }

/** Header button; there is nothing to summarise until something is on the shortlist. */
export function SummaryButton({ className }: Props) {
  const { dispatch } = useAppState()
  const empty = useShortlist().length === 0
  return (
    <button
      type="button" className={className} data-testid="open-summary" disabled={empty}
      title={empty ? 'Save a match to the shortlist first' : undefined}
      onClick={() => dispatch({ type: 'overlay/set', overlay: 'summary' })}
    >
      Client summary
    </button>
  )
}
