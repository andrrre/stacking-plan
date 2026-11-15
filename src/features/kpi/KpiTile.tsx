import type { KpiKey } from '../../app/state/types'
import styles from './kpi.module.css'

type Props = {
  kpi: KpiKey
  testId: string
  label: string
  value: string
  sub?: string
  subTestId?: string
  pressed: boolean
  onToggle: (kpi: KpiKey) => void
}

export function KpiTile({ kpi, testId, label, value, sub, subTestId, pressed, onToggle }: Props) {
  return (
    <button
      type="button"
      className={styles.tile}
      data-kpi={kpi}
      data-testid={testId}
      aria-pressed={pressed}
      onClick={() => onToggle(kpi)}
    >
      <span className={styles.label}>{label}</span>
      <span className={styles.value} data-testid={`${testId}-value`}>{value}</span>
      {sub && <span className={styles.sub} data-testid={subTestId}>{sub}</span>}
    </button>
  )
}
