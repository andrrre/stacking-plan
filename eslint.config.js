import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
export default defineConfig([
  globalIgnores(['dist', '.pw', 'playwright-report', 'test-results', '.vercel']),
  { files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended, reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: { 'no-console': 'error', 'max-lines': ['error', { max: 800 }], 'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }], 'max-depth': ['error', 4] } },
  { files: ['src/domain/**/*.{ts,tsx}', 'src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { paths: [{ name: 'react', message: 'Domain and shared code must stay free of React.' }] }],
      'no-restricted-syntax': ['error', { selector: "NewExpression[callee.name='Date']", message: 'Do not construct Date; use src/domain/dates.ts.' }],
    } },
  { files: ['**/*.test.{ts,tsx}', 'e2e/**'], rules: { 'max-lines-per-function': 'off' } },
])
