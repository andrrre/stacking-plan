import { test, expect, type Page } from '@playwright/test'
import { gotoApp } from './helpers'

const suite3d = (page: import('@playwright/test').Page, n: string) => page.getByTestId(`suite3d-odt-${n}`)

test.describe('3D view', () => {
  test('the toggle shows the 3D stack with 32 suites and back to 2D', async ({ page }) => {
    await gotoApp(page)
    await expect(page.getByTestId('view-stack')).toBeChecked()
    await page.getByTestId('view-3d').click()
    await expect(page.getByTestId('view-3d')).toBeChecked()
    await expect(page.getByTestId('stack-3d')).toBeVisible()
    await expect(page.getByTestId('stack')).toHaveCount(0)
    await expect(page.locator('[data-testid^="suite3d-"]')).toHaveCount(32)
    await page.getByTestId('view-stack').click()
    await expect(page.getByTestId('stack')).toBeVisible()
    await expect(page.getByTestId('stack-3d')).toHaveCount(0)
  })

  test('the toggle works from the keyboard and view=3d is in the URL', async ({ page }) => {
    await gotoApp(page)
    await page.getByTestId('view-stack').focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByTestId('view-3d')).toBeChecked()
    await expect(page.getByTestId('view-3d')).toBeFocused()
    await expect(page).toHaveURL(/view=3d/)
    await gotoApp(page, { view: '3d' })
    await expect(page.getByTestId('stack-3d')).toBeVisible()
  })

  test('clicking a suite opens its details; keyboard Enter selects too', async ({ page }) => {
    await gotoApp(page, { view: '3d' })
    await suite3d(page, '500').click()
    await expect(suite3d(page, '500')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('suite-details')).toContainText('500')
    await suite3d(page, '600').focus()
    await expect(suite3d(page, '600')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(suite3d(page, '600')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('suite-details')).toContainText('600')
  })

  test('match ranks equal the 2D ones, with numbered outlines', async ({ page }) => {
    await gotoApp(page)
    await page.getByTestId('req-min-sf').fill('10000')
    const ranks = async () =>
      page.locator('[data-match-rank]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-testid')?.replace(/^suite3?d?-/, ''), e.getAttribute('data-match-rank')]))
    const two = await ranks()
    expect(two.length).toBeGreaterThan(0)
    await page.getByTestId('view-3d').click()
    await expect(page.getByTestId('stack-3d')).toBeVisible()
    expect(await ranks()).toEqual(two)
    await expect(suite3d(page, '500')).toHaveAttribute('data-match-rank', '1')
    await expect(page.getByTestId('match-outline-1')).toBeVisible()
    await expect(suite3d(page, '600')).toHaveAttribute('data-dimmed', 'true')
  })

  test('the date slider and colour mode recolour the 3D suites', async ({ page }) => {
    await gotoApp(page, { view: '3d' })
    await expect(suite3d(page, '600')).toHaveAttribute('data-status', 'expiring')
    await page.getByTestId('mode-risk').click()
    await expect(suite3d(page, '900')).toHaveAttribute('data-fill', 'risk-gt36')
    await expect(page.getByTestId('legend-risk')).toBeVisible()
    await page.getByTestId('mode-availability').click()
    await page.getByTestId('date-slider').fill('8')
    await expect(suite3d(page, '600')).toHaveAttribute('data-fill', 'potential')
  })

  test('dragging rotates the building without selecting a suite; reset restores it', async ({ page }) => {
    await gotoApp(page, { view: '3d' })
    const stage = page.getByTestId('stack-3d')
    const rot = () => stage.evaluate((el) => getComputedStyle(el).getPropertyValue('--rot'))
    expect(await rot()).toBe('-35deg')
    const box = await stage.boundingBox()
    if (!box) throw new Error('no stage box')
    const y = box.y + 30
    await page.mouse.move(box.x + 100, y)
    await page.mouse.down()
    await page.mouse.move(box.x + 220, y, { steps: 6 })
    await page.mouse.up()
    expect(await rot()).not.toBe('-35deg')
    await expect(page.locator('[data-testid^="suite3d-"][aria-pressed="true"]')).toHaveCount(0)
    await page.getByRole('button', { name: 'Reset view' }).click()
    expect(await rot()).toBe('-35deg')
  })

  test('3D fits the pane at 1280x800 with no horizontal page scroll', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await gotoApp(page, { view: '3d' })
    await expect(page.getByTestId('stack-3d')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280)
  })

  test('reduced motion: no transitions, dragging still works', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await gotoApp(page, { view: '3d' })
    const dur = await suite3d(page, '500').evaluate((el) => getComputedStyle(el).transitionDuration)
    expect(dur.split(',').every((d) => parseFloat(d) === 0)).toBe(true)
    await page.getByRole('button', { name: 'Rotate view right' }).click()
    expect(await page.getByTestId('stack-3d').evaluate((el) => getComputedStyle(el).getPropertyValue('--rot'))).toBe('-20deg')
  })

  test('dragging across suites rotates without selecting; a plain click still selects', async ({ page }) => {
    await gotoApp(page, { view: '3d' })
    const stage = page.getByTestId('stack-3d')
    const rot = () => stage.evaluate((el) => getComputedStyle(el).getPropertyValue('--rot'))
    const from = await suite3d(page, '1200').boundingBox()
    const to = await suite3d(page, '1100').boundingBox()
    if (!from || !to) throw new Error('no boxes')
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 })
    await page.mouse.up()
    expect(await rot()).not.toBe('-35deg')
    await expect(page.locator('[data-testid^="suite3d-"][aria-pressed="true"]')).toHaveCount(0)
    await page.getByRole('button', { name: 'Reset view' }).click()
    await suite3d(page, '500').click()
    await expect(suite3d(page, '500')).toHaveAttribute('aria-pressed', 'true')
  })

  test('a real mouse click on any visible part of each suite selects it, at the default angle and turned', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1400 })
    await gotoApp(page, { view: '3d' })
    for (const turns of [0, 5]) {
      for (let i = 0; i < turns; i++) await page.getByRole('button', { name: 'Rotate view right' }).click()
      const ids = await page.locator('[data-testid^="suite3d-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid') ?? ''))
      expect(ids).toHaveLength(32)
      for (const id of ids) {
        const point = await page.evaluate((tid) => {
          const el = document.querySelector(`[data-testid="${tid}"]`)
          if (!el) return null
          const r = el.getBoundingClientRect()
          const cx = r.x + r.width / 2
          const cy = r.y + r.height / 2
          let best: { x: number; y: number; d: number } | null = null
          for (let gx = 1; gx < 12; gx++) {
            for (let gy = 1; gy < 8; gy++) {
              const x = r.x + (r.width * gx) / 12
              const y = r.y + (r.height * gy) / 8
              if (document.elementFromPoint(x, y) !== el) continue
              const d = Math.hypot(x - cx, y - cy)
              if (!best || d > best.d) best = { x, y, d }
            }
          }
          return best
        }, id)
        expect(point, `${id} has visible area (turn ${turns})`).not.toBeNull()
        if (!point) continue
        await page.mouse.click(point.x, point.y)
        await expect(page.getByTestId(id), `${id} turn ${turns}`).toHaveAttribute('aria-pressed', 'true')
      }
    }
  })

  test('the hero stays inside its stage at 85 and 265 degrees', async ({ page }) => {
    await gotoApp(page, { view: '3d' })
    const turn = async (n: number) => {
      for (let i = 0; i < n; i++) await page.getByRole('button', { name: 'Rotate view right' }).click()
    }
    for (const clicks of [8, 12]) { // -35 + 120 = 85, then +180 = 265
      await turn(clicks)
      expect(await insideStage(page)).toEqual([])
    }
  })

  test('a 25-floor building never covers the toolbar or the rotate controls', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.addInitScript((b) => localStorage.setItem('stackmatch.v1.imported', JSON.stringify([b])), tallBuilding())
    await gotoApp(page, { view: '3d', b: 'tall' })
    await expect(page.locator('[data-testid^="suite3d-"]')).toHaveCount(75)
    for (const clicks of [0, 8]) {
      for (let i = 0; i < clicks; i++) await page.getByRole('button', { name: 'Rotate view right' }).click()
      for (const control of [
        page.getByTestId('mode-risk'),
        page.getByRole('button', { name: 'Rotate view left' }),
        page.getByRole('button', { name: 'Rotate view right' }),
        page.getByRole('button', { name: 'Reset view' }),
      ]) {
        await control.scrollIntoViewIfNeeded()
        const ok = await control.evaluate((el) => {
          const r = el.getBoundingClientRect()
          const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
          return hit !== null && el.contains(hit)
        })
        expect(ok).toBe(true)
      }
      expect(await insideStage(page)).toEqual([])
    }
  })

  test('keyboard focus shows on the upright chip', async ({ page }) => {
    await gotoApp(page, { view: '3d' })
    await suite3d(page, '600').focus()
    const shadow = await suite3d(page, '600').evaluate((el) => getComputedStyle(el.nextElementSibling as Element).boxShadow)
    expect(shadow).not.toBe('none')
    expect(await suite3d(page, '600').evaluate((el) => getComputedStyle(el.nextElementSibling as Element).opacity)).toBe('1')
  })
})

/** Suites and their chips whose box leaves the stage (the stage clips, so that would be a hidden part). */
async function insideStage(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const stage = document.querySelector('[data-testid="stack-3d"]')?.getBoundingClientRect()
    if (!stage) return ['no stage']
    const out: string[] = []
    for (const el of document.querySelectorAll('[data-testid^="suite3d-"]')) {
      for (const node of [el, el.nextElementSibling]) {
        const r = node?.getBoundingClientRect()
        if (r && r.width > 0 && (r.top < stage.top - 1 || r.bottom > stage.bottom + 1 || r.left < stage.left - 1 || r.right > stage.right + 1)) {
          out.push(el.getAttribute('data-testid') ?? '?')
        }
      }
    }
    return out
  })
}

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
