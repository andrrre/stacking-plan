import { test, expect } from '@playwright/test'
import { gotoApp } from './helpers'

// The header's Client summary button before anything is shortlisted: focusable, aria-disabled, and explained by a
// real tooltip on hover and keyboard focus (not a title nobody sees).

const HINT = 'Save a match to the shortlist, or add a suite from its details, to build a client summary.'

test.describe('Client summary tooltip', () => {
  test('hover and keyboard focus show why it is unavailable; Escape and moving away hide it', async ({ page }) => {
    await gotoApp(page, 'stack')
    const button = page.getByTestId('open-summary')
    const tip = page.getByTestId('open-summary-hint')
    await expect(button).toHaveAttribute('aria-disabled', 'true')
    await expect(button).toBeDisabled() // aria-disabled counts
    await expect(tip).toBeHidden()

    await button.hover()
    await expect(tip).toBeVisible()
    await expect(tip).toHaveText(HINT)
    await expect(tip).toHaveRole('tooltip')
    await expect(button).toHaveAttribute('aria-describedby', (await tip.getAttribute('id')) ?? 'missing')
    const box = await tip.boundingBox()
    const viewport = page.viewportSize()
    expect(box && viewport && box.x >= 0 && box.x + box.width <= viewport.width).toBe(true)
    await tip.hover() // hoverable: the pointer can move onto it
    await expect(tip).toBeVisible()
    await page.mouse.move(10, 400)
    await expect(tip).toBeHidden()

    await button.focus()
    await expect(tip).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(tip).toBeHidden()
    await expect(button).toBeFocused()
  })

  test('stays inside the viewport at 1000px wide', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 })
    await gotoApp(page, 'stack')
    await page.getByTestId('open-summary').focus()
    const tip = page.getByTestId('open-summary-hint')
    await expect(tip).toBeVisible()
    const box = await tip.boundingBox()
    expect(box && box.x >= 0 && box.x + box.width <= 1000 && box.y >= 0).toBe(true)
  })

  test('once a match is saved there is no tooltip and the button opens the summary', async ({ page }) => {
    await gotoApp(page, 'stack', { min: '10000' })
    await page.getByTestId('save-match-1').click()
    const button = page.getByTestId('open-summary')
    await expect(button).toBeEnabled()
    await expect(button).not.toHaveAttribute('aria-disabled')
    await expect(page.getByTestId('open-summary-hint')).toHaveCount(0)
    await button.click()
    await expect(page.getByTestId('client-summary')).toBeVisible()
  })

  test('is not printed', async ({ page }) => {
    await gotoApp(page, 'stack')
    await page.getByTestId('open-summary').hover()
    await page.emulateMedia({ media: 'print' })
    await expect(page.getByTestId('open-summary-hint')).toBeHidden()
  })
})
