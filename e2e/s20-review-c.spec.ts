import { test, expect, type Locator, type Page } from '@playwright/test'
import { gotoApp, suite, suite3d } from './helpers'

// Fixes from the review of the legend filter, labels, details panel and present mode: what the filter leaves lit,
// a pressed pill nothing carries, and the label of a hovered suite.

const label = (page: Page, n: string) => page.getByTestId(`label3d-odt-${n}`)
const pill = (page: Page, key: string) => page.getByTestId('legend').locator(`[data-key="${key}"]`)
const opacity = (el: Locator) => el.evaluate((e) => getComputedStyle(e).opacity)
const visibleText = (el: Locator) => el.evaluate((e) => (e as HTMLElement).innerText)

async function settled(page: Page, n: string): Promise<void> {
  await expect(suite3d(page, n)).toHaveAttribute('data-screen-hit', 'true')
}

test.describe('legend filter with a search', () => {
  test('3D: a match painted otherwise than the pressed pill stays fully lit and its label readable', async ({ page }) => {
    await gotoApp(page, '3d', { legend: 'expiring', min: '5000' })
    await settled(page, '500')
    await expect(pill(page, 'expiring')).toHaveAttribute('aria-pressed', 'true')
    await expect(suite3d(page, '500')).toHaveAttribute('data-fill', 'vacant')
    await expect(suite3d(page, '500')).toHaveAttribute('data-match-rank', /\d/)
    await expect(suite3d(page, '500')).toHaveAttribute('data-filtered', 'false')
    await expect(label(page, '500')).toHaveAttribute('data-filtered', 'false')
    await expect(label(page, '500')).toHaveAttribute('data-hidden', 'false')
    await expect.poll(() => opacity(label(page, '500'))).toBe('1')
    await expect.poll(() => visibleText(label(page, '500'))).toMatch(/^500 · 10,250 SF/)
    // A suite that is neither a match nor expiring is still left out.
    await expect(suite3d(page, '900')).toHaveAttribute('data-filtered', 'true')
  })

  test('2D: the same match stays fully lit; an occupied non-match fades', async ({ page }) => {
    await gotoApp(page, 'stack', { legend: 'expiring', min: '5000' })
    await expect(suite(page, 500)).toHaveAttribute('data-match-rank', /\d/)
    await expect(suite(page, 500)).toHaveAttribute('data-filtered', 'false')
    await expect.poll(() => opacity(suite(page, 500))).toBe('1')
    await expect(suite(page, 500).getByText('Vacant', { exact: true })).toBeVisible()
    await expect(suite(page, 900)).toHaveAttribute('data-filtered', 'true')
    await expect(suite(page, 900)).toHaveAttribute('aria-label', /, filtered out$/)
  })
})

test.describe('legend filter and hover', () => {
  test('2D: the hovered suite shows through the filter', async ({ page }) => {
    await gotoApp(page, 'stack', { legend: 'vacant' })
    await expect.poll(() => opacity(suite(page, 900))).toBe('0.28')
    await suite(page, 900).hover()
    await expect.poll(() => opacity(suite(page, 900))).toBe('1')
  })

  test('3D: the hovered suite\'s label shows through the filter', async ({ page }) => {
    await gotoApp(page, '3d', { legend: 'vacant' })
    await settled(page, '900')
    await expect(label(page, '900')).toHaveAttribute('data-filtered', 'true')
    const box = await page.getByTestId('scene3d').locator('canvas').boundingBox()
    const x = Number(await suite3d(page, '900').getAttribute('data-screen-x'))
    const y = Number(await suite3d(page, '900').getAttribute('data-screen-y'))
    if (!box) throw new Error('no canvas')
    await page.mouse.move(box.x + x, box.y + y)
    await expect(label(page, '900')).toHaveAttribute('data-filtered', 'false')
    await expect.poll(() => opacity(label(page, '900'))).toBe('1')
    await page.mouse.move(box.x + 2, box.y + 2)
    await expect(label(page, '900')).toHaveAttribute('data-filtered', 'true')
  })
})

test.describe('a pressed pill no suite carries', () => {
  test('Committed pressed, then the date past its start: nothing fades and the pill stays pressed at 0 suites', async ({ page }) => {
    await gotoApp(page, 'stack')
    await pill(page, 'committed').click()
    await expect(suite(page, 900)).toHaveAttribute('data-filtered', 'true')
    await page.getByTestId('date-slider').fill('8') // Jul 2027: 1010's lease has started
    await expect(page.getByTestId('date-label')).toContainText('Jul 2027')
    await expect(pill(page, 'committed')).toHaveAttribute('aria-pressed', 'true')
    await expect(pill(page, 'committed')).toContainText('0 suites')
    await expect(page.locator('[data-testid^="suite-odt-"][data-filtered="true"]')).toHaveCount(0)
    await expect.poll(() => opacity(suite(page, 900))).toBe('1')
    // Un-pressing it keeps keyboard focus on the pill (now aria-disabled), not on the page.
    await pill(page, 'committed').focus()
    await page.keyboard.press('Enter')
    await expect(pill(page, 'committed')).toHaveAttribute('aria-pressed', 'false')
    await expect(pill(page, 'committed')).toHaveAttribute('aria-disabled', 'true')
    await expect(pill(page, 'committed')).toBeFocused()
  })

  test('3D: a shared link with ?legend=potential does not fade the building', async ({ page }) => {
    await gotoApp(page, '3d', { legend: 'potential' })
    await settled(page, '500')
    await expect(pill(page, 'potential')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('[data-testid^="suite3d-"][data-filtered="true"]')).toHaveCount(0)
    await expect.poll(() => opacity(label(page, '500'))).toBe('1')
  })
})
