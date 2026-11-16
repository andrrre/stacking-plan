import { readFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { gotoApp, suite, suite3d } from './helpers'

type Bundled = { floors: { suites: { leases: { tenant: string }[] }[] }[] }
const HERO_TENANTS = (JSON.parse(readFileSync('src/data/ocean-drive-tower.json', 'utf8')) as Bundled).floors.flatMap((f) =>
  f.suites.flatMap((s) => s.leases.map((l) => l.tenant)),
)

const matchButton = (page: Page, n: number) => page.getByTestId(`match-${n}`).getByRole('button', { name: new RegExp(`^Match ${n}:`) })
const label = (page: Page, n: number) => page.getByTestId(`label3d-odt-${n}`)
const visibleText = (page: Page, n: number) => label(page, n).evaluate((el) => (el as HTMLElement).innerText)

/** Rank of every suite that carries one, as `suite number -> rank`, read from either the 2D or the 3D stack. */
const ranks = (page: Page) =>
  page.locator('[data-match-rank]').evaluateAll((els) =>
    Object.fromEntries(els.map((e) => [(e.getAttribute('data-testid') ?? '').replace(/^suite3?d?-odt-/, ''), e.getAttribute('data-match-rank')])),
  )

test('demo flow: the eight beats in order, in one session, on the 3D building', async ({ page }) => {
  const problems: string[] = []
  page.on('console', (m) => {
    // The browser itself logs the two requests this test aborts on purpose; that is not an app error.
    const aborted = m.location().url.includes('/api/') && m.text().startsWith('Failed to load resource')
    if (m.type() === 'error' && !aborted) problems.push(`console: ${m.text()}`)
  })
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  await page.route('**/api/ask', (route) => route.abort())
  await page.route('**/api/summary', (route) => route.abort())

  // 1. First paint: the 3D building, vacant and expiring space readable on the facade
  await gotoApp(page, '3d')
  await expect(page.getByTestId('view-3d')).toBeChecked()
  await expect(suite3d(page, 500)).toHaveAttribute('data-screen-hit', 'true')
  expect(await visibleText(page, 500)).toContain('VACANT')
  expect(await visibleText(page, 600)).toContain('04/2027')
  await expect(page.getByTestId('kpi-occupancy-value')).toHaveText('72%')
  await expect(page.getByTestId('kpi-vacant')).toContainText('38,150 SF')
  await expect(page.getByTestId('kpi-expiring')).toContainText('26,500 SF')
  await expect(page.getByTestId('kpi-largest-block')).toContainText('10,500 SF · Floor 7')

  // 2. Finder
  await page.getByTestId('req-min-sf').fill('10,000')
  await expect(page.getByTestId('match-1')).toHaveAttribute('data-key', 'odt-500')
  await expect(page.getByTestId('match-2')).toHaveAttribute('data-key', 'odt-700+odt-710')
  await expect(page.getByTestId('match-3')).toHaveCount(0)
  await expect(suite3d(page, 500)).toHaveAttribute('data-match-rank', '1')
  await expect(suite3d(page, 710)).toHaveAttribute('data-match-rank', '2')
  await expect(page.getByTestId('badge3d-1')).toBeVisible()
  await expect(page.getByTestId('badge3d-2')).toBeVisible()
  await expect(suite3d(page, 600)).toHaveAttribute('data-dimmed', 'true')
  await matchButton(page, 2).click()
  const why = page.getByTestId('match-why')
  await expect(why).toBeVisible()
  await expect(why).toContainText('Suites 700 + 710')
  await expect(why).toContainText('10,500 SF')
  await expect(why).toContainText('$52.18')
  await why.getByRole('button', { name: /all matches/i }).click()
  await expect(page.getByTestId('match-list')).toBeVisible()

  // 3. Time machine: Jul 2027
  await page.getByTestId('date-slider').fill('8')
  await expect(page.getByTestId('date-label')).toContainText('Jul 2027')
  const jul = ['odt-400+odt-410', 'odt-500', 'odt-700+odt-710', 'odt-600']
  for (const [i, key] of jul.entries()) {
    await expect(page.getByTestId(`match-${i + 1}`)).toHaveAttribute('data-key', key)
  }
  await expect(page.getByTestId('match-4')).toContainText(/potential/i)
  await expect(page.getByTestId('match-5')).toHaveCount(0)
  await expect(suite3d(page, 600)).toHaveAttribute('data-overlay', 'potential')
  await expect(page.getByTestId('badge3d-4')).toBeVisible()
  expect(await visibleText(page, 600)).toContain('Potential')

  // 4. Back to today, save match 1
  await page.getByTestId('date-today').click()
  await expect(page.getByTestId('date-label')).not.toContainText('Jul 2027')
  await expect(page.getByTestId('match-1')).toHaveAttribute('data-key', 'odt-500')
  await expect(page.getByTestId('match-1')).toContainText('Suite 500')
  await page.getByTestId('save-match-1').click()
  const entry1 = page.getByTestId('shortlist-entry-1')
  await expect(entry1).toContainText('Suite 500')
  await expect(page.getByTestId('whatif-tag')).toHaveCount(0)
  const entryBefore = (await entry1.textContent()) ?? ''

  // 5. Place tenant on Suite 500
  await matchButton(page, 1).click()
  await page.getByTestId('place-tenant').click()
  await expect(page.getByTestId('change-dialog')).toBeVisible()
  await page.getByTestId('change-submit').click()
  await expect(page.getByTestId('change-dialog')).toHaveCount(0)
  await expect(page.getByTestId('scenario-occupancy')).toContainText('72% → 79%')
  await expect(page.getByTestId('scenario-rent-roll')).toContainText('+$492,000')
  await expect(page.getByTestId('kpi-occupancy-value')).toHaveText('79%')
  await expect(entry1).toHaveText(entryBefore)
  await expect(page.getByTestId('whatif-tag')).toHaveCount(0)
  await expect(suite3d(page, 500)).toHaveAttribute('data-modified', 'true')
  await expect(suite3d(page, 500)).toHaveAttribute('aria-pressed', 'true')

  // saving during the scenario produces a what-if entry
  await page.getByTestId('right-drawer-close').click()
  await expect(page.getByTestId('match-1')).toHaveAttribute('data-key', 'odt-700+odt-710')
  await page.getByTestId('save-match-1').click()
  const entry2 = page.getByTestId('shortlist-entry-2')
  await expect(entry2).toContainText('Suites 700 + 710')
  await expect(entry2.getByTestId('whatif-tag')).toBeVisible()
  await expect(entry1).toHaveText(entryBefore)
  const whatIfBefore = (await entry2.textContent()) ?? ''

  // 6. Toggle to the 2D stack and back: the same answer in both views
  const ranks3d = await ranks(page)
  expect(Object.keys(ranks3d).length).toBeGreaterThan(0)
  await expect(suite3d(page, 500)).toHaveAttribute('data-status', 'occupied')
  await page.getByTestId('view-stack').click()
  await expect(page.getByTestId('stack')).toBeVisible()
  await expect(page.getByTestId('stack-3d')).toHaveCount(0)
  await expect(page.getByTestId('scenario-bar')).toBeVisible()
  await expect(suite(page, 500)).toHaveAttribute('data-modified', 'true')
  expect(await ranks(page)).toEqual(ranks3d)
  await page.getByTestId('view-3d').click()
  await expect(page.getByTestId('stack-3d')).toBeVisible()
  await expect(suite3d(page, 500)).toHaveAttribute('data-modified', 'true')
  expect(await ranks(page)).toEqual(ranks3d)
  await expect(page.getByTestId('kpi-occupancy-value')).toHaveText('79%')

  // 7. Reset, then jump to date (C1)
  await page.getByTestId('scenario-reset').click()
  await expect(page.getByTestId('scenario-bar')).toHaveCount(0)
  await expect(page.getByTestId('kpi-occupancy-value')).toHaveText('72%')
  await expect(entry2).toHaveText(whatIfBefore)
  await expect(entry2.getByTestId('whatif-tag')).toBeVisible()
  await expect(entry1).toHaveText(entryBefore)
  await page.getByTestId('req-min-sf').fill('12,000')
  await page.getByTestId('jump-to-date').click()
  await expect(page.getByTestId('date-label')).toContainText('May 2027')
  await expect(page.getByTestId('req-include-potential')).toBeChecked()
  await expect(page.getByTestId('match-1')).toHaveAttribute('data-key', 'odt-600')
  await expect(suite3d(page, 600)).toHaveAttribute('data-match-rank', '1')
  // The URL write is debounced: wait for it.
  await expect(page).toHaveURL((url) => url.searchParams.get('asOf') === '2027-05-01' && !url.searchParams.has('pot'))

  // 8. Client summary
  await page.getByTestId('open-summary').click()
  const summary = page.getByTestId('client-summary')
  await expect(summary).toBeVisible()
  const text = await summary.innerText()
  for (const t of HERO_TENANTS) expect(text, t).not.toContain(t)
  expect(text).not.toContain('Prospect')
  expect(text).toContain('Suite 500')
  expect(text).toContain('Suites 700 + 710')
  expect(text).toContain('Indicative')

  expect(problems).toEqual([])
})
