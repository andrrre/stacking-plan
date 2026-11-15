import { test, expect } from '@playwright/test'
import { gotoApp, suite } from './helpers'

test('KPI tiles show the A14 values at today', async ({ page }) => {
  await gotoApp(page)
  await expect(page.getByTestId('kpi-occupancy-value')).toHaveText('72%')
  await expect(page.getByTestId('kpi-vacant-value')).toHaveText('38,150 SF')
  await expect(page.getByTestId('kpi-vacant-potential')).toContainText('committed 3,000')
  await expect(page.getByTestId('kpi-expiring-value')).toHaveText('26,500 SF')
  await expect(page.getByTestId('kpi-largest-block-value')).toHaveText('10,500 SF · Fl 7')
})

test('clicking the largest-block tile lights exactly 700 and 710; Esc restores', async ({ page }) => {
  await gotoApp(page)
  const tile = page.getByTestId('kpi-largest-block')
  await tile.click()
  await expect(tile).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-testid^="suite-odt-"][data-dimmed="false"]')).toHaveCount(2)
  await expect(suite(page, 700)).toHaveAttribute('data-dimmed', 'false')
  await expect(suite(page, 710)).toHaveAttribute('data-dimmed', 'false')
  await page.keyboard.press('Escape')
  await expect(tile).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('[data-testid^="suite-odt-"][data-dimmed="true"]')).toHaveCount(0)
})

test('a second click on a tile restores the overlay', async ({ page }) => {
  await gotoApp(page)
  const tile = page.getByTestId('kpi-vacant')
  await tile.click()
  await tile.click()
  await expect(tile).toHaveAttribute('aria-pressed', 'false')
  await expect(suite(page, 600)).toHaveAttribute('data-dimmed', 'false')
})

test('selecting suite 600 shows its details; Close returns to the empty panel', async ({ page }) => {
  await gotoApp(page)
  await suite(page, 600).click()
  const panel = page.getByTestId('suite-details')
  await expect(panel).toContainText('Flamingo Row Media')
  await expect(panel).toContainText('12,400 SF')
  await expect(panel).toContainText('$48.00')
  await expect(panel).toContainText('30 Apr 2027')
  await expect(panel).toContainText('Expiring')
  await expect(panel).toContainText('5 months')
  await page.getByRole('button', { name: 'Close details' }).click()
  await expect(page.getByTestId('right-empty')).toBeVisible()
})

test('suite 700 says it can combine with 710', async ({ page }) => {
  await gotoApp(page)
  await suite(page, 700).click()
  await expect(page.getByTestId('suite-details')).toContainText('Can combine with 710')
})
