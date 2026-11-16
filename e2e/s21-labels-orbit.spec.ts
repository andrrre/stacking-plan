import { test, expect, type Page } from '@playwright/test'
import { gotoApp, suite3d } from './helpers'

// Facade labels follow a sloping face by rotation (never a skew): orbited up and round, the front faces become
// thin bands sloping across the screen, and each label turns to lie along its own band, inside it.

const canvas = (page: Page) => page.getByTestId('stack-3d').locator('canvas')
const label = (page: Page, n: string) => page.getByTestId(`label3d-odt-${n}`)
const pointKey = (page: Page, n: string) => suite3d(page, n).evaluate((el) => `${el.getAttribute('data-screen-x')},${el.getAttribute('data-screen-y')}`)

/** Waits until `n`'s reported screen point has held still for three reads 300 ms apart (an orbit ends with a glide). */
async function settled(page: Page, n: string): Promise<void> {
  await expect(suite3d(page, n)).toHaveAttribute('data-screen-hit', /true|false/) // the scene's first report (cold start)
  const seen: string[] = []
  await expect.poll(async () => {
    seen.push(await pointKey(page, n))
    return seen.length >= 3 && seen.slice(-3).every((k) => k === seen[seen.length - 1])
  }, { intervals: [300], timeout: 8000 }).toBe(true)
}

async function drag(page: Page, from: { x: number; y: number }, dx: number, dy: number): Promise<void> {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 8 })
  await page.mouse.up()
}

const view = async (page: Page) => {
  const c = canvas(page)
  return { azimuth: 9 + Number(await c.getAttribute('data-camera-azimuth')), elevation: Number(await c.getAttribute('data-camera-elevation')) }
}

/** Orbits by dragging to about `azimuth` / `elevation` (degrees): ~3 px of drag per degree, corrected up to twice. */
async function orbitTo(page: Page, azimuth: number, elevation: number): Promise<void> {
  const box = await canvas(page).boundingBox()
  if (!box) throw new Error('no canvas')
  for (let i = 0; i < 3; i++) {
    const v = await view(page)
    if (Math.abs(v.azimuth - azimuth) < 3 && Math.abs(v.elevation - elevation) < 3) return
    const before = await pointKey(page, '600')
    await drag(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, (v.azimuth - azimuth) * 3, (elevation - v.elevation) * 3)
    await expect.poll(() => pointKey(page, '600')).not.toBe(before)
    await settled(page, '600')
  }
}

/**
 * For every shown label: how far the middle of its box's left end lies from the middle of its face's left end,
 * along and across the face (px; the face from the scene's data-screen-face hook), and its turn against the
 * face's edges (degrees). The text itself starts the label's 5px padding further in.
 */
const alignment = (page: Page) => page.locator('[data-testid^="label3d-odt-"][data-hidden="false"]').evaluateAll((els) => {
  const canvasAt = document.querySelector('[data-testid="stack-3d"] canvas')?.getBoundingClientRect()
  return els.map((lab) => {
    const id = (lab.getAttribute('data-testid') ?? '').replace('label3d-', '')
    const face = (document.querySelector(`[data-testid="suite3d-${id}"]`)?.getAttribute('data-screen-face') ?? '')
      .split(' ').map((p) => p.split(',').map(Number)).map(([x = 0, y = 0]) => ({ x: x + (canvasAt?.x ?? 0), y: y + (canvasAt?.y ?? 0) }))
    const [tl = { x: 0, y: 0 }, tr = tl, br = tl, bl = tl] = face
    const m = new DOMMatrix(getComputedStyle(lab).transform)
    const parent = (lab.parentElement as HTMLElement).getBoundingClientRect()
    const h = (lab as HTMLElement).offsetHeight
    const start = { x: parent.x + m.e + (m.c * h) / 2, y: parent.y + m.f + (m.d * h) / 2 }
    const end = { x: (tl.x + bl.x) / 2, y: (tl.y + bl.y) / 2 }
    const edges = (Math.atan2(tr.y - tl.y, tr.x - tl.x) + Math.atan2(br.y - bl.y, br.x - bl.x)) / 2
    const along = (p: { x: number; y: number }) => p.x * m.a + p.y * m.b
    const across = (p: { x: number; y: number }) => p.y * m.a - p.x * m.b
    return {
      id,
      // from the face's left end, the inner of its two left corners along the face (the box stays on the face)
      along: Math.abs(along(start) - Math.max(along(tl), along(bl))),
      across: Math.abs(across(start) - across(end)), // off the left end's middle (the band tapers over the label)
      turn: ((Math.atan2(m.b, m.a) - edges) * 180) / Math.PI,
    }
  })
})

test('every label starts at its face\'s left end, centred in the band, and turns with the face: default view and orbited', async ({ page }) => {
  await gotoApp(page, '3d')
  await expect(suite3d(page, '1200')).toHaveAttribute('data-screen-hit', 'true')
  await settled(page, '600')
  for (const [name, az, el] of [['default', 9, 6], ['orbited', 25, 24]] as const) {
    if (name !== 'default') await orbitTo(page, az, el)
    const all = await alignment(page)
    expect(all.length, name).toBeGreaterThan(20)
    for (const a of all) {
      expect(a.along, `${name} ${a.id}: starts at the face's left end`).toBeLessThan(1.5)
      expect(a.across, `${name} ${a.id}: centred in the band`).toBeLessThan(3)
      expect(Math.abs(a.turn), `${name} ${a.id}: turn`).toBeLessThan(0.1)
    }
  }
})

test('orbited up and round, every suite\'s label turns along its face and stays inside it, floors 1–3 included', async ({ page }) => {
  await gotoApp(page, '3d')
  await expect(suite3d(page, '1200')).toHaveAttribute('data-screen-hit', 'true')
  await orbitTo(page, -30, 32)
  const box = await canvas(page).boundingBox()
  if (!box) throw new Error('no canvas')
  const v = await view(page)
  expect(v.azimuth, 'azimuth').toBeLessThan(-26)
  expect(v.elevation, 'elevation').toBeGreaterThan(28)
  const compact = ['720', '510', '420', '430', '320', '330', '120'] // under 2,500 SF: the number alone, where it fits
  const report = await page.locator('[data-testid^="suite3d-odt-"]').evaluateAll((els, canvasAt) => {
    const centre = (n: string) => {
      const e = document.querySelector(`[data-testid="suite3d-odt-${n}"]`)
      return { x: canvasAt.x + Number(e?.getAttribute('data-screen-x')), y: canvasAt.y + Number(e?.getAttribute('data-screen-y')) }
    }
    const numbers = els.map((e) => (e.getAttribute('data-testid') ?? '').replace('suite3d-odt-', ''))
    const floorOf = (n: string) => Number(n.slice(0, -2))
    return numbers.map((n) => {
      const lab = document.querySelector<HTMLElement>(`[data-testid="label3d-odt-${n}"]`)
      if (!lab) return { n, shown: false, parts: '', angle: 0, across: 1, between: false }
      const m = new DOMMatrix(getComputedStyle(lab).transform)
      const angle = Math.atan2(m.b, m.a)
      const r = lab.getBoundingClientRect() // a turned box's bounding box shares its centre
      const c = { x: r.x + r.width / 2, y: r.y + r.height / 2 }
      const u = { x: Math.cos(angle), y: Math.sin(angle) }
      const nrm = { x: -u.y, y: u.x }
      const self = centre(n)
      const dot = (p: { x: number; y: number }, d: { x: number; y: number }) => (p.x - self.x) * d.x + (p.y - self.y) * d.y
      const other = numbers.find((k) => Math.abs(floorOf(k) - floorOf(n)) === 1) ?? n
      const pitch = Math.abs(dot(centre(other), nrm)) // floor to floor, across the bands
      // Its centre lies between the centres of the suites either side of it (the mirror lists them left to right).
      const floor = numbers.filter((k) => floorOf(k) === floorOf(n))
      const at = floor.indexOf(n)
      const between = floor.every((k, i) => i === at || (i < at ? dot(centre(k), u) < dot(c, u) : dot(centre(k), u) > dot(c, u)))
      return {
        n,
        shown: lab.dataset.hidden === 'false',
        parts: lab.dataset.parts ?? '',
        angle: (angle * 180) / Math.PI,
        across: (Math.abs(dot(c, nrm)) + lab.offsetHeight / 2) / pitch, // how far towards the next floor its box reaches (0.5: halfway across the gap)
        between,
      }
    })
  }, box)
  expect(report).toHaveLength(32)
  for (const r of report.filter((x) => !compact.includes(x.n))) {
    expect(r.shown, `${r.n} shows`).toBe(true)
    expect(r.parts, `${r.n} parts`).toMatch(/^number/)
    expect(r.angle, `${r.n} turns with its face`).toBeLessThan(-8)
    expect(r.angle, `${r.n} never past a quarter turn`).toBeGreaterThan(-90)
    expect(r.across, `${r.n} stays in its band, short of the gap to the next floor`).toBeLessThan(0.5)
    expect(r.between, `${r.n} lies on its own face, between its neighbours`).toBe(true)
  }
  for (const n of ['100', '110', '200', '210', '220', '230', '300', '310']) await expect(label(page, n), n).toBeVisible()
  // Floor numbers stand left of their floor (beside the left side the camera now sees), clear of one another.
  const tags = await page.locator('[data-testid^="floor3d-"]').evaluateAll((els) => els.map((e) => {
    const r = e.getBoundingClientRect()
    const floor = (e.getAttribute('data-testid') ?? '').replace('floor3d-', '')
    const xs = [...document.querySelectorAll(`[data-testid^="suite3d-odt-${floor}"]`)]
      .filter((b) => (b.getAttribute('data-testid') ?? '').length === `suite3d-odt-${floor}`.length + 2)
      .map((b) => Number(b.getAttribute('data-screen-x')))
    return { floor, shown: getComputedStyle(e).visibility === 'visible', right: r.right, top: r.top + 2, bottom: r.bottom - 2, left: r.left, firstFace: Math.min(...xs) }
  }))
  const shownTags = tags.filter((t) => t.shown)
  expect(shownTags.length, 'floor numbers shown').toBeGreaterThanOrEqual(6)
  for (const t of shownTags) expect(t.right - box.x, `floor ${t.floor} number left of its floor`).toBeLessThan(t.firstFace)
  for (const a of shownTags) {
    for (const b of shownTags) {
      if (a === b) continue
      const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
      expect(overlap, `floor numbers ${a.floor} and ${b.floor} overlap`).toBe(false)
    }
  }
})
