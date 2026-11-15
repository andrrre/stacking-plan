import { test, expect } from '@playwright/test'

test('app loads with product name and demo badge', async ({ page }) => {
  await page.goto('/?today=2026-11-15')
  await expect(page.getByText('StackMatch')).toBeVisible()
  await expect(page.getByTestId('demo-badge')).toContainText('Demo data')
})
