import type { CSSProperties, ReactElement } from 'react'
import { joinsNext } from '../stack/joins'
import { segments } from '../stack/segments'
import { suiteDataAttributes } from '../stack/suiteAttributes'
import type { FloorVisual } from '../stack/suiteVisual'
import type { RovingItemProps } from '../stack/useRovingFocus'
import stackStyles from '../stack/stack.module.css'
import styles from './three-d.module.css'

// Chips on suites narrower than this (estimated from the share of the plate) show only when matched, selected or focused.
const REF_WIDTH_PX = 400
const NARROW_PX = 24

type Props = {
  floor: FloorVisual
  level: number // 0 = the lowest floor
  dense?: boolean // a very tall building: chips only for matched, selected or focused suites
  getItemProps: (id: string) => RovingItemProps
  onSelect: (suiteId: string) => void
}

/** The floor's suites in outline groups, in the same flex structure for the top face and the side strips. */
function Row({ floor, cell, tagged = false }: { floor: FloorVisual; cell: (i: number, badge: number | null) => ReactElement; tagged?: boolean }) {
  return (
    <>
      {segments(floor.suites.length, floor.runs).map((seg) => {
        if (seg.kind === 'suite') return cell(seg.index, null)
        const { rank, first, last } = seg.run
        const areaSf = floor.suites.slice(first, last + 1).reduce((sum, v) => sum + v.suite.areaSf, 0)
        return (
          <div key={`run-${rank}`} className={styles.run} style={{ flexGrow: areaSf }} data-testid={tagged ? `match-outline-${rank}` : undefined}>
            {floor.suites.slice(first, last + 1).map((_, k) => cell(first + k, k === 0 ? rank : null))}
          </div>
        )
      })}
    </>
  )
}

/** A non-interactive strip of the floor's suites on a side face, coloured and dimmed like the top. */
function Strip({ floor }: { floor: FloorVisual }) {
  return (
    <Row
      floor={floor}
      cell={(i) => {
        const v = floor.suites[i]
        if (!v) return <span key={i} />
        return (
          <span
            key={v.suite.id}
            className={`${stackStyles.suite} ${styles.stripCell}`}
            style={{ flexGrow: v.suite.areaSf }}
            data-fill={v.fill}
            data-dimmed={String(v.dimmed)}
            aria-hidden="true"
          />
        )
      }}
    />
  )
}

export function Floor3D({ floor, level, dense = false, getItemProps, onSelect }: Props) {
  const plateStyle: CSSProperties = { '--level': level, width: `${floor.widthPct}%` } as CSSProperties
  const cell = (i: number, badge: number | null) => {
    const v = floor.suites[i]
    if (!v) return <span key={i} />
    const approxPx = (v.suite.areaSf / floor.plateSf) * (floor.widthPct / 100) * REF_WIDTH_PX
    const narrow = (dense || approxPx < NARROW_PX) && !v.selected && v.matchRank === null
    return (
      <div key={v.suite.id} className={styles.cell} style={{ flexGrow: v.suite.areaSf }}>
        <button
          type="button"
          className={`${stackStyles.suite} ${styles.suite}`}
          data-testid={`suite3d-${v.suite.id}`}
          {...suiteDataAttributes(v, joinsNext(floor.suites, i))}
          aria-pressed={v.selected}
          aria-label={v.ariaLabel}
          title={v.tooltip}
          onClick={() => onSelect(v.suite.id)}
          {...getItemProps(v.suite.id)}
        >
          {v.modified && <span className={stackStyles.modifiedDot} aria-hidden="true" />}
        </button>
        <span className={styles.chip} data-narrow={String(narrow)} data-dimmed={String(v.dimmed)} data-selected={String(v.selected)} aria-hidden="true">
          {badge !== null && <span className={styles.badge}>{badge}</span>}
          {v.suite.number}
        </span>
      </div>
    )
  }
  return (
    <div className={styles.slab} style={plateStyle} role="group" aria-label={`Floor ${floor.number}`} data-testid={`floor3d-${floor.number}`}>
      <div className={styles.top}>
        <Row floor={floor} cell={cell} tagged />
      </div>
      <div className={`${styles.face} ${styles.front}`} aria-hidden="true"><Strip floor={floor} /></div>
      <div className={`${styles.face} ${styles.back}`} aria-hidden="true"><Strip floor={floor} /></div>
      <div className={`${styles.face} ${styles.left}`} aria-hidden="true" />
      <div className={`${styles.face} ${styles.right}`} aria-hidden="true" />
    </div>
  )
}
