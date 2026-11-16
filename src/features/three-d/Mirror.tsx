import { joinsNext } from '../stack/joins'
import { suiteDataAttributes } from '../stack/suiteAttributes'
import type { StackModel } from '../stack/suiteVisual'
import type { RovingItemProps } from '../stack/useRovingFocus'
import type { ScreenPoint } from './sceneTypes'
import styles from './three-d.module.css'

// The canvas is not accessible, so every suite also has a real, visually hidden button with the 2D stack's
// accessible name, state attributes and roving focus. The scene draws the focus indicator for the focused
// button; `data-screen-*` say where the suite is on the canvas once the camera has settled.

type Props = {
  model: StackModel
  points: ReadonlyMap<string, ScreenPoint>
  getItemProps: (id: string) => RovingItemProps
  onSelect: (id: string) => void
  onFocusChange: (id: string | null) => void
}

export function Mirror({ model, points, getItemProps, onSelect, onFocusChange }: Props) {
  return (
    <div className={styles.mirror} data-testid="mirror3d">
      {model.floors.map((f) => (
        <div key={f.number} role="group" aria-label={`Floor ${f.number}`}>
          {f.suites.map((v, i) => {
            const id = v.suite.id
            const roving = getItemProps(id)
            const p = points.get(id)
            return (
              <button
                key={id}
                type="button"
                className={styles.mirrorButton}
                data-testid={`suite3d-${id}`}
                {...suiteDataAttributes(v, joinsNext(f.suites, i))}
                data-screen-x={p?.x}
                data-screen-y={p?.y}
                data-screen-hit={p ? String(p.hit) : undefined}
                data-screen-face={p?.face}
                aria-pressed={v.selected}
                aria-label={v.ariaLabel}
                title={v.tooltip}
                onClick={() => onSelect(id)}
                {...roving}
                onFocus={() => {
                  roving.onFocus()
                  onFocusChange(id)
                }}
                onBlur={() => onFocusChange(null)}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}
