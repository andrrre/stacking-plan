import { test, expect, type Page } from '@playwright/test'
import { gotoApp, suite } from './helpers'

// Fixes from the review of the night theme: text-field borders, the 2D selection ring on gold, the dashed 3D
// focus ring, the city switch's off track, the KPI row on narrow screens and the stored theme on first paint.

const INPUT_BORDER = 'rgb(139, 147, 157)' // --c-input-border, #8B939D in both themes

async function inDark(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('stackmatch.v1.theme', '"dark"'))
}

const css = (page: Page, testId: string, prop: string) =>
  page.getByTestId(testId).evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop)

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: text fields carry the stronger input border; buttons keep theirs`, async ({ page }) => {
    if (theme === 'dark') await inDark(page)
    await gotoApp(page, 'stack')
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    expect(await css(page, 'req-min-sf', 'border-top-color')).toBe(INPUT_BORDER)
    expect(await page.getByRole('textbox', { name: /describe the requirement/i }).evaluate((el) => getComputedStyle(el).borderTopColor)).toBe(INPUT_BORDER)
    expect(await css(page, 'req-clear', 'border-top-color')).not.toBe(INPUT_BORDER)
  })
}

test('dark: a selected suite in the 2D stack has its 2px ring and a page-colour ring just inside it', async ({ page }) => {
  await inDark(page)
  await gotoApp(page, 'stack')
  await suite(page, 600).click() // expiring: gold, where white alone is 1.7:1
  await expect(suite(page, 600)).toHaveAttribute('aria-pressed', 'true')
  // the selected colour first (painted on top), then the page colour #121518 one pixel further in (polled: it
  // eases in)
  await expect.poll(() => suite(page, 600).evaluate((el) => getComputedStyle(el).boxShadow))
    .toBe('rgb(255, 255, 255) 0px 0px 0px 2px inset, rgb(18, 21, 24) 0px 0px 0px 3px inset')
})

test('3D: the keyboard focus ring is dashed, the selection ring solid', async ({ page }) => {
  await gotoApp(page, '3d')
  const dash = (kind: string) => page.locator(`polygon[data-kind="${kind}"]`).first().evaluate((el) => getComputedStyle(el).strokeDasharray)
  expect(await dash('focus')).toBe('6px, 4px')
  expect(await dash('selected')).toBe('none')
})

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: the city switch's off track is the muted text colour, the on track the accent`, async ({ page }) => {
    if (theme === 'dark') await inDark(page)
    await gotoApp(page, '3d')
    const sw = page.getByTestId('city-toggle')
    const track = () => sw.locator('span[aria-hidden="true"]').evaluate((el) => getComputedStyle(el).backgroundColor)
    const token = (name: string) => page.evaluate((n) => {
      const probe = document.createElement('span')
      probe.style.color = `var(${n})`
      document.body.append(probe)
      const c = getComputedStyle(probe).color
      probe.remove()
      return c
    }, name)
    await expect(sw).toHaveAttribute('aria-checked', 'true')
    expect(await track()).toBe(await token('--c-accent'))
    await sw.click()
    await expect(sw).toHaveAttribute('aria-checked', 'false')
    await expect.poll(track).toBe(await token('--c-text-muted'))
  })
}

for (const [width, columns] of [[1440, 4], [700, 2], [400, 1]] as const) {
  test(`KPI row at ${width}px: ${columns} per row, every row full, so no rule-coloured block shows`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await gotoApp(page, 'stack')
    const ids = ['kpi-occupancy', 'kpi-vacant', 'kpi-expiring', 'kpi-largest-block']
    const boxes = await Promise.all(ids.map(async (id) => page.getByTestId(id).boundingBox()))
    const tops = [...new Set(boxes.map((b) => Math.round(b?.y ?? -1)))]
    expect(tops).toHaveLength(4 / columns)
    const bar = await page.getByTestId('kpi-occupancy').locator('..').boundingBox()
    for (const top of tops) {
      const row = boxes.filter((b) => Math.round(b?.y ?? -1) === top)
      expect(row).toHaveLength(columns)
      const covered = row.reduce((s, b) => s + (b?.width ?? 0), 0) + (columns - 1) // tiles plus their 1px rules
      expect(Math.abs(covered - (bar?.width ?? 0))).toBeLessThan(1.5)
    }
  })
}

test('the served CSS has no light-dark(): browsers without it get both themes from the build toggles', async ({ page }) => {
  await gotoApp(page, 'stack')
  const hrefs = await page.locator('link[rel="stylesheet"]').evaluateAll((els) => els.map((e) => (e as HTMLLinkElement).href))
  expect(hrefs.length).toBeGreaterThan(0)
  const css = (await Promise.all(hrefs.map(async (h) => (await page.request.get(h)).text()))).join('\n')
  expect(css).not.toContain('light-dark(')
  // every token is a light/dark toggle pair; data-theme and print flip the pair as color-scheme would
  expect(css).toContain('--c-vacant:var(--lightningcss-light,#c62f3b)var(--lightningcss-dark,#ff5c66)')
  expect(css).toMatch(/:root\[data-theme=dark\]\{--lightningcss-light: ;--lightningcss-dark:initial;color-scheme:dark\}/)
  expect(css).toMatch(/:root\[data-theme=light\]\{--lightningcss-light:initial;--lightningcss-dark: ;color-scheme:light\}/)
})

test('a stored dark choice is on the root before the app script runs (no light flash)', async ({ page }) => {
  await inDark(page)
  await page.route(/\/assets\/.*\.js$/, (route) => route.abort()) // the app bundle never loads
  await page.goto('/?today=2026-11-15')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})
