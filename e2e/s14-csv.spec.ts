import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type Page } from '@playwright/test'
import { gotoApp } from './helpers'

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures')
const VALID = path.join(FIXTURES, 'csv-valid.csv')
const BAD = path.join(FIXTURES, 'csv-bad.csv')
const IMPORTED_ID = 'csv-bayfront-commons'

async function importFile(page: Page, file: string) {
  await page.getByTestId('import-csv-input').setInputFiles(file)
}

/** Fails the test if any file value is ever executed (alert from an onerror attribute) or logs an error. */
function watchForInjection(page: Page): string[] {
  const problems: string[] = []
  page.on('dialog', (d) => { problems.push(`dialog: ${d.message()}`); void d.dismiss() })
  page.on('pageerror', (e) => problems.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()) })
  return problems
}

test.describe('csv import', () => {
  test('the bad fixture lists every problem by row and column, and imports nothing', async ({ page }) => {
    await gotoApp(page)
    await importFile(page, BAD)
    const errors = page.getByTestId('import-errors')
    await expect(errors).toBeVisible()
    const rows = errors.locator('tbody tr')
    await expect(rows).toHaveCount(3)
    await expect(rows.nth(0)).toContainText(/^2\s*lease_start.*YYYY-MM-DD/)
    await expect(rows.nth(1)).toContainText(/^4\s*suite.*already listed on row 3/)
    await expect(rows.nth(2)).toContainText(/^6\s*lease_start.*overlaps the lease on row 5/)
    await errors.getByRole('button', { name: 'Close' }).click()
    await expect(errors).toBeHidden()
    const switcher = page.getByTestId('building-switcher')
    await expect(switcher.locator('option')).toHaveCount(2)
    await expect(switcher).toHaveValue('odt')
  })

  test('the valid fixture adds the building, selects it and renders file text literally', async ({ page }) => {
    const problems = watchForInjection(page)
    await gotoApp(page)
    await importFile(page, VALID)
    const switcher = page.getByTestId('building-switcher')
    await expect(switcher).toHaveValue(IMPORTED_ID)
    await expect(switcher.locator('option')).toHaveCount(3)
    await expect(page.getByTestId(`suite-${IMPORTED_ID}-3-310`)).toBeVisible()
    await expect(page.locator('[data-testid^="suite-csv-"]')).toHaveCount(5)

    await page.getByTestId(`suite-${IMPORTED_ID}-3-300`).click()
    await expect(page.getByTestId('suite-details')).toContainText('<img src=x onerror=alert(1)>')
    await page.getByTestId(`suite-${IMPORTED_ID}-2-200`).click()
    await expect(page.getByTestId('suite-details')).toContainText('=HYPERLINK("http://example.com","Click")')
    await expect(page.locator('img[src="x"]')).toHaveCount(0)
    await expect(page.locator('a[href*="example.com"]')).toHaveCount(0)
    expect(problems).toEqual([])
  })

  test('an imported building survives a reload and is restored from its URL id', async ({ page }) => {
    await gotoApp(page)
    await importFile(page, VALID)
    await expect(page.getByTestId('building-switcher')).toHaveValue(IMPORTED_ID)
    await expect.poll(() => new URL(page.url()).searchParams.get('b')).toBe(IMPORTED_ID)
    await page.reload()
    await expect(page.getByTestId('building-switcher')).toHaveValue(IMPORTED_ID)
    await expect(page.getByTestId(`suite-${IMPORTED_ID}-3-300`)).toBeVisible()

    await gotoApp(page)
    await expect(page.getByTestId('building-switcher').locator('option')).toHaveCount(3)
    await gotoApp(page, { b: IMPORTED_ID })
    await expect(page.getByTestId('building-switcher')).toHaveValue(IMPORTED_ID)
  })

  test('the template downloads as a file that imports with no errors', async ({ page }, testInfo) => {
    await gotoApp(page)
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('import-template').click()])
    expect(download.suggestedFilename()).toBe('stackmatch-template.csv')
    const saved = testInfo.outputPath('template.csv')
    await download.saveAs(saved)
    expect(await readFile(saved, 'utf8')).toMatch(/^building,floor,suite,area_sf,kind,/)
    await importFile(page, saved)
    await expect(page.getByTestId('building-switcher')).toHaveValue('csv-coral-way-plaza')
    await expect(page.getByTestId('import-errors')).toHaveCount(0)
  })

  test('a non-text file is rejected with a whole-file message', async ({ page }) => {
    await gotoApp(page)
    await page.getByTestId('import-csv-input').setInputFiles({
      name: 'rent-roll.csv', mimeType: 'text/csv', buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0xff, 0xfe]),
    })
    const errors = page.getByTestId('import-errors')
    await expect(errors).toContainText('Whole file')
    await expect(errors).toContainText('Excel')
    await page.keyboard.press('Escape')
    await expect(errors).toBeHidden()
    await expect(page.getByTestId('building-switcher').locator('option')).toHaveCount(2)
  })
})
