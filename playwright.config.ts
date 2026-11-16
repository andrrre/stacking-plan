import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.PW_PORT ?? 4173)
const browser = { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }

/**
 * Spec files that drive the WebGL building. Headless Chromium draws it in software, on the CPU, and a cold start
 * (parsing the ~1 MB scene chunk, creating the GL context, compiling shaders) takes ~1.3 s of CPU on its own,
 * ~2.7 s with two canvases starting together and ~3.4 s with four (measured): under a full parallel run, on a
 * loaded machine, that passed the 5 s an assertion waits by default (a trace of one failure showed the page's main
 * thread blocked for ~9.5 s right as the scene chunk ran: WebGL calls wait on the starved GPU process). These
 * specs run at most two at a time, with 15 s for each assertion and 60 s for each test; the DOM-only specs fill
 * the other workers with the defaults.
 */
const WEBGL = /(s13-3d|s16-drawers|s17-theme|s18-night-b|s19-night-review|s20-review-c|s21-labels-orbit|s22-tour|demo-[a-z-]+)\.spec\.ts$/

export default defineConfig({
  testDir: 'e2e',
  outputDir: `test-results/pw-${port}`,
  fullyParallel: true,
  retries: 0,
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1440, height: 900 },
    timezoneId: 'America/New_York',
    colorScheme: 'light', // deterministic: a test opts into dark itself
  },
  projects: [
    { name: 'webgl', testMatch: WEBGL, workers: 2, timeout: 60_000, expect: { timeout: 15_000 }, use: browser },
    { name: 'chromium', testIgnore: WEBGL, use: browser },
  ],
  webServer: {
    command: `npx vite build --outDir .pw/dist-${port} && npx vite preview --outDir .pw/dist-${port} --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 120000,
  },
})
