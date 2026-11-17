// Records the demo video. Drives the app through the beats in storyboard.mjs in headless Chrome (on the real GPU,
// so nothing appears on screen), captures the frames, reads the narration with a macOS voice and writes one MP4.
//
//   node scripts/demo-video/record.mjs
//
// Environment: DEMO_URL (default: the live deploy), FFMPEG (path to an ffmpeg with libx264 and aac, default
// `ffmpeg`), OUT_DIR (default .demo-video), SLOW (default 2), THEME (dark or light, default dark), and for the voice either VOICE (a macOS `say` voice,
// default Samantha) or KOKORO_DIR (a folder with a Python `venv` that has kokoro-onnx and soundfile, plus
// kokoro-v1.0.onnx and voices-v1.0.bin) with VOICE as a Kokoro voice (default af_heart). macOS only: it uses
// `say` and `afinfo`.

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'
import { BEATS } from './storyboard.mjs'
import { encode, narrate } from './media.mjs'

const URL_ = process.env.DEMO_URL ?? 'https://stacking-plan-ten.vercel.app/'
const THEME = process.env.THEME === 'light' ? 'light' : 'dark'
const KOKORO_DIR = process.env.KOKORO_DIR
const VOICE = process.env.VOICE ?? (KOKORO_DIR ? 'af_heart' : 'Samantha')
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg'
const OUT_DIR = path.resolve(process.env.OUT_DIR ?? '.demo-video')
/** The demo data and every number in the README are written for this date. */
const TODAY = '2026-11-15'
/** The video is the viewport, pixel for pixel: the screencast ignores a device scale factor, so a larger size would only be an upscale. */
const VIEWPORT = { width: 1600, height: 900 }
/** Silence after each line, and the hold on the last picture, in seconds. */
const GAP = 0.45
const TAIL = 1
/**
 * The page runs this many times slower than the video plays. A screenshot of a busy scene takes up to 70 ms, which
 * is 15 frames a second at full speed; at half speed the same screenshots are 30 frames for each second of video.
 */
const SLOW = Number(process.env.SLOW ?? 2)
/** Without these, headless Chrome draws WebGL in software and the building stutters. */
const GPU_ARGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']

const log = (text) => process.stdout.write(`${text}\n`)

/** Runs in the page before its scripts: the clock, animation frames and timers all go `slow` times slower. */
// CSS transitions are left at full speed, so they play `slow` times faster in the video. Slowing them with the
// browser's animation playback rate is not an option: with it set, the camera jumps about once the floors separate.
function slowPageClock(slow) {
  const realNow = performance.now.bind(performance)
  const origin = realNow()
  const scaled = (t) => origin + (t - origin) / slow
  performance.now = () => scaled(realNow())
  const frame = window.requestAnimationFrame.bind(window)
  window.requestAnimationFrame = (callback) => frame((t) => callback(scaled(t)))
  const timeout = window.setTimeout.bind(window)
  window.setTimeout = (handler, ms, ...args) => timeout(handler, (ms ?? 0) * slow, ...args)
  const interval = window.setInterval.bind(window)
  window.setInterval = (handler, ms, ...args) => interval(handler, (ms ?? 0) * slow, ...args)
}

/**
 * Runs in the page before its scripts: every WebGL canvas keeps its last drawn picture. The building is drawn on
 * demand, and a screenshot of a canvas that has not drawn since the last one can show an older picture instead:
 * with the floors separated the video jumped back and forth between two views.
 */
function keepDrawingBuffer() {
  const getContext = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function (type, attributes) {
    return getContext.call(this, type, /^webgl/.test(type) ? { ...attributes, preserveDrawingBuffer: true } : attributes)
  }
}

async function openApp(browser) {
  const context = await browser.newContext({ viewport: VIEWPORT, timezoneId: 'America/New_York', colorScheme: THEME })
  const page = await context.newPage()
  // The tour asks for fullscreen. A headless browser's screen is 800 × 600, so granting it shrinks the frames to
  // that for the whole tour; the app carries on without fullscreen when the browser says it is unavailable.
  await page.addInitScript(() => {
    Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false })
  })
  await page.addInitScript(slowPageClock, SLOW)
  await page.addInitScript(keepDrawingBuffer)
  const url = new URL(URL_)
  url.searchParams.set('today', TODAY)
  await page.goto(url.toString())
  await page.locator('[data-testid="scene3d"] canvas').waitFor({ timeout: 30_000 })
  await page.waitForTimeout(3000 * SLOW) // the city around the building finishes loading
  return page
}

/**
 * Starts capturing frames to `dir`: one screenshot after another, which comes to an even 30 a second. The browser's
 * screencast is not used: on this page it delivers nothing for about 270 ms every few seconds, which shows as a
 * stutter in the tour. Returns the clock (seconds of video since the start), the frames captured so far and `stop`.
 */
async function startCapture(page, dir) {
  const frames = []
  const cdp = await page.context().newCDPSession(page)
  await page.screencast.showActions({ cursor: 'pointer', duration: 400 * SLOW, style: { title: 'display: none' } })
  const t0 = performance.now()
  const clock = () => (performance.now() - t0) / 1000 / SLOW
  let running = true
  const loop = (async () => {
    while (running) {
      const at = clock()
      const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 95, optimizeForSpeed: true })
      const file = path.join(dir, `f${String(frames.length).padStart(6, '0')}.jpg`)
      writeFileSync(file, Buffer.from(shot.data, 'base64'))
      frames.push({ file, at })
    }
  })()
  const stop = async () => {
    running = false
    await loop
  }
  return { clock, frames, stop }
}

/** Runs every beat, holding each one until its line has been read. Returns when each clip starts. */
async function play(page, clips, clock) {
  const marks = []
  const pause = (ms) => page.waitForTimeout(ms * SLOW)
  for (const beat of BEATS) {
    const start = clock()
    const clip = clips[beat.id]
    marks.push({ file: clip.file, start })
    log(`${start.toFixed(1).padStart(6)} s  ${beat.id}`)
    await beat.run(page, pause)
    const rest = start + clip.seconds + GAP - clock()
    if (rest > 0) await pause(rest * 1000)
  }
  return marks
}

async function main() {
  const framesDir = path.join(OUT_DIR, 'frames')
  const audioDir = path.join(OUT_DIR, 'audio')
  rmSync(framesDir, { recursive: true, force: true })
  for (const dir of [framesDir, audioDir]) mkdirSync(dir, { recursive: true })

  log(`Narration: ${VOICE}`)
  const clips = narrate(BEATS, audioDir, VOICE, KOKORO_DIR)
  const browser = await chromium.launch({ headless: true, args: GPU_ARGS })
  try {
    const page = await openApp(browser)
    const { clock, frames, stop } = await startCapture(page, framesDir)
    const marks = await play(page, clips, clock)
    await page.waitForTimeout(TAIL * 1000 * SLOW)
    const endSeconds = clock()
    await stop()
    const output = path.join(OUT_DIR, 'stackmatch-demo.mp4')
    log(`Encoding ${frames.length} frames, ${endSeconds.toFixed(1)} s`)
    encode({ ffmpeg: FFMPEG, frames: [...frames], endSeconds, marks, size: VIEWPORT, workDir: OUT_DIR, output })
    log(output)
  } finally {
    await browser.close()
  }
}

try {
  await main()
} catch (error) {
  process.stderr.write(`Recording failed: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
