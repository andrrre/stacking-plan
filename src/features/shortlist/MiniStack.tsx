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

/**
 * Outlines for the options on one floor. Options that cover exactly the same suites share one outline:
 * the run takes the best rank and `labels` carries every number ("1 · 3"). An option whose suites are
 * gone or not side by side is left out.
 */
function runsOnFloor(floor: LayoutFloor, options: readonly ClientOption[], labels: Map<number, string>): MatchRun[] {
  const byKey = new Map<string, MatchRun>()
  for (const o of options) {
    if (o.floor !== floor.number) continue
    const at = o.suiteNumbers.map((n) => floor.suites.findIndex((s) => s.number === n))
    const first = Math.min(...at)
    const last = Math.max(...at)
    if (!at.every((x) => x >= 0) || last - first + 1 !== at.length) continue
    const key = `${first}-${last}`
    const run = byKey.get(key)
    if (run) labels.set(run.rank, `${labels.get(run.rank)} · ${o.rank}`)
    else {
      byKey.set(key, { rank: o.rank, first, last })
      labels.set(o.rank, String(o.rank))
    }
  }
  return [...byKey.values()]
}

const cellStyle = (s: LayoutSuite): CSSProperties => ({ flexGrow: s.areaSf })

/** The building's layout in neutral fills with suite numbers; the options are outlined and numbered. */
export function MiniStack({ building, options }: Props) {
  const floors = layoutOf(building)
  const labels = new Map<number, string>()
  const maxPlate = Math.max(...floors.map((f) => f.plateSf), 1)
  return (
    <div className={styles.stack} data-testid="mini-stack">
      {floors.map((f) => {
        const cell = (i: number) => {
          const s = f.suites[i]
          return s ? <span key={s.number} className={styles.suite} data-common={s.common} style={cellStyle(s)}>{s.common ? '' : s.number}</span> : null
        }
        return (
          <div key={f.number} className={styles.floor}>
            <span className={styles.label}>{f.number}</span>
            <div className={styles.track}>
              <div className={styles.plate} style={{ width: `${(f.plateSf / maxPlate) * 100}%` }}>
                {segments(f.suites.length, runsOnFloor(f, options, labels)).map((seg) => {
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
