import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AppStateContext } from '../../app/state/useAppState'
import type { Action, AppState } from '../../app/state/types'
import { DateSlider } from './DateSlider'

const TODAY = '2026-11-15'

function renderSlider(asOf: string) {
  const dispatch = vi.fn<(a: Action) => void>()
  const state = { today: TODAY, asOf } as AppState
  render(
    <AppStateContext.Provider value={{ state, dispatch }}>
      <DateSlider />
    </AppStateContext.Provider>,
  )
  return dispatch
}

describe('DateSlider', () => {
  it('is a 0..60 range with step 1 and an accessible name', () => {
    renderSlider(TODAY)
    const slider = screen.getByTestId('date-slider')
    expect(slider).toHaveAttribute('type', 'range')
    expect(slider).toHaveAttribute('min', '0')
    expect(slider).toHaveAttribute('max', '60')
    expect(slider).toHaveAttribute('step', '1')
    expect(slider).toHaveAccessibleName('As of date')
  })

  it('reads Today at step 0', () => {
    renderSlider(TODAY)
    expect(screen.getByTestId('date-slider')).toHaveAttribute('aria-valuetext', 'Today')
    expect(screen.getByTestId('date-label')).toHaveTextContent(/^Today · Nov 2026$/)
    expect(screen.getByTestId('date-slider')).toHaveValue('0')
  })

  it('reads May 2027 at the 2027-05-01 step', () => {
    renderSlider('2027-05-01')
    expect(screen.getByTestId('date-slider')).toHaveAttribute('aria-valuetext', 'May 2027')
    expect(screen.getByTestId('date-slider')).toHaveValue('6')
    expect(screen.getByTestId('date-label')).toHaveTextContent('May 2027')
  })

  it('reads Nov 2031 at step 60', () => {
    renderSlider('2031-11-01')
    expect(screen.getByTestId('date-slider')).toHaveAttribute('aria-valuetext', 'Nov 2031')
    expect(screen.getByTestId('date-slider')).toHaveValue('60')
  })

  it('dispatches asOf/set with the slider date on change', () => {
    const dispatch = renderSlider(TODAY)
    fireEvent.change(screen.getByTestId('date-slider'), { target: { value: '8' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'asOf/set', asOf: '2027-07-01' })
  })

  it('Today resets to today', () => {
    const dispatch = renderSlider('2027-07-01')
    fireEvent.click(screen.getByTestId('date-today'))
    expect(dispatch).toHaveBeenCalledWith({ type: 'asOf/set', asOf: TODAY })
  })

  it('marks Today aria-disabled and inert while already at today', () => {
    const dispatch = renderSlider(TODAY)
    const button = screen.getByTestId('date-today')
    expect(button).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(button)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('keeps focus on Today after it is activated', () => {
    renderSlider('2027-07-01')
    const button = screen.getByTestId('date-today')
    button.focus()
    fireEvent.click(button)
    expect(button).toHaveFocus()
  })
})
