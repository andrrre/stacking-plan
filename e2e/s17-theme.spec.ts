import { test, expect, type Page } from '@playwright/test'
import { gotoApp } from './helpers'

// The light/dark theme: the header toggle, the saved choice, following the system, live 3D recolouring, print.

const html = (page: Page) => page.locator('html')
const toggle = (page: Page) => page.getByTestId('theme-toggle')

/** Pixels of the canvas within `tol` of `hex` (the 3D building's own colours). */
async function countColour(page: Page, hex: string, tol = 2): Promise<number> {
  const png = (await page.getByTestId('stack-3d').locator('canvas').screenshot()).toString('base64')
  return page.evaluate(async ({ png, hex, tol }) => {
    const img = new Image()
    img.src = `data:image/png;base64,${png}`
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const ctx = c.getContext('2d')
    if (!ctx) return -1
    ctx.drawImage(img, 0, 0)
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
    let n = 0
    for (let i = 0; i < d.length; i += 4) {
      if (Math.abs((d[i] ?? 0) - r) <= tol && Math.abs((d[i + 1] ?? 0) - g) <= tol && Math.abs((d[i + 2] ?? 0) - b) <= tol) n++
    }
    return n
  }, { png, hex, tol })
}

test('starts light, the header button switches to dark and back, and the choice survives a reload', async ({ page }) => {
  await gotoApp(page, 'stack')
  await expect(html(page)).toHaveAttribute('data-theme', 'light')
  await expect(toggle(page)).toHaveAccessibleName('Switch to dark theme')
  const bg = () => page.locator('body').evaluate((b) => getComputedStyle(b).backgroundColor)
  expect(await bg()).toBe('rgb(244, 245, 247)')
  await toggle(page).click()
  await expect(html(page)).toHaveAttribute('data-theme', 'dark')
  await expect(toggle(page)).toHaveAccessibleName('Switch to light theme')
  expect(await bg()).toBe('rgb(18, 21, 24)')
  expect(await page.evaluate(() => localStorage.getItem('stackmatch.v1.theme'))).toBe('"dark"')
  await page.reload()
  await expect(html(page)).toHaveAttribute('data-theme', 'dark')
  await toggle(page).click()
  await expect(html(page)).toHaveAttribute('data-theme', 'light')
})

test('with nothing saved it follows the system setting, live', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await gotoApp(page, 'stack')
  await expect(html(page)).toHaveAttribute('data-theme', 'dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(html(page)).toHaveAttribute('data-theme', 'light')
})

test('a saved choice wins over the system setting', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('stackmatch.v1.theme', '"light"'))
  await page.emulateMedia({ colorScheme: 'dark' })
  await gotoApp(page, 'stack')
  await expect(html(page)).toHaveAttribute('data-theme', 'light')
})

test('the 3D building recolours live when the theme changes', async ({ page }) => {
  await gotoApp(page, '3d')
  const scene = page.getByTestId('scene3d')
  await expect(scene).toHaveAttribute('data-theme', 'light')
  await expect.poll(() => countColour(page, '#C62F3B', 6), { message: 'light vacant crimson' }).toBeGreaterThan(1000)
  expect(await countColour(page, '#2E343C'), 'no dark occupied faces in light').toBeLessThan(1000) // label ink only
  await toggle(page).click()
  await expect(scene).toHaveAttribute('data-theme', 'dark')
  await expect.poll(() => countColour(page, '#2E343C'), { message: 'dark occupied grey' }).toBeGreaterThan(5000)
  await expect.poll(() => countColour(page, '#FF5C66', 6), { message: 'dark vacant crimson' }).toBeGreaterThan(1000)
  expect(await countColour(page, '#C62F3B', 6), 'no light vacant crimson left').toBe(0)
})

test('print is always light, even in the dark theme', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('stackmatch.v1.theme', '"dark"'))
  await gotoApp(page, 'stack')
  await expect(html(page)).toHaveAttribute('data-theme', 'dark')
  await page.emulateMedia({ media: 'print' })
  const colours = () => page.evaluate(() => {
    const cell = document.querySelector('[data-testid="suite-odt-900"]')
    return {
      body: getComputedStyle(document.body).backgroundColor,
      text: getComputedStyle(document.body).color,
      occupied: cell ? getComputedStyle(cell).backgroundColor : 'missing',
    }
  })
  // Polled: the suite's colour transition runs on screen (a real print has none).
  await expect.poll(colours).toEqual({ body: 'rgb(255, 255, 255)', text: 'rgb(18, 21, 24)', occupied: 'rgb(227, 230, 234)' })
})
