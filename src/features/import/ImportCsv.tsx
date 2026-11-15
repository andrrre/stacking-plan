import { useRef, useState, type ChangeEvent } from 'react'
import { selectBuildings } from '../../app/state/selectors'
import { useAppState } from '../../app/state/useAppState'
import type { CsvError } from '../../domain/types'
import { downloadTemplate } from './downloadTemplate'
import { ImportErrors } from './ImportErrors'
import { readCsvFile } from './readCsvFile'
import styles from './import.module.css'

type Props = { buttonClassName?: string }
type Failure = { fileName: string; errors: CsvError[] }

/** Header control: "Import CSV" opens the file picker; "CSV template" downloads an example file. */
export function ImportCsv({ buttonClassName }: Props) {
  const { state, dispatch } = useAppState()
  const input = useRef<HTMLInputElement>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [status, setStatus] = useState('')

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // picking the same file again fires change again
    if (!file) return
    const result = await readCsvFile(file, selectBuildings(state).map((b) => b.id))
    if (!result.ok) {
      setStatus('')
      setFailure({ fileName: file.name, errors: result.errors })
      return
    }
    setFailure(null)
    setStatus(`Imported ${result.buildings.map((b) => b.name).join(', ')}.`)
    dispatch({ type: 'building/import', buildings: result.buildings })
  }

  return (
    <div className={styles.control}>
      <button type="button" className={buttonClassName} data-testid="import-csv-button" onClick={() => input.current?.click()}>
        Import CSV
      </button>
      <input
        ref={input} type="file" accept=".csv,text/csv" hidden data-testid="import-csv-input"
        aria-label="CSV file to import" onChange={onFile}
      />
      <button
        type="button" className={styles.template} data-testid="import-template"
        title="Download a CSV template: one row per lease" onClick={downloadTemplate}
      >
        CSV template
      </button>
      <span role="status" className={styles.srOnly}>{status}</span>
      {failure && <ImportErrors fileName={failure.fileName} errors={failure.errors} onClose={() => setFailure(null)} />}
    </div>
  )
}
