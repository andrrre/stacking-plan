import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../app/App'
import { StateProvider } from '../../app/state/StateProvider'
import { initState } from '../../app/state/init'
import type { AppState } from '../../app/state/types'
import type { ShortlistEntry } from '../../domain/types'

// The drawers through the real App (jsdom has no WebGL, so the 2D stack stands in for the 3D building).

const entry: ShortlistEntry = {
  id: 'odt|2026-11-15|odt-500|b', buildingId: 'odt', asOf: '2026-11-15', whatIf: false,
  candidate: {
    key: 'odt-500', suiteIds: ['odt-500'], suiteNumbers: ['500'], floor: 5, totalSf: 10250, excessSf: 250,
    blendedRentPsf: 48, availableFrom: '2026-11-15', availability: 'now', caveats: [],
  },
}

function renderApp(over: Partial<AppState> = {}) {
  render(
    <StateProvider initialState={{ ...initState('', null, '2026-11-15'), ...over }}>
      <App />
    </StateProvider>,
  )
}

const SEARCH = { minSf: 10_000, maxSf: null, maxRentPsf: null, includePotential: true }
const firstCard = () => within(screen.getByTestId('match-1')).getByRole('button', { name: /^Match 1:/ })
/** The sliding element around a drawer's content. */
const drawerOf = (el: HTMLElement) => el.closest<HTMLElement>('[data-drawer]') ?? el
/** Ends the right drawer's slide, as the browser's transitionend would. */
const slideEnds = async () => { fireEvent.transitionEnd(drawerOf(screen.getByTestId('right-panel'))) }

const toggle = () => screen.getByTestId('left-drawer-toggle')
const rightPanel = () => screen.getByTestId('right-panel')

beforeEach(() => localStorage.clear())

describe('left drawer', () => {
  it('starts open; its toggle names and controls the search panel', () => {
    renderApp()
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    expect(toggle()).toHaveAccessibleName('Hide search panel')
    expect(toggle()).toHaveAttribute('aria-controls', screen.getByTestId('left-rail').id)
    expect(screen.getByTestId('left-rail')).not.toHaveAttribute('inert')
  })

  it('hiding makes the content inert, flips the toggle and is saved', async () => {
    renderApp()
    await userEvent.click(toggle())
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    expect(toggle()).toHaveAccessibleName('Show search panel')
    expect(screen.getByTestId('left-rail')).toHaveAttribute('inert')
    expect(localStorage.getItem('stackmatch.v1.leftDrawer')).toBe('false')
    await userEvent.click(toggle())
    expect(screen.getByTestId('left-rail')).not.toHaveAttribute('inert')
    expect(localStorage.getItem('stackmatch.v1.leftDrawer')).toBe('true')
  })

  it('opens closed when it was hidden last time', () => {
    localStorage.setItem('stackmatch.v1.leftDrawer', 'false')
    renderApp()
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows the shortlist count on the handle only while closed and the shortlist has entries', async () => {
    renderApp({ shortlist: [entry] })
    expect(within(toggle()).queryByTestId('left-drawer-badge')).toBeNull()
    await userEvent.click(toggle())
    expect(within(toggle()).getByTestId('left-drawer-badge')).toHaveTextContent('1')
    expect(toggle()).toHaveAccessibleName('Show search panel (1 in shortlist)')
  })

  it('no badge for an empty shortlist', async () => {
    renderApp()
    await userEvent.click(toggle())
    expect(screen.queryByTestId('left-drawer-badge')).toBeNull()
  })
})

describe('right drawer', () => {
  it('is closed and inert with nothing to show; the stage shows the hint instead', () => {
    renderApp()
    expect(rightPanel()).toHaveAttribute('data-open', 'false')
    expect(rightPanel()).toHaveAttribute('inert')
    expect(screen.queryByTestId('right-empty')).toBeNull()
    expect(screen.getByTestId('stage-hint')).toHaveTextContent('Click a suite for details · enter a size to find space')
  })

  it('a suite click opens it with the details, without moving focus; the hint goes for good', async () => {
    renderApp()
    await userEvent.click(screen.getByTestId('suite-odt-500'))
    expect(rightPanel()).toHaveAttribute('data-open', 'true')
    expect(rightPanel()).not.toHaveAttribute('inert')
    expect(within(rightPanel()).getByTestId('suite-details')).toHaveTextContent('Suite 500')
    expect(screen.getByTestId('suite-odt-500')).toHaveFocus()
    expect(screen.queryByTestId('stage-hint')).toBeNull()
    await userEvent.click(screen.getByTestId('right-drawer-close'))
    expect(screen.queryByTestId('stage-hint')).toBeNull()
  })

  it('Close clears the selection, closes and returns focus to the suite that opened it', async () => {
    renderApp()
    await userEvent.click(screen.getByTestId('suite-odt-500'))
    await userEvent.click(screen.getByTestId('right-drawer-close'))
    expect(screen.getByTestId('suite-odt-500')).toHaveAttribute('aria-pressed', 'false')
    expect(rightPanel()).toHaveAttribute('data-open', 'false')
    expect(screen.getByTestId('suite-odt-500')).toHaveFocus()
  })

  it('Escape inside it closes it', async () => {
    renderApp()
    await userEvent.click(screen.getByTestId('suite-odt-500'))
    screen.getByTestId('right-drawer-close').focus()
    await userEvent.keyboard('{Escape}')
    expect(rightPanel()).toHaveAttribute('data-open', 'false')
    expect(screen.getByTestId('suite-odt-500')).toHaveAttribute('aria-pressed', 'false')
  })

  it('without an opener in the stage, Close focuses the stage', async () => {
    renderApp({ selection: { kind: 'suite', suiteId: 'odt-500' } })
    await userEvent.click(screen.getByTestId('right-drawer-close'))
    expect(screen.getByTestId('center-pane')).toHaveFocus()
  })

  it('a search opens it with the list; dismissed, it stays shut until the requirement changes', async () => {
    renderApp()
    const min = screen.getByTestId('req-min-sf')
    await userEvent.type(min, '10000')
    expect(rightPanel()).toHaveAttribute('data-open', 'true')
    expect(within(rightPanel()).getByTestId('match-list')).toBeVisible()
    await userEvent.click(screen.getByTestId('right-drawer-close'))
    expect(rightPanel()).toHaveAttribute('data-open', 'false')
    await userEvent.type(min, '1')
    expect(rightPanel()).toHaveAttribute('data-open', 'true')
  })

  it('a dismissed list re-opens when a suite is selected', async () => {
    renderApp({ req: SEARCH })
    await userEvent.click(screen.getByTestId('right-drawer-close'))
    expect(rightPanel()).toHaveAttribute('data-open', 'false')
    await userEvent.click(screen.getByTestId('suite-odt-600'))
    expect(within(rightPanel()).getByTestId('suite-details')).toBeVisible()
  })

  it('closing a suite while a search is active hands over to the list and its first card; a second Close shuts it', async () => {
    renderApp({ req: SEARCH, selection: { kind: 'suite', suiteId: 'odt-600' } })
    await userEvent.click(screen.getByTestId('right-drawer-close'))
    expect(rightPanel()).toHaveAttribute('data-open', 'true')
    expect(within(rightPanel()).getByTestId('match-list')).toBeVisible()
    expect(firstCard()).toHaveFocus()
    await userEvent.click(screen.getByTestId('right-drawer-close'))
    expect(rightPanel()).toHaveAttribute('data-open', 'false')
    await slideEnds()
    expect(screen.queryByTestId('match-list')).toBeNull()
  })

  it('H1: a list dismissed earlier comes back when a suite selected later is closed', async () => {
    renderApp({ req: SEARCH })
    await userEvent.click(screen.getByTestId('right-drawer-close'))
    expect(rightPanel()).toHaveAttribute('data-open', 'false')
    await userEvent.click(screen.getByTestId('suite-odt-600'))
    expect(within(rightPanel()).getByTestId('suite-details')).toBeVisible()
    await userEvent.click(screen.getByTestId('right-drawer-close'))
    expect(rightPanel()).toHaveAttribute('data-open', 'true')
    expect(within(rightPanel()).getByTestId('match-list')).toBeVisible()
    expect(firstCard()).toHaveFocus()
  })

  it('H3: Escape on a control inside the details, with a search active, moves focus to the first match card', async () => {
    renderApp({ req: SEARCH, selection: { kind: 'suite', suiteId: 'odt-600' } })
    const inside = within(screen.getByTestId('suite-details')).getByTestId('open-floor-plan') // the first enabled control
    inside.focus()
    await userEvent.keyboard('{Escape}')
    expect(within(rightPanel()).getByTestId('match-list')).toBeVisible()
    expect(firstCard()).toHaveFocus()
  })

  it('M3: while the drawer slides shut it keeps its content (inert); the content goes when the slide ends', async () => {
    renderApp()
    await userEvent.click(screen.getByTestId('suite-odt-500'))
    await userEvent.click(screen.getByTestId('right-drawer-close'))
    expect(rightPanel()).toHaveAttribute('inert')
    expect(within(rightPanel()).getByTestId('suite-details')).toHaveTextContent('Suite 500')
    fireEvent.transitionEnd(drawerOf(rightPanel()))
    expect(screen.queryByTestId('suite-details')).toBeNull()
  })

  it('M4: an opener is forgotten once the selection changes with focus outside the stage', async () => {
    renderApp({ req: SEARCH })
    await userEvent.click(screen.getByTestId('suite-odt-500')) // opener: suite 500
    await userEvent.click(screen.getByTestId('right-drawer-close')) // back to the list, focus in the drawer
    await userEvent.click(within(screen.getByTestId('match-2')).getByRole('button', { name: /^Match 2:/ }))
    await userEvent.click(screen.getByTestId('right-drawer-close')) // back to the list
    await userEvent.click(screen.getByTestId('right-drawer-close')) // shut
    expect(rightPanel()).toHaveAttribute('data-open', 'false')
    expect(screen.getByTestId('suite-odt-500')).not.toHaveFocus()
    expect(screen.getByTestId('center-pane')).toHaveFocus()
  })

  it('Escape inside a dialog in the drawer is left to the dialog', async () => {
    renderApp({ selection: { kind: 'suite', suiteId: 'odt-600' } })
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.tabIndex = -1
    within(rightPanel()).getByTestId('suite-details').append(dialog)
    dialog.focus()
    await userEvent.keyboard('{Escape}')
    expect(rightPanel()).toHaveAttribute('data-open', 'true')
    dialog.remove()
  })
})

describe('below 1100 px', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('max-width'), media: query, addEventListener: () => {}, removeEventListener: () => {},
    }))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('L1: the left drawer starts closed on a first visit; a stored setting still wins', () => {
    renderApp()
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
  })

  it('L1: a stored open setting opens it', () => {
    localStorage.setItem('stackmatch.v1.leftDrawer', 'true')
    renderApp()
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
  })

  it('H2: typing a size keeps the left drawer open and focused; the list shows once the left is hidden', async () => {
    localStorage.setItem('stackmatch.v1.leftDrawer', 'true')
    renderApp()
    const min = screen.getByTestId('req-min-sf')
    await userEvent.type(min, '10000')
    expect(min).toHaveValue('10000')
    expect(min).toHaveFocus()
    expect(screen.getByTestId('left-rail')).not.toHaveAttribute('inert')
    expect(rightPanel()).toHaveAttribute('data-open', 'false')
    await userEvent.click(toggle())
    expect(rightPanel()).toHaveAttribute('data-open', 'true')
    expect(within(rightPanel()).getByTestId('match-list')).toBeVisible()
  })

  it('H2: a suite selected while the left is open takes over at once', async () => {
    localStorage.setItem('stackmatch.v1.leftDrawer', 'true')
    renderApp()
    await userEvent.click(screen.getByTestId('suite-odt-500'))
    expect(rightPanel()).toHaveAttribute('data-open', 'true')
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('presentation mode', () => {
  const present = () => screen.getByTestId('present')

  it('Present shuts both drawers; Exit presentation brings the left one back as it was', async () => {
    renderApp()
    await userEvent.click(screen.getByTestId('suite-odt-500'))
    expect(rightPanel()).toHaveAttribute('data-open', 'true')
    await userEvent.click(present())
    expect(present()).toHaveAttribute('aria-pressed', 'true')
    expect(present()).toHaveTextContent('Exit presentation')
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    expect(rightPanel()).toHaveAttribute('data-open', 'false')
    expect(localStorage.getItem('stackmatch.v1.leftDrawer')).toBeNull() // never saved
    await userEvent.click(present())
    expect(present()).toHaveAttribute('aria-pressed', 'false')
    expect(present()).toHaveTextContent('Present')
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
  })

  it('a hidden left drawer stays hidden after presenting', async () => {
    localStorage.setItem('stackmatch.v1.leftDrawer', 'false')
    renderApp()
    await userEvent.click(present())
    await userEvent.click(present())
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
  })

  it('selecting a suite while presenting shows its details', async () => {
    renderApp()
    await userEvent.click(present())
    await userEvent.click(screen.getByTestId('suite-odt-700'))
    expect(rightPanel()).toHaveAttribute('data-open', 'true')
  })

  it('Escape ends it where fullscreen is unavailable (jsdom has none)', async () => {
    renderApp()
    await userEvent.click(present())
    await userEvent.keyboard('{Escape}')
    expect(present()).toHaveAttribute('aria-pressed', 'false')
  })

  it('leaving fullscreen by the browser ends it', async () => {
    renderApp()
    await userEvent.click(present())
    fireEvent(document, new Event('fullscreenchange'))
    expect(present()).toHaveAttribute('aria-pressed', 'false')
  })

  it('the handle still opens the left drawer while presenting', async () => {
    renderApp()
    await userEvent.click(present())
    await userEvent.click(toggle())
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
  })
})

describe('presentation mode and browser fullscreen', () => {
  afterEach(() => {
    for (const key of ['exitFullscreen', 'fullscreenElement']) Reflect.deleteProperty(document, key)
    Reflect.deleteProperty(document.documentElement, 'requestFullscreen')
  })

  it('asks for fullscreen on Present, and leaves fullscreen granted after the mode already ended', async () => {
    let fullscreen: Element | null = null
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreen })
    const exit = vi.fn(() => { fullscreen = null; return Promise.resolve() })
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exit })
    const request = vi.fn(() => Promise.resolve())
    Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: request })
    renderApp()
    await userEvent.click(screen.getByTestId('present'))
    expect(request).toHaveBeenCalledOnce()
    await userEvent.click(screen.getByTestId('present')) // Exit before the browser granted it
    fullscreen = document.documentElement // granted late
    fireEvent(document, new Event('fullscreenchange'))
    expect(exit).toHaveBeenCalled()
    expect(screen.getByTestId('present')).toHaveAttribute('aria-pressed', 'false')
  })
})
