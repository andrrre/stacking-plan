import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StateProvider } from '../../app/state/StateProvider'
import { initState } from '../../app/state/init'
import type { AppState } from '../../app/state/types'
import { useAppState } from '../../app/state/useAppState'
import { BUNDLED_BUILDINGS } from '../../data'
import { PresentButton } from '../layout/PresentButton'
import { STOP_MS } from '../three-d/tourCamera'
import { TourOverlay } from './TourOverlay'
import { tourStops } from './tourStops'

const TODAY = '2026-11-15'
const hero = BUNDLED_BUILDINGS[0]
const stops = tourStops({ building: hero, buildingId: hero.id, asOf: TODAY, today: TODAY, shortlist: [], matches: [], includePotential: true })

function Harness() {
  const { state } = useAppState()
  return (
    <>
      <PresentButton />
      {state.tour && <TourOverlay tour={state.tour} />}
      <output data-testid="state">{JSON.stringify({ presenting: state.presenting, index: state.tour?.index ?? null, playing: state.tour?.playing ?? null })}</output>
    </>
  )
}

function renderTour(over: Partial<NonNullable<AppState['tour']>> = {}) {
  const base = initState('', null, TODAY)
  const initial: AppState = { ...base, presenting: true, view: '3d', tour: { stops, index: 0, phase: 'look', playing: false, ...over } }
  render(<StateProvider initialState={initial}><Harness /></StateProvider>)
}

const now = () => JSON.parse(screen.getByTestId('state').textContent ?? '{}') as { presenting: boolean; index: number | null; playing: boolean | null }

afterEach(() => {
  vi.useRealTimers()
})

describe('TourOverlay', () => {
  it('shows the stop\'s caption and the stop count', () => {
    renderTour()
    expect(screen.getByTestId('tour-title')).toHaveTextContent(`Suite ${stops[0]?.suiteNumbers[0]} · Floor ${stops[0]?.floor}`)
    expect(screen.getByTestId('tour-counter')).toHaveTextContent(`1 of ${stops.length}`)
  })

  it('one Escape ends the tour and keeps presenting; the next ends the presentation', async () => {
    renderTour()
    await userEvent.keyboard('{Escape}')
    expect(now()).toMatchObject({ presenting: true, index: null })
    await userEvent.keyboard('{Escape}')
    expect(now().presenting).toBe(false)
  })

  it('leaving fullscreen during a tour (the browser takes that Escape) ends the tour only', () => {
    renderTour()
    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    expect(now()).toMatchObject({ presenting: true, index: null })
    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    expect(now().presenting).toBe(false)
  })

  it('← → step between stops and stop at either end; Space plays and pauses', async () => {
    renderTour()
    await userEvent.keyboard('{ArrowLeft}')
    expect(now().index).toBe(0)
    await userEvent.keyboard('{ArrowRight}')
    expect(now().index).toBe(1)
    await userEvent.keyboard(' ')
    expect(now().playing).toBe(true)
    await userEvent.keyboard(' ')
    expect(now().playing).toBe(false)
  })

  it('the bar\'s buttons: Previous is unavailable on the first stop, Next steps, Play plays, Exit tour ends the tour only', async () => {
    renderTour()
    expect(screen.getByTestId('tour-prev')).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(screen.getByTestId('tour-prev'))
    expect(now().index).toBe(0)
    await userEvent.click(screen.getByTestId('tour-next'))
    expect(now().index).toBe(1)
    await userEvent.click(screen.getByTestId('tour-play'))
    expect(screen.getByTestId('tour-play')).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByTestId('tour-exit'))
    expect(now()).toMatchObject({ presenting: true, index: null })
  })

  it('playing, it moves on after each stop\'s time and stops on the last one instead of looping', () => {
    vi.useFakeTimers()
    renderTour({ index: stops.length - 2, playing: true })
    act(() => {
      vi.advanceTimersByTime(STOP_MS)
    })
    expect(now()).toMatchObject({ index: stops.length - 1, playing: true })
    act(() => {
      vi.advanceTimersByTime(STOP_MS)
    })
    expect(now()).toMatchObject({ index: stops.length - 1, playing: false })
  })

  it('paused, it stays', () => {
    vi.useFakeTimers()
    renderTour()
    act(() => {
      vi.advanceTimersByTime(STOP_MS * 3)
    })
    expect(now().index).toBe(0)
  })
})
