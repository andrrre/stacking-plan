import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { BUNDLED_BUILDINGS } from '../../data'
import type { ClientOption } from '../shortlist/clientOptions'
import { SummaryIntro } from './SummaryIntro'

type FetchFn = typeof fetch

const opt = (n: number, over: Partial<ClientOption> = {}): ClientOption => ({
  rank: 1, label: `Suite ${n}`, floor: 5, suiteNumbers: [String(n)], totalSf: 10500, blendedRentPsf: 52, availableFrom: '2026-11-15', notes: [], whatIf: false, ...over,
})
const AI = { headline: 'AI headline', paragraph: 'AI paragraph.' }
const props = (options: ClientOption[], fetchFn: FetchFn, buildingId: string = BUNDLED_BUILDINGS[0].id) => ({ buildingId, buildingName: 'Ocean Drive Tower', asOf: '2026-11-15', options, fetchFn })
const ok = (body: unknown = AI): FetchFn => vi.fn<FetchFn>(async () => Response.json(body))

describe('SummaryIntro', () => {
  it('shows the templated copy at once, before any response', () => {
    const fetchFn = vi.fn<FetchFn>(() => new Promise<Response>(() => {}))
    render(<SummaryIntro {...props([opt(500)], fetchFn)} />)
    const intro = screen.getByTestId('summary-intro')
    expect(intro).toHaveTextContent('Suite 500 at Ocean Drive Tower')
    expect(intro).toHaveTextContent('Suite 500 on floor 5 offers 10,500 SF')
    expect(intro).toHaveAttribute('data-source', 'template')
  })

  it('swaps in valid AI copy when it arrives', async () => {
    render(<SummaryIntro {...props([opt(500)], ok())} />)
    await waitFor(() => expect(screen.getByTestId('summary-intro')).toHaveTextContent('AI headline'))
    expect(screen.getByTestId('summary-intro')).toHaveTextContent('AI paragraph.')
  })

  it.each([['a 503', async () => Response.json({ error: 'x' }, { status: 503 })], ['a network error', async () => { throw new TypeError('offline') }], ['invalid copy', async () => Response.json({ headline: '' })]])(
    'keeps the templated copy after %s, with no failure notice',
    async (_name, impl) => {
      const fetchFn = vi.fn<FetchFn>(impl)
      render(<SummaryIntro {...props([opt(500)], fetchFn)} />)
      await waitFor(() => expect(fetchFn).toHaveBeenCalled())
      await new Promise((r) => setTimeout(r, 0))
      const intro = screen.getByTestId('summary-intro')
      expect(intro).toHaveTextContent('Suite 500 at Ocean Drive Tower')
      expect(intro.textContent).not.toMatch(/offline|unavailable|error/i)
    },
  )

  it('requests once, and not again on a re-render with equal options', async () => {
    const fetchFn = ok()
    const { rerender } = render(<SummaryIntro {...props([opt(500)], fetchFn)} />)
    rerender(<SummaryIntro {...props([opt(500)], fetchFn)} />)
    await waitFor(() => expect(screen.getByTestId('summary-intro')).toHaveTextContent('AI headline'))
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('ignores a late response after the options changed, and requests the new options', async () => {
    let resolveFirst: (r: Response) => void = () => {}
    const fetchFn = vi.fn<FetchFn>()
    fetchFn.mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveFirst = resolve }))
    fetchFn.mockImplementation(async () => Response.json({ headline: 'Second', paragraph: 'Second.' }))
    const { rerender } = render(<SummaryIntro {...props([opt(500)], fetchFn)} />)
    rerender(<SummaryIntro {...props([opt(600)], fetchFn)} />)
    await waitFor(() => expect(screen.getByTestId('summary-intro')).toHaveTextContent('Second'))
    resolveFirst(Response.json({ headline: 'Stale', paragraph: 'Stale.' }))
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.getByTestId('summary-intro')).not.toHaveTextContent('Stale')
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('aborts the request on unmount, and a response that arrives after is not applied or warned about', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    let resolve: (r: Response) => void = () => {}
    const fetchFn = vi.fn<FetchFn>(() => new Promise<Response>((r) => { resolve = r }))
    const { unmount } = render(<SummaryIntro {...props([opt(500)], fetchFn)} />)
    const signal = vi.mocked(fetchFn).mock.calls[0]?.[1]?.signal
    expect(signal?.aborted).toBe(false)
    unmount()
    expect(signal?.aborted).toBe(true)
    resolve(Response.json(AI))
    await new Promise((r) => setTimeout(r, 0))
    expect(document.body.textContent).not.toContain('AI headline')
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })

  it('aborts the previous request when the options change', async () => {
    const fetchFn = vi.fn<FetchFn>(() => new Promise<Response>(() => {}))
    const { rerender } = render(<SummaryIntro {...props([opt(500)], fetchFn)} />)
    const first = vi.mocked(fetchFn).mock.calls[0]?.[1]?.signal
    rerender(<SummaryIntro {...props([opt(600)], fetchFn)} />)
    expect(first?.aborted).toBe(true)
    expect(vi.mocked(fetchFn).mock.calls[1]?.[1]?.signal?.aborted).toBe(false)
  })

  it('makes no request for an imported building, and shows the templated copy', () => {
    const fetchFn = ok()
    render(<SummaryIntro {...props([opt(500)], fetchFn, 'csv-bayfront-commons')} />)
    expect(fetchFn).not.toHaveBeenCalled()
    expect(screen.getByTestId('summary-intro')).toHaveTextContent('Suite 500 at Ocean Drive Tower')
  })

  it('renders nothing and makes no request with no options', () => {
    const fetchFn = ok()
    render(<SummaryIntro {...props([], fetchFn)} />)
    expect(screen.queryByTestId('summary-intro')).toBeNull()
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
