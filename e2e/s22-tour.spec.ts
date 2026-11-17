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

/** Presentation mode, seen from outside: Import CSV leaves the header and the left drawer shuts. */
async function expectPresenting(page: Page, on: boolean) {
  await expect(page.getByRole('button', { name: /Import CSV/ })).toHaveCount(on ? 0 : 1)
  await expect(page.getByTestId('left-drawer-toggle')).toHaveAttribute('aria-expanded', on ? 'false' : 'true')
}

/** One click on the header's Tour button presents and starts the tour. */
async function startTour(page: Page) {
  await page.getByTestId('tour').click()
  await expect(page.getByTestId('tour-bar')).toBeVisible()
  await expect(page.getByTestId('tour')).toHaveText('End tour')
}

test.describe('suite tour', () => {
  test('one click on Tour with no shortlist: presents, the available suites, top floor first; it goes inside; Next; one Escape ends it all', async ({ page }) => {
    const problems: string[] = []
    page.on('pageerror', (e) => problems.push(e.message)).on('console', (m) => { if (m.type() === 'error') problems.push(m.text()) })
    await gotoApp(page, '3d')
    await expect(page.getByTestId('present')).toHaveCount(0)
    await startTour(page)
    await expectPresenting(page, true)
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
    await expectPresenting(page, false)
    await expect(page.getByTestId('tour')).toHaveText('Tour')
    await expect(page.getByTestId('tour')).toBeFocused()
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true) // left, wherever it was granted
    await expect(canvas(page)).toHaveAttribute('data-tour-camera', 'idle')
    await expect(canvas(page)).toHaveAttribute('data-camera-fov', '20.0')
    await expect(page.getByTestId('label3d-odt-700')).toHaveAttribute('data-hidden', 'false') // the facade labels are back
    expect(problems).toEqual([])
  })

  test('from the details panel: Tour suite presents and starts at that suite in one click; Exit tour ends both', async ({ page }) => {
    await gotoApp(page, '3d')
    await suite3d(page, '410').evaluate((el: HTMLElement) => el.click())
    await page.getByTestId('tour-suite').click()
    await expectPresenting(page, true)
    await expect(page.getByTestId('tour-title')).toHaveText('Suite 410 · Floor 4')
    await expect(stage(page)).toHaveAttribute('data-tour-phase', 'look')
    await page.getByTestId('tour-exit').click()
    await expect(page.getByTestId('tour-bar')).toHaveCount(0)
    await expectPresenting(page, false)
  })

  test('from the details panel: one Escape ends the tour and the presentation', async ({ page }) => {
    await gotoApp(page, '3d')
    await suite3d(page, '410').evaluate((el: HTMLElement) => el.click())
    await page.getByTestId('tour-suite').click()
    await expect(page.getByTestId('tour-title')).toHaveText('Suite 410 · Floor 4')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('tour-bar')).toHaveCount(0)
    await expectPresenting(page, false)
  })

  test('with a shortlisted match it visits exactly that option', async ({ page }) => {
    await gotoApp(page, '3d', { min: '10000' })
    await page.getByTestId('save-match-2').click() // Suites 700 + 710
    await startTour(page)
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
    await startTour(page)
    await expect(stage(page)).toHaveAttribute('data-tour-phase', 'look')
    await expect(canvas(page)).toHaveAttribute('data-camera-fov', '60.0')
    await expect(page.getByTestId('tour-play')).toHaveText('Play') // no auto-advance
    const seen = await page.evaluate(() => (window as unknown as { tourCameraSeen: string[] }).tourCameraSeen)
    expect(seen).not.toContain('fly')
    expect(seen).toContain('look')
  })

  test('the caption never names a tenant, on any stop', async ({ page }) => {
    await gotoApp(page, '3d', { min: '9000' })
    await startTour(page)
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
    await startTour(page)
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
    await startTour(page)
    await expect(page.getByTestId('mirror3d')).toHaveAttribute('aria-hidden', 'true')
    await expect(page.getByTestId('mirror3d')).toHaveAttribute('inert', '')
    await expect(stage(page)).toHaveAttribute('data-tour-phase', 'look')
    await page.getByTestId('tour-exit').click()
    await expect(page.getByTestId('mirror3d')).not.toHaveAttribute('aria-hidden', 'true')
  })

  test('after Exit tour the camera is the user\'s again: framed, FOV 20, orbits, tenant labels back', async ({ page }) => {
    await gotoApp(page, '3d')
    await startTour(page)
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
    await startTour(page)
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
    await startTour(page)
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

test.describe('suite tour: inside the suite', () => {
  const attr = async (page: Page, name: string) => Number(await canvas(page).getAttribute(name))
  const yaw = (page: Page) => attr(page, 'data-tour-yaw')

  /** Drags across the canvas `n` times by `dx` px each (0.2° a px: 450 px is a quarter turn). */
  async function turn(page: Page, dx: number, n: number) {
    const box = await canvas(page).boundingBox()
    if (!box) throw new Error('no canvas')
    const x = dx > 0 ? box.x + 150 : box.x + box.width - 150
    for (let i = 0; i < n; i++) await drag(page, { x, y: box.y + box.height / 2 }, dx, 0)
  }

  test('the room has its walls, an entrance door, furniture and people, and says the fit-out is illustrative; all gone after the tour', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await gotoApp(page, '3d')
    await startTour(page)
    await expect(canvas(page)).toHaveAttribute('data-tour-camera', 'look')
    expect(await attr(page, 'data-room-walls')).toBeGreaterThanOrEqual(3)
    expect(await attr(page, 'data-room-doors')).toBeGreaterThanOrEqual(1)
    expect(await attr(page, 'data-room-furniture')).toBeGreaterThanOrEqual(5)
    expect(await attr(page, 'data-room-people')).toBeGreaterThanOrEqual(2)
    await expect(page.getByTestId('fitout-tag')).toBeVisible()
    await expect(page.getByTestId('fitout-tag')).toContainText('Illustrative fit-out')
    await expectNoTenant(page, 'stack-3d')
    const small = await attr(page, 'data-room-furniture')
    await page.getByTestId('tour-next').click() // Suite 710, bigger than 700
    await expect(page.getByTestId('tour-title')).toHaveText('Suite 710 · Floor 7')
    await expect.poll(() => attr(page, 'data-room-furniture')).toBeGreaterThan(small)
    await page.getByTestId('tour-exit').click()
    await expect(canvas(page)).toHaveAttribute('data-tour-camera', 'idle')
    await expect(page.getByTestId('fitout-tag')).toHaveCount(0)
    await expect(canvas(page)).not.toHaveAttribute('data-room-walls', /.*/)
  })

  /** Inside: no status colour is drawn in the room, and the stop's own suite boxes are hidden. */
  async function expectNoStatusInside(page: Page) {
    await expect(canvas(page)).toHaveAttribute('data-tour-camera', 'look')
    await expect(canvas(page)).toHaveAttribute('data-room-status', '0')
    await expect(canvas(page)).toHaveAttribute('data-room-suite-hidden', 'true')
  }

  for (const scheme of ['light', 'dark'] as const) {
    test(`${scheme}: no status colour shows inside a vacant, a potential, a matched or a selected suite`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: scheme })
      await gotoApp(page, '3d', { pot: '1', asOf: '2027-07-01' }) // the stops include potential space
      await startTour(page)
      await expectNoStatusInside(page) // Suite 700: vacant
      const count = Number((await page.getByTestId('tour-counter').textContent())?.split(' of ')[1])
      let potential = 0
      for (let i = 1; i < count; i++) {
        await page.getByTestId('tour-next').click()
        await expect(page.getByTestId('tour-counter')).toHaveText(`${i + 1} of ${count}`)
        await expectNoStatusInside(page)
        if ((await page.getByTestId('tour-caption').textContent())?.includes('Subject to the current tenant vacating')) potential++
      }
      expect(potential).toBeGreaterThan(0)
      await page.keyboard.press('Escape')

      await gotoApp(page, '3d', { min: '10000' })
      await page.getByTestId('save-match-2').click() // matched: Suites 700 + 710, ringed outside
      await startTour(page)
      await expect(page.getByTestId('tour-title')).toHaveText('Suites 700 + 710 · Floor 7')
      await expectNoStatusInside(page)
      await page.keyboard.press('Escape')

      await gotoApp(page, '3d')
      await suite3d(page, '410').evaluate((el: HTMLElement) => el.click()) // selected
      await page.getByTestId('tour-suite').click()
      await expect(page.getByTestId('tour-title')).toHaveText('Suite 410 · Floor 4')
      await expectNoStatusInside(page)
    })
  }

  test('on its own the look turns once all the way round, then stops there', async ({ page }) => {
    await gotoApp(page, '3d')
    await startTour(page)
    await expect(canvas(page)).toHaveAttribute('data-tour-camera', 'look')
    await page.getByTestId('tour-play').click() // paused: the stop stays while the look turns
    await expect(page.getByTestId('tour-play')).toHaveText('Play')
    await expect.poll(() => yaw(page), { timeout: 10_000 }).toBeGreaterThan(90)
    await expect.poll(() => yaw(page), { timeout: 15_000 }).toBeGreaterThan(200)
    await expect.poll(() => yaw(page), { timeout: 15_000 }).toBeGreaterThanOrEqual(359.9)
    await expect(canvas(page)).toHaveAttribute('data-tour-pan', 'off')
    expect(await yaw(page)).toBeCloseTo(360, 1)
  })

  test('a drag turns the look freely all the way round, either way', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' }) // no auto-turn: only the drag moves the look
    await gotoApp(page, '3d')
    await startTour(page)
    await expect(canvas(page)).toHaveAttribute('data-tour-camera', 'look')
    expect(await yaw(page)).toBe(0)
    await turn(page, 600, 3) // 3 × 600 px × 0.2° = 360°
    await expect.poll(() => yaw(page)).toBeCloseTo(360, 0)
    await turn(page, -600, 6)
    await expect.poll(() => yaw(page)).toBeCloseTo(-360, 0)
    await expect(canvas(page)).toHaveAttribute('data-tour-camera', 'look') // still inside
  })

  test('the people walk while the look runs, and stand still under reduced motion', async ({ page }) => {
    await gotoApp(page, '3d')
    await startTour(page)
    await expect(canvas(page)).toHaveAttribute('data-tour-camera', 'look')
    const first = await canvas(page).getAttribute('data-room-walk')
    await expect.poll(() => canvas(page).getAttribute('data-room-walk')).not.toBe(first)

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByTestId('tour-next').click()
    await expect(page.getByTestId('tour-counter')).toHaveText('2 of 6')
    await expect(canvas(page)).toHaveAttribute('data-tour-camera', 'look')
    const still = await canvas(page).getAttribute('data-room-walk')
    expect(still).toMatch(/^-?\d+\.\d{3},-?\d+\.\d{3}$/)
    await page.waitForTimeout(1500)
    expect(await canvas(page).getAttribute('data-room-walk')).toBe(still)
  })

  test('in the dark theme the room is drawn in the dark palette, with everything in it and no errors', async ({ page }) => {
    const problems: string[] = []
    page.on('pageerror', (e) => problems.push(e.message)).on('console', (m) => { if (m.type() === 'error') problems.push(m.text()) })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await gotoApp(page, '3d')
    await startTour(page)
    await expect(canvas(page)).toHaveAttribute('data-tour-camera', 'look')
    const light = await canvas(page).getAttribute('data-room-wall-colour')
    await page.getByTestId('tour-exit').click()
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
    await expect(page.getByTestId('scene3d')).toHaveAttribute('data-theme', 'dark')
    await startTour(page)
    await expect(canvas(page)).toHaveAttribute('data-tour-camera', 'look')
    const dark = await canvas(page).getAttribute('data-room-wall-colour')
    expect(dark).toMatch(/^#[0-9a-f]{6}$/)
    expect(dark).not.toBe(light)
    expect(await attr(page, 'data-room-people')).toBeGreaterThanOrEqual(2)
    expect(await attr(page, 'data-room-doors')).toBeGreaterThanOrEqual(1)
    await expect(page.getByTestId('fitout-tag')).toBeVisible()
    expect(problems).toEqual([])
  })
})
