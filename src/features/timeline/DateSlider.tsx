import { monthOffset, sliderDate } from '../../domain/dates'
import { HORIZON_MONTHS } from '../../domain/constants'
import { formatMonthYear } from '../../domain/format'
import { useAppState } from '../../app/state/useAppState'
import styles from './DateSlider.module.css'

export function DateSlider() {
  const { state, dispatch } = useAppState()
  const { today, asOf } = state
  const step = monthOffset(asOf, today)
  const atToday = step === 0
  const label = atToday ? 'Today' : formatMonthYear(asOf) // the slider's spoken value
  const shown = atToday ? `Today · ${formatMonthYear(today)}` : label

  return (
    <div className={styles.slider} data-testid="date-slider-panel">
      <div className={styles.head}>
        <span className={styles.caption}>Building as of</span>
        <span className={styles.label} data-testid="date-label">{shown}</span>
        <button
          type="button"
          className={styles.today}
          data-testid="date-today"
          aria-disabled={atToday}
          onClick={() => {
            if (!atToday) dispatch({ type: 'asOf/set', asOf: today })
          }}
        >
          Today
        </button>
      </div>
      <input
        type="range"
        className={styles.range}
        data-testid="date-slider"
        aria-label="As of date"
        aria-valuetext={label}
        min={0}
        max={HORIZON_MONTHS}
        step={1}
        value={step}
        onChange={(e) => dispatch({ type: 'asOf/set', asOf: sliderDate(today, Number(e.target.value)) })}
      />
      <div className={styles.ends} aria-hidden="true">
        <span>{formatMonthYear(today)}</span>
        <span>{formatMonthYear(sliderDate(today, HORIZON_MONTHS))}</span>
      </div>
    </div>
  )
}
