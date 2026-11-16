import { useEffect } from 'react'
import { afterEach, describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { initState } from '../../app/state/init'
import { StateProvider } from '../../app/state/StateProvider'
import type { AppState } from '../../app/state/types'
import { useAppState } from '../../app/state/useAppState'
import { moveChanges } from '../../domain/makeRoom'
import { MatchList } from './MatchList'

const TODAY = '2026-11-15'

const seen: { state: AppState | null } = { state: null }
function StateProbe() {
  const { state } = useAppState()
  useEffect(() => { seen.state = state })
  return null
}
const latest = () => {
  if (!seen.state) throw new Error('state not rendered')
  return seen.state
}

function renderFinder(minSf: number) {
  const base = initState('', null, TODAY)
  render(
    <StateProvider initialState={{ ...base, req: { ...base.req, minSf } }}>
      <MatchList />
      <StateProbe />
    </StateProvider>,
  )
}

afterEach(() => localStorage.clear())

describe('MakeRoom', () => {
  it('12,000 SF: one option with the three lines', () => {
    renderFinder(12_000)
    const options = screen.getAllByTestId('move-option')
    expect(options).toHaveLength(1)
    expect(options[0]).toHaveTextContent('Move Northpier Engineering (2,150 SF) from Suite 510 to Suite 410 (4,000 SF).')
    expect(options[0]).toHaveTextContent('12,400 SF on floor 5')
    expect(options[0]).toHaveTextContent('Assumes Northpier Engineering agrees to relocate.')
  })

  it('no options: the section is not rendered', () => {
    renderFinder(20_000)
    expect(screen.queryByTestId('make-room')).toBeNull()
    expect(screen.getAllByTestId('no-fit-reason').length).toBeGreaterThan(0)
  })

  it('Show move sets the preview, pressing it again clears it', async () => {
    renderFinder(12_000)
    const button = screen.getByTestId('show-move')
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(button).toHaveTextContent('Show move')

    await userEvent.click(button)
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(button).toHaveTextContent('Hide move')
    expect(latest().movePreview?.lease.tenant).toBe('Northpier Engineering')
    expect(latest().changes).toEqual([])

    await userEvent.click(button)
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(latest().movePreview).toBeNull()
    expect(latest().changes).toEqual([])
  })

  it('Apply as scenario adds the two changes and the freed block becomes match 1', async () => {
    renderFinder(12_000)
    await userEvent.click(screen.getByTestId('show-move'))
    const option = latest().movePreview
    if (!option) throw new Error('preview not set')
    expect(screen.getByTestId('apply-move')).toHaveAttribute('data-focus-next', 'list')

    await userEvent.click(screen.getByTestId('apply-move'))
    expect(latest().changes).toEqual(moveChanges(option, latest().asOf))
    expect(latest().movePreview).toBeNull()
    expect(screen.getByTestId('match-1')).toHaveTextContent('Suites 500 + 510')
  })
})
