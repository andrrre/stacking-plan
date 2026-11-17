// The demo video's beats, in order. Each beat has the line the voice reads (`say`, written the way it should be
// spoken) and what happens on screen meanwhile (`run`). The recorder holds a beat until its line has been read, so
// timing follows the narration: change a line and the video re-times itself. `run` gets the page and `pause`, which
// waits a number of milliseconds of video time (the recorder runs the page in slow motion, so not of real time).

const t = (page, id) => page.getByTestId(id)
const canvas = (page) => page.locator('[data-testid="scene3d"] canvas')

const RELEASE_OFFSET = 12

/**
 * Drags across the lower part of the 3D scene by `dx` px and back again over `ms`: a slow orbit. The events go
 * straight to the browser: Playwright's own mouse waits for the recorder's cursor animation on every move, which
 * makes a drag take a minute.
 */
async function orbitAndBack(page, pause, dx, ms) {
  const box = await canvas(page).boundingBox()
  if (!box) throw new Error('The 3D canvas is not on screen')
  const x = box.x + box.width / 2
  const y = box.y + box.height * 0.85
  const cdp = await page.context().newCDPSession(page)
  const mouse = (type, at) => cdp.send('Input.dispatchMouseEvent', { type, x: at, y, button: 'left', buttons: 1, clickCount: 1 })
  await mouse('mousePressed', x)
  const steps = Math.round(ms / 16)
  for (let i = 0; i < steps; i += 1) {
    await mouse('mouseMoved', x + dx * Math.sin((Math.PI * i) / steps))
    await pause(16)
  }
  // Let go a little away from where the drag began: a press and release on one spot is a click, which selects a suite.
  await mouse('mouseMoved', x + RELEASE_OFFSET)
  await mouse('mouseReleased', x + RELEASE_OFFSET)
  await cdp.detach()
}

/**
 * Drags a range input's thumb from value `from` to value `to` with the mouse, one step at a time, so the pointer
 * is seen doing it. `vertical` is for a slider turned upright, whose highest value is at the top.
 */
async function dragSlider(page, slider, from, to, vertical = false) {
  const box = await slider.boundingBox()
  if (!box) throw new Error('The slider is not on screen')
  const { min, max } = await slider.evaluate((el) => ({ min: Number(el.min), max: Number(el.max) }))
  const thumb = Math.min(box.width, box.height)
  const share = (v) => (v - min) / (max - min)
  const at = (v) => (vertical
    ? { x: box.x + box.width / 2, y: box.y + box.height - thumb / 2 - (box.height - thumb) * share(v) }
    : { x: box.x + thumb / 2 + (box.width - thumb) * share(v), y: box.y + box.height / 2 })
  const point = (v) => page.mouse.move(at(v).x, at(v).y)
  await point(from)
  await page.mouse.down()
  const step = to > from ? 1 : -1
  for (let v = from + step; v !== to + step; v += step) await point(v)
  await page.mouse.up()
  await slider.fill(String(to)) // lands exactly, whatever the thumb's real width
}

/** Asks the assistant for 10,000 SF. If the AI has not filled the form in time, the form is filled directly. */
async function askForSpace(page) {
  const example = t(page, 'chat-example').filter({ hasText: '10,000 SF' })
  if (await example.count()) await example.first().click()
  const filled = await t(page, 'match-1').waitFor({ timeout: 15_000 }).then(() => true, () => false)
  if (!filled) await t(page, 'req-min-sf').fill('10,000')
  await t(page, 'match-1').waitFor()
}

export const BEATS = [
  {
    id: 'intro',
    say: 'A stacking plan shows who is in a building. A broker needs to know where a tenant can go, and when. This is Stack Match.',
    run: (page, pause) => orbitAndBack(page, pause, -150, 6500),
  },
  {
    id: 'glance',
    say: 'It opens on the building in three D. Vacant space is red, expiring leases are amber, and the key numbers sit on top.',
    run: async (page, pause) => {
      await t(page, 'kpi-vacant').hover()
      await pause(2200)
      await t(page, 'kpi-expiring').hover()
      await pause(2200)
      await t(page, 'kpi-largest-block').hover()
    },
  },
  {
    id: 'separate',
    say: 'Separate the floors to read every plate from above.',
    run: async (page, pause) => {
      await t(page, 'separate-floors').click()
      await pause(3200)
      await t(page, 'separate-floors').click()
      await pause(900)
    },
  },
  {
    id: 'floor-view',
    say: 'Or open floor view, and step through the building one floor at a time, each with its area and what is vacant.',
    run: async (page, pause) => {
      await t(page, 'floor-view').click()
      await pause(1800)
      const slider = t(page, 'floor-slider')
      const floor = Number(await slider.inputValue())
      await dragSlider(page, slider, floor, floor >= 3 ? floor - 3 : floor + 3, true)
      await pause(1500)
      await t(page, 'floor-view').click()
      await pause(900)
    },
  },
  {
    id: 'ask',
    say: 'Ask in plain words where a ten thousand square foot tenant could go. The rest of the building fades, and the options that fit lift out, ranked.',
    run: askForSpace,
  },
  {
    id: 'why',
    say: 'Every match explains why it works.',
    run: async (page, pause) => {
      await t(page, 'match-2').getByRole('button', { name: /^Match 2:/ }).click()
      await pause(2600)
      await t(page, 'match-why').getByRole('button', { name: /all matches/i }).click()
    },
  },
  {
    id: 'time',
    say: 'Move the date to mid twenty twenty-seven. A lease ends, potential space appears, and the list re-ranks.',
    run: async (page, pause) => {
      await dragSlider(page, t(page, 'date-slider'), 0, 8)
      await pause(600)
    },
  },
  {
    id: 'no-fit',
    say: 'Need twelve thousand? Nothing fits today. So Stack Match proposes a move.',
    run: async (page, pause) => {
      await t(page, 'date-today').click()
      await pause(700)
      await t(page, 'req-min-sf').click()
      await t(page, 'req-min-sf').fill('12,000')
      await t(page, 'make-room').waitFor()
      await pause(1200)
      await t(page, 'show-move').hover()
    },
  },
  {
    id: 'move',
    say: 'Relocate one small tenant, and two suites join into a single block.',
    run: async (page, pause) => {
      await t(page, 'show-move').click()
      await pause(3800)
    },
  },
  {
    id: 'apply',
    say: 'Apply it as a scenario, and occupancy and rent roll update.',
    run: async (page, pause) => {
      await t(page, 'apply-move').click()
      await t(page, 'scenario-bar').waitFor()
      await pause(600)
      await t(page, 'scenario-rent-roll').hover()
    },
  },
  {
    id: 'tour',
    say: 'Save the option, then take the client on a tour, right inside the space.',
    run: async (page, pause) => {
      await t(page, 'save-match-1').click()
      await pause(900)
      await t(page, 'tour').click()
      await page.locator('[data-testid="stack-3d"][data-tour-phase="look"]').waitFor({ timeout: 20_000 })
      await pause(6500)
    },
  },
  {
    id: 'summary',
    say: 'Finish with a client-ready summary, with no tenant names in it.',
    run: async (page, pause) => {
      await page.keyboard.press('Escape')
      await pause(1200)
      await t(page, 'open-summary').click()
      await t(page, 'client-summary').waitFor()
    },
  },
  {
    id: 'outro',
    say: 'That is Stack Match. Ask the building where your tenant can go, and when. Thank you for watching.',
    run: async (page, pause) => {
      await pause(800)
      await t(page, 'client-summary').getByRole('button', { name: 'Close', exact: true }).click()
      await pause(500)
      await t(page, 'reset-view').click()
      await pause(700)
      await orbitAndBack(page, pause, -150, 5500)
    },
  },
]
