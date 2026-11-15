import { describe, it, expect, vi } from 'vitest'
import { createEvent, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ColourModeToggle } from './ColourModeToggle'

describe('ColourModeToggle', () => {
  it('is a radio group with the current mode checked', () => {
    render(<ColourModeToggle mode="risk" onChange={() => undefined} />)
    expect(screen.getByRole('radiogroup', { name: 'Colour mode' })).toBeInTheDocument()
    expect(screen.getByTestId('mode-risk')).toBeChecked()
    expect(screen.getByTestId('mode-availability')).not.toBeChecked()
  })

  it('click and arrow keys choose a mode', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ColourModeToggle mode="availability" onChange={onChange} />)
    await user.click(screen.getByTestId('mode-risk'))
    expect(onChange).toHaveBeenLastCalledWith('risk')
    screen.getByTestId('mode-availability').focus()
    await user.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith('risk')
  })

  it('ignores arrow keys with a modifier and leaves them to the browser', () => {
    const onChange = vi.fn()
    render(<ColourModeToggle mode="availability" onChange={onChange} />)
    const button = screen.getByTestId('mode-availability')
    for (const mod of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey']) {
      const event = createEvent.keyDown(button, { key: 'ArrowLeft', [mod]: true })
      fireEvent(button, event)
      expect(event.defaultPrevented, mod).toBe(false)
    }
    expect(onChange).not.toHaveBeenCalled()
  })
})
