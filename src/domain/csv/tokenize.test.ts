import { describe, it, expect } from 'vitest'
import { tokenizeCsv } from './tokenize'

function cells(text: string): string[][] {
  const r = tokenizeCsv(text, 100)
  if (!r.ok) throw new Error(r.error.message)
  return r.records.map((rec) => rec.cells)
}

describe('tokenizeCsv (RFC 4180)', () => {
  it('splits plain fields and LF rows', () => {
    expect(cells('a,b,c\n1,2,3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']])
  })

  it('accepts CRLF and ignores one trailing newline', () => {
    expect(cells('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']])
    expect(cells('a,b\n1,2\n')).toEqual([['a', 'b'], ['1', '2']])
  })

  it('reads quoted commas, escaped quotes and newlines inside quotes', () => {
    expect(cells('"Kestrel & Pine, CPAs","say ""hi""","two\nlines"')).toEqual([
      ['Kestrel & Pine, CPAs', 'say "hi"', 'two\nlines'],
    ])
    expect(cells('"a\r\nb",c')).toEqual([['a\r\nb', 'c']])
  })

  it('keeps empty fields, including a trailing empty field', () => {
    expect(cells('a,,c,\n,,,')).toEqual([['a', '', 'c', ''], ['', '', '', '']])
    expect(cells('""')).toEqual([['']])
  })

  it('numbers records spreadsheet-style, so a quoted newline does not shift later rows', () => {
    const r = tokenizeCsv('h\n"x\ny"\nz', 100)
    expect(r.ok && r.records.map((rec) => rec.row)).toEqual([1, 2, 3])
  })

  it('reports an unclosed quote at the row where the quoted cell starts', () => {
    const r = tokenizeCsv('h\nok\n"never closed\nmore', 100)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toMatchObject({ row: 3, column: null })
    expect(!r.ok && r.error.message).toMatch(/quote/i)
  })

  it('reports text after a closing quote', () => {
    const r = tokenizeCsv('h\n"ab"c', 100)
    expect(!r.ok && r.error).toMatchObject({ row: 2, column: null })
  })

  it('stops once more than maxRecords records are read', () => {
    const r = tokenizeCsv('a\nb\nc\nd\ne', 3)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error.message).toMatch(/rows/i)
  })

  it('returns no records for empty text', () => {
    expect(cells('')).toEqual([])
  })
})
