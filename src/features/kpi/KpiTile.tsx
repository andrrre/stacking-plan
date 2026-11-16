import type { KpiKey } from '../../app/state/types'
import styles from './kpi.module.css'

type Props = {
  kpi: KpiKey
  testId: string
  label: string
  value: string
  unit?: string // small, after the figure ("SF", "SF · Floor 7")
  sub?: string
  subTestId?: string
  bar?: number // 0..100: a thin progress bar under the figure
  pressed: boolean
  onToggle: (kpi: KpiKey) => void
}

export function KpiTile({ kpi, testId, label, value, unit, sub, subTestId, bar, pressed, onToggle }: Props) {
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
      <span className={styles.value} data-testid={`${testId}-value`}>
        {value}
        {unit && <span className={styles.unit}> {unit}</span>}
      </span>
      {bar !== undefined && (
        <span className={styles.track} aria-hidden="true">
          <span className={styles.fill} style={{ width: `${Math.min(Math.max(bar, 0), 100)}%` }} />
        </span>
      )}
      {sub && <span className={styles.sub} data-testid={subTestId}>{sub}</span>}
    </button>
  )
}
