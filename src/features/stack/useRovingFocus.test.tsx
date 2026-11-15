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
