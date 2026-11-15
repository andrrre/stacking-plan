import { it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './App'
import { StateProvider } from './state/StateProvider'
import { initState } from './state/init'

function renderApp() {
  return render(
    <StateProvider initialState={initState('', null, '2026-11-15')}>
      <App />
    </StateProvider>,
  )
}

it('renders the product name and demo badge', () => {
  renderApp()
  expect(screen.getByText('StackMatch')).toBeInTheDocument()
  expect(screen.getByTestId('demo-badge')).toHaveTextContent('Demo data')
})

it('renders the shell around a 32-suite stack with no overlay', () => {
  const { container } = renderApp()
  expect(container.firstElementChild).toHaveAttribute('data-overlay', 'none')
  expect(screen.getByRole('main')).toBeInTheDocument()
  expect(within(screen.getByTestId('stack')).getAllByRole('button')).toHaveLength(32)
  expect(screen.getByTestId('right-empty')).toHaveTextContent('Enter a size to find space · click a suite for details')
})

it('opens on the 3D building; without WebGL (jsdom) it shows the 2D stack with a note', () => {
  renderApp()
  expect(screen.getByTestId('view-3d')).toHaveAttribute('aria-checked', 'true')
  expect(screen.getByTestId('webgl-fallback')).toContainElement(screen.getByTestId('stack'))
})

it('selecting a suite replaces the empty right panel', async () => {
  renderApp()
  await userEvent.click(screen.getByTestId('suite-odt-500'))
  expect(screen.getByTestId('suite-odt-500')).toHaveAttribute('aria-pressed', 'true')
  expect(screen.queryByTestId('right-empty')).toBeNull()
})

it('Print calls window.print', async () => {
  const calls: number[] = []
  const original = window.print
  window.print = () => calls.push(1)
  try {
    renderApp()
    await userEvent.click(screen.getByRole('button', { name: 'Print' }))
    expect(calls).toHaveLength(1)
  } finally {
    window.print = original
  }
})
