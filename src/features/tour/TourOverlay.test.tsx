import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StateProvider } from '../../app/state/StateProvider'
import { initState } from '../../app/state/init'
import type { AppState } from '../../app/state/types'
import { useAppState } from '../../app/state/useAppState'
import { BUNDLED_BUILDINGS } from '../../data'
import { HintButton } from '../layout/HintButton'
import { TourButton } from './TourButton'
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
      <TourButton />
      <HintButton hint="Why not" testId="why" onClick={() => undefined}>Why</HintButton>
      <div role="dialog" aria-label="A dialog"><button type="button" data-testid="in-dialog">In a dialog</button></div>
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

  it('one Escape ends the tour and the presentation with it', async () => {
    renderTour()
    await userEvent.keyboard('{Escape}')
    expect(now()).toMatchObject({ presenting: false, index: null })
  })

  it('leaving fullscreen during a tour (the browser takes that Escape) ends the tour and the presentation', () => {
    renderTour()
    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    expect(now()).toMatchObject({ presenting: false, index: null })
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

  it('the bar\'s buttons: Previous is unavailable on the first stop, Next steps, Play plays, Exit tour ends the tour and the presentation', async () => {
    renderTour()
    expect(screen.getByTestId('tour-prev')).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(screen.getByTestId('tour-prev'))
    expect(now().index).toBe(0)
    await userEvent.click(screen.getByTestId('tour-next'))
    expect(now().index).toBe(1)
    await userEvent.click(screen.getByTestId('tour-play'))
    expect(screen.getByTestId('tour-play')).toHaveTextContent('Pause')
    expect(screen.getByTestId('tour-play')).not.toHaveAttribute('aria-pressed') // the label says it
    await userEvent.click(screen.getByTestId('tour-exit'))
    expect(now()).toMatchObject({ presenting: false, index: null })
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
  it('starting moves focus to Play / Pause; Exit tour hands it to the header Tour button', async () => {
    renderTour()
    expect(screen.getByTestId('tour-play')).toHaveFocus()
    await userEvent.click(screen.getByTestId('tour-exit'))
    expect(now().index).toBeNull()
    expect(screen.getByTestId('tour')).toHaveFocus()
    expect(screen.getByTestId('tour')).not.toHaveAttribute('aria-pressed')
  })

  it('Escape closes an open tooltip first and the tour keeps running; the next Escape ends the tour', async () => {
    renderTour()
    await userEvent.hover(screen.getByTestId('why'))
    expect(screen.getByTestId('why-hint')).toHaveAttribute('data-open', 'true')
    await userEvent.keyboard('{Escape}')
    expect(screen.getByTestId('why-hint')).toHaveAttribute('data-open', 'false')
    expect(now()).toMatchObject({ presenting: true, index: 0 })
    await userEvent.keyboard('{Escape}')
    expect(now()).toMatchObject({ presenting: false, index: null })
  })

  it('Escape inside a dialog over the tour belongs to the dialog: the tour keeps running', async () => {
    renderTour()
    screen.getByTestId('in-dialog').focus()
    await userEvent.keyboard('{Escape}')
    expect(now()).toMatchObject({ presenting: true, index: 0 })
  })

  it('announces each stop once in a polite live region; the card itself is not live', async () => {
    renderTour()
    const live = screen.getByTestId('tour-live')
    expect(live).toHaveAttribute('aria-live', 'polite')
    expect(live).toHaveAttribute('aria-atomic', 'true')
    expect(live).toHaveTextContent(`Stop 1 of ${stops.length}: Suite ${stops[0]?.suiteNumbers[0]}, Floor ${stops[0]?.floor},`)
    expect(screen.getByTestId('tour-caption')).not.toHaveAttribute('aria-live')
    await userEvent.click(screen.getByTestId('tour-next'))
    expect(live).toHaveTextContent(`Stop 2 of ${stops.length}: Suite ${stops[1]?.suiteNumbers[0]}`)
  })
})
