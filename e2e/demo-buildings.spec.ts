import { test, expect } from '@playwright/test'
import { gotoApp } from './helpers'

// The three larger demo buildings: listed in the switcher, rendered in 3D, and treated as bundled demo data.

const NEW_BUILDINGS = [
  { id: 'bsp', name: 'Biscayne Spire', address: '1450 Biscayne Boulevard, Miami', suite: '2401' },
  { id: 'mgc', name: 'Mangrove Commons', address: '8800 Mangrove Parkway, Doral', suite: '501' },
  { id: 'fex', name: 'Flamingo Exchange', address: '700 Flamingo Way, Miami Beach', suite: '1801' },
]
const KPI_VALUES = ['kpi-occupancy-value', 'kpi-vacant-value', 'kpi-expiring-value', 'kpi-largest-block-value']

test('the switcher lists five buildings and each new one renders in 3D with its KPIs', async ({ page }) => {
  await gotoApp(page, '3d')
  const switcher = page.getByTestId('building-switcher')
  await expect(switcher.locator('option')).toHaveText([
    'Ocean Drive Tower', 'Palm Bay Plaza', 'Biscayne Spire', 'Mangrove Commons', 'Flamingo Exchange',
  ])
  const header = page.getByTestId('app-header')
  for (const b of NEW_BUILDINGS) {
    await switcher.selectOption(b.id)
    await expect(switcher.locator('option:checked')).toHaveText(b.name)
    await expect(header.getByText(b.address)).toBeVisible()
    await expect(header.getByTestId('demo-badge')).toBeVisible()
    const stage = page.getByTestId('stack-3d')
    await expect(stage.locator('canvas')).toBeVisible()
    await expect(stage.getByTestId(`suite3d-${b.id}-${b.suite}`)).toHaveAttribute('data-status', /\w+/)
    for (const id of KPI_VALUES) await expect(page.getByTestId(id)).toHaveText(/\d/)
  }
})

test('a new demo building may use the AI and keeps its shortlist across a reload', async ({ page }) => {
  let chatPosts = 0
  await page.route('**/api/chat', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { available: true } })
    chatPosts += 1
    return route.abort()
  })
  await gotoApp(page, 'stack', { b: 'bsp', min: '10000' })
  await page.getByTestId('match-1').getByRole('button', { name: /Save to shortlist/ }).click()
  await expect(page.getByTestId('shortlist-entry-1')).toContainText('Suite 3001')
  await expect(page.getByTestId('chat-panel')).toHaveAttribute('data-mode', 'ai')
  await page.getByTestId('chat-input').fill('at least 12k SF')
  await page.getByTestId('chat-input').press('Enter')
  await expect(page.getByTestId('chat-fallback').getByTestId('ask-status')).toBeVisible()
  await expect(page.getByTestId('req-min-sf')).toHaveValue('12,000')
  expect(chatPosts).toBe(1) // bundled buildings send the message to the AI; imported ones never do
  await page.reload()
  await expect(page.getByTestId('building-switcher')).toHaveValue('bsp')
  await expect(page.getByTestId('shortlist-entry-1')).toContainText('Suite 3001')
})
