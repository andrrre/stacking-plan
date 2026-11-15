import { test, expect } from '@playwright/test'
import { gotoApp, suite } from './helpers'

const FULL = {
  b: 'pbp', asOf: '2027-05-01', mode: 'risk', view: '3d', min: '9000', max: '11000', rent: '60', pot: '0',
}

test.describe('url state and second building', () => {
  test('a URL with every parameter restores state across a reload', async ({ page }) => {
    await gotoApp(page, FULL)
    await expect(page.getByTestId('building-switcher')).toHaveValue('pbp')
    await expect(page.getByTestId('date-label')).toContainText('May 2027')
    await expect(page.getByTestId('mode-risk')).toBeChecked()
    await expect(page.getByTestId('req-min-sf')).toHaveValue(/9,?000/)
    await expect(page.getByTestId('req-include-potential')).not.toBeChecked()
    await page.reload()
    await expect(page.getByTestId('building-switcher')).toHaveValue('pbp')
    await expect(page.getByTestId('date-label')).toContainText('May 2027')
    const params = new URL(page.url()).searchParams
    for (const [k, v] of Object.entries({ ...FULL, today: '2026-11-15' })) expect(params.get(k)).toBe(v)
  })

  test('garbage parameters fall back without console errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    page.on('pageerror', (e) => errors.push(e.message))
    await gotoApp(page, { b: 'nope', asOf: 'banana', mode: 'x', view: 'cube', min: '-5', max: 'abc', rent: '0', pot: '7' })
    await expect(suite(page, 500)).toBeVisible()
    await expect(page.getByTestId('building-switcher')).toHaveValue('odt')
    await expect(page.getByTestId('date-slider')).toHaveAttribute('aria-valuetext', 'Today')
    await expect(page.getByTestId('mode-availability')).toBeChecked()
    expect(errors).toEqual([])
  })

  test('the switcher lists 2 buildings and switching clears the selection', async ({ page }) => {
    await gotoApp(page)
    const switcher = page.getByTestId('building-switcher')
    await expect(switcher.locator('option')).toHaveCount(2)
    await suite(page, 600).click()
    await expect(page.getByTestId('suite-details')).toBeVisible()
    await switcher.selectOption('pbp')
    await expect(page.getByTestId('suite-pbp-202')).toBeVisible()
    await expect(page.getByTestId('suite-details')).toHaveCount(0)
    await expect(page).toHaveURL((url) => url.searchParams.get('b') === 'pbp') // debounced write
  })

  test('the second building finds a 3-suite 10,000 SF answer', async ({ page }) => {
    await gotoApp(page, { b: 'pbp', min: '10000' })
    await expect(page.getByTestId('match-1')).toContainText('202')
    await expect(page.getByTestId('suite-pbp-202')).toHaveAttribute('data-match-rank', '1')
    await expect(page.getByTestId('suite-pbp-203')).toHaveAttribute('data-match-rank', '1')
    await expect(page.getByTestId('suite-pbp-204')).toHaveAttribute('data-match-rank', '1')
  })

  test('slider moves leave history.length unchanged', async ({ page }) => {
    await gotoApp(page)
    const before = await page.evaluate(() => history.length)
    const slider = page.getByTestId('date-slider')
    for (let i = 1; i <= 10; i++) await slider.fill(String(i))
    await expect(page.getByTestId('date-label')).toContainText('Sep 2027')
    await expect(page).toHaveURL((url) => url.searchParams.get('asOf') === '2027-09-01') // debounced write
    expect(await page.evaluate(() => history.length)).toBe(before)
  })
})
