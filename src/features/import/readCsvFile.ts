import { FILE_ROW, MAX_BYTES, TOO_BIG_MESSAGE } from '../../domain/csv/limits'
import { parseCsv } from '../../domain/csv/parseCsv'
import type { CsvResult } from '../../domain/types'

type CsvFile = Pick<File, 'size' | 'text'>

const fileError = (message: string): CsvResult => ({ ok: false, errors: [{ row: FILE_ROW, column: null, message }] })

/** Size first (the file is never read when over 1 MB), then read as UTF-8 and parse; never throws. */
export async function readCsvFile(file: CsvFile, existingIds: readonly string[]): Promise<CsvResult> {
  if (file.size > MAX_BYTES) return fileError(TOO_BIG_MESSAGE)
  try {
    return parseCsv(await file.text(), existingIds)
  } catch {
    return fileError('The file could not be read. Check that it is still on your computer and try again.')
  }
}
