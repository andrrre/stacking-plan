import { describe, it, expect, vi } from 'vitest'
import { CSV_TEMPLATE } from '../../domain/csv/template'
import { MAX_BYTES } from '../../domain/csv/limits'
import { readCsvFile } from './readCsvFile'

describe('readCsvFile', () => {
  it('parses a valid file against the existing ids', async () => {
    const r = await readCsvFile(new File([CSV_TEMPLATE], 'template.csv'), ['csv-coral-way-plaza'])
    expect(r.ok && r.buildings.map((b) => b.id)).toEqual(['csv-coral-way-plaza-2'])
  })

  it('rejects a file over 1 MB without reading it', async () => {
    const text = vi.fn(async () => '')
    const r = await readCsvFile({ size: MAX_BYTES + 1, text }, [])
    expect(text).not.toHaveBeenCalled()
    expect(!r.ok && r.errors).toEqual([expect.objectContaining({ row: 0, column: null, message: expect.stringMatching(/1 MB/) })])
  })

  it('reports a read failure as an error instead of throwing', async () => {
    const r = await readCsvFile({ size: 10, text: async () => { throw new Error('denied') } }, [])
    expect(!r.ok && r.errors[0]).toMatchObject({ row: 0, column: null })
  })

  it('rejects binary content such as a renamed .xlsx', async () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00, 0xff, 0xfe])
    const r = await readCsvFile(new File([zip], 'book.csv'), [])
    expect(!r.ok && r.errors[0]?.message).toMatch(/Excel/)
  })
})
