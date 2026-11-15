import { test, expect, type Page } from '@playwright/test'
import { gotoApp, suite } from './helpers'

const LIT = new Map([['500', '1'], ['700', '2'], ['710', '2']])

async function expectOthersDimmed(page: Page) {
  const others = page.locator('[data-testid^="suite-odt-"]')
  await expect(others).toHaveCount(32)
  for (const el of await others.all()) {
    const id = (await el.getAttribute('data-testid')) ?? ''
    const number = id.replace('suite-odt-', '')
    if (LIT.has(number)) continue
    await expect(el, `suite ${number} dimmed`).toHaveAttribute('data-dimmed', 'true')
  }
}

test.describe('space finder', () => {
  test.beforeEach(async ({ page }) => gotoApp(page))

  for (const text of ['10000', '10,000', '10k']) {
    test(`"${text}" lights #1 Suite 500 and #2 Suites 700+710`, async ({ page }) => {
      await page.getByTestId('req-min-sf').fill(text)

      await expect(page.getByTestId('match-1')).toHaveAttribute('data-key', 'odt-500')
      await expect(page.getByTestId('match-1')).toContainText('Suite 500')
      await expect(page.getByTestId('match-2')).toHaveAttribute('data-key', 'odt-700+odt-710')
      await expect(page.getByTestId('match-2')).toContainText('Suites 700 + 710')
      await expect(page.getByTestId('match-3')).toHaveCount(0)

      for (const [number, rank] of LIT) {
        await expect(suite(page, number)).toHaveAttribute('data-match-rank', rank)
        await expect(suite(page, number)).toHaveAttribute('data-dimmed', 'false')
      }
      await expect(page.getByTestId('match-outline-1')).toBeVisible()
      await expect(page.getByTestId('match-outline-2')).toBeVisible()
      await expect(page.getByTestId('match-outline-2').locator('[data-testid^="suite-odt-"]')).toHaveCount(2)
      await expectOthersDimmed(page)
    })
  }

  test('Jul 2027: the list is 400+410, 500, 700+710, 600', async ({ page }) => {
    await page.getByTestId('req-min-sf').fill('10,000')
    await expect(page.getByTestId('match-1')).toHaveAttribute('data-key', 'odt-500')
    await page.getByTestId('date-slider').fill('8')
    await expect(page.getByTestId('date-label')).toContainText('Jul 2027')

    const keys = ['odt-400+odt-410', 'odt-500', 'odt-700+odt-710', 'odt-600']
    for (const [i, key] of keys.entries()) {
      await expect(page.getByTestId(`match-${i + 1}`)).toHaveAttribute('data-key', key)
    }
    await expect(page.getByTestId('match-5')).toHaveCount(0)
    await expect(page.getByTestId('match-1')).toContainText(/from Jun 2027/i)
    await expect(page.getByTestId('match-4')).toContainText(/potential/i)
    await expect(suite(page, 600)).toHaveAttribute('data-match-rank', '4')
  })

  test('max below min shows a validation error and keeps the matches', async ({ page }) => {
    await page.getByTestId('req-min-sf').fill('10000')
    await page.getByTestId('req-max-sf').fill('9000')
    await expect(page.getByRole('status')).toContainText(/at least the minimum/i)
    await expect(page.getByTestId('req-max-sf')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByTestId('match-1')).toHaveAttribute('data-key', 'odt-500')
    await expect(page.getByTestId('match-2')).toHaveAttribute('data-key', 'odt-700+odt-710')
  })

  test('clicking a card selects it and keeps the list in view', async ({ page }) => {
    await page.getByTestId('req-min-sf').fill('10,000')
    const card = page.getByTestId('match-1').getByRole('button')
    await card.click()
    await expect(page.getByTestId('match-list')).toBeVisible()
    await expect(card).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('match-2').getByRole('button')).toHaveAttribute('aria-pressed', 'false')
  })

  test('Clear restores the empty panel and undims the stack', async ({ page }) => {
    await page.getByTestId('req-min-sf').fill('10k')
    await expect(page.getByTestId('match-list')).toBeVisible()
    await page.getByTestId('req-clear').click()
    await expect(page.getByTestId('req-min-sf')).toHaveValue('')
    await expect(page.getByTestId('right-empty')).toBeVisible()
    await expect(page.locator('[data-dimmed="true"]')).toHaveCount(0)
  })
})
