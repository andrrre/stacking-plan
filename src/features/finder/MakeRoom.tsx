import { useAppState } from '../../app/state/useAppState'
import { formatSf, suitesLabel } from '../../domain/format'
import { moveChanges } from '../../domain/makeRoom'
import type { MoveOption } from '../../domain/types'
import { useMoveOptions } from './useMoveOptions'
import styles from './MakeRoom.module.css'

/** One move, worded as a proposal: the tenant has not agreed to anything. */
function MoveItem({ option }: { option: MoveOption }) {
  const { state, dispatch } = useAppState()
  const { lease, from, to, freed } = option
  const showing = state.movePreview?.key === option.key
  const apply = () => {
    for (const change of moveChanges(option, state.asOf)) dispatch({ type: 'scenario/add', change })
  }
  return (
    <li className={styles.option} data-testid="move-option">
      <p className={styles.move}>
        Move <strong>{lease.tenant}</strong> ({formatSf(from.areaSf)}) from Suite {from.number} to Suite {to.number} ({formatSf(to.areaSf)}).
      </p>
      <p className={styles.freed}>Frees {suitesLabel(freed.suiteNumbers)}: {formatSf(freed.totalSf)} on floor {freed.floor}.</p>
      <p className={styles.assumes}>Assumes {lease.tenant} agrees to relocate.</p>
      <div className={styles.actions}>
        <button
          type="button" className={styles.show} data-testid="show-move" aria-pressed={showing}
          onClick={() => dispatch({ type: 'move/preview', option: showing ? null : option })}
        >
          {showing ? 'Hide move' : 'Show move'}
        </button>
        <button type="button" className={styles.apply} data-testid="apply-move" data-focus-next="list" onClick={apply}>
          Apply as scenario
        </button>
      </div>
    </li>
  )
}

/** The no-fit panel's last resort: moving one tenant would free a block that fits. */
export function MakeRoom() {
  const options = useMoveOptions()
  if (options.length === 0) return null
  return (
    <section className={styles.makeRoom} data-testid="make-room" aria-labelledby="make-room-title">
      <h4 id="make-room-title" className={styles.title}>Make room</h4>
      <ul className={styles.options}>
        {options.map((o) => <MoveItem key={o.key} option={o} />)}
      </ul>
    </section>
  )
}
