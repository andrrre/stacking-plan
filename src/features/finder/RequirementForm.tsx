import { useId, useState, type ChangeEvent } from 'react'
import type { RequirementDraft } from '../../app/state/types'
import { useAppState } from '../../app/state/useAppState'
import { formatNumber } from '../../domain/format'
import styles from './RequirementForm.module.css'

// Spec A13: minSf integer 1..1,000,000 typed as "10000", "10,000" or "10k"; maxSf ≥ minSf; maxRentPsf 1..1,000.

type FieldKey = 'min' | 'max' | 'rent'
type Drafts = Record<FieldKey, string>
type Errors = Partial<Record<FieldKey, string>>
type Values = Pick<RequirementDraft, 'minSf' | 'maxSf' | 'maxRentPsf'>
type Parsed = { value: number | null } | { error: string }

const MAX_SF = 1_000_000
const SIZE_ERROR = 'Enter a whole number of SF between 1 and 1,000,000.'
const RENT_ERROR = 'Enter a rent between $1 and $1,000 per SF per year.'
const EMPTY: Drafts = { min: '', max: '', rent: '' }

// Digits, or digits in comma thousands groups; then an optional decimal part and an optional "k".
const SIZE_PATTERN = /^(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(k?)$/

function parseSize(text: string): Parsed {
  const t = text.trim().toLowerCase()
  if (t === '') return { value: null }
  const m = SIZE_PATTERN.exec(t)
  if (!m) return { error: SIZE_ERROR }
  const x = Number(`${(m[1] ?? '').replace(/,/g, '')}${m[2] ?? ''}`) * (m[3] ? 1000 : 1)
  const n = Math.round(x) // "16.1k" is 16100.000000000002 in floating point
  return Math.abs(x - n) < 1e-6 && n >= 1 && n <= MAX_SF ? { value: n } : { error: SIZE_ERROR }
}

function parseRent(text: string): Parsed {
  const t = text.trim().replace(/^\$/, '')
  if (t === '') return { value: null }
  const n = /^\d+(?:\.\d+)?$/.test(t) ? Number(t) : NaN
  return n >= 1 && n <= 1000 ? { value: n } : { error: RENT_ERROR }
}

const valueOf = (p: Parsed) => ('value' in p ? p.value : null)

function validate(d: Drafts): { errors: Errors; values: Values } {
  const min = parseSize(d.min)
  const max = parseSize(d.max)
  const rent = parseRent(d.rent)
  const values = { minSf: valueOf(min), maxSf: valueOf(max), maxRentPsf: valueOf(rent) }
  const below = values.minSf !== null && values.maxSf !== null && values.maxSf < values.minSf
  const errors: Errors = {
    ...('error' in min && { min: min.error }),
    ...('error' in max && { max: max.error }),
    ...(below && { max: 'Must be at least the minimum.' }),
    ...('error' in rent && { rent: rent.error }),
  }
  return { errors, values }
}

const sizeText = (n: number | null) => (n === null ? '' : formatNumber(n))
const rentText = (n: number | null) => (n === null ? '' : String(n))
const draftsOf = (r: RequirementDraft): Drafts => ({ min: sizeText(r.minSf), max: sizeText(r.maxSf), rent: rentText(r.maxRentPsf) })

/** After the requirement changes from outside (Ask, Clear), show it, but keep text that already means the same value. */
function syncDrafts(d: Drafts, prev: RequirementDraft, next: RequirementDraft): Drafts {
  const keep = (field: keyof Values, parsed: Parsed) => prev[field] === next[field] || valueOf(parsed) === next[field]
  const shown = draftsOf(next)
  return {
    min: keep('minSf', parseSize(d.min)) ? d.min : shown.min,
    max: keep('maxSf', parseSize(d.max)) ? d.max : shown.max,
    rent: keep('maxRentPsf', parseRent(d.rent)) ? d.rent : shown.rent,
  }
}

type FieldProps = {
  id: string; label: string; hint?: string; value: string; placeholder: string; error?: string; testId: string
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
}

function Field({ id, label, hint, value, placeholder, error, testId, onChange }: FieldProps) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>{label}{hint && <span className={styles.hint}> {hint}</span>}</label>
      <input
        id={id} type="text" inputMode="text" autoComplete="off" className={styles.input} data-testid={testId}
        value={value} placeholder={placeholder} onChange={onChange}
        aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && <p id={`${id}-error`} className={styles.error} role="status" aria-live="polite">{error}</p>}
    </div>
  )
}

export function RequirementForm() {
  const { state, dispatch } = useAppState()
  const { req } = state
  const id = useId()
  const [drafts, setDrafts] = useState<Drafts>(() => draftsOf(req))
  const [prevReq, setPrevReq] = useState(req)
  if (prevReq !== req) {
    setPrevReq(req)
    setDrafts(syncDrafts(drafts, prevReq, req))
  }
  const { errors } = validate(drafts)

  const onField = (k: FieldKey) => (e: ChangeEvent<HTMLInputElement>) => {
    const next = { ...drafts, [k]: e.target.value }
    setDrafts(next)
    const v = validate(next)
    const changed = v.values.minSf !== req.minSf || v.values.maxSf !== req.maxSf || v.values.maxRentPsf !== req.maxRentPsf
    if (Object.keys(v.errors).length === 0 && changed) dispatch({ type: 'req/set', patch: v.values })
  }
  const onClear = () => {
    setDrafts(EMPTY)
    dispatch({ type: 'req/clear' })
  }

  return (
    <form className={styles.form} role="search" aria-label="Space requirement" onSubmit={(e) => e.preventDefault()} noValidate>
      <h2 className={styles.heading}>Find space</h2>
      <Field id={`${id}-min`} label="Minimum size" hint="SF" testId="req-min-sf" value={drafts.min} placeholder="e.g. 10,000" error={errors.min} onChange={onField('min')} />
      <div className={styles.pair}>
        <Field id={`${id}-max`} label="Maximum size" hint="SF" testId="req-max-sf" value={drafts.max} placeholder="Optional" error={errors.max} onChange={onField('max')} />
        <Field id={`${id}-rent`} label="Max rent" hint="$/SF/yr" testId="req-max-rent" value={drafts.rent} placeholder="Optional" error={errors.rent} onChange={onField('rent')} />
      </div>
      <label className={styles.check}>
        <input type="checkbox" data-testid="req-include-potential" checked={req.includePotential}
          onChange={(e) => dispatch({ type: 'req/set', patch: { includePotential: e.target.checked } })} />
        Include potential space
      </label>
      <button type="button" className={styles.clear} data-testid="req-clear" onClick={onClear}>Clear</button>
    </form>
  )
}
