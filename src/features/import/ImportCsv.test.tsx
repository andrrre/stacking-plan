import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StateProvider } from '../../app/state/StateProvider'
import { initState } from '../../app/state/init'
import { useAppState } from '../../app/state/useAppState'
import { CSV_COLUMNS } from '../../domain/csv/limits'
import { CSV_TEMPLATE } from '../../domain/csv/template'
import { ImportCsv } from './ImportCsv'

const HEADER = CSV_COLUMNS.join(',')

function Probe() {
  const { state } = useAppState()
  return <output data-testid="probe">{`${state.buildingId}|${state.importedBuildings.map((b) => b.id).join(',')}`}</output>
}

function setup() {
  render(
    <StateProvider initialState={initState('', null, '2026-11-15')}>
      <div data-print="shell"><ImportCsv /></div>
      <Probe />
    </StateProvider>,
  )
}

async function upload(text: string, name = 'stack.csv') {
  await userEvent.upload(screen.getByTestId('import-csv-input'), new File([text], name, { type: 'text/csv' }))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ImportCsv', () => {
  it('the button opens the hidden file input', async () => {
    setup()
    const input = screen.getByTestId('import-csv-input')
    const click = vi.spyOn(input, 'click')
    await userEvent.click(screen.getByRole('button', { name: 'Import CSV' }))
    expect(click).toHaveBeenCalledTimes(1)
    expect(input).toHaveAttribute('accept', expect.stringContaining('.csv'))
  })

  it('a valid file imports its building and selects it', async () => {
    setup()
    await upload(CSV_TEMPLATE)
    expect(await screen.findByTestId('probe')).toHaveTextContent('csv-coral-way-plaza|csv-coral-way-plaza')
    expect(screen.queryByTestId('import-errors')).toBeNull()
    expect(screen.getByText('Imported Coral Way Plaza.')).toHaveAttribute('role', 'status')
  })

  it('an invalid file imports nothing and lists row, column and message', async () => {
    setup()
    await upload(`${HEADER}\nBay House,5,500,4000,leasable,40,maybe,,,,,\n`, 'bad.csv')
    const dialog = await screen.findByTestId('import-errors')
    expect(screen.getByRole('dialog')).toHaveAccessibleName(/couldn.t import bad\.csv/i)
    expect(within(dialog).getByText(/Nothing was imported/)).toBeInTheDocument()
    const cells = within(dialog).getAllByRole('row')[1]
    expect(cells).toHaveTextContent(/^2\s*joins_next.*yes or no/)
    expect(screen.getByTestId('probe')).toHaveTextContent('odt|')
  })

  it('Close and Escape dismiss the error list', async () => {
    setup()
    await upload('nonsense')
    await userEvent.click(within(await screen.findByTestId('import-errors')).getByRole('button', { name: 'Close' }))
    expect(screen.queryByTestId('import-errors')).toBeNull()
    await upload('nonsense')
    await screen.findByTestId('import-errors')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByTestId('import-errors')).toBeNull()
  })

  it('shows the first 50 errors and counts the rest', async () => {
    setup()
    const rows = Array.from({ length: 53 }, (_, i) => `B,1,${i + 1},bad,leasable,1,no,,,,,`)
    await upload([HEADER, ...rows].join('\n'))
    const dialog = await screen.findByTestId('import-errors')
    expect(within(dialog).getAllByRole('row')).toHaveLength(51)
    expect(dialog).toHaveTextContent('…and 3 more problems')
  })

  it('labels whole-file problems and renders hostile text literally', async () => {
    setup()
    const evil = '<img src=x onerror=alert(1)>'
    await upload(`${HEADER.replace('vacating', evil)}\n`, `${evil}.csv`)
    const dialog = await screen.findByTestId('import-errors')
    expect(dialog.querySelector('img')).toBeNull()
    expect(screen.getByRole('dialog')).toHaveAccessibleName(`Couldn't import ${evil}.csv`)
    expect(dialog).toHaveTextContent(`"${evil}" is not a column`)
    await upload('PK\u0003\u0004\u0000')
    expect(await screen.findByText('Whole file')).toBeInTheDocument()
  })

  it('downloads the template through a Blob URL that is revoked afterwards', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const create = vi.fn<(b: Blob) => string>(() => 'blob:template')
    const revoke = vi.fn()
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke })
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    setup()
    screen.getByTestId('import-template').click()
    expect(anchorClick).toHaveBeenCalledTimes(1)
    const anchor = anchorClick.mock.contexts[0] as HTMLAnchorElement
    expect(anchor.download).toBe('stackmatch-template.csv')
    expect(anchor.href).toBe('blob:template')
    expect(await (create.mock.calls[0]?.[0] as Blob).text()).toBe(CSV_TEMPLATE)
    vi.runAllTimers()
    expect(revoke).toHaveBeenCalledWith('blob:template')
    vi.useRealTimers()
  })
})
