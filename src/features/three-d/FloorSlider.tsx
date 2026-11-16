import { useEffect, useId, useRef } from 'react'
import type { StackModel } from '../stack/suiteVisual'
import { floorCaption, floorMarks, floorValueText, wheelPixels, wheelStep } from './floorView'
import styles from './three-d.module.css'

// Floor view's vertical floor slider on the stage's left edge: a native range turned upright (top = the
// highest floor), so dragging, ArrowUp / ArrowDown, Home / End and screen readers work as for any slider.
// The mouse wheel over it steps one floor at a time. Beside it a tick per floor: its number, the current
// floor emphasised, and a mark for vacant space and for a search match, so the slider shows where to go.

type Props = { model: StackModel; floor: number; onFloor: (floor: number) => void }

/** Steps one floor per wheel notch (trackpad deltas add up); the page does not scroll meanwhile. */
function useWheelSteps(onStep: (step: 1 | -1) => void) {
  const rail = useRef<HTMLDivElement>(null)
  const latest = useRef(onStep)
  useEffect(() => {
    latest.current = onStep
  })
  useEffect(() => {
    const el = rail.current
    if (!el) return
    let acc = 0
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = wheelStep(acc, wheelPixels(e.deltaY, e.deltaMode, el.clientHeight))
      acc = r.acc
      if (r.step !== 0) latest.current(r.step)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])
  return rail
}

export function FloorSlider({ model, floor, onFloor }: Props) {
  const marks = floorMarks(model)
  const top = marks.length - 1
  const at = marks.findIndex((m) => m.floor === floor) // from the top
  const pick = (index: number) => {
    const m = marks[index]
    if (m && m.floor !== floor) onFloor(m.floor)
  }
  const rail = useWheelSteps((step) => pick(at - step))
  const shown = model.floors[at]
  const captionId = useId()
  return (
    <div className={styles.floorPanel} data-testid="floor-panel">
      {shown && <p id={captionId} className={styles.floorCaption} data-testid="floor-caption">{floorCaption(shown)}</p>}
      <div className={styles.floorRail} ref={rail} data-testid="floor-rail">
        <ol className={styles.floorTicks} data-testid="floor-ticks" aria-hidden="true" data-dense={String(marks.length > 24)}>
          {marks.map((m) => (
            <li key={m.floor} className={styles.floorTick} data-current={String(m.floor === floor)} data-vacant={String(m.vacant)} data-match={String(m.match)}>
              {m.floor}
            </li>
          ))}
        </ol>
        <input
          type="range"
          className={styles.floorRange}
          min={0}
          max={top}
          step={1}
          value={top - at}
          aria-label="Floor"
          aria-orientation="vertical"
          aria-valuetext={floorValueText(marks, floor)}
          aria-describedby={shown ? captionId : undefined}
          data-testid="floor-slider"
          onChange={(e) => pick(top - Number(e.target.value))}
        />
      </div>
    </div>
  )
}
