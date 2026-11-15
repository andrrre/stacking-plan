import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRovingFocus } from './useRovingFocus'

afterEach(cleanup)

const GRID = [['a1', 'a2', 'a3'], ['b1'], ['c1', 'c2']]

type Props = { onSelect: (id: string | null) => void; selectedId?: string | null; grid?: string[][] }

function Grid({ onSelect, selectedId = null, grid = GRID }: Props) {
  const { getItemProps } = useRovingFocus(grid, { selectedId, onSelect })
  return (
    <div>
      {grid.map((row, i) => (
        <div key={i}>
          {row.map((id) => (
            <button key={id} type="button" onClick={() => onSelect(id)} {...getItemProps(id)}>
              {id}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

function tabStops(): string[] {
  return screen.getAllByRole('button').filter((b) => b.tabIndex === 0).map((b) => b.textContent ?? '')
}

function setup(props: Partial<Props> = {}) {
  const onSelect = vi.fn()
  const user = userEvent.setup()
  render(<Grid onSelect={onSelect} {...props} />)
  return { onSelect, user }
}

describe('useRovingFocus', () => {
  it('gives exactly one item tabIndex 0, the first one by default', () => {
    setup()
    expect(tabStops()).toEqual(['a1'])
    expect(screen.getAllByRole('button').filter((b) => b.tabIndex === -1)).toHaveLength(5)
  })

  it('starts on the selected item when there is one', () => {
    setup({ selectedId: 'c2' })
    expect(tabStops()).toEqual(['c2'])
  })

  it('falls back to the first item when the selected id is not in the grid', () => {
    setup({ selectedId: 'zz' })
    expect(tabStops()).toEqual(['a1'])
  })

  it('Tab enters the grid on the tab stop', async () => {
    const { user } = setup()
    await user.tab()
    expect(screen.getByText('a1')).toHaveFocus()
  })

  it('Left and Right move within a row and stop at the ends', async () => {
    const { user } = setup()
    await user.tab()
    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(screen.getByText('a3')).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByText('a3')).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByText('a2')).toHaveFocus()
    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(screen.getByText('a1')).toHaveFocus()
  })

  it('Up and Down move to the same index on the next row, clamped', async () => {
    const { user } = setup()
    await user.tab()
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowDown}')
    expect(screen.getByText('b1')).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByText('c1')).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByText('c1')).toHaveFocus()
    await user.keyboard('{ArrowRight}{ArrowUp}{ArrowUp}')
    expect(screen.getByText('a1')).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(screen.getByText('a1')).toHaveFocus()
  })

  it('keeps exactly one tab stop, on the focused item, as focus moves', async () => {
    const { user } = setup()
    await user.tab()
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowRight}')
    expect(screen.getByText('c2')).toHaveFocus()
    expect(tabStops()).toEqual(['c2'])
  })

  it('a click moves the tab stop to the clicked item', async () => {
    const { user } = setup()
    await user.click(screen.getByText('b1'))
    expect(tabStops()).toEqual(['b1'])
  })

  it('Enter and Space select the focused item, once each', async () => {
    const { user, onSelect } = setup()
    await user.tab()
    await user.keyboard('{ArrowRight}{Enter}')
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenLastCalledWith('a2')
    await user.keyboard('{ArrowDown} ')
    expect(onSelect).toHaveBeenCalledTimes(2)
    expect(onSelect).toHaveBeenLastCalledWith('b1')
  })

  it('Escape clears the selection', async () => {
    const { user, onSelect } = setup({ selectedId: 'a2' })
    await user.tab()
    await user.keyboard('{Escape}')
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenLastCalledWith(null)
  })

  it('Escape that clears a selection is marked handled; with nothing selected it passes on', async () => {
    const seen: boolean[] = []
    const onDocKey = (e: KeyboardEvent) => { if (e.key === 'Escape') seen.push(e.defaultPrevented) }
    document.addEventListener('keydown', onDocKey)
    try {
      const { user } = setup({ selectedId: 'a2' })
      await user.tab()
      await user.keyboard('{Escape}')
      cleanup()
      const second = setup({ selectedId: null })
      await second.user.tab()
      await second.user.keyboard('{Escape}')
    } finally {
      document.removeEventListener('keydown', onDocKey)
    }
    expect(seen).toEqual([true, false])
  })

  it('other keys are ignored', async () => {
    const { user, onSelect } = setup()
    await user.tab()
    await user.keyboard('x')
    expect(onSelect).not.toHaveBeenCalled()
    expect(screen.getByText('a1')).toHaveFocus()
  })

  it('an empty grid renders nothing and does not throw', () => {
    setup({ grid: [] })
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})

/** Wrapping an item (as a match outline does) re-parents its button, so React mounts a new element. */
function Wrapping({ wrapped, tick = 0 }: { wrapped: boolean; tick?: number }) {
  const row = ['a1', 'a2', 'a3']
  const { getItemProps } = useRovingFocus([row], { selectedId: null, onSelect: () => {} })
  const button = (id: string) => <button key={id} type="button" data-tick={tick} {...getItemProps(id)}>{id}</button>
  return (
    <div>
      {button('a1')}
      {wrapped ? <span>{button('a2')}</span> : button('a2')}
      {button('a3')}
    </div>
  )
}

describe('useRovingFocus: focus survives a remount', () => {
  it('refocuses the focused item when an outline appears around it', () => {
    const { rerender } = render(<Wrapping wrapped={false} />)
    const before = screen.getByRole('button', { name: 'a2' })
    before.focus()
    rerender(<Wrapping wrapped />)
    const after = screen.getByRole('button', { name: 'a2' })
    expect(after).not.toBe(before)
    expect(after).toHaveFocus()
  })

  it('refocuses it when the outline disappears', () => {
    const { rerender } = render(<Wrapping wrapped />)
    screen.getByRole('button', { name: 'a2' }).focus()
    rerender(<Wrapping wrapped={false} />)
    expect(screen.getByRole('button', { name: 'a2' })).toHaveFocus()
  })

  it('does not take focus back after the user moved it out of the grid', () => {
    const { rerender } = render(<Wrapping wrapped={false} />)
    screen.getByRole('button', { name: 'a2' }).focus()
    screen.getByRole('button', { name: 'a2' }).blur()
    rerender(<Wrapping wrapped tick={1} />)
    expect(document.body).toHaveFocus()
  })
})
