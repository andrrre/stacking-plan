import { CSV_TEMPLATE } from '../../domain/csv/template'

export const TEMPLATE_FILE_NAME = 'stackmatch-template.csv'

/** Saves CSV_TEMPLATE as a file through a short-lived Blob URL. */
export function downloadTemplate(): void {
  const url = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = TEMPLATE_FILE_NAME
  document.body.append(a)
  a.click()
  a.remove()
  // Revoke on the next task: revoking synchronously can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
