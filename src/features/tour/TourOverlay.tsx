import { useEffect } from 'react'
import { selectBuilding } from '../../app/state/selectBuilding'
import { activeRequirement } from '../../app/state/selectors'
import type { Action, Tour } from '../../app/state/types'
import { useAppState } from '../../app/state/useAppState'
import { STOP_MS } from '../three-d/tourCamera'
import { tourCaption } from './tourCaption'
import { tourKey, type TourCommand } from './tourKeys'
import styles from './tour.module.css'

// The suite tour on the stage: the caption card (bottom left, large enough to read across a room) and the bar of
// controls (Previous, Play / Pause, Next, Exit tour), the keys (← → Space Escape) and the auto-advance.

const command = (c: TourCommand, t: Tour): Action => {
  switch (c) {
    case 'exit': return { type: 'tour/exit' }
    case 'prev': return { type: 'tour/go', index: t.index - 1 }
    case 'next': return { type: 'tour/go', index: t.index + 1 }
    case 'toggle': return { type: 'tour/play', playing: !t.playing }
  }
}

/**
 * The tour's keys, on the document: they run before presentation mode's (on the window), so one Escape ends the
 * tour and the next the presentation. A key something else handled already (a drawer, a dialog) is left alone.
 */
function useTourKeys(tour: Tour, dispatch: (a: Action) => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
      const c = tourKey(e.key, e.target instanceof Element ? e.target : null)
      if (!c) return
      e.preventDefault()
      dispatch(command(c, tour))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [tour, dispatch])
}

/** Playing, each stop stays STOP_MS, then the next; after the last the tour stops there (it does not loop). */
function useAutoAdvance(tour: Tour, dispatch: (a: Action) => void): void {
  const { index, playing } = tour
  const last = tour.stops.length - 1
  useEffect(() => {
    if (!playing) return undefined
    const timer = setTimeout(() => {
      dispatch(index < last ? { type: 'tour/go', index: index + 1 } : { type: 'tour/play', playing: false })
    }, STOP_MS)
    return () => clearTimeout(timer)
  }, [index, playing, last, dispatch])
}

function Caption({ tour }: { tour: Tour }) {
  const { state } = useAppState()
  const stop = tour.stops[tour.index]
  if (!stop) return null
  const c = tourCaption({
    stop, building: selectBuilding(state), asOf: state.asOf, today: state.today, includePotential: state.req.includePotential,
    req: activeRequirement(state), whatIf: state.changes.length > 0, index: tour.index, count: tour.stops.length,
  })
  return (
    <section className={styles.caption} data-testid="tour-caption" aria-live="polite" aria-label="Suite tour stop">
      <p className={styles.counter} data-testid="tour-counter">{c.counter}</p>
      <h2 className={styles.title} data-testid="tour-title">{c.title}</h2>
      <ul className={styles.lines}>
        {c.lines.map((l) => <li key={l}>{l}</li>)}
      </ul>
    </section>
  )
}

function Bar({ tour, dispatch }: { tour: Tour; dispatch: (a: Action) => void }) {
  const first = tour.index === 0
  const last = tour.index === tour.stops.length - 1
  const go = (c: TourCommand) => dispatch(command(c, tour))
  return (
    <div className={styles.bar} role="group" aria-label="Suite tour" data-testid="tour-bar">
      <button type="button" className={styles.button} data-testid="tour-prev" aria-disabled={first || undefined} onClick={() => !first && go('prev')}>
        <span aria-hidden="true">←</span> Previous
      </button>
      <button type="button" className={styles.button} data-testid="tour-play" aria-pressed={tour.playing} onClick={() => go('toggle')}>
        {tour.playing ? 'Pause' : 'Play'}
      </button>
      <button type="button" className={styles.button} data-testid="tour-next" aria-disabled={last || undefined} onClick={() => !last && go('next')}>
        Next <span aria-hidden="true">→</span>
      </button>
      <button type="button" className={styles.exit} data-testid="tour-exit" onClick={() => go('exit')}>
        Exit tour
      </button>
    </div>
  )
}

export function TourOverlay({ tour }: { tour: Tour }) {
  const { dispatch } = useAppState()
  useTourKeys(tour, dispatch)
  useAutoAdvance(tour, dispatch)
  return (
    <div className={styles.tour} data-print="hide">
      <Caption tour={tour} />
      <Bar tour={tour} dispatch={dispatch} />
    </div>
  )
}
