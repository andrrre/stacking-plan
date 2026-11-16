import type { RefObject } from 'react'
import type { Rig } from './sceneTypes'
import styles from './three-d.module.css'

// Camera controls as real buttons (a labelled group, each its own tab stop), so rotate, zoom, reset,
// separate floors, floor view and the city switch work from the keyboard too.

type Props = {
  rig: RefObject<Rig | null>
  separated: boolean
  onSeparate: (on: boolean) => void
  floorView: boolean
  onFloorView: (on: boolean) => void
  city: boolean
  onCity: (on: boolean) => void
  onReset: () => void
}

function Icon({ d }: { d: string }) {
  return (
    <svg className={styles.icon} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const ROTATE_LEFT = 'M3.5 6.5A5 5 0 1 1 3 9.5M3.5 6.5V3M3.5 6.5H7'
const ROTATE_RIGHT = 'M12.5 6.5A5 5 0 1 0 13 9.5M12.5 6.5V3M12.5 6.5H9'
const SEPARATE = 'M2.5 3.5h11M2.5 8h11M2.5 12.5h11'
const FLOOR = 'M1.5 9.5 8 6l6.5 3.5L8 13ZM8 2v2.5'
const CITY = 'M1.5 13.5h13M3 13.5V8h3v5.5M6 13.5V3.5h4v10M10 13.5V7h3v6.5'

/** Shows or hides the sketched streets, neighbours and traffic around the building. */
function CityToggle({ city, onCity }: Pick<Props, 'city' | 'onCity'>) {
  return (
    <button
      type="button"
      className={styles.ctlText}
      aria-pressed={city}
      aria-label="City"
      data-testid="city-toggle"
      title="Sketched streets and neighbours around the building"
      onClick={() => onCity(!city)}
    >
      <Icon d={CITY} />
      <span className={styles.ctlLabel}>City</span>
    </button>
  )
}

export function Controls3D({ rig, separated, onSeparate, floorView, onFloorView, city, onCity, onReset }: Props) {
  return (
    <div className={styles.controls} role="group" aria-label="3D view controls">
      <span className={styles.hint} aria-hidden="true">Drag to orbit · scroll to zoom</span>
      <div className={styles.ctlGroup}>
        <button type="button" className={styles.ctl} aria-label="Rotate left" title="Rotate left" onClick={() => rig.current?.rotate(-15)}>
          <Icon d={ROTATE_LEFT} />
        </button>
        <button type="button" className={styles.ctl} aria-label="Rotate right" title="Rotate right" onClick={() => rig.current?.rotate(15)}>
          <Icon d={ROTATE_RIGHT} />
        </button>
        <button type="button" className={styles.ctl} aria-label="Zoom out" title="Zoom out" onClick={() => rig.current?.zoom(1.18)}>
          <Icon d="M3.5 8h9" />
        </button>
        <button type="button" className={styles.ctl} aria-label="Zoom in" title="Zoom in" onClick={() => rig.current?.zoom(0.85)}>
          <Icon d="M3.5 8h9M8 3.5v9" />
        </button>
      </div>
      <button
        type="button"
        className={styles.ctlText}
        aria-pressed={separated}
        data-testid="separate-floors"
        onClick={() => onSeparate(!separated)}
      >
        <Icon d={SEPARATE} />
        Separate floors
      </button>
      <button
        type="button"
        className={styles.ctlText}
        aria-pressed={floorView}
        data-testid="floor-view"
        onClick={() => onFloorView(!floorView)}
      >
        <Icon d={FLOOR} />
        Floor view
      </button>
      <CityToggle city={city} onCity={onCity} />
      <button type="button" className={styles.ctlText} data-testid="reset-view" onClick={onReset}>
        Reset view
      </button>
    </div>
  )
}
