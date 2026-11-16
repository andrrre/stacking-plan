import { test, expect } from '@playwright/test'
import { gotoApp, suite } from './helpers'

const RISK: Array<[string, string]> = [
  ['600', 'le6'], ['400', 'le12'], ['220', 'le12'], ['1000', 'le12'],
  ['210', 'le24'], ['420', 'le24'], ['810', 'le36'], ['900', 'gt36'], ['230', 'openEnded'],
]

test.describe('lease-risk colour mode', () => {
  test.beforeEach(async ({ page }) => gotoApp(page, 'stack'))

  test('availability is the default, with its own legend', async ({ page }) => {
    await expect(page.getByTestId('mode-availability')).toBeChecked()
    await expect(page.getByTestId('legend')).toBeVisible()
    await expect(page.getByTestId('legend-risk')).toHaveCount(0)
  })

  test('risk mode buckets each leased suite and swaps the legend', async ({ page }) => {
    await page.getByTestId('mode-risk').click()
    await expect(page.getByTestId('mode-risk')).toBeChecked()
    await expect(page.getByTestId('legend-risk')).toBeVisible()
    await expect(page.getByTestId('legend')).toHaveCount(0)
    await expect(page.getByTestId('legend-risk').getByTestId('legend-pill')).toHaveText([
      /^Vacant/, /^Potential/, /^Committed/, /^≤ 6 months/, /^≤ 12 months/, /^≤ 24 months/, /^≤ 36 months/, /^Over 36 months/,
      /^No end date/, /^Common area/,
    ])
    for (const [number, bucket] of RISK) {
      await expect(suite(page, number), `suite ${number}`).toHaveAttribute('data-risk', bucket)
    }
    await expect(suite(page, '600')).toHaveAttribute('data-fill', 'risk-le6')
    await expect(suite(page, '900')).toHaveAttribute('data-fill', 'risk-gt36')
    await expect(suite(page, '230')).toHaveAttribute('data-fill', 'risk-open')
    await expect(suite(page, '500')).toHaveAttribute('data-fill', 'vacant')
  })

  test('a risk pill filters by bucket, like an availability pill; a pill both legends share survives the switch', async ({ page }) => {
    await page.getByTestId('mode-risk').click()
    await page.getByTestId('legend-risk').locator('[data-key="risk-le6"]').click()
    await expect(suite(page, '600')).toHaveAttribute('data-filtered', 'false')
    await expect(suite(page, '900')).toHaveAttribute('data-filtered', 'true')
    await page.getByTestId('legend-risk').locator('[data-key="vacant"]').click()
    await page.getByTestId('mode-availability').click()
    await expect(page.getByTestId('legend').locator('[data-key="vacant"]')).toHaveAttribute('aria-pressed', 'true')
    await page.getByTestId('mode-risk').click()
    await page.getByTestId('legend-risk').locator('[data-key="risk-le12"]').click()
    await page.getByTestId('mode-availability').click()
    await expect(page.getByTestId('legend').locator('[aria-pressed="true"]')).toHaveCount(0)
  })

  test('the toggle works from the keyboard', async ({ page }) => {
    await page.getByTestId('mode-availability').focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByTestId('mode-risk')).toBeChecked()
    await expect(page.getByTestId('mode-risk')).toBeFocused()
    await page.keyboard.press('ArrowLeft')
    await expect(page.getByTestId('mode-availability')).toBeChecked()
  })

  test('match outlines survive the mode switch', async ({ page }) => {
    await page.getByTestId('req-min-sf').fill('10000')
    await expect(suite(page, '500')).toHaveAttribute('data-match-rank', '1')
    await page.getByTestId('mode-risk').click()
    await expect(suite(page, '500')).toHaveAttribute('data-match-rank', '1')
    await expect(suite(page, '700')).toHaveAttribute('data-match-rank', '2')
    await expect(page.getByTestId('match-outline-1')).toBeVisible()
    await expect(suite(page, '600')).toHaveAttribute('data-dimmed', 'true')
  })

  test('potential space keeps its overlay in risk mode', async ({ page }) => {
    await page.getByTestId('date-slider').fill('8')
    await page.getByTestId('mode-risk').click()
    await expect(suite(page, '600')).toHaveAttribute('data-fill', 'potential')
  })
})
