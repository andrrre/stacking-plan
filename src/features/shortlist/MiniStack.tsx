import type { CSSProperties } from 'react'
import { segments } from '../stack/segments'
import type { MatchRun } from '../stack/suiteVisual'
import type { Building } from '../../domain/types'
import type { ClientOption } from './clientOptions'
import outline from '../stack/stack.module.css'
import styles from './miniStack.module.css'

type LayoutSuite = { number: string; areaSf: number; common: boolean }
type LayoutFloor = { number: number; plateSf: number; suites: LayoutSuite[] }

type Props = { building: Building; options: readonly ClientOption[] }

/** Only number, size and kind leave the building: the client summary can never leak a lease from here. */
function layoutOf(building: Building): LayoutFloor[] {
  return [...building.floors]
    .sort((a, b) => b.number - a.number)
    .map((f) => {
      const suites = f.suites.map((s) => ({ number: s.number, areaSf: s.areaSf, common: s.kind === 'common' }))
      return { number: f.number, plateSf: suites.reduce((sum, s) => sum + s.areaSf, 0), suites }
    })
}

/** Where an option sits on its floor, or null when its suites are gone or not side by side. */
function spanOf(floor: LayoutFloor, o: ClientOption): { first: number; last: number } | null {
  const at = o.suiteNumbers.map((n) => floor.suites.findIndex((s) => s.number === n))
  const first = Math.min(...at)
  const last = Math.max(...at)
  return at.every((x) => x >= 0) && last - first + 1 === at.length ? { first, last } : null
}

type FloorRuns = { runs: readonly MatchRun[]; labels: ReadonlyMap<number, string> }

/**
 * Outlines for the options on one floor. Options that cover exactly the same suites share one outline:
 * the run takes the best (first) rank and its label carries every number ("1 · 3").
 */
function runsOnFloor(floor: LayoutFloor, options: readonly ClientOption[]): FloorRuns {
  const placed = options.flatMap((o) => {
    const at = o.floor === floor.number ? spanOf(floor, o) : null
    return at ? [{ rank: o.rank, ...at }] : []
  })
  const runs = placed.filter((p, i) => placed.findIndex((q) => q.first === p.first && q.last === p.last) === i)
  const labels = new Map(runs.map((r) => [
    r.rank,
    placed.filter((p) => p.first === r.first && p.last === r.last).map((p) => p.rank).join(' · '),
  ] as const))
  return { runs, labels }
}

const cellStyle = (s: LayoutSuite): CSSProperties => ({ flexGrow: s.areaSf })

/** The building's layout in neutral fills with suite numbers; the options are outlined and numbered. */
export function MiniStack({ building, options }: Props) {
  const floors = layoutOf(building)
  const maxPlate = Math.max(...floors.map((f) => f.plateSf), 1)
  return (
    <div className={styles.stack} data-testid="mini-stack">
      {floors.map((f) => {
        const cell = (i: number) => {
          const s = f.suites[i]
          return s ? <span key={s.number} className={styles.suite} data-common={s.common} style={cellStyle(s)}>{s.common ? '' : s.number}</span> : null
        }
        const { runs, labels } = runsOnFloor(f, options)
        return (
          <div key={f.number} className={styles.floor}>
            <span className={styles.label}>{f.number}</span>
            <div className={styles.track}>
              <div className={styles.plate} style={{ width: `${(f.plateSf / maxPlate) * 100}%` }}>
                {segments(f.suites.length, runs).map((seg) => {
                  if (seg.kind === 'suite') return cell(seg.index)
                  const { rank, first, last } = seg.run
                  const inRun = f.suites.slice(first, last + 1)
                  return (
                    <div
                      key={`run-${rank}`} className={outline.run} data-testid={`match-outline-${rank}`}
                      style={{ flexGrow: inRun.reduce((n, s) => n + s.areaSf, 0) }}
                    >
                      <span className={`${outline.runBadge} ${styles.badge}`} aria-hidden="true">{labels.get(rank)}</span>
                      {inRun.map((_, k) => cell(first + k))}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
