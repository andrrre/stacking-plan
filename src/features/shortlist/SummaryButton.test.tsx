import { describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { initState } from '../../app/state/init'
import type { Action, AppState } from '../../app/state/types'
import { AppStateContext } from '../../app/state/useAppState'
import { BUNDLED_BUILDINGS } from '../../data'
import { findFits } from '../../domain/findFits'
import type { Candidate } from '../../domain/types'
import { createEntry } from './entryId'
import { SummaryButton } from './SummaryButton'

const TODAY = '2026-11-15'
const hero = BUNDLED_BUILDINGS[0]
const match = findFits(hero, { minSf: 10_000, includePotential: false }, TODAY, TODAY)[0] as Candidate

function renderButton(over: Partial<AppState> = {}) {
  const state: AppState = { ...initState('', null, TODAY), ...over }
  const dispatch = vi.fn<(a: Action) => void>()
  render(
    <AppStateContext.Provider value={{ state, dispatch }}>
      <SummaryButton />
    </AppStateContext.Provider>,
  )
  return { dispatch, button: screen.getByTestId('open-summary') }
}

describe('SummaryButton', () => {
  it('with an empty shortlist stays focusable, is aria-disabled and described by a tooltip saying how to fill it', () => {
    const { button } = renderButton()
    expect(button).not.toHaveAttribute('disabled')
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).not.toHaveAttribute('title')
    const tip = screen.getByRole('tooltip', { hidden: true })
    expect(button).toHaveAttribute('aria-describedby', tip.id)
    expect(tip).toHaveTextContent('Save a match to the shortlist, or add a suite from its details, to build a client summary.')
  })

  it('a click while empty does nothing', async () => {
    const { button, dispatch } = renderButton()
    await userEvent.click(button)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('the tooltip shows on hover and on keyboard focus, and goes on leaving, blurring or Escape', async () => {
    const { button } = renderButton()
    const tip = screen.getByRole('tooltip', { hidden: true })
    expect(tip).toHaveAttribute('data-open', 'false')
    fireEvent.mouseEnter(button.parentElement as HTMLElement)
    expect(tip).toHaveAttribute('data-open', 'true')
    fireEvent.mouseLeave(button.parentElement as HTMLElement)
    expect(tip).toHaveAttribute('data-open', 'false')
    await userEvent.tab()
    expect(button).toHaveFocus()
    expect(tip).toHaveAttribute('data-open', 'true')
    await userEvent.keyboard('{Escape}')
    expect(tip).toHaveAttribute('data-open', 'false')
    await userEvent.tab()
    await userEvent.tab({ shift: true })
    expect(tip).toHaveAttribute('data-open', 'true')
    act(() => button.blur())
    expect(tip).toHaveAttribute('data-open', 'false')
  })

  it('Escape that closes the tooltip is handled, so presentation mode is not ended by the same key', async () => {
    renderButton()
    await userEvent.tab()
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    document.activeElement?.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('with something saved there is no tooltip and the button opens the summary', async () => {
    const { button, dispatch } = renderButton({ shortlist: [createEntry(hero.id, match, TODAY, false)] })
    expect(button).not.toHaveAttribute('aria-disabled')
    expect(button).not.toHaveAttribute('aria-describedby')
    expect(screen.queryByRole('tooltip', { hidden: true })).toBeNull()
    await userEvent.click(button)
    expect(dispatch).toHaveBeenCalledWith({ type: 'overlay/set', overlay: 'summary' })
  })
})
