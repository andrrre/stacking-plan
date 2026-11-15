import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { initState } from '../../app/state/init'
import type { Action } from '../../app/state/types'
import { AppStateContext } from '../../app/state/useAppState'
import { AskBox } from './AskBox'

vi.mock('./askService', () => ({
  askService: async () => {
    throw new Error('unexpected')
  },
}))

describe('AskBox when the service fails unexpectedly', () => {
  it('clears the busy state, dispatches nothing and says it could not read the text', async () => {
    const dispatch = vi.fn<(a: Action) => void>()
    render(
      <AppStateContext.Provider value={{ state: initState('', null, '2026-11-15'), dispatch }}>
        <AskBox />
      </AppStateContext.Provider>,
    )
    await userEvent.type(screen.getByTestId('ask-input'), '10k{Enter}')
    expect(await screen.findByTestId('ask-warning')).toHaveTextContent(/could not read/i)
    expect(screen.getByTestId('ask-submit')).toHaveTextContent('Ask')
    expect(screen.getByTestId('ask-submit')).toBeEnabled()
    expect(dispatch).not.toHaveBeenCalled()
  })
})
