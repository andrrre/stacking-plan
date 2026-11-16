import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.PW_PORT ?? 4173)

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
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `npx vite build --outDir .pw/dist-${port} && npx vite preview --outDir .pw/dist-${port} --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 120000,
  },
})
