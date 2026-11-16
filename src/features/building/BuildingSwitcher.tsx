import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { BUNDLED_BUILDINGS } from '../../data'
import { selectBaseBuilding, selectBuildings } from '../../app/state/selectors'
import { useAppState } from '../../app/state/useAppState'
import styles from './BuildingSwitcher.module.css'

type RemoveProps = { name: string; onRemove: () => void }

/** Two steps so one click cannot delete the broker's data; Cancel or Escape returns focus to the Remove button. */
function RemoveImported({ name, onRemove }: RemoveProps) {
  const [confirming, setConfirming] = useState(false)
  const removeButton = useRef<HTMLButtonElement>(null)
  const cancelled = useRef(false)
  useEffect(() => {
    if (confirming || !cancelled.current) return
    cancelled.current = false
    removeButton.current?.focus()
  }, [confirming])
  const cancel = () => {
    cancelled.current = true
    setConfirming(false)
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    e.stopPropagation()
    cancel()
  }

  if (!confirming) {
    return (
      <button
        ref={removeButton} type="button" className={styles.remove} data-testid="building-remove"
        aria-label={`Remove ${name}`} onClick={() => setConfirming(true)}
      >
        Remove
      </button>
    )
  }
  return (
    <span className={styles.confirm} role="group" aria-label={`Confirm removing ${name}`} onKeyDown={onKeyDown}>
      <span className={styles.question}>Remove {name} and its saved options?</span>
      <button
        type="button" className={styles.danger} data-testid="building-remove-confirm"
        aria-label={`Yes, remove ${name}`} onClick={onRemove} autoFocus
      >
        Yes, remove
      </button>
      <button type="button" className={styles.remove} data-testid="building-remove-cancel" onClick={cancel}>Cancel</button>
    </span>
  )
}

export function BuildingSwitcher() {
  const { state, dispatch } = useAppState()
  const select = useRef<HTMLSelectElement>(null)
  const current = selectBaseBuilding(state)
  const imported = !BUNDLED_BUILDINGS.some((b) => b.id === current.id)

  const remove = () => {
    dispatch({ type: 'building/remove', buildingId: current.id })
    select.current?.focus()
  }

  return (
    <span className={styles.switcher}>
      <span className={styles.pick}>
        <select
          ref={select}
          className={styles.select}
          data-testid="building-switcher"
          aria-label="Building"
          value={state.buildingId}
          onChange={(e) => dispatch({ type: 'building/set', buildingId: e.target.value })}
        >
          {selectBuildings(state).map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <svg className={styles.chevron} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </span>
      {imported && <RemoveImported key={current.id} name={current.name} onRemove={remove} />}
    </span>
  )
}
