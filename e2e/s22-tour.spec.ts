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

/**
 * Everything a viewer could read on `testId`'s element: its rendered text (innerText leaves out what is hidden)
 * and the accessible names and titles of everything not hidden from assistive tech.
 */
const readable = (page: Page, testId: string) => page.getByTestId(testId).evaluate((root) => {
  const exposed = [...root.querySelectorAll('*')].filter((el) => !el.closest('[aria-hidden="true"], [inert]'))
  const names = exposed.flatMap((el) => [el.getAttribute('aria-label'), el.getAttribute('title')]).filter((n): n is string => n !== null)
  return [(root as HTMLElement).innerText, ...names].join('\n')
})

async function expectNoTenant(page: Page, testId: string) {
  const text = await readable(page, testId)
  for (const t of TENANTS) expect(text, `${t} on the stage`).not.toContain(t)
}

const NO_WEBGL = () => {
  Object.defineProperty(window, 'WebGL2RenderingContext', { value: undefined })
}

async function drag(page: Page, from: { x: number; y: number }, dx: number, dy: number): Promise<void> {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 8 })
  await page.mouse.up()
}

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
    await expect(page.getByTestId('tour-play')).toHaveText('Play') // no auto-advance
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
  test('with potential space at a later date: a stop subject to the tenant vacating is visited, and no tenant name shows on the stage while flying or inside', async ({ page }) => {
    await gotoApp(page, '3d', { pot: '1', asOf: '2027-07-01' })
    await startFromPresent(page)
    await page.getByTestId('tour-play').click() // paused: each stop is stepped to by hand
    await expect(page.getByTestId('tour-play')).toHaveText('Play')
    const count = Number((await page.getByTestId('tour-counter').textContent())?.split(' of ')[1])
    let vacating = 0
    for (let i = 0; i < count; i++) {
      if (i > 0) {
        await page.getByTestId('tour-next').click()
        await expect(page.getByTestId('tour-counter')).toHaveText(`${i + 1} of ${count}`)
        await expect(stage(page)).toHaveAttribute('data-tour-phase', 'fly')
        await expectNoTenant(page, 'stack-3d')
      }
      const box = await canvas(page).boundingBox()
      if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2) // a hover shows no tooltip
      await expect(page.getByTestId('tooltip3d')).toBeHidden()
      await expect(stage(page)).toHaveAttribute('data-tour-phase', 'look')
      await expectNoTenant(page, 'stack-3d')
      if ((await page.getByTestId('tour-caption').textContent())?.includes('Subject to the current tenant vacating')) vacating++
    }
    expect(vacating).toBeGreaterThan(0)
  })

  test('the mirror is out of reach of the keyboard and assistive tech for the whole tour', async ({ page }) => {
    await gotoApp(page, '3d')
    await expect(suite3d(page, '900')).toHaveAttribute('data-screen-hit', /true|false/)
    await startFromPresent(page)
    await expect(page.getByTestId('mirror3d')).toHaveAttribute('aria-hidden', 'true')
    await expect(page.getByTestId('mirror3d')).toHaveAttribute('inert', '')
    await expect(stage(page)).toHaveAttribute('data-tour-phase', 'look')
    await page.getByTestId('tour-exit').click()
    await expect(page.getByTestId('mirror3d')).not.toHaveAttribute('aria-hidden', 'true')
  })

  test('after Exit tour the camera is the user\'s again: framed, FOV 20, orbits, tenant labels back', async ({ page }) => {
    await gotoApp(page, '3d')
    await startFromPresent(page)
    await expect(stage(page)).toHaveAttribute('data-tour-phase', 'look')
    await page.getByTestId('tour-exit').click()
    await expect(canvas(page)).toHaveAttribute('data-tour-camera', 'idle')
    await expect(canvas(page)).toHaveAttribute('data-camera-fov', '20.0')
    await expect(canvas(page)).toHaveAttribute('data-camera-zoom', '1.000')
    await expect(canvas(page)).toHaveAttribute('data-camera-azimuth', '0.0')
    await expect.poll(async () => page.locator('[data-testid^="label3d-"][data-hidden="false"][data-parts~="tenant"]').count()).toBeGreaterThan(0)
    const tenantShown = await page.locator('[data-testid^="label3d-"][data-hidden="false"][data-parts~="tenant"]').first().innerText()
    expect(TENANTS.some((t) => tenantShown.includes(t.slice(0, 8)))).toBe(true)
    const box = await canvas(page).boundingBox()
    if (!box) throw new Error('no canvas')
    await drag(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, -160, 0)
    await expect.poll(async () => Math.abs(Number(await canvas(page).getAttribute('data-camera-azimuth')))).toBeGreaterThan(5)
  })

  test('without WebGL the tour runs over the 2D stack: caption, bar and keys, the stop lit and in view, no tenant names', async ({ page }) => {
    await page.addInitScript(NO_WEBGL)
    await page.setViewportSize({ width: 1280, height: 720 })
    await gotoApp(page, '3d')
    await startFromPresent(page)
    await expect(page.getByTestId('webgl-fallback')).toBeVisible()
    await expect(page.getByTestId('tour-title')).toHaveText('Suite 700 · Floor 7')
    await expect(page.getByTestId('tour-play')).toBeFocused()
    await expect(page.getByTestId('suite-odt-700')).toHaveAttribute('data-dimmed', 'false')
    await expect(page.getByTestId('suite-odt-900')).toHaveAttribute('data-dimmed', 'true')
    await expectNoTenant(page, 'webgl-fallback')
    await page.getByTestId('tour-play').click()
    for (let i = 2; i <= 6; i++) {
      await page.keyboard.press('ArrowRight')
      await expect(page.getByTestId('tour-counter')).toHaveText(`${i} of 6`)
      const n = /^Suite (\d+) /.exec((await page.getByTestId('tour-title').textContent()) ?? '')?.[1]
      await expect(page.getByTestId(`suite-odt-${n}`)).toBeInViewport()
    }
    await expectNoTenant(page, 'webgl-fallback')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('tour-bar')).toHaveCount(0)
    await expect(page.getByTestId('tour')).toBeFocused()
  })

  test('a WebGL context lost for good during a tour: the tour carries on over the 2D stack', async ({ page }) => {
    await gotoApp(page, '3d')
    await startFromPresent(page)
    await expect(stage(page)).toHaveAttribute('data-tour-phase', 'look')
    await page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>('[data-testid="stack-3d"] canvas')
      c?.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext()
    })
    await expect(page.getByTestId('webgl-fallback')).toHaveAttribute('data-reason', 'lost', { timeout: 6000 })
    await expect(page.getByTestId('tour-title')).toHaveText('Suite 700 · Floor 7')
    await page.getByTestId('tour-next').click()
    await expect(page.getByTestId('tour-counter')).toHaveText('2 of 6')
    await expect(page.getByTestId('suite-odt-710')).toHaveAttribute('data-dimmed', 'false')
  })
})
