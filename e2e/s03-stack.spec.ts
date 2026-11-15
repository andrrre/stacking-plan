import { test, expect, type Locator } from '@playwright/test'
import { gotoApp, suite } from './helpers'

const VACANT = [300, 310, 410, 500, 700, 710, 1010]
const VACANT_UNCOMMITTED = [300, 310, 410, 500, 700, 710]
const EXPIRING: Record<number, string> = { 600: '04/2027', 400: '05/2027', 220: '08/2027', 1000: '09/2027' }

/** True when `inner` is rendered and lies fully inside `outer` (no clipping by the cell). */
async function fullyInside(inner: Locator, outer: Locator): Promise<boolean> {
  const [a, b] = await Promise.all([inner.boundingBox(), outer.boundingBox()])
  if (!a || !b || a.width === 0 || a.height === 0) return false
  return a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.width <= b.x + b.width + 0.5 && a.y + a.height <= b.y + b.height + 0.5
}

async function numbersWith(page: import('@playwright/test').Page, attr: string, value: string): Promise<number[]> {
  const ids = await page.locator(`[data-testid^="suite-odt-"][${attr}="${value}"]`).evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-testid') ?? ''),
  )
  return ids.map((id) => Number(id.replace('suite-odt-', ''))).sort((x, y) => x - y)
}

test.describe('stack structure', () => {
  test.beforeEach(async ({ page }) => gotoApp(page))

  test('12 floors top-down and 32 suite buttons', async ({ page }) => {
    const floors = page.locator('[data-testid^="floor-"]')
    await expect(floors).toHaveCount(12)
    const order = await floors.evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')))
    expect(order).toEqual(Array.from({ length: 12 }, (_, i) => `floor-${12 - i}`))
    await expect(page.getByTestId('stack').getByRole('button')).toHaveCount(32)
    await expect(page.locator('button[data-testid^="suite-odt-"]')).toHaveCount(32)
  })

  test('suite buttons carry the full aria-label', async ({ page }) => {
    await expect(suite(page, 500)).toHaveAttribute('aria-label', 'Suite 500, floor 5, vacant, 10,250 SF')
    await expect(suite(page, 600)).toHaveAttribute(
      'aria-label',
      'Suite 600, floor 6, Flamingo Row Media, 12,400 SF, expiring, lease ends 30 Apr 2027',
    )
    await expect(suite(page, 500)).toHaveAttribute('aria-pressed', 'false')
    await expect(suite(page, 500)).toHaveAttribute('title', /Suite 500 · Floor 5 · 10,250 SF/)
  })

  test('floor 12 is narrower than floor 11', async ({ page }) => {
    const w12 = (await page.getByTestId('floor-12').boundingBox())?.width ?? 0
    const w11 = (await page.getByTestId('floor-11').boundingBox())?.width ?? 0
    expect(w12).toBeGreaterThan(0)
    expect(w12).toBeLessThan(w11)
  })
})

test.describe('the ten-second questions', () => {
  test('Q1: exactly the vacant suites are vacant, and the uncommitted ones read VACANT', async ({ page }) => {
    await gotoApp(page)
    expect(await numbersWith(page, 'data-status', 'vacant')).toEqual([...VACANT].sort((x, y) => x - y))
    for (const n of VACANT_UNCOMMITTED) {
      const cell = suite(page, n)
      await expect(cell).toHaveAttribute('data-overlay', 'none')
      const word = cell.getByText('Vacant', { exact: true })
      await expect(word).toBeVisible()
      expect(await word.evaluate((el) => (el as HTMLElement).innerText)).toBe('VACANT')
      expect(await fullyInside(word, cell)).toBe(true)
    }
    await expect(suite(page, 1010)).toHaveAttribute('data-overlay', 'committed')
    await expect(suite(page, 1010).getByText('Vacant', { exact: true })).toHaveCount(0)
  })

  test('Q2: exactly the expiring suites are expiring, and show their MM/YYYY at 1280 px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await gotoApp(page)
    expect(await numbersWith(page, 'data-status', 'expiring')).toEqual([220, 400, 600, 1000])
    for (const [n, mmyyyy] of Object.entries(EXPIRING)) {
      const cell = suite(page, n)
      const cue = cell.getByText(mmyyyy, { exact: true })
      await expect(cue).toBeVisible()
      expect(await fullyInside(cue, cell)).toBe(true)
    }
  })

  test('committed 1010 shows its start date in the cue at 1280 px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await gotoApp(page)
    const cell = suite(page, 1010)
    const cue = cell.getByText('03/2027', { exact: true })
    await expect(cue).toBeVisible()
    expect(await fullyInside(cue, cell)).toBe(true)
  })
})

test('legend: 4 availability entries, overlay keys and the assumption line', async ({ page }) => {
  await gotoApp(page)
  const legend = page.getByTestId('legend')
  await expect(legend.getByTestId('legend-entry')).toHaveCount(4)
  await expect(legend.getByTestId('legend-entry')).toHaveText([/Occupied/, /Expiring/, /Vacant/, /Common/])
  await expect(legend.getByTestId('legend-overlay')).toHaveText([/Potential/, /Committed/])
  await expect(page.getByTestId('legend-assumption')).toHaveText(
    'A lease that ends is assumed not renewed: shown as potential',
  )
})

test('keyboard: one tab stop, arrows move focus, Enter selects, Escape clears', async ({ page }) => {
  await gotoApp(page)
  await expect(page.locator('[data-testid^="suite-odt-"][tabindex="0"]')).toHaveCount(1)
  await suite(page, 1200).focus()
  await page.keyboard.press('ArrowDown')
  await expect(suite(page, 1100)).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(suite(page, 1110)).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(suite(page, 1010)).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(suite(page, 1110)).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(suite(page, 1110)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-testid^="suite-odt-"][tabindex="0"]')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(suite(page, 1110)).toHaveAttribute('aria-pressed', 'false')
})

test('a dimmed suite drops its dimming while focused or selected, so the ring stays visible', async ({ page }) => {
  await gotoApp(page)
  // Nothing dims the stack before S4/S5, so mark suites dimmed directly; React leaves the unchanged prop alone.
  const opacity = (n: number) => suite(page, n).evaluate((el) => getComputedStyle(el).opacity)
  await suite(page, 1200).focus()
  await page.keyboard.press('ArrowDown')
  await expect(suite(page, 1100)).toBeFocused()
  for (const n of [1100, 1110, 1200]) await suite(page, n).evaluate((el) => el.setAttribute('data-dimmed', 'true'))
  await expect.poll(() => opacity(1100)).toBe('1')
  await expect.poll(() => opacity(1110)).toBe('0.28')
  await page.keyboard.press('Enter')
  await page.keyboard.press('ArrowRight')
  await expect(suite(page, 1100)).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => opacity(1100)).toBe('1')
  await expect.poll(() => opacity(1110)).toBe('1')
  await expect.poll(() => opacity(1200)).toBe('0.28')
})

test('clicking a suite selects it and the right panel leaves its empty state', async ({ page }) => {
  await gotoApp(page)
  await expect(page.getByTestId('right-empty')).toHaveText('Enter a size to find space · click a suite for details')
  await suite(page, 500).click()
  await expect(suite(page, 500)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('right-empty')).toHaveCount(0)
})

test('shell: header, rails, main landmark and overlay attribute', async ({ page }) => {
  await gotoApp(page)
  await expect(page.getByTestId('building-switcher')).toHaveValue('odt')
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeVisible()
  await expect(page.getByRole('main')).toBeVisible()
  for (const id of ['left-rail', 'center-pane', 'right-panel']) await expect(page.getByTestId(id)).toBeVisible()
  await expect(page.locator('#root > [data-overlay]')).toHaveAttribute('data-overlay', 'none')
})

test('width: no horizontal scroll at 1280 px', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await gotoApp(page)
  await expect(page.getByTestId('stack')).toBeVisible()
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(scrollWidth).toBeLessThanOrEqual(1280)
})
