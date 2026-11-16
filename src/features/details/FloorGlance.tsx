import { useAppState } from '../../app/state/useAppState'
import { formatSf } from '../../domain/format'
import { useStackModel } from '../stack/useStackModel'
import stack from '../stack/stack.module.css'
import styles from './details.module.css'

type Props = { floor: number; suiteId: string }

/** "Floor N at a glance": the floor's suites as rows, the shown one current; a row selects its suite. */
export function FloorGlance({ floor, suiteId }: Props) {
  const { dispatch } = useAppState()
  const suites = useStackModel().floors.find((f) => f.number === floor)?.suites ?? []
  return (
    <section className={styles.card} data-testid="floor-glance" aria-labelledby="floor-glance-title">
      <h3 id="floor-glance-title" className={styles.sub}>Floor {floor} at a glance</h3>
      <ul className={styles.glance}>
        {suites.map((v) => (
          <li key={v.suite.id}>
            <button type="button" className={styles.glanceRow} data-testid={`glance-${v.suite.id}`}
              aria-current={v.suite.id === suiteId ? 'true' : undefined}
              onClick={() => dispatch({ type: 'select', selection: { kind: 'suite', suiteId: v.suite.id } })}>
              <span className={stack.swatch} data-fill={v.fill} aria-hidden="true" />
              <span className={styles.glanceNumber}>{v.suite.number}</span>
              <span className={styles.glanceName}>{v.label.line2}</span>
              <span className={styles.glanceSf}>{formatSf(v.suite.areaSf)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
