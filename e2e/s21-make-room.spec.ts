import { test, expect } from '@playwright/test'
import { gotoApp, suite } from './helpers'

test.describe('make room', () => {
  test('min 12,000: preview a move, apply it as a scenario, reset', async ({ page }) => {
    await gotoApp(page, 'stack')
    await page.getByTestId('req-min-sf').fill('12,000')

    await expect(page.getByTestId('no-fit')).toBeVisible()
    const options = page.getByTestId('move-option')
    await expect(options).toHaveCount(1)
    await expect(options).toContainText('Northpier Engineering')
    await expect(options).toContainText('Suite 510')
    await expect(options).toContainText('Suite 410')
    await expect(options).toContainText('12,400 SF on floor 5')

    await page.getByTestId('show-move').click()
    await expect(suite(page, 510)).toHaveAttribute('data-move', 'out')
    await expect(suite(page, 410)).toHaveAttribute('data-move', 'in')
    await expect(page.locator('[data-move]')).toHaveCount(2)
    await expect(page.getByTestId('scenario-bar')).toHaveCount(0)

    await page.getByTestId('apply-move').click()
    const match = page.getByTestId('match-1')
    await expect(match).toContainText('Suites 500 + 510')
    await expect(match).toContainText('12,400 SF')
    await expect(page.getByTestId('scenario-occupancy')).toContainText('72% → 73%')
    await expect(page.getByTestId('scenario-rent-roll')).toContainText('+$86,950')
    await expect(page.locator('[data-move]')).toHaveCount(0)

    await page.getByTestId('scenario-reset').click()
    await expect(page.getByTestId('scenario-bar')).toHaveCount(0)
    await expect(page.getByTestId('no-fit')).toBeVisible()
    await expect(page.getByTestId('make-room')).toBeVisible()
  })
})
