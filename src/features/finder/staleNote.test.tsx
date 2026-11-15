import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { initState } from '../../app/state/init'
import { StateProvider } from '../../app/state/StateProvider'
import type { RequirementDraft } from '../../app/state/types'
import { FormValidityProvider } from './FormValidityProvider'
import { MatchList } from './MatchList'
import { RequirementForm } from './RequirementForm'

const TODAY = '2026-11-15'

function renderBoth(req: Partial<RequirementDraft> = {}) {
  const base = initState('', null, TODAY)
  render(
    <StateProvider initialState={{ ...base, req: { ...base.req, ...req } }}>
      <FormValidityProvider>
        <RequirementForm />
        <MatchList />
      </FormValidityProvider>
    </StateProvider>,
  )
}

const note = () => screen.getByTestId('match-stale')

describe('stale results note', () => {
  it('is an empty polite live region while every field is valid', () => {
    renderBoth({ minSf: 10_000 })
    expect(note()).toHaveAttribute('role', 'status')
    expect(note()).toHaveAttribute('aria-live', 'polite')
    expect(note()).toBeEmptyDOMElement()
  })

  it.each(['0', 'abc', '1000001'])('min "%s" keeps the last results and says which requirement they are for', async (text) => {
    renderBoth({ minSf: 10_000 })
    const min = screen.getByTestId<HTMLInputElement>('req-min-sf')
    // Replace the text in one edit: clearing first would empty the field, which is valid and clears the search.
    min.focus()
    min.setSelectionRange(0, min.value.length)
    await userEvent.paste(text)
    expect(note()).toHaveTextContent('Showing results for 10,000 SF+. Fix the highlighted field to update.')
    expect(screen.getByTestId('match-1')).toHaveAttribute('data-key', 'odt-500')
  })

  it('a max below the min shows the note; fixing it clears the note and updates the results', async () => {
    renderBoth({ minSf: 10_000 })
    await userEvent.type(screen.getByTestId('req-max-sf'), '9000')
    expect(note()).toHaveTextContent('Showing results for 10,000 SF+.')
    await userEvent.clear(screen.getByTestId('req-max-sf'))
    await userEvent.type(screen.getByTestId('req-max-sf'), '10,300')
    expect(note()).toBeEmptyDOMElement()
    expect(screen.getByTestId('match-1')).toHaveAttribute('data-key', 'odt-500')
    expect(screen.queryByTestId('match-2')).toBeNull()
  })

  it('names the maximum size and rent when the shown results have them', async () => {
    renderBoth({ minSf: 10_000, maxSf: 12_000, maxRentPsf: 60 })
    await userEvent.type(screen.getByTestId('req-max-rent'), 'x')
    expect(note()).toHaveTextContent('Showing results for 10,000 to 12,000 SF, up to $60.00/SF. Fix the highlighted field to update.')
  })

  it('also sits above the no-fit panel', async () => {
    renderBoth({ minSf: 40_000 })
    await userEvent.type(screen.getByTestId('req-max-rent'), 'abc')
    expect(screen.getByTestId('no-fit')).toBeInTheDocument()
    expect(note()).toHaveTextContent('Showing results for 40,000 SF+.')
  })

  it('without a provider the list shows no note', () => {
    const base = initState('', null, TODAY)
    render(<StateProvider initialState={{ ...base, req: { ...base.req, minSf: 10_000 } }}><MatchList /></StateProvider>)
    expect(note()).toBeEmptyDOMElement()
  })
})
