import { useEffect, useId, useRef, useState, type FormEvent, type SyntheticEvent } from 'react'
import { selectBuilding } from '../../app/state/selectBuilding'
import { selectBaseBuilding } from '../../app/state/selectors'
import { useAppState } from '../../app/state/useAppState'
import { formatLongDate, formatSf, suitesLabel } from '../../domain/format'
import { applyScenario, findLease } from '../../domain/scenario'
import type { Building, Change } from '../../domain/types'
import { parseForm, toForm, type ChangeForm } from './changeForm'
import styles from './ChangeDialog.module.css'

type Props = { initial: Change; onClose: (applied: boolean) => void }

type Heading = { title: string; sub: string; hint?: string }

function heading(b: Building, c: Change): Heading {
  if (c.kind === 'newLease') {
    const suites = b.floors.flatMap((f) => f.suites).filter((s) => c.suiteIds.includes(s.id))
    const numbers = suites.map((s) => s.number)
    const area = suites.reduce((sum, s) => sum + s.areaSf, 0)
    return { title: 'New lease', sub: `${suitesLabel(numbers)} · ${formatSf(area)}` }
  }
  const loc = findLease(b, c.leaseId)
  const sub = loc ? `${loc.lease.tenant} · ${suitesLabel([loc.suite.number])}` : ''
  const term = loc ? `Lease ${formatLongDate(loc.lease.start)} → ${loc.lease.end ? formatLongDate(loc.lease.end) : 'no end date'}` : undefined
  return { title: c.kind === 'renew' ? 'Renew lease' : 'Vacate', sub, hint: term }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      {children}
    </label>
  )
}

type Setter = (key: keyof ChangeForm) => (e: React.ChangeEvent<HTMLInputElement>) => void

function Fields({ kind, form, set }: { kind: Change['kind']; form: ChangeForm; set: Setter }) {
  if (kind !== 'newLease') {
    return (
      <Field label={kind === 'renew' ? 'New end date' : 'Vacate on'}>
        <input className={styles.input} type="date" value={form.date} onChange={set('date')} />
      </Field>
    )
  }
  return (
    <>
      <Field label="Tenant"><input className={styles.input} value={form.tenant} onChange={set('tenant')} /></Field>
      <div className={styles.pair}>
        <Field label="Start"><input className={styles.input} type="date" value={form.start} onChange={set('start')} /></Field>
        <Field label="End"><input className={styles.input} type="date" value={form.end} onChange={set('end')} /></Field>
      </div>
      <Field label="Rent ($/SF/yr)">
        <input className={styles.input} inputMode="decimal" value={form.rent} onChange={set('rent')} />
      </Field>
    </>
  )
}

/** Opens itself modally; Escape or Cancel closes without applying and focus goes back to the opener. */
function useModal(onClose: Props['onClose']) {
  const ref = useRef<HTMLDialogElement>(null)
  const returnTo = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return undefined
    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!d.open) d.showModal()
    return () => { if (d.open) d.close() }
  }, [])
  const finish = (applied: boolean) => {
    ref.current?.close()
    if (returnTo.current?.isConnected) returnTo.current.focus()
    onClose(applied)
  }
  return { ref, finish }
}

/** Renew, vacate or new lease, validated against the whole scenario before it is added (spec-technical §5.5). */
export function ChangeDialog({ initial, onClose }: Props) {
  const { state, dispatch } = useAppState()
  const { ref, finish } = useModal(onClose)
  const [form, setForm] = useState<ChangeForm>(() => toForm(initial))
  const [error, setError] = useState<string | null>(null)
  const id = useId()
  const h = heading(selectBuilding(state), initial)

  const set: Setter = (key) => (e) => {
    const { value } = e.target
    setForm((f) => ({ ...f, [key]: value }))
    setError(null)
  }
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const parsed = parseForm(initial, form)
    if (!parsed.ok) return setError(parsed.message)
    const r = applyScenario(selectBaseBuilding(state), [...state.changes, parsed.change])
    if (!r.ok) return setError(r.error.message)
    dispatch({ type: 'scenario/add', change: parsed.change })
    finish(true)
  }
  const onCancel = (e: SyntheticEvent) => {
    e.preventDefault()
    finish(false)
  }

  return (
    <dialog ref={ref} className={styles.dialog} data-testid="change-dialog" aria-labelledby={`${id}-title`} onCancel={onCancel}>
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <header>
          <h2 id={`${id}-title`} className={styles.title}>{h.title}</h2>
          <p className={styles.sub}>{h.sub}</p>
          {h.hint && <p className={styles.hint}>{h.hint}</p>}
        </header>
        <Fields kind={initial.kind} form={form} set={set} />
        {error !== null && <p className={styles.error} data-testid="change-error" role="alert">{error}</p>}
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={() => finish(false)}>Cancel</button>
          <button type="submit" className={styles.primary} data-testid="change-submit">Add to scenario</button>
        </div>
      </form>
    </dialog>
  )
}
