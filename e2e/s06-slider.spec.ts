import { test, expect } from '@playwright/test'
import { gotoApp, suite } from './helpers'

test.describe('date slider', () => {
  test.beforeEach(async ({ page }) => gotoApp(page))

  test('range attributes and Today at step 0', async ({ page }) => {
    const slider = page.getByTestId('date-slider')
    await expect(slider).toHaveAttribute('min', '0')
    await expect(slider).toHaveAttribute('max', '60')
    await expect(slider).toHaveAttribute('aria-valuetext', 'Today')
    await slider.fill('60')
    await expect(slider).toHaveAttribute('aria-valuetext', 'Nov 2031')
    await expect(page.getByTestId('date-label')).toContainText('Nov 2031')
  })

  test('1010 reads Leased from 03/2027', async ({ page }) => {
    await expect(suite(page, 1010)).toContainText('Leased from 03/2027')
  })

  test('keyboard steps the date and Today resets it', async ({ page }) => {
    const slider = page.getByTestId('date-slider')
    await slider.focus()
    await page.keyboard.press('ArrowRight')
    await expect(slider).toHaveAttribute('aria-valuetext', 'Dec 2026')
    await page.keyboard.press('End')
    await expect(slider).toHaveAttribute('aria-valuetext', 'Nov 2031')
    await page.getByTestId('date-today').click()
    await expect(slider).toHaveAttribute('aria-valuetext', 'Today')
    await expect(page.getByTestId('date-today')).toHaveAttribute('aria-disabled', 'true')
  })

  test('Jul 2027: suite 600 is potential', async ({ page }) => {
    await page.getByTestId('date-slider').fill('8')
    await expect(page.getByTestId('date-label')).toContainText('Jul 2027')
    const s600 = suite(page, 600)
    await expect(s600).toHaveAttribute('data-overlay', 'potential')
    await expect(s600).toHaveAttribute('title', /Potential · Flamingo Row Media lease ends 04\/2027/)
    await expect(s600).toHaveAttribute('aria-label', /potential: Flamingo Row Media lease ends 30 Apr 2027/)
  })

  test('suite colour transition exists, and is off under reduced motion', async ({ page }) => {
    const duration = () => suite(page, 500).evaluate((el) => getComputedStyle(el).transitionDuration)
    const isZero = (d: string) => d.split(',').every((x) => x.trim() === '0s')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    expect(isZero(await duration())).toBe(false)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect.poll(async () => isZero(await duration())).toBe(true)
  })
})
