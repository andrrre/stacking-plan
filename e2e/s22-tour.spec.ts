import { readFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { gotoApp, suite3d } from './helpers'

// The suite tour in presentation mode: stops, the flight in and the caption, the controls and keys, and what it
// never says (a tenant's name).

const stage = (page: Page) => page.getByTestId('stack-3d')
const canvas = (page: Page) => page.locator('[data-testid="scene3d"] canvas')

const TENANTS: string[] = (JSON.parse(readFileSync(new URL('../src/data/ocean-drive-tower.json', import.meta.url), 'utf8')) as {
  floors: { suites: { leases: { tenant: string }[] }[] }[]
}).floors.flatMap((f) => f.suites.flatMap((s) => s.leases.map((l) => l.tenant)))

async function startFromPresent(page: Page) {
  await page.getByTestId('present').click()
  await expect(page.getByTestId('present')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('tour').click()
}

test.describe('suite tour', () => {
  test('from Present with no shortlist: the available suites, top floor first; it goes inside; Next; Escape twice', async ({ page }) => {
    const problems: string[] = []
    page.on('pageerror', (e) => problems.push(e.message)).on('console', (m) => { if (m.type() === 'error') problems.push(m.text()) })
    await gotoApp(page, '3d')
    await startFromPresent(page)
    await expect(page.getByTestId('tour-title')).toHaveText('Suite 700 · Floor 7')
    await expect(page.getByTestId('tour-counter')).toHaveText('1 of 6')
    await expect(page.getByTestId('kpi-occupancy')).toHaveCount(0) // the building has the screen
    await expect(stage(page)).toHaveAttribute('data-tour-phase', 'look')
    await expect(canvas(page)).toHaveAttribute('data-camera-fov', '60.0')
    await expect(canvas(page)).toHaveAttribute('data-tour-camera', 'look')

    await page.getByTestId('tour-next').click()
    await expect(page.getByTestId('tour-counter')).toHaveText('2 of 6')
    await expect(page.getByTestId('tour-title')).toHaveText('Suite 710 · Floor 7')
    await expect(stage(page)).toHaveAttribute('data-tour-stop', '2')
    await page.keyboard.press('ArrowLeft')
    await expect(page.getByTestId('tour-counter')).toHaveText('1 of 6')

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('tour-caption')).toHaveCount(0)
    await expect(page.getByTestId('present')).toHaveAttribute('aria-pressed', 'true')
    await expect(canvas(page)).toHaveAttribute('data-tour-camera', 'idle')
    await expect(canvas(page)).toHaveAttribute('data-camera-fov', '20.0')
    await expect(page.getByTestId('label3d-odt-700')).toHaveAttribute('data-hidden', 'false') // the facade labels are back
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('present')).toHaveAttribute('aria-pressed', 'false')
    expect(problems).toEqual([])
  })

  test('from the details panel: Tour suite presents and starts at that suite', async ({ page }) => {
    await gotoApp(page, '3d')
    await suite3d(page, '410').evaluate((el: HTMLElement) => el.click())
    await page.getByTestId('tour-suite').click()
    await expect(page.getByTestId('present')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('tour-title')).toHaveText('Suite 410 · Floor 4')
    await expect(stage(page)).toHaveAttribute('data-tour-phase', 'look')
    await page.getByTestId('tour-exit').click()
    await expect(page.getByTestId('tour-bar')).toHaveCount(0)
    await expect(page.getByTestId('present')).toHaveAttribute('aria-pressed', 'true')
  })

  test('with a shortlisted match it visits exactly that option', async ({ page }) => {
    await gotoApp(page, '3d', { min: '10000' })
    await page.getByTestId('save-match-2').click() // Suites 700 + 710
    await startFromPresent(page)
    await expect(page.getByTestId('tour-counter')).toHaveText('1 of 1')
    await expect(page.getByTestId('tour-title')).toHaveText('Suites 700 + 710 · Floor 7')
    await expect(page.getByTestId('tour-caption')).toContainText('10,500 SF · 2 suites combined')
    await expect(page.getByTestId('tour-next')).toHaveAttribute('aria-disabled', 'true')
  })

  test('under reduced motion it cuts straight inside, without a flight', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await gotoApp(page, '3d')
    await expect(canvas(page)).toHaveAttribute('data-camera-fov', '20.0')
    await canvas(page).evaluate((el) => {
      const seen: string[] = []
      new MutationObserver(() => seen.push(el.getAttribute('data-tour-camera') ?? '')).observe(el, { attributes: true, attributeFilter: ['data-tour-camera'] })
      Object.assign(window, { tourCameraSeen: seen })
    })
    await startFromPresent(page)
    await expect(stage(page)).toHaveAttribute('data-tour-phase', 'look')
    await expect(canvas(page)).toHaveAttribute('data-camera-fov', '60.0')
    await expect(page.getByTestId('tour-play')).toHaveAttribute('aria-pressed', 'false') // no auto-advance
    const seen = await page.evaluate(() => (window as unknown as { tourCameraSeen: string[] }).tourCameraSeen)
    expect(seen).not.toContain('fly')
    expect(seen).toContain('look')
  })

  test('the caption never names a tenant, on any stop', async ({ page }) => {
    await gotoApp(page, '3d', { min: '9000' })
    await startFromPresent(page)
    const count = Number((await page.getByTestId('tour-counter').textContent())?.split(' of ')[1])
    expect(count).toBeGreaterThan(0)
    for (let i = 0; i < count; i++) {
      const text = (await page.getByTestId('tour-caption').textContent()) ?? ''
      for (const t of TENANTS) expect(text).not.toContain(t)
      if (i < count - 1) {
        await page.getByTestId('tour-next').click()
        await expect(page.getByTestId('tour-counter')).toHaveText(`${i + 2} of ${count}`)
      }
    }
  })
})
