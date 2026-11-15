import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DialogFrame } from './DialogFrame'

function setup(onClose = vi.fn()) {
  const view = render(
    <>
      <div data-print="shell"><button type="button">header control</button><input aria-label="rail field" /></div>
      <DialogFrame labelledBy="t" onClose={onClose}>
        <h2 id="t">Title</h2>
        <p>Some plain text</p>
        <button type="button">first</button>
        <button type="button">last</button>
      </DialogFrame>
    </>,
  )
  return { onClose, ...view }
}

describe('DialogFrame', () => {
  it('Escape closes after a click on non-focusable text', async () => {
    const { onClose } = setup()
    await userEvent.click(screen.getByText('Some plain text'))
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Escape closes when focus has fallen to the body', async () => {
    const { onClose } = setup()
    ;(document.activeElement as HTMLElement).blur()
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Escape is default-prevented so the KPI bar leaves its highlight alone', () => {
    setup()
    const seen: boolean[] = []
    document.addEventListener('keydown', (e) => seen.push(e.defaultPrevented), { once: true })
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(seen).toEqual([true])
  })

  it('Tab from the last control wraps to the first, never to the shell', async () => {
    setup()
    screen.getByRole('button', { name: 'last' }).focus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'first' })).toHaveFocus()
    await userEvent.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'last' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'header control' })).not.toHaveFocus()
  })

  it('Tab with focus on the container or body moves into the dialog', async () => {
    setup()
    ;(document.activeElement as HTMLElement).blur()
    await userEvent.tab()
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement)
  })

  it('makes the shell inert and locks scroll only while open, then returns focus to the opener', () => {
    const { rerender } = render(<button type="button">opener</button>)
    const opener = screen.getByRole('button', { name: 'opener' })
    opener.focus()
    const shell = document.createElement('div')
    shell.setAttribute('data-print', 'shell')
    document.body.append(shell)
    const open = render(<DialogFrame labelledBy="x" onClose={() => undefined}><button type="button">in</button></DialogFrame>)
    expect(shell).toHaveAttribute('inert')
    expect(document.body.style.overflow).toBe('hidden')
    open.unmount()
    expect(shell).not.toHaveAttribute('inert')
    expect(document.body.style.overflow).toBe('')
    expect(opener).toHaveFocus()
    shell.remove()
    rerender(<></>)
  })
})
