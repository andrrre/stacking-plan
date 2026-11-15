import type { KeyboardEvent } from 'react'
import type { ViewMode } from '../../app/state/types'
import styles from '../risk/risk.module.css'

const OPTIONS: ReadonlyArray<{ view: ViewMode; label: string; testId: string }> = [
  { view: 'stack', label: '2D stack', testId: 'view-stack' },
  { view: '3d', label: '3D view', testId: 'view-3d' },
]

type Props = { view: ViewMode; onChange: (view: ViewMode) => void }

/** Two-option radio group beside the colour-mode toggle: roving tabindex, arrows move and select. */
export function ViewToggle({ view, onChange }: Props) {
  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) return
    e.preventDefault()
    const next: ViewMode = view === '3d' ? 'stack' : '3d' // two options: any arrow moves to the other
    onChange(next)
    e.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-view="${next}"]`)?.focus()
  }

  return (
    <div className={styles.group} role="radiogroup" aria-label="View">
      {OPTIONS.map((o) => (
        <button
          key={o.view}
          type="button"
          role="radio"
          aria-checked={view === o.view}
          tabIndex={view === o.view ? 0 : -1}
          data-view={o.view}
          data-testid={o.testId}
          className={styles.option}
          onClick={() => onChange(o.view)}
          onKeyDown={onKeyDown}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
