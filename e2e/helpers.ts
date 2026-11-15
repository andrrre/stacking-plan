import type { Locator, Page } from '@playwright/test'

/** Every E2E run pins the clock to this date (spec.md A15). */
export const TODAY = '2026-11-15'

/** Loads the app with optional URL params; `today` is always pinned to TODAY. */
export async function gotoApp(page: Page, params: string | Record<string, string> = {}): Promise<void> {
  const search = new URLSearchParams(params)
  search.set('today', TODAY)
  await page.goto(`/?${search.toString()}`)
}

/** The hero building's suite button by suite number, e.g. suite(page, 500) → data-testid "suite-odt-500". */
export function suite(page: Page, number: string | number): Locator {
  return page.getByTestId(`suite-odt-${number}`)
}
