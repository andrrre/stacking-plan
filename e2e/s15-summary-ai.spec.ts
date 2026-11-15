import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type Page } from '@playwright/test'
import { gotoApp } from './helpers'

type Bundled = { floors: { suites: { leases: { tenant: string }[] }[] }[] }
const tenantsOf = (file: string): string[] => {
  const b = JSON.parse(readFileSync(file, 'utf8')) as Bundled
  return b.floors.flatMap((f) => f.suites.flatMap((s) => s.leases.map((l) => l.tenant)))
}
const ALL_TENANTS = [...tenantsOf('src/data/ocean-drive-tower.json'), ...tenantsOf('src/data/palm-bay-plaza.json')]

const AI = { headline: 'Two options on floors 5 and 6', paragraph: 'Written by the model.' }
const HEADLINE = 'Two office options at Ocean Drive Tower'

/** Shortlist Suite 500 (today) and Suite 600 (Jul 2027, whose stored caveat names a tenant). */
async function shortlistTwo(page: Page) {
  await gotoApp(page, 'stack')
  await page.getByTestId('req-min-sf').fill('10000')
  await page.getByTestId('save-match-1').click()
  await page.getByTestId('date-slider').fill('8')
  await expect(page.getByTestId('date-label')).toContainText('Jul 2027')
  const six = page.locator('[data-testid^="match-"][data-key="odt-600"]')
  await six.getByRole('button', { name: /Save to shortlist/ }).click()
  await expect(page.getByTestId('shortlist-entry-2')).toContainText('Suite 600')
}

test.describe('client summary intro', () => {
  test('503 from /api/summary: the templated copy shows, and the request holds no tenant name', async ({ page }) => {
    const bodies: string[] = []
    await page.route('**/api/summary', (route) => {
      bodies.push(route.request().postData() ?? '')
      return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"AI unavailable"}' })
    })
    await shortlistTwo(page)
    await page.getByTestId('open-summary').click()

    const intro = page.getByTestId('summary-intro')
    await expect(intro).toContainText(HEADLINE)
    await expect(intro).toContainText('10,250 to 12,400 SF')
    await expect(intro).toContainText('earliest available from 15 Nov 2026 (Suite 500)')
    await expect(intro).toContainText('(Suite 500). Suite 600 – subject to the current tenant vacating (30 Apr 2027).')
    await expect(intro).toHaveAttribute('data-source', 'template')
    await expect.poll(() => bodies.length).toBe(1)

    // The leak guarantee: the stored caveat names Flamingo Row Media; the wire never does.
    expect(bodies[0]).toContain('Suite 600')
    expect(bodies[0]).toContain('Subject to the current tenant vacating (30 Apr 2027).')
    for (const t of ALL_TENANTS) expect(bodies[0], t).not.toContain(t)
    expect(bodies[0]).not.toContain('Flamingo')
    expect(JSON.parse(bodies[0] as string)).toEqual({
      buildingName: 'Ocean Drive Tower',
      asOf: '2026-11-15',
      options: [
        { label: 'Suite 500', floor: 5, suiteNumbers: ['500'], totalSf: 10250, blendedRentPsf: expect.any(Number), availableFrom: '2026-11-15', notes: [] },
        { label: 'Suite 600', floor: 6, suiteNumbers: ['600'], totalSf: 12400, blendedRentPsf: expect.any(Number), availableFrom: '2027-05-01', notes: ['Subject to the current tenant vacating (30 Apr 2027).'] },
      ],
    })

    const text = await page.getByTestId('client-summary').innerText()
    for (const t of ALL_TENANTS) expect(text, t).not.toContain(t)
  })

  test('AI copy replaces the template, and prints', async ({ page }) => {
    await page.route('**/api/summary', (route) => route.fulfill({ json: AI }))
    await shortlistTwo(page)
    await page.getByTestId('open-summary').click()
    const intro = page.getByTestId('summary-intro')
    await expect(intro).toContainText(AI.headline)
    await expect(intro).toHaveAttribute('data-source', 'ai')

    await page.emulateMedia({ media: 'print' })
    await expect(intro).toBeVisible()
    await expect(page.locator('[data-print="shell"]')).toBeHidden()
  })

  test('an invalid AI answer leaves the template, with no failure notice', async ({ page }) => {
    await page.route('**/api/summary', (route) => route.fulfill({ json: { headline: '', paragraph: '' } }))
    await shortlistTwo(page)
    await page.getByTestId('open-summary').click()
    const intro = page.getByTestId('summary-intro')
    await expect(intro).toContainText(HEADLINE)
    await page.waitForTimeout(300)
    await expect(intro).toHaveAttribute('data-source', 'template')
    expect(await page.getByTestId('client-summary').innerText()).not.toMatch(/offline/i)
  })

  test('a response that arrives after the summary closed is ignored; reopening requests again', async ({ page }) => {
    let calls = 0
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => { release = resolve })
    await page.route('**/api/summary', async (route) => {
      calls += 1
      if (calls > 1) return route.fulfill({ status: 503, body: '{}' , contentType: 'application/json' })
      await held
      return route.fulfill({ json: { headline: 'Stale headline', paragraph: 'Stale.' } })
    })
    await shortlistTwo(page)
    await page.getByTestId('open-summary').click()
    await expect(page.getByTestId('summary-intro')).toContainText(HEADLINE)
    await page.getByTestId('summary-close').click()
    await expect(page.getByTestId('client-summary')).toHaveCount(0)
    release()
    await page.waitForTimeout(200)

    await page.getByTestId('open-summary').click()
    await expect.poll(() => calls).toBe(2)
    await expect(page.getByTestId('summary-intro')).toContainText(HEADLINE)
    await expect(page.getByTestId('summary-intro')).not.toContainText('Stale')
  })

  test('an imported building never sends anything to /api/summary', async ({ page }) => {
    const bodies: string[] = []
    await page.route('**/api/summary', (route) => {
      bodies.push(route.request().postData() ?? '')
      return route.fulfill({ json: AI })
    })
    await gotoApp(page, 'stack')
    await page.getByTestId('import-csv-input').setInputFiles(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'csv-valid.csv'))
    await expect(page.getByTestId('building-switcher')).toHaveValue('csv-bayfront-commons')
    await page.getByTestId('req-min-sf').fill('4000')
    await page.getByTestId('save-match-1').click()
    await page.getByTestId('open-summary').click()
    const intro = page.getByTestId('summary-intro')
    await expect(intro).toContainText('Bayfront Commons')
    await expect(intro).toHaveAttribute('data-source', 'template')
    await page.waitForTimeout(500)
    expect(bodies).toEqual([])
    await expect(intro).not.toContainText(AI.headline)
  })
})
