import { test, expect } from '@playwright/test'
import { gotoApp } from './helpers'

// No URL assertions here: the URL spec checks the serialized URL after a jump.
test.describe('why this works, no-fit, jump to date', () => {
  test.beforeEach(async ({ page }) => gotoApp(page))

  test('selecting match 2 shows why it works; the back button returns to the list', async ({ page }) => {
    await page.getByTestId('req-min-sf').fill('10,000')
    await page.getByTestId('match-2').getByRole('button', { name: /^Match 2:/ }).click()

    const why = page.getByTestId('match-why')
    await expect(why).toBeVisible()
    await expect(why).toContainText('Suites 700 + 710')
    await expect(why).toContainText('10,500 SF')
    await expect(why).toContainText('+500 SF')
    await expect(why).toContainText('$52.18')
    await expect(page.getByTestId('match-why-caveat')).toHaveText(['Requires combining 2 suites.'])

    await why.getByRole('button', { name: /all matches/i }).click()
    await expect(page.getByTestId('match-list')).toBeVisible()
    await expect(page.getByTestId('match-2').getByRole('button', { name: /^Match 2:/ })).toHaveAttribute('aria-pressed', 'false')
  })

  test('Clear while a match is selected returns to the empty panel', async ({ page }) => {
    await page.getByTestId('req-min-sf').fill('10,000')
    await page.getByTestId('match-1').getByRole('button', { name: /^Match 1:/ }).click()
    await expect(page.getByTestId('match-why')).toBeVisible()
    await page.getByTestId('req-clear').click()
    await expect(page.getByTestId('right-empty')).toBeVisible()
  })

  test('min 12,000: reasons, then Jump to date lands on May 2027 with Suite 600', async ({ page }) => {
    await page.getByTestId('req-include-potential').uncheck()
    await page.getByTestId('req-min-sf').fill('12,000')

    await expect(page.getByTestId('no-fit-reason')).toHaveText([
      'Largest block is 10,500 SF on floor 7.',
      '35,150 SF is available, but split into 5 blocks on 4 floors.',
    ])
    await expect(page.getByTestId('no-fit')).toContainText('Earliest fit: May 2027 — Suite 600 (potential).')

    await page.getByTestId('jump-to-date').click()
    await expect(page.getByTestId('date-label')).toContainText('May 2027')
    await expect(page.getByTestId('req-include-potential')).toBeChecked()
    await expect(page.getByTestId('match-1')).toHaveAttribute('data-key', 'odt-600')
    await expect(page.getByTestId('match-1')).toContainText('Suite 600')
    await expect(page.getByTestId('no-fit')).toHaveCount(0)
  })

  test('min 60,000: no fit in the next 5 years, no jump', async ({ page }) => {
    await page.getByTestId('req-min-sf').fill('60,000')
    await expect(page.getByTestId('no-fit')).toContainText('No fit in the next 5 years.')
    await expect(page.getByTestId('jump-to-date')).toHaveCount(0)
  })
})
