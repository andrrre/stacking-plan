import { useAppState } from '../../app/state/useAppState'
import { HintButton } from '../layout/HintButton'
import { useShortlist } from './useShortlist'

type Props = { className?: string }

/** What fills the shortlist: Save to shortlist on a match, Add to client summary in a suite's details. */
export const SUMMARY_HINT = 'Save a match to the shortlist, or add a suite from its details, to build a client summary.'

/** Header button; there is nothing to summarise until something is on the shortlist, and its tooltip says so. */
export function SummaryButton({ className }: Props) {
  const { dispatch } = useAppState()
  const empty = useShortlist().length === 0
  return (
    <HintButton
      className={className} testId="open-summary" hint={empty ? SUMMARY_HINT : null}
      onClick={() => dispatch({ type: 'overlay/set', overlay: 'summary' })}
    >
      Client summary
    </HintButton>
  )
}
