import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { gotoApp } from './helpers'

type Bundled = { floors: { suites: { leases: { tenant: string }[] }[] }[] }
const tenantsOf = (file: string): string[] => {
  const b = JSON.parse(readFileSync(file, 'utf8')) as Bundled
  return b.floors.flatMap((f) => f.suites.flatMap((s) => s.leases.map((l) => l.tenant)))
}
const ALL_TENANTS = [...tenantsOf('src/data/ocean-drive-tower.json'), ...tenantsOf('src/data/palm-bay-plaza.json')]

test.describe('shortlist, compare, client summary', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __prints: number }
      w.__prints = 0
      window.print = () => { w.__prints += 1 }
    })
    await gotoApp(page, 'stack')
    await page.getByTestId('req-min-sf').fill('10000')
  })

  test('saving the same match twice keeps one entry, and the entry does not move with the date', async ({ page }) => {
    await page.getByTestId('save-match-1').click()
    await expect(page.getByTestId('save-match-1')).toContainText('Saved')
    await page.getByTestId('save-match-1').click()
    await expect(page.getByTestId('shortlist-entry-1')).toBeVisible()
    await expect(page.getByTestId('shortlist-entry-2')).toHaveCount(0)
    const before = (await page.getByTestId('shortlist-entry-1').textContent()) ?? ''
    expect(before).toContain('Suite 500')

    await page.getByTestId('date-slider').fill('8')
    await expect(page.getByTestId('date-label')).toContainText('Jul 2027')
    await expect(page.getByTestId('shortlist-entry-1')).toHaveText(before)
    await expect(page.getByTestId('save-match-1')).not.toContainText('Saved')
  })

  test('a shortlist option number does not look like a match rank', async ({ page }) => {
    await page.getByTestId('save-match-1').click()
    const look = (el: import('@playwright/test').Locator) => el.evaluate((n) => {
      const cs = getComputedStyle(n)
      return { bg: cs.backgroundColor, radius: cs.borderTopLeftRadius }
    })
    const option = await look(page.getByTestId('shortlist-entry-1').locator('[aria-hidden="true"]').first())
    const rank = await look(page.getByTestId('match-1').locator('[aria-hidden="true"]').first())
    expect(option.bg).not.toBe(rank.bg)
    expect(option.radius).not.toBe(rank.radius)
  })

  test('an entry can be removed, and the summary button needs one', async ({ page }) => {
    await expect(page.getByTestId('open-summary')).toBeDisabled()
    await page.getByTestId('save-match-1').click()
    await expect(page.getByTestId('open-summary')).toBeEnabled()
    await page.getByTestId('shortlist-remove-1').click()
    await expect(page.getByTestId('shortlist-entry-1')).toHaveCount(0)
    await expect(page.getByTestId('open-summary')).toBeDisabled()
  })

  test('compare shows one row per entry; focus moves in and returns; Escape closes', async ({ page }) => {
    await page.getByTestId('save-match-1').click()
    await page.getByTestId('save-match-2').click()
    const opener = page.getByTestId('open-compare')
    await opener.click()
    const dialog = page.getByTestId('compare-dialog')
    await expect(dialog).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Compare options' })).toBeVisible()
    await expect(dialog.locator('[data-testid^="compare-row-"]')).toHaveCount(2)
    await expect(page.getByTestId('compare-row-1')).toContainText('Suite 500')
    await expect(page.getByTestId('compare-row-2')).toContainText('Suites 700 + 710')
    expect(await page.evaluate(() => document.activeElement?.closest('[role=dialog]') !== null)).toBe(true)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(opener).toBeFocused()
  })

  test('a click on dialog text or the backdrop does not break Escape or Tab, and the page behind is inert', async ({ page }) => {
    await page.getByTestId('save-match-1').click()
    await page.getByTestId('open-compare').click()
    const dialog = page.getByTestId('compare-dialog')
    await expect(page.locator('[data-print="shell"]')).toHaveAttribute('inert', '')
    await page.getByRole('heading', { name: 'Compare options' }).click()
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => document.activeElement?.closest('[role=dialog]') !== null)).toBe(true)
    await page.getByRole('heading', { name: 'Compare options' }).click()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('[data-print="shell"]')).not.toHaveAttribute('inert', '')
    await expect(page.getByTestId('open-compare')).toBeFocused()
  })

  test('Escape in the dialog does not clear a KPI highlight', async ({ page }) => {
    await page.getByTestId('save-match-1').click()
    await page.getByTestId('kpi-vacant').click()
    await page.getByTestId('open-compare').click()
    await page.getByRole('heading', { name: 'Compare options' }).click()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('compare-dialog')).toHaveCount(0)
    await expect(page.getByTestId('kpi-vacant')).toHaveAttribute('aria-pressed', 'true')
  })

  test('the client summary at Jul 2027 never names a tenant or shows a lease rent, and prints', async ({ page }) => {
    await page.getByTestId('save-match-1').click()
    await page.getByTestId('date-slider').fill('8')
    await expect(page.getByTestId('date-label')).toContainText('Jul 2027')
    await expect(page.getByTestId('match-outline-1')).toBeVisible()
    const six = page.locator('[data-testid^="match-"][data-key="odt-600"]')
    await six.getByRole('button', { name: /Save to shortlist/ }).click()
    await expect(page.getByTestId('shortlist-entry-2')).toContainText('Suite 600')

    const opener = page.getByTestId('open-summary')
    await opener.click()
    const summary = page.getByTestId('client-summary')
    await expect(summary).toBeVisible()
    const text = await summary.innerText()
    expect(text).not.toContain('Flamingo')
    for (const t of ALL_TENANTS) expect(text, t).not.toContain(t)
    expect(text).toContain('Prepared 15 Nov 2026')
    expect(text).toContain('Subject to the current tenant vacating (30 Apr 2027)')
    expect(text).toContain('Ocean Drive Tower')
    await expect(page.getByTestId('compare-row-2')).toContainText('1 May 2027')
    await expect(summary.getByTestId('match-outline-2')).toContainText('600')
    await expect(summary.locator('[data-status]')).toHaveCount(0)

    await page.getByTestId('summary-print').click()
    expect(await page.evaluate(() => (window as unknown as { __prints: number }).__prints)).toBe(1)

    await page.keyboard.press('Escape')
    await expect(summary).toHaveCount(0)
    await expect(opener).toBeFocused()
  })

  test('shortlist survives a reload', async ({ page }) => {
    await page.getByTestId('save-match-1').click()
    await gotoApp(page, 'stack')
    await expect(page.getByTestId('shortlist-entry-1')).toContainText('Suite 500')
  })
})
