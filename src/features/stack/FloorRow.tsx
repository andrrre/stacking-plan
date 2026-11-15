import type { CSSProperties } from 'react'
import { MatchOutline } from './MatchOutline'
import { SuiteCell } from './SuiteCell'
import { segments } from './segments'
import type { FloorVisual, SuiteVisual } from './suiteVisual'
import type { RovingItemProps } from './useRovingFocus'
import styles from './stack.module.css'

type Props = {
  floor: FloorVisual
  getItemProps: (id: string) => RovingItemProps
  onSelect: (suiteId: string) => void
  testId?: string // default `floor-{n}`
}

const isOpenVacant = (v: SuiteVisual | undefined) => v?.status.status === 'vacant' && v.status.overlay !== 'committed'

/** A dashed joint is drawn between neighbouring vacant suites that can combine (spec A4). */
function joinsNext(suites: readonly SuiteVisual[], i: number): boolean {
  const v = suites[i]
  return Boolean(v?.suite.joinsNext) && isOpenVacant(v) && isOpenVacant(suites[i + 1])
}

export function FloorRow({ floor, getItemProps, onSelect, testId }: Props) {
  const cell = (i: number) => {
    const v = floor.suites[i]
    if (!v) return null
    const props = getItemProps(v.suite.id)
    return <SuiteCell key={v.suite.id} visual={v} roving={props} joinsNext={joinsNext(floor.suites, i)} onSelect={onSelect} />
  }
  const plateStyle: CSSProperties = { width: `${floor.widthPct}%` }
  return (
    <div className={styles.floorRow}>
      <span className={styles.floorLabel} aria-hidden="true">{floor.number}</span>
      <div className={styles.plateTrack}>
        <div className={styles.plate} style={plateStyle} role="group" aria-label={`Floor ${floor.number}`} data-testid={testId ?? `floor-${floor.number}`}>
          {segments(floor.suites.length, floor.runs).map((seg) => {
            if (seg.kind === 'suite') return cell(seg.index)
            const { rank, first, last } = seg.run
            const inRun = floor.suites.slice(first, last + 1)
            const areaSf = inRun.reduce((sum, v) => sum + v.suite.areaSf, 0)
            return (
              <MatchOutline key={`run-${rank}`} rank={rank} areaSf={areaSf} suiteCount={inRun.length}>
                {inRun.map((_, k) => cell(first + k))}
              </MatchOutline>
            )
          })}
        </div>
      </div>
    </div>
  )
}
