import type { Locator, Page } from '@playwright/test'

/** Every E2E run pins the clock to this date (spec.md A15). */
export const TODAY = '2026-11-15'

/** The centre view to open: the 3D building (the default, no URL parameter) or the 2D stack (`view=stack`). */
export type View = '3d' | 'stack'

/**
 * Loads the app in `view` with optional URL params; `today` is always pinned to TODAY. A `view` key in
 * `params` wins (for tests of the parameter itself).
 */
export async function gotoApp(page: Page, view: View, params: string | Record<string, string> = {}): Promise<void> {
  const search = new URLSearchParams(view === 'stack' ? { view } : {})
  for (const [k, v] of new URLSearchParams(params)) search.set(k, v)
  search.set('today', TODAY)
  await page.goto(`/?${search.toString()}`)
}

/** The hero building's 2D suite button by suite number, e.g. suite(page, 500) → data-testid "suite-odt-500". */
export function suite(page: Page, number: string | number): Locator {
  return page.getByTestId(`suite-odt-${number}`)
}

/** The hero building's 3D mirror button by suite number, e.g. suite3d(page, 500) → data-testid "suite3d-odt-500". */
export function suite3d(page: Page, number: string | number): Locator {
  return page.getByTestId(`suite3d-odt-${number}`)
}
