import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'

// Roving tabindex over a grid of rows (spec-technical §4): exactly one item has tabIndex 0.
// Left/Right move within a row, Up/Down move to the same index on the previous/next row (clamped),
// Enter and Space select, Escape clears the selection. When an item's element is replaced while it holds
// focus (a match outline re-parents it), focus moves to the new element.

export type RovingItemProps = {
  tabIndex: 0 | -1
  ref: (el: HTMLElement | null) => void
  onFocus: () => void
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void
}

export type RovingOptions = { selectedId: string | null; onSelect: (id: string | null) => void }

type Grid = readonly (readonly string[])[]
type Pos = { row: number; col: number }

const MOVES: Record<string, (p: Pos) => Pos> = {
  ArrowLeft: (p) => ({ row: p.row, col: p.col - 1 }),
  ArrowRight: (p) => ({ row: p.row, col: p.col + 1 }),
  ArrowUp: (p) => ({ row: p.row - 1, col: p.col }),
  ArrowDown: (p) => ({ row: p.row + 1, col: p.col }),
}

const clamp = (n: number, max: number) => Math.min(Math.max(n, 0), max)

function find(grid: Grid, id: string | null): Pos | null {
  const row = id === null ? -1 : grid.findIndex((r) => r.includes(id))
  return row < 0 || id === null ? null : { row, col: grid[row]?.indexOf(id) ?? 0 }
}

function idAt(grid: Grid, p: Pos): string | undefined {
  const row = clamp(p.row, grid.length - 1)
  const cells = grid[row] ?? []
  return cells[clamp(p.col, cells.length - 1)]
}

export function useRovingFocus(grid: Grid, { selectedId, onSelect }: RovingOptions) {
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const elements = useRef(new Map<string, HTMLElement>())
  const lostFocusId = useRef<string | null>(null) // set when a focused element is detached

  useLayoutEffect(() => {
    const id = lostFocusId.current
    lostFocusId.current = null
    const active = document.activeElement
    if (id !== null && (active === null || active === document.body)) elements.current.get(id)?.focus()
  })
  const activeId = find(grid, focusedId) ? focusedId : find(grid, selectedId) ? selectedId : (grid[0]?.[0] ?? null)

  const onKey = useCallback((id: string, e: KeyboardEvent<HTMLElement>) => {
    const move = MOVES[e.key]
    if (move) {
      const from = find(grid, id)
      const next = from && idAt(grid, move(from))
      e.preventDefault()
      if (next) elements.current.get(next)?.focus()
      return
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault() // the button would otherwise also fire a click
      onSelect(id)
    } else if (e.key === 'Escape') {
      onSelect(null)
    }
  }, [grid, onSelect])

  const getItemProps = (id: string): RovingItemProps => ({
    tabIndex: id === activeId ? 0 : -1,
    ref: (el) => {
      if (el) {
        elements.current.set(id, el)
        return
      }
      if (elements.current.get(id) === document.activeElement) lostFocusId.current = id
      elements.current.delete(id)
    },
    onFocus: () => setFocusedId(id),
    onKeyDown: (e) => onKey(id, e),
  })

  return { activeId, getItemProps }
}
