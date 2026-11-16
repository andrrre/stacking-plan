import { test, expect, type Locator, type Page } from '@playwright/test'
import { gotoApp, suite, suite3d } from './helpers'

// The night theme's second phase: the legend as a filter (3D), upright two-line building labels, the suite
// details card with Floor N at a glance and Floor plan, and presentation mode.

const label = (page: Page, n: string) => page.getByTestId(`label3d-odt-${n}`)
const pill = (page: Page, key: string) => page.getByTestId('legend').locator(`[data-key="${key}"]`)
const opacity = (el: Locator) => el.evaluate((e) => getComputedStyle(e).opacity)

/** Waits until the scene has reported where `n` is on the canvas (the camera has settled). */
async function settled(page: Page, n: string): Promise<void> {
  await expect(suite3d(page, n)).toHaveAttribute('data-screen-hit', 'true')
}

/** The computed transform of every shown label, as [a, b, c, d] of its 2D matrix (1, 0, 0, 1 when upright). */
const shownLabelMatrices = (page: Page) =>
  page.locator('[data-testid^="label3d-"][data-hidden="false"]').evaluateAll((els) => els.map((el) => {
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform)
    return { id: el.getAttribute('data-testid'), turned: el.getAttribute('data-turned'), abcd: [m.a, m.b, m.c, m.d], is2D: m.is2D }
  }))

test.describe('legend filter on the 3D building', () => {
  test('a pill fades every other suite and its label to 28%; pressing it again clears', async ({ page }) => {
    await gotoApp(page, '3d')
    await settled(page, '500')
    await pill(page, 'vacant').click()
    await expect(pill(page, 'vacant')).toHaveAttribute('aria-pressed', 'true')
    await expect(suite3d(page, '600')).toHaveAttribute('data-filtered', 'true')
    await expect(suite3d(page, '500')).toHaveAttribute('data-filtered', 'false')
    await expect(label(page, '600')).toHaveAttribute('data-filtered', 'true')
    await expect.poll(() => opacity(label(page, '600'))).toBe('0.28')
    await expect.poll(() => opacity(label(page, '500'))).toBe('1')
    await expect(page.locator('[data-testid^="suite3d-"][data-filtered="false"]')).toHaveCount(6)
    await pill(page, 'vacant').click()
    await expect(page.locator('[data-testid^="suite3d-"][data-filtered="true"]')).toHaveCount(0)
    await expect.poll(() => opacity(label(page, '600'))).toBe('1')
  })

  test('a selected suite stays selectable and detailed while filtered out', async ({ page }) => {
    await gotoApp(page, '3d', { legend: 'vacant' })
    await settled(page, '600')
    await suite3d(page, '600').evaluate((el) => (el as HTMLElement).click())
    await expect(suite3d(page, '600')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('suite-details')).toContainText('Suite 600')
    await expect.poll(() => opacity(label(page, '600'))).toBe('1') // lit, so its selection reads
  })

  test('switching building clears the filter', async ({ page }) => {
    await gotoApp(page, 'stack', { legend: 'vacant' })
    await expect(pill(page, 'vacant')).toHaveAttribute('aria-pressed', 'true')
    await page.getByTestId('building-switcher').selectOption('pbp')
    await expect(page.getByTestId('building-switcher')).toHaveValue('pbp')
    await expect(page.getByTestId('legend').locator('[aria-pressed="true"]')).toHaveCount(0)
    await expect(page).not.toHaveURL(/legend=/)
  })
})

test.describe('building labels', () => {
  test('sit upright on the facade (no skew or rotation) and say "number · SF" over the status, at the default view', async ({ page }) => {
    await gotoApp(page, '3d')
    await settled(page, '500')
    await expect(label(page, '500')).toHaveAttribute('data-hidden', 'false')
    const matrices = await shownLabelMatrices(page)
    expect(matrices.length).toBeGreaterThan(20)
    for (const m of matrices) {
      expect(m.is2D, m.id ?? '').toBe(true)
      expect(m.abcd, m.id ?? '').toEqual([1, 0, 0, 1])
    }
    expect(await label(page, '500').evaluate((el) => (el as HTMLElement).innerText)).toBe('500 · 10,250 SF\nVacant')
  })

  test('show two lines where the face is tall enough: zoomed in, line 2 is the tenant or status', async ({ page }) => {
    await gotoApp(page, '3d')
    await settled(page, '900')
    for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Zoom in' }).click()
    await expect(label(page, '900')).toHaveAttribute('data-lines', '2')
    await expect.poll(() => label(page, '900').evaluate((el) => (el as HTMLElement).innerText)).toMatch(/^900 · 12,400 SF\s+Coralstone Insurance$/)
    for (const m of await shownLabelMatrices(page)) expect(m.abcd, m.id ?? '').toEqual([1, 0, 0, 1])
  })

  test('a suite under 2,500 SF shows only its number', async ({ page }) => {
    await gotoApp(page, '3d')
    await settled(page, '720')
    await expect(label(page, '720')).toHaveAttribute('data-hidden', 'false')
    await expect(label(page, '720')).toHaveAttribute('data-parts', 'number')
    expect(await label(page, '720').evaluate((el) => (el as HTMLElement).innerText)).toBe('720')
  })

  test('stay upright with floors separated too', async ({ page }) => {
    await gotoApp(page, '3d')
    await page.getByTestId('separate-floors').click()
    await expect(page.getByTestId('scene3d')).toHaveAttribute('data-floors-moving', 'false')
    await settled(page, '1200')
    const matrices = await shownLabelMatrices(page)
    expect(matrices.length).toBeGreaterThan(10)
    for (const m of matrices) expect(m.abcd, m.id ?? '').toEqual([1, 0, 0, 1])
  })
})

test.describe('suite details', () => {
  test('the card: chip, tenant line, Floor / Size / Lease / Contiguous; Floor 7 at a glance selects on click', async ({ page }) => {
    await gotoApp(page, '3d')
    await settled(page, '700')
    await suite3d(page, '700').evaluate((el) => (el as HTMLElement).click())
    const details = page.getByTestId('suite-details')
    await expect(details.getByRole('heading', { level: 2 })).toHaveText('Suite 700')
    await expect(details.getByTestId('suite-chip')).toHaveText('Vacant')
    await expect(details.getByTestId('suite-tenant')).toHaveText('Available for lease')
    await expect(details.getByTestId('suite-grid')).toHaveText('Floor7Size4,300 SFLeaseAvailable nowContiguous on floor10,500 SF')
    const glance = page.getByTestId('floor-glance')
    await expect(glance.getByRole('heading')).toHaveText('Floor 7 at a glance')
    await expect(glance.getByTestId('glance-odt-700')).toHaveAttribute('aria-current', 'true')
    await glance.getByTestId('glance-odt-720').click()
    await expect(suite3d(page, '720')).toHaveAttribute('aria-pressed', 'true')
    await expect(details.getByRole('heading', { level: 2 })).toHaveText('Suite 720')
    await expect(page.getByTestId('glance-odt-720')).toHaveAttribute('aria-current', 'true')
  })

  test('Add to client summary saves the suite for the client summary and can take it back', async ({ page }) => {
    await gotoApp(page, 'stack')
    await suite(page, 500).click()
    const add = page.getByTestId('add-to-summary')
    await add.click()
    await expect(add).toHaveText('Remove from client summary')
    await expect(page.getByTestId('open-summary')).toBeEnabled()
    await add.click()
    await expect(add).toHaveText('Add to client summary')
    await expect(page.getByTestId('open-summary')).toBeDisabled()
  })

  test('Floor plan from the 2D stack opens the 3D floor view on the suite\'s floor', async ({ page }) => {
    await gotoApp(page, 'stack')
    await suite(page, 600).click()
    await page.getByTestId('open-floor-plan').click()
    await expect(page.getByTestId('view-3d')).toBeChecked()
    await expect(page.getByTestId('stack-3d')).toHaveAttribute('data-floor', '6')
    await expect(page.getByTestId('floor-view')).toHaveAttribute('aria-pressed', 'true')
    await expect(page).toHaveURL(/[?&]floor=6(&|$)/)
    await expect(suite3d(page, '600')).toHaveAttribute('aria-pressed', 'true')
  })

  test('Floor plan with floors separated leaves separated floors for floor view', async ({ page }) => {
    await gotoApp(page, '3d')
    await page.getByTestId('separate-floors').click()
    await settled(page, '500')
    await suite3d(page, '500').evaluate((el) => (el as HTMLElement).click())
    await page.getByTestId('open-floor-plan').click()
    await expect(page.getByTestId('stack-3d')).toHaveAttribute('data-floor', '5')
    await expect(page.getByTestId('separate-floors')).toHaveAttribute('aria-pressed', 'false')
  })
})

test.describe('presentation mode', () => {
  test('Present shuts both drawers without errors; the button leaves it and the left drawer comes back', async ({ page }) => {
    const problems: string[] = []
    page.on('pageerror', (e) => problems.push(e.message))
    page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()) })
    await gotoApp(page, 'stack')
    await suite(page, 500).click()
    await expect(page.getByTestId('right-panel')).toHaveAttribute('data-open', 'true')
    const present = page.getByTestId('present')
    await present.click()
    await expect(present).toHaveAttribute('aria-pressed', 'true')
    await expect(present).toHaveText('Exit presentation')
    await expect(page.getByTestId('left-drawer-toggle')).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByTestId('right-panel')).toHaveAttribute('data-open', 'false')
    await present.click()
    await expect(present).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('left-drawer-toggle')).toHaveAttribute('aria-expanded', 'true')
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true) // left, wherever it was granted
    expect(problems).toEqual([])
  })

  test('Escape leaves it', async ({ page }) => {
    await gotoApp(page, 'stack')
    await page.getByTestId('present').click()
    await expect(page.getByTestId('present')).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('present')).toHaveAttribute('aria-pressed', 'false')
  })

  test('is not printed and not put in the URL', async ({ page }) => {
    await gotoApp(page, 'stack')
    await page.getByTestId('present').click()
    await expect(page).not.toHaveURL(/present/)
    await page.emulateMedia({ media: 'print' })
    await expect(page.getByTestId('present')).toBeHidden()
  })
})
