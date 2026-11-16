import { test, expect } from '@playwright/test'
import { gotoApp, suite } from './helpers'

test('KPI tiles show the A14 values at today', async ({ page }) => {
  await gotoApp(page, 'stack')
  await expect(page.getByTestId('kpi-occupancy-value')).toHaveText('72%')
  await expect(page.getByTestId('kpi-vacant-value')).toHaveText('38,150 SF')
  await expect(page.getByTestId('kpi-vacant-potential')).toHaveText('3,000 SF committed')
  await expect(page.getByTestId('kpi-expiring-value')).toHaveText('26,500 SF')
  await expect(page.getByTestId('kpi-expiring-leases')).toHaveText('4 leases')
  await expect(page.getByTestId('kpi-largest-block-value')).toHaveText('10,500 SF · Floor 7')
  await expect(page.getByTestId('kpi-largest-block-suites')).toHaveText('Suites 700 + 710')
})

test('the lease count and the block suites follow the date slider', async ({ page }) => {
  await gotoApp(page, 'stack')
  await page.getByTestId('date-slider').fill('8')
  await expect(page.getByTestId('date-label')).toContainText('Jul 2027')
  await expect(page.getByTestId('kpi-expiring-leases')).toHaveText('6 leases')
  await expect(page.getByTestId('kpi-largest-block-suites')).toHaveText('Suite 600')
})

test('clicking the largest-block tile lights exactly 700 and 710; Esc restores', async ({ page }) => {
  await gotoApp(page, 'stack')
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
  await gotoApp(page, 'stack')
  const tile = page.getByTestId('kpi-vacant')
  await tile.click()
  await tile.click()
  await expect(tile).toHaveAttribute('aria-pressed', 'false')
  await expect(suite(page, 600)).toHaveAttribute('data-dimmed', 'false')
})

test('selecting suite 600 shows its details; Close clears the selection and closes the drawer', async ({ page }) => {
  await gotoApp(page, 'stack')
  await suite(page, 600).click()
  const panel = page.getByTestId('suite-details')
  await expect(panel).toContainText('Flamingo Row Media')
  await expect(panel).toContainText('12,400 SF')
  await expect(panel).toContainText('$48.00')
  await expect(panel).toContainText('30 Apr 2027')
  await expect(panel).toContainText('Expiring')
  await expect(panel).toContainText('5 months')
  await page.getByRole('button', { name: 'Close details' }).click()
  await expect(page.getByTestId('right-panel')).toHaveAttribute('data-open', 'false')
  await expect(suite(page, 600)).toHaveAttribute('aria-pressed', 'false')
})

test('suite 700 says it can combine with 710', async ({ page }) => {
  await gotoApp(page, 'stack')
  await suite(page, 700).click()
  await expect(page.getByTestId('suite-details')).toContainText('Can combine with 710')
})
