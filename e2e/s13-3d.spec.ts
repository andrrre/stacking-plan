import { test, expect, type Locator, type Page } from '@playwright/test'
import { gotoApp, suite3d } from './helpers'

// The 3D building (WebGL) is the main screen. The canvas is checked by its pixels; everything else through
// the DOM: the mirror buttons (state, and where each suite is on the canvas), the facade labels, badges,
// rings and the controls. Headless Chromium draws WebGL in software.

const VACANT = ['300', '310', '410', '500', '700', '710', '1010']
const EXPIRING: Record<string, string> = { '600': '04/2027', '400': '05/2027', '220': '08/2027', '1000': '09/2027' }

const canvas = (page: Page) => page.getByTestId('stack-3d').locator('canvas')
const label = (page: Page, n: string) => page.getByTestId(`label3d-odt-${n}`)

/** Waits for the scene to report screen points (the camera has settled) and returns `n`'s point in page coords. */
async function pointOf(page: Page, n: string): Promise<{ x: number; y: number }> {
  const b = suite3d(page, n)
  await expect(b).toHaveAttribute('data-screen-hit', 'true')
  const box = await canvas(page).boundingBox()
  if (!box) throw new Error('no canvas')
  const x = Number(await b.getAttribute('data-screen-x'))
  const y = Number(await b.getAttribute('data-screen-y'))
  return { x: box.x + x, y: box.y + y }
}

/**
 * Waits until `n`'s reported screen point has held still for three reads 300 ms apart (an orbit ends with a
 * short glide back to framing; under load the first report can come before the glide).
 */
async function settled(page: Page, n: string): Promise<void> {
  const seen: string[] = []
  await expect.poll(async () => {
    seen.push(await pointKey(page, n))
    return seen.length >= 3 && seen.slice(-3).every((k) => k === seen[seen.length - 1])
  }, { intervals: [300], timeout: 8000 }).toBe(true)
}

const pointKey = (page: Page, n: string) => suite3d(page, n).evaluate((el) => `${el.getAttribute('data-screen-x')},${el.getAttribute('data-screen-y')}`)

/** Counts pixels of the element's screenshot within `tol` of each hex colour. */
async function colourCounts(page: Page, target: Locator, hexes: readonly string[], tol = 10): Promise<number[]> {
  const png = (await target.screenshot()).toString('base64')
  return page.evaluate(async ({ png, hexes, tol }) => {
    const img = new Image()
    img.src = `data:image/png;base64,${png}`
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const ctx = c.getContext('2d')
    if (!ctx) return hexes.map(() => -1)
    ctx.drawImage(img, 0, 0)
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    const rgb = hexes.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)))
    const counts = hexes.map(() => 0)
    for (let i = 0; i < d.length; i += 4) {
      rgb.forEach(([r, g, b], k) => {
        if (Math.abs((d[i] ?? 0) - (r ?? 0)) <= tol && Math.abs((d[i + 1] ?? 0) - (g ?? 0)) <= tol && Math.abs((d[i + 2] ?? 0) - (b ?? 0)) <= tol) counts[k] = (counts[k] ?? 0) + 1
      })
    }
    return counts
  }, { png, hexes: [...hexes], tol })
}

async function drag(page: Page, from: { x: number; y: number }, dx: number, dy: number): Promise<void> {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 8 })
  await page.mouse.up()
}

test.describe('3D building', () => {
  test('first paint is the 3D building, drawn, with no console errors', async ({ page }) => {
    const problems: string[] = []
    page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()) })
    page.on('pageerror', (e) => problems.push(e.message))
    await gotoApp(page, '3d')
    await expect(page.getByTestId('view-3d')).toBeChecked()
    await expect(canvas(page)).toBeVisible()
    await expect(page.getByTestId('stack-3d').locator('[aria-hidden="true"]').filter({ has: page.locator('canvas') })).toHaveCount(1)
    await expect(page.getByRole('group', { name: '3D building, Ocean Drive Tower' })).toBeVisible()
    await expect(page.locator('[data-testid^="suite-odt-"]')).toHaveCount(0) // the print-only 2D stack mounts only to print
    await pointOf(page, '500')
    const [orange, blue] = await colourCounts(page, canvas(page), ['#F28C28', '#1E3A6E'])
    expect(orange, 'vacant orange pixels').toBeGreaterThan(1500)
    expect(blue, 'occupied blue pixels').toBeGreaterThan(5000)
    expect(problems).toEqual([])
  })

  for (const [w, h] of [[1440, 900], [1280, 800]] as const) {
    test(`questions 1 and 2 at ${w}x${h}: vacant and expiring suites read on the facade`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h })
      await gotoApp(page, '3d')
      await pointOf(page, '500')
      const byStatus = (s: string) => page.locator(`[data-testid^="suite3d-"][data-status="${s}"]`).evaluateAll((els) =>
        els.map((e) => (e.getAttribute('data-testid') ?? '').replace('suite3d-odt-', '')).sort())
      expect(await byStatus('vacant')).toEqual([...VACANT].sort())
      expect(await byStatus('expiring')).toEqual(Object.keys(EXPIRING).sort())
      const stage = await page.getByTestId('stack-3d').boundingBox()
      for (const n of VACANT.filter((n) => n !== '1010')) {
        await expect(label(page, n), n).toBeVisible()
        expect(await label(page, n).evaluate((el) => (el as HTMLElement).innerText), n).toContain('VACANT')
      }
      for (const [n, date] of Object.entries(EXPIRING)) {
        await expect(label(page, n), n).toBeVisible()
        expect(await label(page, n).evaluate((el) => (el as HTMLElement).innerText), n).toContain(date)
      }
      expect(await label(page, '1010').evaluate((el) => (el as HTMLElement).innerText)).toContain('03/2027') // committed: lock + start
      for (const n of [...VACANT, ...Object.keys(EXPIRING)]) {
        const p = await pointOf(page, n)
        expect(stage && p.x > stage.x && p.x < stage.x + stage.width && p.y > stage.y && p.y < stage.y + stage.height, n).toBe(true)
      }
    })
  }

  test('question 3: 10,000 SF lights 500 and 700 + 710 with rank badges 1 and 2, the rest ghosted', async ({ page }) => {
    await gotoApp(page, '3d')
    await page.getByTestId('req-min-sf').fill('10000')
    await expect(suite3d(page, '500')).toHaveAttribute('data-match-rank', '1')
    for (const n of ['700', '710']) await expect(suite3d(page, n)).toHaveAttribute('data-match-rank', '2')
    await expect(page.getByTestId('badge3d-1')).toBeVisible()
    await expect(page.getByTestId('badge3d-1')).toHaveText('1')
    await expect(page.getByTestId('badge3d-2')).toHaveText('2')
    await expect(page.getByTestId('badge3d-3')).toHaveCount(0)
    const lit = await page.locator('[data-testid^="suite3d-"][data-dimmed="false"]').count()
    expect(lit).toBe(3)
    await expect(page.locator('[data-testid^="suite3d-"][data-dimmed="true"]')).toHaveCount(29)
    await expect(label(page, '500')).toHaveAttribute('data-forced', 'true')
    await expect(label(page, '600')).toHaveAttribute('data-ghost', 'true')
    // A ghosted suite keeps only its cue and number, faint: the matches are what the eye lands on.
    await expect.poll(() => label(page, '600').evaluate((el) => (el as HTMLElement).innerText)).not.toContain('Flamingo')
    expect(Number(await label(page, '600').evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(0.5)
    expect(await label(page, '500').evaluate((el) => (el as HTMLElement).innerText)).toContain('10,250 SF')
    // One ring around each match: 500 alone, and one around the 700 + 710 run.
    await expect(page.locator('polygon[data-kind="run"][data-on="true"]')).toHaveCount(2)
  })

  test('a real click on the canvas selects the suite under the pointer, on any floor and after orbiting', async ({ page }) => {
    await gotoApp(page, '3d')
    for (const n of ['500', '220']) {
      const p = await pointOf(page, n)
      await page.mouse.click(p.x, p.y)
      await expect(suite3d(page, n)).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByTestId('suite-details')).toContainText(`Suite ${n}`)
    }
    const before = await pointKey(page, '300')
    const box = await canvas(page).boundingBox()
    if (!box) throw new Error('no canvas')
    await drag(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, -160, 40)
    await expect.poll(() => pointKey(page, '300')).not.toBe(before)
    await settled(page, '300')
    const p = await pointOf(page, '300')
    await page.mouse.click(p.x, p.y)
    await expect(suite3d(page, '300')).toHaveAttribute('aria-pressed', 'true')
  })

  test('dragging across suites orbits and selects nothing; clicking empty space clears nothing', async ({ page }) => {
    await gotoApp(page, '3d')
    const from = await pointOf(page, '1200')
    const to = await pointOf(page, '1100')
    const before = await pointKey(page, '500')
    await drag(page, from, to.x - from.x + 120, to.y - from.y)
    await expect.poll(() => pointKey(page, '500')).not.toBe(before)
    await expect(page.locator('[data-testid^="suite3d-"][aria-pressed="true"]')).toHaveCount(0)
    await settled(page, '900')
    const p = await pointOf(page, '900')
    await page.mouse.click(p.x, p.y)
    await expect(suite3d(page, '900')).toHaveAttribute('aria-pressed', 'true')
    const box = await canvas(page).boundingBox()
    if (!box) throw new Error('no canvas')
    await page.mouse.click(box.x + 8, box.y + box.height - 8)
    await expect(suite3d(page, '900')).toHaveAttribute('aria-pressed', 'true')
  })

  test('the whole building stays inside the canvas after a hard orbit, and after Reset from zoomed in', async ({ page }) => {
    await gotoApp(page, '3d')
    await pointOf(page, '1200')
    const box = await canvas(page).boundingBox()
    if (!box) throw new Error('no canvas')
    const allInside = () => page.locator('[data-testid^="suite3d-"]').evaluateAll((els, s) => els.flatMap((e) => {
      const x = Number(e.getAttribute('data-screen-x'))
      const y = Number(e.getAttribute('data-screen-y'))
      return x > 0 && x < s.width && y > 0 && y < s.height ? [] : [e.getAttribute('data-testid')]
    }), box)
    const home = await pointKey(page, '1200')
    await drag(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, -600, 200)
    await expect.poll(() => pointKey(page, '1200')).not.toBe(home)
    await settled(page, '1200') // the glide back to a full framing
    expect(await allInside()).toEqual([])
    const tags = await page.locator('[data-testid^="floor3d-"]').evaluateAll((els) => {
      const stage = document.querySelector('[data-testid="stack-3d"]')?.getBoundingClientRect()
      return els.filter((e) => { const r = e.getBoundingClientRect(); return !stage || r.top < stage.top || r.bottom > stage.bottom }).length
    })
    expect(tags).toBe(0)

    await page.getByTestId('reset-view').click()
    await expect.poll(() => pointKey(page, '1200')).toBe(home)
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Zoom in' }).click()
    await expect.poll(async () => (await allInside()).length).toBeGreaterThan(0) // zoomed in past the framing, and it stays
    await page.getByTestId('reset-view').click()
    await expect.poll(() => pointKey(page, '1200')).toBe(home)
    expect(await allInside()).toEqual([])
  })

  test('zooming in on a 25-floor import brings up facade labels that were too small to show', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.addInitScript((b) => localStorage.setItem('stackmatch.v1.imported', JSON.stringify([b])), tallBuilding())
    await gotoApp(page, '3d', { b: 'tall' })
    const target = page.getByTestId('label3d-tall-13-2')
    await expect(page.getByTestId('suite3d-tall-13-2')).toHaveAttribute('data-screen-hit', 'true')
    await expect(target).toHaveAttribute('data-hidden', 'true')
    for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Zoom in' }).click()
    await expect(target).toHaveAttribute('data-hidden', 'false')
    await expect(target).toBeVisible()
    expect(await target.evaluate((el) => (el as HTMLElement).innerText)).toContain('1302')
  })

  test('hover shows the suite tooltip', async ({ page }) => {
    await gotoApp(page, '3d')
    const p = await pointOf(page, '600')
    await page.mouse.move(p.x, p.y)
    await expect(page.getByTestId('tooltip3d')).toBeVisible()
    await expect(page.getByTestId('tooltip3d')).toContainText('Suite 600 · Floor 6')
    await expect(page.locator('polygon[data-kind="hover"]')).toHaveAttribute('data-on', 'true')
  })

  test('the date slider and the colour mode recolour the building', async ({ page }) => {
    await gotoApp(page, '3d')
    await pointOf(page, '600')
    await page.getByTestId('date-slider').fill('8')
    await expect(suite3d(page, '600')).toHaveAttribute('data-overlay', 'potential')
    await expect(label(page, '600')).toContainText('Potential')
    await page.getByTestId('date-today').click()
    await page.getByTestId('mode-risk').click()
    await expect(page.getByTestId('legend-risk')).toBeVisible()
    await expect(suite3d(page, '900')).toHaveAttribute('data-fill', 'risk-gt36')
    await expect(label(page, '900')).toHaveAttribute('data-fill', 'risk-gt36')
    await expect.poll(async () => (await colourCounts(page, canvas(page), ['#6D28D9', '#1E3A6E']))).toEqual([expect.any(Number), 0])
    const [violet] = await colourCounts(page, canvas(page), ['#6D28D9'])
    expect(violet, 'risk ≤12 months violet pixels').toBeGreaterThan(300)
  })

  test('Separate floors and Reset view work by mouse and by keyboard', async ({ page }) => {
    await gotoApp(page, '3d')
    const spanOf = async () => Number(await suite3d(page, '100').getAttribute('data-screen-y')) - Number(await suite3d(page, '1200').getAttribute('data-screen-y'))
    await pointOf(page, '1200')
    const home = await pointKey(page, '500')
    const together = await spanOf()
    await page.getByTestId('separate-floors').click()
    await expect(page.getByTestId('separate-floors')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('stack-3d')).toHaveAttribute('data-separated', 'true')
    await expect.poll(spanOf).not.toBe(together)
    await expect(page.getByTestId('scene3d')).toHaveAttribute('data-labels', 'top') // labels move onto the plates
    await page.getByTestId('reset-view').click()
    await expect(page.getByTestId('separate-floors')).toHaveAttribute('aria-pressed', 'false')
    await expect.poll(() => pointKey(page, '500')).toBe(home)

    await page.getByTestId('separate-floors').focus()
    await page.keyboard.press('Space')
    await expect(page.getByTestId('separate-floors')).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('Space')
    await expect(page.getByTestId('separate-floors')).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('scene3d')).toHaveAttribute('data-floors-moving', 'false')
    await expect.poll(() => pointKey(page, '500')).toBe(home)
    // Rotate pressed while the floors are still moving apart is queued, then applied when they stop.
    const pressedWhileMoving = await page.evaluate(async () => {
      const q = (sel: string) => document.querySelector<HTMLElement>(sel)
      q('[data-testid="separate-floors"]')?.click()
      for (let i = 0; i < 60 && q('[data-testid="scene3d"]')?.dataset.floorsMoving !== 'true'; i++) {
        await new Promise((r) => requestAnimationFrame(r))
      }
      const moving = q('[data-testid="scene3d"]')?.dataset.floorsMoving
      q('button[aria-label="Rotate left"]')?.click()
      return moving
    })
    expect(pressedWhileMoving).toBe('true')
    await expect(page.getByTestId('scene3d')).toHaveAttribute('data-floors-moving', 'false')
    await settled(page, '500')
    const separatedRotated = await pointKey(page, '500')
    await page.getByTestId('reset-view').click() // back together, default framing
    await expect.poll(() => pointKey(page, '500')).toBe(home)
    await page.getByTestId('separate-floors').click()
    await expect(page.getByTestId('scene3d')).toHaveAttribute('data-floors-moving', 'false')
    await settled(page, '500')
    expect(await pointKey(page, '500'), 'the queued rotation was applied').not.toBe(separatedRotated)
    await page.getByTestId('separate-floors').click()
    await expect.poll(() => pointKey(page, '500')).toBe(home)
    await page.getByRole('button', { name: 'Rotate left' }).click()
    await expect.poll(() => pointKey(page, '500')).not.toBe(home)
    const rotated = await pointKey(page, '500')
    await page.getByRole('button', { name: 'Zoom in' }).click()
    await expect.poll(() => pointKey(page, '500')).not.toBe(rotated) // zoom-in is real, and stays
    await page.getByTestId('reset-view').focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => pointKey(page, '500')).toBe(home)
  })

  for (const [what, presses] of [
    ['turned past the azimuth limit', [...Array(8).fill('Rotate right'), 'Rotate left']],
    ['zoomed in past the zoom limit', [...Array(10).fill('Zoom in'), 'Zoom out']],
  ] as const) {
    test(`button presses ${what} survive Separate floors on and off without a jump`, async ({ page }) => {
      await gotoApp(page, '3d')
      await pointOf(page, '500')
      for (const name of presses) await page.getByRole('button', { name }).click()
      await settled(page, '500')
      const xy = async () => (await pointKey(page, '500')).split(',').map(Number)
      const before = await xy()
      for (let i = 0; i < 2; i++) {
        await page.getByTestId('separate-floors').click()
        await expect(page.getByTestId('scene3d')).toHaveAttribute('data-floors-moving', 'false')
        await expect(page.getByTestId('scene3d')).toHaveAttribute('data-labels', i === 0 ? 'top' : 'front')
      }
      await settled(page, '500')
      const after = await xy()
      expect(Math.abs((after[0] ?? 0) - (before[0] ?? 0)), `x ${before} -> ${after}`).toBeLessThanOrEqual(1)
      expect(Math.abs((after[1] ?? 0) - (before[1] ?? 0)), `y ${before} -> ${after}`).toBeLessThanOrEqual(1)
    })
  }

  test('the toggle switches to the 2D stack and back, keeping the search', async ({ page }) => {
    await gotoApp(page, '3d')
    await page.getByTestId('req-min-sf').fill('10000')
    await expect(suite3d(page, '500')).toHaveAttribute('data-match-rank', '1')
    await page.getByTestId('view-stack').click()
    await expect(page).toHaveURL(/view=stack/)
    await expect(page.getByTestId('stack-3d')).toHaveCount(0)
    await expect(page.getByTestId('suite-odt-500')).toHaveAttribute('data-match-rank', '1')
    await page.getByTestId('view-stack').focus()
    await page.keyboard.press('ArrowLeft')
    await expect(page.getByTestId('view-3d')).toBeChecked()
    await expect(page).not.toHaveURL(/view=/)
    await expect(suite3d(page, '500')).toHaveAttribute('data-match-rank', '1')
    await expect(page.getByTestId('req-min-sf')).toHaveValue(/10,?000/)
    await expect(page.getByTestId('badge3d-1')).toBeVisible()
  })

  test('keyboard: Tab into the building, arrows move, Enter selects, Escape clears, focus shows on the suite', async ({ page }) => {
    await gotoApp(page, '3d')
    await pointOf(page, '1200')
    await page.getByTestId('view-stack').focus()
    let guard = 0
    while (!(await page.evaluate(() => document.activeElement?.getAttribute('data-testid')?.startsWith('suite3d-'))) && guard++ < 40) {
      await page.keyboard.press('Tab')
    }
    await expect(suite3d(page, '1200')).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowRight')
    await expect(suite3d(page, '1110')).toBeFocused()
    await expect(page.locator('polygon[data-kind="focus"]')).toHaveAttribute('data-on', 'true')
    await expect(label(page, '1110')).toHaveAttribute('data-focused', 'true')
    await expect(label(page, '1110')).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(suite3d(page, '1110')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('suite-details')).toContainText('Suite 1110')
    await page.keyboard.press('Escape')
    await expect(suite3d(page, '1110')).toHaveAttribute('aria-pressed', 'false')
  })

  test('the second building and a 25-floor import fit inside the stage, clear of the toolbar and controls', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.addInitScript((b) => localStorage.setItem('stackmatch.v1.imported', JSON.stringify([b])), tallBuilding())
    for (const [b, count] of [['pbp', 28], ['tall', 75]] as const) {
      await gotoApp(page, '3d', { b })
      const buttons = page.locator('[data-testid^="suite3d-"]')
      await expect(buttons).toHaveCount(count)
      await expect(buttons.first()).toHaveAttribute('data-screen-x', /\d/)
      const size = await canvas(page).boundingBox()
      if (!size) throw new Error('no canvas')
      const outside = await buttons.evaluateAll((els, s) => els.flatMap((e) => {
        const x = Number(e.getAttribute('data-screen-x'))
        const y = Number(e.getAttribute('data-screen-y'))
        return x > 0 && x < s.width && y > 0 && y < s.height ? [] : [e.getAttribute('data-testid')]
      }), size)
      expect(outside, b).toEqual([])
      for (const control of [
        page.getByTestId('mode-risk'), page.getByTestId('view-stack'), page.getByTestId('reset-view'),
        page.getByTestId('separate-floors'), page.getByRole('button', { name: 'Zoom in' }),
      ]) {
        const free = await control.evaluate((el) => {
          const r = el.getBoundingClientRect()
          const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
          return hit !== null && el.contains(hit)
        })
        expect(free, `${b}: control not covered`).toBe(true)
      }
      const tags = await page.locator('[data-testid^="floor3d-"]').evaluateAll((els) => {
        const stage = document.querySelector('[data-testid="stack-3d"]')?.getBoundingClientRect()
        return els.filter((e) => {
          const r = e.getBoundingClientRect()
          return !stage || r.top < stage.top || r.bottom > stage.bottom || r.left < stage.left
        }).length
      })
      expect(tags, `${b}: floor numbers inside the stage`).toBe(0)
    }
  })

  test('reduced motion: colours change without a transition', async ({ page }) => {
    await gotoApp(page, '3d')
    await expect(page.getByTestId('scene3d')).toHaveAttribute('data-colour-transition-ms', '180')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(page.getByTestId('scene3d')).toHaveAttribute('data-colour-transition-ms', '0')
    await pointOf(page, '600')
    await page.getByTestId('mode-risk').click()
    // With no fade the very next screenshot already has no availability blue left.
    const [blue, violet] = await colourCounts(page, canvas(page), ['#1E3A6E', '#6D28D9'], 6)
    expect(blue).toBe(0)
    expect(violet, 'the canvas is drawn, in the new colours').toBeGreaterThan(300)
  })

  test('without WebGL the 2D stack takes its place with a short note', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'WebGL2RenderingContext', { value: undefined })
    })
    await gotoApp(page, '3d')
    await expect(page.getByTestId('webgl-fallback')).toContainText('needs WebGL')
    await expect(page.getByTestId('suite-odt-500')).toBeVisible()
    await expect(page.getByTestId('stack-3d')).toHaveCount(0)
  })

  for (const [b, id] of [['odt', 'suite-odt-100'], ['tall', 'suite-tall-1-0']] as const) {
    test(`without WebGL the stand-in 2D stack scrolls to its lowest floor (${b})`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 })
      await page.addInitScript((tall) => {
        Object.defineProperty(window, 'WebGL2RenderingContext', { value: undefined })
        localStorage.setItem('stackmatch.v1.imported', JSON.stringify([tall]))
      }, tallBuilding())
      await gotoApp(page, '3d', { b })
      const stack = page.getByTestId('stack')
      await expect(stack).toBeVisible()
      const box = await stack.boundingBox()
      if (!box) throw new Error('no stack')
      const reachable = () => page.getByTestId(id).evaluate((el) => {
        const r = el.getBoundingClientRect()
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        return hit !== null && el.contains(hit)
      })
      for (let i = 0; i < 20 && !(await reachable()); i++) {
        await page.mouse.move(box.x + box.width / 2, box.y + 40)
        await page.mouse.wheel(0, 300)
        await page.waitForTimeout(50)
      }
      expect(await reachable()).toBe(true)
    })
  }

  test('a lost WebGL context that comes back redraws by itself; one that stays lost hands over to 2D', async ({ page }) => {
    await gotoApp(page, '3d')
    await pointOf(page, '500')
    // The extension is only handed out while the context is alive, so the test keeps it from the loss.
    const ext = (call: 'loseContext' | 'restoreContext') => page.evaluate((c) => {
      const w = window as unknown as { __loseExt?: WEBGL_lose_context | null }
      const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="stack-3d"] canvas')
      if (c === 'loseContext') w.__loseExt = canvas?.getContext('webgl2')?.getExtension('WEBGL_lose_context')
      w.__loseExt?.[c]()
    }, call)
    await ext('loseContext')
    await page.waitForTimeout(300)
    await ext('restoreContext')
    await expect.poll(async () => (await colourCounts(page, canvas(page), ['#F28C28']))[0], { timeout: 5000 }).toBeGreaterThan(1500)
    await expect(page.getByTestId('webgl-fallback')).toHaveCount(0)
    await ext('loseContext')
    await expect(page.getByTestId('webgl-fallback')).toHaveAttribute('data-reason', 'lost', { timeout: 6000 })
    await expect(page.getByTestId('webgl-fallback')).toContainText('stopped working')
    await expect(page.getByTestId('suite-odt-500')).toBeVisible()
  })

  test('if the 3D code fails to load, the 2D stack says so and Try again loads it', async ({ page }) => {
    await page.route('**/*Scene3D*', (route) => route.abort())
    await gotoApp(page, '3d')
    await expect(page.getByTestId('webgl-fallback')).toHaveAttribute('data-reason', 'load')
    await expect(page.getByTestId('webgl-fallback')).toContainText('failed to load')
    await page.unroute('**/*Scene3D*')
    await page.getByRole('button', { name: 'Try again' }).click()
    await pointOf(page, '500')
    await expect(page.getByTestId('webgl-fallback')).toHaveCount(0)
  })

  test('separated and orbited to the upper limit, no label lies over the floor above', async ({ page }) => {
    await gotoApp(page, '3d')
    await page.getByTestId('separate-floors').click()
    await expect(page.getByTestId('scene3d')).toHaveAttribute('data-floors-moving', 'false')
    await pointOf(page, '1200')
    const box = await canvas(page).boundingBox()
    if (!box) throw new Error('no canvas')
    await drag(page, { x: box.x + box.width / 2, y: box.y + 60 }, 0, 500)
    await settled(page, '600')
    const bad = await page.locator('[data-testid^="suite3d-"]').evaluateAll((els) => els.flatMap((e) => {
      const id = (e.getAttribute('data-testid') ?? '').replace('suite3d-', '')
      const lab = document.querySelector(`[data-testid="label3d-${id}"]`)
      const shown = lab?.getAttribute('data-hidden') === 'false'
      return shown && e.getAttribute('data-screen-hit') !== 'true' ? [id] : []
    }))
    expect(bad).toEqual([])
    expect(await page.locator('[data-testid^="label3d-"][data-hidden="false"]').count()).toBeGreaterThan(0)
  })

  test.describe('floor view', () => {
    const slider = (page: Page) => page.getByTestId('floor-slider')
    const floorView = (page: Page) => page.getByTestId('floor-view')

    test('opens on the highest floor with vacant space; the slider steps floor by floor and the URL follows', async ({ page }) => {
      await gotoApp(page, '3d')
      await pointOf(page, '500')
      await floorView(page).click()
      await expect(floorView(page)).toHaveAttribute('aria-pressed', 'true')
      await expect(slider(page)).toHaveAttribute('aria-valuetext', 'Floor 7, 7 of 12')
      await expect(page.getByTestId('stack-3d')).toHaveAttribute('data-floor', '7')
      await expect(page).toHaveURL(/[?&]floor=7(&|$)/)
      await expect(page.getByTestId('floor-caption')).toHaveText(/^Floor 7 · [\d,]+ SF · [\d,]+ SF vacant$/)
      await expect(suite3d(page, '1200')).toHaveCount(0) // floors above are not drawn, and leave the mirror
      await expect(suite3d(page, '600')).toHaveCount(0) // the mirror lists the shown floor only
      await expect(page.getByTestId('scene3d')).toHaveAttribute('data-labels', 'top')
      await pointOf(page, '700')
      await expect(label(page, '700')).toHaveAttribute('data-hidden', 'false')
      expect(await label(page, '700').evaluate((el) => (el as HTMLElement).innerText)).toContain('VACANT')

      await slider(page).focus()
      await page.keyboard.press('ArrowDown')
      await expect(slider(page)).toHaveAttribute('aria-valuetext', 'Floor 6, 6 of 12')
      await expect(page).toHaveURL(/[?&]floor=6(&|$)/)
      await expect(suite3d(page, '700')).toHaveCount(0)
      await pointOf(page, '600')
      await expect(label(page, '600')).toHaveAttribute('data-hidden', 'false')
      await page.keyboard.press('ArrowUp')
      await page.keyboard.press('ArrowUp')
      await expect(slider(page)).toHaveAttribute('aria-valuetext', 'Floor 8, 8 of 12')

      const rail = await page.getByTestId('floor-rail').boundingBox()
      if (!rail) throw new Error('no rail')
      await page.mouse.move(rail.x + rail.width / 2, rail.y + rail.height / 2)
      await page.mouse.wheel(0, 100)
      await expect(slider(page)).toHaveAttribute('aria-valuetext', 'Floor 7, 7 of 12')
    })

    test('?floor=5 opens floor view on floor 5; an unknown floor opens the whole building', async ({ page }) => {
      await gotoApp(page, '3d', { floor: '5' })
      await expect(floorView(page)).toHaveAttribute('aria-pressed', 'true')
      await expect(slider(page)).toHaveAttribute('aria-valuetext', 'Floor 5, 5 of 12')
      await pointOf(page, '500')
      await expect(suite3d(page, '600')).toHaveCount(0)
      await gotoApp(page, '3d', { floor: '13' })
      await pointOf(page, '1200')
      await expect(floorView(page)).toHaveAttribute('aria-pressed', 'false')
      await expect(slider(page)).toHaveCount(0)
      await expect(page).not.toHaveURL(/floor=/)
    })

    test('opens on the selected suite\'s floor', async ({ page }) => {
      await gotoApp(page, '3d')
      const p = await pointOf(page, '220')
      await page.mouse.click(p.x, p.y)
      await expect(suite3d(page, '220')).toHaveAttribute('aria-pressed', 'true')
      await floorView(page).click()
      await expect(slider(page)).toHaveAttribute('aria-valuetext', 'Floor 2, 2 of 12')
    })

    test('Separate floors and floor view exclude each other; Reset view leaves floor view', async ({ page }) => {
      await gotoApp(page, '3d')
      await pointOf(page, '500')
      const home = await pointKey(page, '500')
      await page.getByTestId('separate-floors').click()
      await floorView(page).click()
      await expect(page.getByTestId('separate-floors')).toHaveAttribute('aria-pressed', 'false')
      await expect(slider(page)).toBeVisible()
      await page.getByTestId('separate-floors').click()
      await expect(floorView(page)).toHaveAttribute('aria-pressed', 'false')
      await expect(slider(page)).toHaveCount(0)
      await expect(page).not.toHaveURL(/floor=/)
      await floorView(page).click()
      await expect(page.getByTestId('separate-floors')).toHaveAttribute('aria-pressed', 'false')
      await page.getByTestId('reset-view').click()
      await expect(floorView(page)).toHaveAttribute('aria-pressed', 'false')
      await expect(slider(page)).toHaveCount(0)
      await expect(page).not.toHaveURL(/floor=/)
      await expect(suite3d(page, '1200')).toHaveCount(1)
      await expect.poll(() => pointKey(page, '500')).toBe(home)
    })

    test('a search rings the match on the shown floor and marks matching floors on the slider', async ({ page }) => {
      await gotoApp(page, '3d', { floor: '7' })
      await page.getByTestId('req-min-sf').fill('10000')
      await expect(suite3d(page, '700')).toHaveAttribute('data-match-rank', '2')
      await expect(page.getByTestId('badge3d-2')).toBeVisible()
      await expect(page.getByTestId('badge3d-1')).toHaveCount(0) // 500 is on floor 5
      await expect(page.locator('polygon[data-kind="run"][data-on="true"]')).toHaveCount(1)
      const marked = await page.getByTestId('floor-ticks').locator('li[data-match="true"]').allTextContents()
      expect(marked).toEqual(['7', '5'])
      await pointOf(page, '700')
      await expect(label(page, '700')).toHaveAttribute('data-hidden', 'false')
    })

    test('selecting a match on another floor moves floor view there', async ({ page }) => {
      await gotoApp(page, '3d', { floor: '7' })
      await page.getByTestId('req-min-sf').fill('10000')
      await page.getByRole('button', { name: /^Match 1:/ }).click() // Suite 500, on floor 5
      await expect(slider(page)).toHaveAttribute('aria-valuetext', 'Floor 5, 5 of 12')
      await expect(page).toHaveURL(/[?&]floor=5(&|$)/)
      await expect(suite3d(page, '500')).toHaveAttribute('data-match-rank', '1')
      await expect(page.getByTestId('badge3d-1')).toBeVisible()
    })

    test('the 2D stack ignores floor view and keeps floor= out of the URL; back in 3D it returns', async ({ page }) => {
      await gotoApp(page, '3d', { floor: '5' })
      await expect(slider(page)).toHaveAttribute('aria-valuetext', 'Floor 5, 5 of 12')
      await page.getByTestId('view-stack').click()
      await expect(page).toHaveURL(/view=stack/)
      await expect(page).not.toHaveURL(/floor=/)
      await expect(page.getByTestId('suite-odt-1200')).toBeVisible()
      await page.getByTestId('view-3d').click()
      await expect(slider(page)).toHaveAttribute('aria-valuetext', 'Floor 5, 5 of 12')
      await expect(page).toHaveURL(/[?&]floor=5(&|$)/)
    })
  })

  test('printing shows the 2D stack in place of the canvas', async ({ page }) => {
    await gotoApp(page, '3d')
    await pointOf(page, '500')
    await page.emulateMedia({ media: 'print' })
    await expect(page.getByTestId('stack-3d')).toBeHidden()
    await expect(page.getByTestId('stack')).toBeVisible()
    await expect(page.getByTestId('suite-odt-500')).toBeVisible()
  })
})

test.describe('the sketched city around the building', () => {
  const toggle = (page: Page) => page.getByTestId('stack-3d').getByTestId('city-toggle')
  const scene = (page: Page) => page.getByTestId('stack-3d').getByTestId('scene3d')
  const MOVING = { cityMotion: 'on' } // gotoApp holds the traffic still unless asked

  /** How many ticks the city's own loop has run (the canvas counts them); 0 before the first. */
  const ticks = async (page: Page) => Number(await canvas(page).getAttribute('data-city-ticks')) || 0
  /** Ticks over `ms`. */
  const ticksIn = async (page: Page, ms: number) => {
    const before = await ticks(page)
    await page.waitForTimeout(ms)
    return (await ticks(page)) - before
  }
  /** Waits until the city's loop has stopped: its tick count holds over two reads 400 ms apart. */
  const loopStopped = async (page: Page) => {
    const seen: number[] = []
    await expect.poll(async () => {
      seen.push(await ticks(page))
      return seen.length >= 2 && seen[seen.length - 1] === seen[seen.length - 2]
    }, { intervals: [400], timeout: 5000 }).toBe(true)
  }

  test('the City switch is on by default; turned off it stays off after a reload', async ({ page }) => {
    await gotoApp(page, '3d', MOVING)
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true')
    await expect(scene(page)).toHaveAttribute('data-city', 'on')
    await expect(scene(page)).toHaveAttribute('data-city-motion', 'on')
    await toggle(page).click()
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false')
    await expect(scene(page)).toHaveAttribute('data-city', 'off')
    await expect(scene(page)).toHaveAttribute('data-city-motion', 'off')
    expect([...new URL(page.url()).searchParams.keys()]).not.toContain('city') // a local preference, not in the URL
    await page.reload()
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false')
    await expect(scene(page)).toHaveAttribute('data-city', 'off')
    await toggle(page).click()
    await page.reload()
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true')
  })

  test('with the city on, the building is framed exactly as without it and a click on the facade selects', async ({ page }) => {
    await gotoApp(page, '3d', MOVING)
    await pointOf(page, '500')
    await settled(page, '500')
    const tag = page.getByTestId('floor3d-7')
    const withCity = await tag.boundingBox()
    const point = await pointKey(page, '500')
    const at = await pointOf(page, '500')
    await page.mouse.click(at.x, at.y)
    await expect(suite3d(page, '500')).toHaveAttribute('aria-pressed', 'true')
    await toggle(page).click()
    await expect(scene(page)).toHaveAttribute('data-city', 'off')
    await settled(page, '500')
    expect(await tag.boundingBox()).toEqual(withCity)
    expect(await pointKey(page, '500')).toBe(point)
  })

  test('the traffic animates on its own loop, which never stops the screen points from settling', async ({ page }) => {
    await gotoApp(page, '3d', MOVING)
    await pointOf(page, '300')
    await settled(page, '300')
    expect(await ticksIn(page, 1000), 'the city loop runs').toBeGreaterThan(3) // "it is running": software GL under a parallel run manages ~10 a second
    await toggle(page).click()
    await expect(scene(page)).toHaveAttribute('data-city-motion', 'off')
    await loopStopped(page)
    expect(await ticksIn(page, 1000), 'nothing animates with the city off').toBe(0)
  })

  test('reduced motion: the cars and people stand still and the city loop never runs', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await gotoApp(page, '3d', MOVING)
    await pointOf(page, '500')
    await expect(scene(page)).toHaveAttribute('data-city', 'on')
    await expect(scene(page)).toHaveAttribute('data-city-motion', 'off')
    await settled(page, '500')
    expect(await ticks(page)).toBe(0)
    expect(await ticksIn(page, 1000)).toBe(0)
  })

  test('an open dialog stops the traffic; closing it starts it again', async ({ page }) => {
    await gotoApp(page, '3d', MOVING)
    await page.getByTestId('req-min-sf').fill('10000')
    await page.getByTestId('save-match-1').click() // the summary needs a shortlist
    await expect(scene(page)).toHaveAttribute('data-city-motion', 'on')
    await page.getByTestId('open-summary').click()
    await expect(page.getByTestId('client-summary')).toBeVisible()
    await expect(scene(page)).toHaveAttribute('data-city-motion', 'off')
    await loopStopped(page)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('client-summary')).toHaveCount(0)
    await expect(scene(page)).toHaveAttribute('data-city-motion', 'on')
    expect(await ticksIn(page, 1000)).toBeGreaterThan(3) // "it is running": software GL under a parallel run manages ~10 a second
  })

  test('floor view and separate floors keep the city moving, further back', async ({ page }) => {
    await gotoApp(page, '3d', MOVING)
    await expect(scene(page)).toHaveAttribute('data-city-dim', '1.00')
    await page.getByTestId('floor-view').click()
    await expect(scene(page)).toHaveAttribute('data-city', 'on')
    await expect(scene(page)).toHaveAttribute('data-city-motion', 'on')
    await expect(scene(page)).toHaveAttribute('data-city-dim', '0.40')
    await page.getByTestId('separate-floors').click()
    await expect(scene(page)).toHaveAttribute('data-city-motion', 'on')
    await expect(scene(page)).toHaveAttribute('data-city-dim', '0.50')
    expect(await ticksIn(page, 1000)).toBeGreaterThan(3) // "it is running": software GL under a parallel run manages ~10 a second
  })

  test('with the traffic moving, the date slider still updates the facade labels', async ({ page }) => {
    await gotoApp(page, '3d', MOVING)
    await pointOf(page, '600')
    await page.getByTestId('date-slider').fill('8')
    await expect(suite3d(page, '600')).toHaveAttribute('data-overlay', 'potential')
    await expect(label(page, '600')).toContainText('Potential')
    await expect(label(page, '600')).toBeVisible()
  })

  test('with the traffic moving, the scene settles after a Minimum size search', async ({ page }) => {
    await gotoApp(page, '3d', MOVING)
    await page.getByTestId('req-min-sf').fill('10000')
    await expect(suite3d(page, '500')).toHaveAttribute('data-match-rank', '1')
    await pointOf(page, '500')
    await settled(page, '500')
    await expect(page.getByTestId('badge3d-1')).toBeVisible()
    await expect(page.locator('polygon[data-kind="run"][data-on="true"]')).toHaveCount(2)
  })
})

function tallBuilding() {
  const floors = Array.from({ length: 25 }, (_, f) => ({
    number: 25 - f,
    suites: [0, 1, 2].map((k) => ({
      id: `tall-${25 - f}-${k}`, number: `${25 - f}0${k}`, areaSf: 3000 + k * 1000, kind: 'leasable', askingRentPsf: 40, joinsNext: false,
      leases: k === 0 ? [] : [{ id: `tall-${25 - f}-${k}-l1`, tenant: 'Tenant', start: '2024-01-01', end: '2029-12-31', rentPsf: 38 }],
    })),
  }))
  return { id: 'tall', name: 'Tall Tower', address: '1 Tall St', floors }
}
