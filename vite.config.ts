import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { apiPlugin } from './server/dev/apiPlugin.js'
export default defineConfig({
  plugins: [react(), apiPlugin()],
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts'], css: { modules: { classNameStrategy: 'non-scoped' } } },
})
