import { test, expect, type Page } from '@playwright/test'
import { gotoApp, suite } from './helpers'

async function placeTenantOn500(page: Page) {
  await page.getByTestId('req-min-sf').fill('10,000')
  await page.getByTestId('match-1').getByRole('button', { name: /Suite 500/ }).click()
  await page.getByTestId('place-tenant').click()
  const dialog = page.getByTestId('change-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Suite 500')
  await expect(page.getByTestId('change-dialog').getByLabel('Tenant')).toBeFocused()
  await page.getByTestId('change-submit').click()
  await expect(dialog).toHaveCount(0)
}

async function openSuiteAction(page: Page, number: number, action: 'renew' | 'vacate' | 'lease') {
  await suite(page, number).click()
  await page.getByTestId(`action-${action}`).click()
  await expect(page.getByTestId('change-dialog')).toBeVisible()
}

test.describe('scenario simulator', () => {
  test.beforeEach(async ({ page }) => gotoApp(page, 'stack'))

  test('no scenario bar until a change is added', async ({ page }) => {
    await expect(page.getByTestId('kpi-occupancy-value')).toHaveText('72%')
    await expect(page.getByTestId('scenario-bar')).toHaveCount(0)
  })

  test('place tenant on Suite 500: 72% → 79%, +$492,000, 500 occupied and modified', async ({ page }) => {
    await placeTenantOn500(page)

    await expect(page.getByTestId('scenario-count')).toHaveText('1 change')
    await expect(page.getByTestId('scenario-occupancy')).toContainText('72% → 79%')
    await expect(page.getByTestId('scenario-vacant')).toContainText('38,150 SF → 27,900 SF')
    await expect(page.getByTestId('scenario-rent-roll')).toContainText('+$492,000')
    await expect(page.getByTestId('kpi-occupancy-value')).toHaveText('79%')

    const s500 = suite(page, 500)
    await expect(s500).toHaveAttribute('data-modified', 'true')
    await expect(s500).toHaveAttribute('data-status', 'occupied')
    await expect(s500).toContainText('Prospect')
    await expect(suite(page, 510)).toHaveAttribute('data-modified', 'false')

    // The placed suite is selected and its heading takes focus; the matches recompute on the scenario building.
    await expect(page.getByTestId('suite-details')).toContainText('Prospect')
    await expect(page.getByRole('heading', { name: 'Suite 500' })).toBeFocused()
    await page.getByTestId('right-drawer-close').click()
    await expect(page.getByTestId('match-1')).toHaveAttribute('data-key', 'odt-700+odt-710')
  })

  test('place tenant on a multi-suite match (700 + 710)', async ({ page }) => {
    await page.getByTestId('req-min-sf').fill('10,000')
    await page.getByTestId('match-2').getByRole('button', { name: /Suites 700 \+ 710/ }).click()
    await page.getByTestId('place-tenant').click()
    await expect(page.getByTestId('change-dialog')).toContainText('Suites 700 + 710')
    await expect(page.getByTestId('change-dialog').getByLabel(/^Rent/)).toHaveValue('52.18')
    await page.getByTestId('change-submit').click()
    await expect(suite(page, 700)).toHaveAttribute('data-modified', 'true')
    await expect(suite(page, 710)).toHaveAttribute('data-modified', 'true')
    await expect(suite(page, 710)).toHaveAttribute('data-status', 'occupied')
  })

  test('Escape closes the dialog without applying and returns focus', async ({ page }) => {
    await page.getByTestId('req-min-sf').fill('10,000')
    await page.getByTestId('match-1').getByRole('button', { name: /Suite 500/ }).click()
    await page.getByTestId('place-tenant').click()
    await expect(page.getByTestId('change-dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('change-dialog')).toHaveCount(0)
    await expect(page.getByTestId('place-tenant')).toBeFocused()
    await expect(page.getByTestId('scenario-bar')).toHaveCount(0)
  })

  test('a lease to prospect on 1010 from 2027-01-01 is rejected with a message', async ({ page }) => {
    await openSuiteAction(page, 1010, 'lease')
    await page.getByTestId('change-dialog').getByLabel('Start', { exact: true }).fill('2027-01-01')
    await page.getByTestId('change-submit').click()
    await expect(page.getByTestId('change-error')).toContainText('Suite 1010 is leased to Bayfront Dental Group')
    await expect(page.getByTestId('change-dialog')).toBeVisible()
    await expect(page.getByTestId('scenario-bar')).toHaveCount(0)
  })

  test('renewing 600 to 2032-04-30 removes it from the Jul 2027 matches', async ({ page }) => {
    await openSuiteAction(page, 600, 'renew')
    await expect(page.getByTestId('change-dialog').getByLabel('New end date')).toHaveValue('2032-04-30')
    await page.getByTestId('change-submit').click()
    await expect(page.getByTestId('scenario-count')).toHaveText('1 change')
    await expect(suite(page, 600)).toHaveAttribute('data-modified', 'true')

    await page.getByTestId('right-drawer-close').click()
    await page.getByTestId('req-min-sf').fill('10,000')
    await page.getByTestId('date-slider').fill('8')
    await expect(page.getByTestId('date-label')).toContainText('Jul 2027')
    await expect(page.getByTestId('match-list')).toBeVisible()
    await expect(page.getByTestId('match-list')).not.toContainText('Suite 600')
    await expect(suite(page, 600)).not.toHaveAttribute('data-match-rank', /.+/)
    await expect(suite(page, 600)).toHaveAttribute('data-status', 'occupied')
  })

  test('renew is disabled for the open-ended 230', async ({ page }) => {
    await suite(page, 230).click()
    await expect(page.getByTestId('action-renew')).toBeDisabled()
  })

  test('vacating 600 makes it plain vacant after its end', async ({ page }) => {
    await openSuiteAction(page, 600, 'vacate')
    await expect(page.getByTestId('change-dialog').getByLabel('Vacate on')).toHaveValue('2027-04-30')
    await page.getByTestId('change-submit').click()
    await page.getByTestId('date-slider').fill('8')
    await expect(page.getByTestId('date-label')).toContainText('Jul 2027')
    await expect(suite(page, 600)).toHaveAttribute('data-status', 'vacant')
    await expect(suite(page, 600)).toHaveAttribute('data-overlay', 'none')
  })

  test('Reset clears the scenario', async ({ page }) => {
    await placeTenantOn500(page)
    await expect(page.getByTestId('scenario-bar')).toBeVisible()
    await page.getByTestId('scenario-reset').click()
    await expect(page.getByTestId('scenario-bar')).toHaveCount(0)
    await expect(suite(page, 500)).toHaveAttribute('data-modified', 'false')
    await expect(suite(page, 500)).toHaveAttribute('data-status', 'vacant')
    await expect(page.getByTestId('kpi-occupancy-value')).toHaveText('72%')
  })
})
