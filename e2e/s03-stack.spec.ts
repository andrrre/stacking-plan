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
  test.beforeEach(async ({ page }) => gotoApp(page, 'stack'))

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

/** The line-2 text shows whole: rendered, inside its cell and not cut by an ellipsis. */
async function wholeLine(line: Locator, cell: Locator): Promise<void> {
  await expect(line).toBeVisible()
  expect(await fullyInside(line, cell)).toBe(true)
  expect(await line.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
}

test.describe('the ten-second questions', () => {
  test('Q1: exactly the vacant suites are vacant, and the uncommitted ones say "Vacant" on line 2', async ({ page }) => {
    await gotoApp(page, 'stack')
    expect(await numbersWith(page, 'data-status', 'vacant')).toEqual([...VACANT].sort((x, y) => x - y))
    for (const n of VACANT_UNCOMMITTED) {
      const cell = suite(page, n)
      await expect(cell).toHaveAttribute('data-overlay', 'none')
      await expect(cell).toContainText(`${n} · `)
      await wholeLine(cell.getByText('Vacant', { exact: true }), cell)
    }
    await expect(suite(page, 1010)).toHaveAttribute('data-overlay', 'committed')
    await expect(suite(page, 1010).getByText('Vacant', { exact: true })).toHaveCount(0)
  })

  test('Q2: exactly the expiring suites are expiring, and say "Tenant · ends MM/YYYY" at 1280 px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await gotoApp(page, 'stack')
    expect(await numbersWith(page, 'data-status', 'expiring')).toEqual([220, 400, 600, 1000])
    for (const [n, mmyyyy] of Object.entries(EXPIRING)) {
      const cell = suite(page, n)
      const line = cell.getByText(new RegExp(` · ends ${mmyyyy.replace('/', '\\/')}$`))
      await expect(line).toBeVisible()
      expect(await fullyInside(line, cell)).toBe(true)
      // The narrowest (220, 2,600 SF) may cut its tenant short with an ellipsis; the tooltip has it whole.
      if (n !== '220') expect(await line.evaluate((el) => el.scrollWidth <= el.clientWidth), n).toBe(true)
    }
  })

  test('committed 1010 says "Committed · starts 03/2027" at 1280 px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await gotoApp(page, 'stack')
    const cell = suite(page, 1010)
    await wholeLine(cell.getByText('Committed · starts 03/2027', { exact: true }), cell)
    await expect(cell).toContainText('1010 · 3,000 SF')
  })

  test('a suite under 2,500 SF shows only its number; the rest is in its name and tooltip', async ({ page }) => {
    await gotoApp(page, 'stack')
    const cell = suite(page, 720)
    await expect(cell).toHaveAttribute('data-compact', 'true')
    expect(await cell.evaluate((el) => (el as HTMLElement).innerText.trim())).toBe('720')
    await expect(cell).toHaveAttribute('aria-label', /Halcyon Tide Realty, 1,900 SF/)
  })
})

test('legend: a pill per status with its count and space, and the assumption line', async ({ page }) => {
  await gotoApp(page, 'stack')
  const pills = page.getByTestId('legend').getByTestId('legend-pill')
  await expect(pills).toHaveText([
    'Vacant6 suites · 35,150 SF', 'Potential0 suites', 'Expiring ≤ 12 mo4 suites · 26,500 SF',
    'Committed1 suite · 3,000 SF', 'Occupied18 suites · 70,150 SF', 'Common area3 suites · 12,400 SF',
  ])
  for (const pill of await pills.all()) await expect(pill).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('legend-assumption')).toHaveText(
    'A lease that ends is assumed not renewed: shown as potential',
  )
})

test('legend filter: a pill dims every other status to 28%, another pill switches, the same pill clears', async ({ page }) => {
  await gotoApp(page, 'stack')
  const pill = (key: string) => page.getByTestId('legend').locator(`[data-key="${key}"]`)
  const opacity = (n: number) => suite(page, n).evaluate((el) => getComputedStyle(el).opacity)
  await pill('vacant').click()
  await expect(pill('vacant')).toHaveAttribute('aria-pressed', 'true')
  expect(await numbersWith(page, 'data-filtered', 'false')).toEqual(VACANT_UNCOMMITTED)
  await expect.poll(() => opacity(600)).toBe('0.28')
  await expect.poll(() => opacity(500)).toBe('1')
  await expect(page).toHaveURL(/legend=vacant/)
  await pill('expiring').click()
  await expect(pill('vacant')).toHaveAttribute('aria-pressed', 'false')
  expect(await numbersWith(page, 'data-filtered', 'false')).toEqual([220, 400, 600, 1000])
  await pill('expiring').click()
  expect(await numbersWith(page, 'data-filtered', 'true')).toEqual([])
  await expect.poll(() => opacity(600)).toBe('1')
  await expect(page).not.toHaveURL(/legend=/)
})

test('legend filter: a selected suite stays selectable, lit and detailed while filtered out', async ({ page }) => {
  await gotoApp(page, 'stack', { legend: 'vacant' })
  await suite(page, 600).click()
  await expect(suite(page, 600)).toHaveAttribute('aria-pressed', 'true')
  await expect(suite(page, 600)).toHaveAttribute('data-filtered', 'true')
  await expect.poll(() => suite(page, 600).evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
  await expect(page.getByTestId('suite-details')).toContainText('Suite 600')
})

test('keyboard: one tab stop, arrows move focus, Enter selects, Escape clears', async ({ page }) => {
  await gotoApp(page, 'stack')
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
  await gotoApp(page, 'stack')
  // Mark suites dimmed directly rather than through a search or KPI highlight; React leaves the unchanged prop alone.
  const opacity = (n: number) => suite(page, n).evaluate((el) => getComputedStyle(el).opacity)
  // The dimmed opacity is a design token, so assert "dimmed" rather than a literal value.
  const dimmed = async (n: number) => Number(await opacity(n)) < 1
  await suite(page, 1200).focus()
  await page.keyboard.press('ArrowDown')
  await expect(suite(page, 1100)).toBeFocused()
  for (const n of [1100, 1110, 1200]) await suite(page, n).evaluate((el) => el.setAttribute('data-dimmed', 'true'))
  await expect.poll(() => opacity(1100)).toBe('1')
  await expect.poll(() => dimmed(1110)).toBe(true)
  await page.keyboard.press('Enter')
  await page.keyboard.press('ArrowRight')
  await expect(suite(page, 1100)).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => opacity(1100)).toBe('1')
  await expect.poll(() => opacity(1110)).toBe('1')
  await expect.poll(() => dimmed(1200)).toBe(true)
})

test('clicking a suite selects it and opens the details drawer', async ({ page }) => {
  await gotoApp(page, 'stack')
  await expect(page.getByTestId('stage-hint')).toHaveText('Click a suite for details · enter a size to find space')
  await expect(page.getByTestId('right-panel')).toHaveAttribute('data-open', 'false')
  await suite(page, 500).click()
  await expect(suite(page, 500)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('right-panel')).toHaveAttribute('data-open', 'true')
  await expect(page.getByTestId('stage-hint')).toHaveCount(0)
})

test('shell: header, rails, main landmark and overlay attribute', async ({ page }) => {
  await gotoApp(page, 'stack')
  await expect(page.getByTestId('building-switcher')).toHaveValue('odt')
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeVisible()
  await expect(page.getByRole('main')).toBeVisible()
  for (const id of ['left-rail', 'center-pane']) await expect(page.getByTestId(id)).toBeVisible()
  await expect(page.getByTestId('right-panel')).toBeAttached() // the details drawer: closed until something is selected
  await expect(page.getByRole('complementary', { name: 'Details' })).toHaveCount(0) // inert: not in the accessibility tree
  await suite(page, 500).click()
  await expect(page.getByRole('complementary', { name: 'Details' })).toBeVisible()
  await expect(page.locator('#root > [data-overlay]')).toHaveAttribute('data-overlay', 'none')
})

test('width: no horizontal scroll at 1280 px', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await gotoApp(page, 'stack')
  await expect(page.getByTestId('stack')).toBeVisible()
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(scrollWidth).toBeLessThanOrEqual(1280)
})
