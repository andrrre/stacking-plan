import { test, expect, type Page } from '@playwright/test'
import { gotoApp, suite3d } from './helpers'

// The side drawers: the left one (requirement and shortlist) hides and shows on its handle and is remembered;
// the right one (details) opens only when it has something to show. On wide screens both push the stage, so
// the building is never under a drawer; below 1100 px they overlay it, one at a time.

const leftToggle = (page: Page) => page.getByTestId('left-drawer-toggle')
const rightPanel = (page: Page) => page.getByTestId('right-panel')
const stage = (page: Page) => page.getByTestId('stack-3d')

async function width(page: Page, testId: string): Promise<number> {
  const box = await page.getByTestId(testId).boundingBox()
  if (!box) throw new Error(`no box for ${testId}`)
  return Math.round(box.width)
}

/** Waits for the stage's width to stop changing (a drawer has finished sliding) and returns it. */
async function settledStageWidth(page: Page): Promise<number> {
  const seen: number[] = []
  await expect.poll(async () => {
    seen.push(await width(page, 'stack-3d'))
    return seen.length >= 3 && seen.slice(-3).every((w) => w === seen[seen.length - 1])
  }, { intervals: [150] }).toBe(true)
  return seen[seen.length - 1] ?? 0
}

/** Clicks suite `n` on the canvas, where the scene reports it. */
async function clickSuite(page: Page, n: string): Promise<void> {
  const b = suite3d(page, n)
  await expect(b).toHaveAttribute('data-screen-hit', 'true')
  const box = await stage(page).locator('canvas').boundingBox()
  if (!box) throw new Error('no canvas')
  await page.mouse.click(box.x + Number(await b.getAttribute('data-screen-x')), box.y + Number(await b.getAttribute('data-screen-y')))
}

/** Every suite's screen point and every floor number lie inside the canvas, and no drawer covers the stage. */
async function expectBuildingInsideStage(page: Page, label: string): Promise<void> {
  await settledStageWidth(page)
  const buttons = page.locator('[data-testid^="suite3d-"]')
  await expect(buttons.first()).toHaveAttribute('data-screen-x', /\d/)
  const canvas = await stage(page).locator('canvas').boundingBox()
  if (!canvas) throw new Error('no canvas')
  await expect.poll(() => buttons.evaluateAll((els, s) => els.filter((e) => {
    const x = Number(e.getAttribute('data-screen-x'))
    const y = Number(e.getAttribute('data-screen-y'))
    return !(x > 0 && x < s.width && y > 0 && y < s.height)
  }).length, canvas), `${label}: suites inside the canvas`).toBe(0)
  const tags = await page.locator('[data-testid^="floor3d-"]').evaluateAll((els) => {
    const s = document.querySelector('[data-testid="stack-3d"]')?.getBoundingClientRect()
    return els.filter((e) => {
      const r = e.getBoundingClientRect()
      return !s || r.top < s.top || r.bottom > s.bottom || r.left < s.left || r.right > s.right
    }).length
  })
  expect(tags, `${label}: floor numbers inside the stage`).toBe(0)
  const covered = await page.evaluate(() => {
    const s = document.querySelector('[data-testid="stack-3d"]')?.getBoundingClientRect()
    return ['left-rail', 'right-panel'].filter((id) => {
      const el = document.querySelector(`[data-testid="${id}"]`)
      if (!s || !el || getComputedStyle(el).visibility === 'hidden') return false
      const r = el.getBoundingClientRect()
      return r.right > s.left + 1 && r.left < s.right - 1
    })
  })
  expect(covered, `${label}: no drawer over the stage`).toEqual([])
}

test.describe('drawers at 1440 px', () => {
  test('initial load: left open, right closed, and the stage narrows when a suite opens the details', async ({ page }) => {
    await gotoApp(page, '3d')
    await expect(leftToggle(page)).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByTestId('left-rail')).toBeVisible()
    await expect(rightPanel(page)).toHaveAttribute('data-open', 'false')
    await expect(rightPanel(page)).toHaveAttribute('inert', '')
    await expect(rightPanel(page)).toBeHidden()
    await expect(page.getByTestId('stage-hint')).toBeVisible()
    const wide = await settledStageWidth(page)

    await clickSuite(page, '500')
    await expect(rightPanel(page)).toHaveAttribute('data-open', 'true')
    await expect(rightPanel(page).getByTestId('suite-details')).toContainText('Suite 500')
    await expect(page.getByTestId('stage-hint')).toHaveCount(0)
    const narrow = await settledStageWidth(page)
    expect(wide - narrow).toBeGreaterThan(300)

    await page.getByTestId('right-drawer-close').click()
    await expect(suite3d(page, '500')).toHaveAttribute('aria-pressed', 'false')
    await expect(rightPanel(page)).toHaveAttribute('data-open', 'false')
    await expect(rightPanel(page)).toHaveAttribute('inert', '')
    await expect(rightPanel(page).getByTestId('suite-details')).toHaveCount(0) // gone once the slide ends
    await expect(rightPanel(page)).toBeHidden()
    expect(await settledStageWidth(page)).toBe(wide)
  })

  test('a search opens the match list; dismissed, it stays shut until the requirement changes', async ({ page }) => {
    await gotoApp(page, '3d')
    await page.getByTestId('req-min-sf').fill('10,000')
    await expect(rightPanel(page)).toHaveAttribute('data-open', 'true')
    await expect(rightPanel(page).getByTestId('match-list')).toBeVisible()
    await page.getByTestId('right-drawer-close').click()
    await expect(rightPanel(page)).toHaveAttribute('data-open', 'false')
    await page.getByTestId('date-slider').fill('6')
    await expect(rightPanel(page)).toHaveAttribute('data-open', 'false')
    await page.getByTestId('req-min-sf').fill('12,000')
    await expect(rightPanel(page)).toHaveAttribute('data-open', 'true')
    await expect(rightPanel(page).getByTestId('match-list')).toBeVisible()
  })

  test('Escape inside the details closes them and clears the selection', async ({ page }) => {
    await gotoApp(page, '3d')
    await clickSuite(page, '700')
    await expect(rightPanel(page)).toHaveAttribute('data-open', 'true')
    await page.getByTestId('right-drawer-close').focus()
    await page.keyboard.press('Escape')
    await expect(rightPanel(page)).toHaveAttribute('data-open', 'false')
    await expect(suite3d(page, '700')).toHaveAttribute('aria-pressed', 'false')
  })

  test('hiding the left drawer persists across a reload; the building fits in all four drawer states', async ({ page }) => {
    await gotoApp(page, '3d')
    await expectBuildingInsideStage(page, 'left open, right closed')
    await clickSuite(page, '600')
    await expect(rightPanel(page)).toHaveAttribute('data-open', 'true')
    await expectBuildingInsideStage(page, 'both open')

    await leftToggle(page).click()
    await expect(leftToggle(page)).toHaveAttribute('aria-expanded', 'false')
    await expect(leftToggle(page)).toHaveAccessibleName('Show search panel')
    await expect(page.getByTestId('left-rail')).toHaveAttribute('inert', '')
    await expect(page.getByTestId('left-rail')).toBeHidden()
    await expectBuildingInsideStage(page, 'left closed, right open')

    await page.reload()
    await expect(leftToggle(page)).toHaveAttribute('aria-expanded', 'false')
    await expect(rightPanel(page)).toHaveAttribute('data-open', 'false')
    await expectBuildingInsideStage(page, 'both closed')
    await expect(leftToggle(page)).toBeInViewport()

    await leftToggle(page).click()
    await expect(page.getByTestId('left-rail')).toBeVisible()
    await page.reload()
    await expect(leftToggle(page)).toHaveAttribute('aria-expanded', 'true')
  })

  test('a selection that opens the details keeps the user\'s zoom and orbit', async ({ page }) => {
    await gotoApp(page, '3d')
    const canvas = stage(page).locator('canvas')
    await expect(suite3d(page, '500')).toHaveAttribute('data-screen-hit', 'true')
    const box = await canvas.boundingBox()
    if (!box) throw new Error('no canvas')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, -300)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 - 120, box.y + box.height / 2 + 20, { steps: 8 })
    await page.mouse.up()
    const read = async () => ({
      azimuth: Number(await canvas.getAttribute('data-camera-azimuth')),
      zoom: Number(await canvas.getAttribute('data-camera-zoom')),
    })
    let before = await read()
    await expect.poll(async () => { const now = await read(); const same = now.zoom === before.zoom && now.azimuth === before.azimuth; before = now; return same }, { intervals: [300] }).toBe(true)
    expect(before.zoom).toBeLessThan(0.95) // zoomed in
    expect(Math.abs(before.azimuth)).toBeGreaterThan(5) // orbited
    await suite3d(page, '500').focus()
    await page.keyboard.press('Enter')
    await expect(rightPanel(page)).toHaveAttribute('data-open', 'true')
    await settledStageWidth(page)
    await expect.poll(async () => (await read()).zoom).toBeCloseTo(before.zoom, 2)
    expect((await read()).azimuth).toBeCloseTo(before.azimuth, 0)
  })

  test('reduced motion: the drawers move without a transition', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await gotoApp(page, '3d')
    const durations = await page.evaluate(() => ['left-rail', 'right-panel'].map((id) => {
      const drawer = document.querySelector(`[data-testid="${id}"]`)?.closest('[data-drawer]')
      return drawer ? getComputedStyle(drawer).transitionDuration : 'missing'
    }))
    expect(durations).toEqual(['0s', '0s'])
    // Click, then measure one frame later: a 240 ms slide would have barely started by then.
    const [before, after] = await page.evaluate(async () => {
      const pane = () => document.querySelector('[data-testid="center-pane"]')?.getBoundingClientRect().width ?? 0
      const start = pane()
      document.querySelector<HTMLElement>('[data-testid="left-drawer-toggle"]')?.click()
      await new Promise((r) => requestAnimationFrame(() => r(null)))
      return [start, pane()]
    })
    expect(after).toBeGreaterThan(before + 200)
  })
})

test.describe('drawers at 1000 px', () => {
  test.use({ viewport: { width: 1000, height: 800 } })

  test('a first visit starts with the left drawer closed; they overlay the stage, one at a time', async ({ page }) => {
    await gotoApp(page, '3d')
    await expect(leftToggle(page)).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByTestId('left-rail')).toHaveAttribute('inert', '')
    const full = await settledStageWidth(page)
    expect(full).toBeGreaterThan(900)

    await leftToggle(page).click()
    await expect(page.getByTestId('left-rail')).toBeVisible()
    expect(await settledStageWidth(page)).toBe(full) // the left drawer floats over the stage

    await clickSuite(page, '500')
    await expect(rightPanel(page)).toHaveAttribute('data-open', 'true')
    await expect(rightPanel(page).getByTestId('suite-details')).toContainText('Suite 500')
    await expect(leftToggle(page)).toHaveAttribute('aria-expanded', 'false')
    expect(await settledStageWidth(page)).toBe(full)

    // The stage's controls and the view switch stay reachable beside the open details.
    for (const control of [page.getByTestId('reset-view'), page.getByTestId('view-stack'), page.getByTestId('separate-floors')]) {
      await expect.poll(() => control.evaluate((el) => {
        const r = el.getBoundingClientRect()
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        return hit !== null && el.contains(hit)
      })).toBe(true)
    }

    // Opening the left drawer gives it the room: the details step aside, the selection stays.
    await leftToggle(page).click()
    await expect(leftToggle(page)).toHaveAttribute('aria-expanded', 'true')
    await expect(rightPanel(page)).toHaveAttribute('data-open', 'false')
    await expect(suite3d(page, '500')).toHaveAttribute('aria-pressed', 'true')

    // A new selection brings the details back and hides the left drawer.
    await suite3d(page, '700').focus()
    await page.keyboard.press('Enter')
    await expect(rightPanel(page)).toHaveAttribute('data-open', 'true')
    await expect(leftToggle(page)).toHaveAttribute('aria-expanded', 'false')
  })

  test('typing a size keeps the left drawer open and focused; hiding it shows the list', async ({ page }) => {
    await gotoApp(page, '3d')
    await leftToggle(page).click()
    const min = page.getByTestId('req-min-sf')
    await min.click()
    await page.keyboard.type('10000')
    await expect(min).toHaveValue('10000')
    await expect(min).toBeFocused()
    await expect(leftToggle(page)).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByTestId('left-rail')).not.toHaveAttribute('inert', '')
    await expect(rightPanel(page)).toHaveAttribute('data-open', 'false')
    await leftToggle(page).click()
    await expect(rightPanel(page)).toHaveAttribute('data-open', 'true')
    await expect(rightPanel(page).getByTestId('match-list')).toBeVisible()
  })
})
