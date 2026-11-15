import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gotoApp } from './helpers'

const IMPORT_FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'csv-valid.csv')

const LAW_FIRM = 'Law firm, roughly 9–11k SF, moving in by Q2 next year, under $60'

async function ask(page: Page, text: string) {
  await page.getByTestId('ask-input').fill(text)
  await page.getByTestId('ask-input').press('Enter')
  await expect(page.getByTestId('ask-status')).toBeVisible()
}

test.describe('ask box (offline fallback)', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/ask', (route) => route.abort())
    await gotoApp(page)
  })

  test('the law-firm query fills the form, sets Jun 2027 and lists 400+410, 500, 700+710', async ({ page }) => {
    await ask(page, LAW_FIRM)

    await expect(page.getByTestId('ask-status')).toContainText('Offline parsing')
    await expect(page.getByTestId('req-min-sf')).toHaveValue('9,000')
    await expect(page.getByTestId('req-max-sf')).toHaveValue('11,000')
    await expect(page.getByTestId('req-max-rent')).toHaveValue('60')
    await expect(page.getByTestId('date-label')).toContainText('Jun 2027')

    const keys = ['odt-400+odt-410', 'odt-500', 'odt-700+odt-710']
    for (const [i, key] of keys.entries()) {
      await expect(page.getByTestId(`match-${i + 1}`)).toHaveAttribute('data-key', key)
    }
    await expect(page.getByTestId('match-4')).toHaveCount(0)
  })

  test('a query with no size says so, leaves the size empty and runs no search', async ({ page }) => {
    await ask(page, 'Law firm moving in by June')

    await expect(page.getByTestId('ask-warning')).toContainText('Size not understood')
    await expect(page.getByTestId('req-min-sf')).toHaveValue('')
    await expect(page.getByTestId('date-label')).toContainText('Jun 2027')
    await expect(page.getByTestId('match-list')).toHaveCount(0)
  })

  test('a new query replaces the previous size and rent (C8)', async ({ page }) => {
    await page.getByTestId('req-min-sf').fill('10,000')
    await page.getByTestId('req-max-sf').fill('10,300')
    await page.getByTestId('req-max-rent').fill('50')
    await ask(page, 'at least 9k SF')

    await expect(page.getByTestId('req-min-sf')).toHaveValue('9,000')
    await expect(page.getByTestId('req-max-sf')).toHaveValue('')
    await expect(page.getByTestId('req-max-rent')).toHaveValue('')
    await expect(page.getByTestId('match-1')).toBeVisible()
  })

  test('an invalid size draft is replaced by the understood size', async ({ page }) => {
    await page.getByTestId('req-min-sf').fill('lots')
    await expect(page.getByTestId('req-min-sf')).toHaveAttribute('aria-invalid', 'true')
    await ask(page, '10k SF')

    await expect(page.getByTestId('req-min-sf')).toHaveValue('10,000')
    await expect(page.getByTestId('req-min-sf')).not.toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByTestId('match-1')).toHaveAttribute('data-key', 'odt-500')
  })

  test('invalid max and rent drafts are cleared when the query states neither', async ({ page }) => {
    await page.getByTestId('req-max-sf').fill('huge')
    await page.getByTestId('req-max-rent').fill('cheap')
    await expect(page.getByTestId('req-max-rent')).toHaveAttribute('aria-invalid', 'true')
    await ask(page, '10k SF')

    await expect(page.getByTestId('req-min-sf')).toHaveValue('10,000')
    await expect(page.getByTestId('req-max-sf')).toHaveValue('')
    await expect(page.getByTestId('req-max-rent')).toHaveValue('')
    await expect(page.getByTestId('req-max-sf')).not.toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByTestId('req-max-rent')).not.toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByTestId('match-1')).toHaveAttribute('data-key', 'odt-500')
  })
})

test.describe('ask box with an imported building', () => {
  test('parses offline and sends no request to /api/ask', async ({ page }) => {
    const askRequests: string[] = []
    page.on('request', (r) => { if (new URL(r.url()).pathname === '/api/ask') askRequests.push(r.url()) })
    await gotoApp(page)
    await page.getByTestId('import-csv-input').setInputFiles(IMPORT_FIXTURE)
    await expect(page.getByTestId('building-switcher')).toHaveValue('csv-bayfront-commons')

    await ask(page, '2,000 SF under $60')
    await expect(page.getByTestId('ask-status')).toContainText('Offline parsing')
    await expect(page.getByTestId('req-min-sf')).toHaveValue('2,000')
    await expect(page.getByTestId('req-max-rent')).toHaveValue('60')
    expect(askRequests).toEqual([])
  })
})
