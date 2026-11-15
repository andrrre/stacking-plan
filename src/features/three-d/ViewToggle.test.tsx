import { describe, it, expect, vi } from 'vitest'
import { createEvent, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ViewToggle } from './ViewToggle'

describe('ViewToggle', () => {
  it('is a radio group with the current view checked', () => {
    render(<ViewToggle view="3d" onChange={() => undefined} />)
    expect(screen.getByRole('radiogroup', { name: 'View' })).toBeInTheDocument()
    expect(screen.getByTestId('view-3d')).toBeChecked()
    expect(screen.getByTestId('view-stack')).not.toBeChecked()
    expect(screen.getByTestId('view-3d')).toHaveAttribute('tabindex', '0')
    expect(screen.getByTestId('view-stack')).toHaveAttribute('tabindex', '-1')
  })

  it('click and arrow keys choose a view and move focus', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ViewToggle view="stack" onChange={onChange} />)
    await user.click(screen.getByTestId('view-3d'))
    expect(onChange).toHaveBeenLastCalledWith('3d')
    screen.getByTestId('view-stack').focus()
    await user.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith('3d')
    expect(screen.getByTestId('view-3d')).toHaveFocus()
  })

  it('ignores arrow keys with a modifier and leaves them to the browser', () => {
    const onChange = vi.fn()
    render(<ViewToggle view="stack" onChange={onChange} />)
    const button = screen.getByTestId('view-stack')
    for (const mod of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey']) {
      const event = createEvent.keyDown(button, { key: 'ArrowLeft', [mod]: true })
      fireEvent(button, event)
      expect(event.defaultPrevented, mod).toBe(false)
    }
    expect(onChange).not.toHaveBeenCalled()
  })
})
