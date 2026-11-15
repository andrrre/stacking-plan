import type { KeyboardEvent } from 'react'
import type { ColourMode } from '../../app/state/types'
import styles from './risk.module.css'

const OPTIONS: ReadonlyArray<{ mode: ColourMode; label: string }> = [
  { mode: 'availability', label: 'Availability' },
  { mode: 'risk', label: 'Lease risk' },
]

type Props = { mode: ColourMode; onChange: (mode: ColourMode) => void }

/** Two-option radio group: roving tabindex, arrows move and select (WAI-ARIA radio pattern). */
export function ColourModeToggle({ mode, onChange }: Props) {
  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) return
    e.preventDefault()
    const next: ColourMode = mode === 'risk' ? 'availability' : 'risk' // two options: any arrow moves to the other
    onChange(next)
    e.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-mode="${next}"]`)?.focus()
  }

  return (
    <div className={styles.group} role="radiogroup" aria-label="Colour mode">
      {OPTIONS.map((o) => (
        <button
          key={o.mode}
          type="button"
          role="radio"
          aria-checked={mode === o.mode}
          tabIndex={mode === o.mode ? 0 : -1}
          data-mode={o.mode}
          data-testid={`mode-${o.mode}`}
          className={styles.option}
          onClick={() => onChange(o.mode)}
          onKeyDown={onKeyDown}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
