import { createPortal } from 'react-dom'
import { FILE_ROW, splitErrors } from '../../domain/csv/limits'
import { formatNumber } from '../../domain/format'
import type { CsvError } from '../../domain/types'
import { DialogFrame } from '../shortlist/DialogFrame'
import dialog from '../shortlist/dialog.module.css'
import styles from './import.module.css'

type Props = { fileName: string; errors: readonly CsvError[]; onClose: () => void }

/**
 * The problems that stopped an import, by spreadsheet row and column. Rendered in a portal outside the app
 * shell, because DialogFrame makes the shell (which holds the header) inert. Every file value is plain text.
 */
export function ImportErrors({ fileName, errors, onClose }: Props) {
  const { shown, hidden } = splitErrors(errors)
  const count = errors.length === 1 ? '1 problem' : `${formatNumber(errors.length)} problems`
  return createPortal(
    <div className={dialog.backdrop}>
      <DialogFrame labelledBy="import-errors-title" onClose={onClose} className={`${dialog.dialog} ${styles.dialog}`}>
        <div data-testid="import-errors" className={dialog.inner}>
          <header className={dialog.head}>
            <h2 id="import-errors-title" className={`${dialog.title} ${styles.title}`}>Couldn&apos;t import {fileName}</h2>
            <button type="button" className={dialog.close} onClick={onClose}>Close</button>
          </header>
          <p className={styles.lede}>
            Nothing was imported: {count} found. Fix them in the spreadsheet, save it as CSV and import it again.
          </p>
          <div className={dialog.scroll}>
            <table className={styles.table}>
              <thead>
                <tr><th scope="col">Row</th><th scope="col">Column</th><th scope="col">Problem</th></tr>
              </thead>
              <tbody>
                {shown.map((e, i) => (
                  <tr key={i}>
                    <td className={styles.row}>{e.row === FILE_ROW ? 'Whole file' : e.row}</td>
                    <td className={styles.column}>{e.column ?? '–'}</td>
                    <td>{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hidden > 0 && (
              <p className={styles.more}>
                …and {formatNumber(hidden)} more {hidden === 1 ? 'problem' : 'problems'}. Fix these first, then import again to see the rest.
              </p>
            )}
          </div>
        </div>
      </DialogFrame>
    </div>,
    document.body,
  )
}
