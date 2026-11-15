import { afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorBoundary } from './ErrorBoundary'
import { resetUrl } from './resetUrl'

function Boom(): never {
  throw new Error('render failed')
}

afterEach(() => vi.restoreAllMocks())

describe('ErrorBoundary', () => {
  it('renders its children when nothing throws', () => {
    render(<ErrorBoundary><p>fine</p></ErrorBoundary>)
    expect(screen.getByText('fine')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows a short message and a Reset view button when a child throws', async () => {
    // React itself reports the caught error; silence it so the test output stays clean.
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const reload = vi.fn<(url: string) => void>()
    window.history.replaceState(null, '', '/?today=2026-11-15&min=9000&b=pbp')
    render(<ErrorBoundary reload={reload}><Boom /></ErrorBoundary>)
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong')
    await userEvent.click(screen.getByRole('button', { name: 'Reset view' }))
    expect(reload).toHaveBeenCalledWith('/?today=2026-11-15')
  })
})

describe('resetUrl', () => {
  it('keeps only a valid today on the bare path', () => {
    expect(resetUrl('/', '?today=2026-11-15&mode=risk')).toBe('/?today=2026-11-15')
    expect(resetUrl('/app/', '?mode=risk&today=2027-01-10')).toBe('/app/?today=2027-01-10')
  })

  it('drops an invalid or out-of-range today', () => {
    expect(resetUrl('/', '?today=9999-12-31&min=1')).toBe('/')
    expect(resetUrl('/', '?today=garbage')).toBe('/')
    expect(resetUrl('/', '')).toBe('/')
  })
})
