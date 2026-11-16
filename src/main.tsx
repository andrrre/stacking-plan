import './zodConfig' // first: zod reads its config when each schema is built
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { format } from 'date-fns'
import './styles/fonts.css'
import './styles/tokens.css'
import './styles/global.css'
import { App } from './app/App'
import { ErrorBoundary } from './app/ErrorBoundary'
import { StateProvider } from './app/state/StateProvider'
import { initState } from './app/state/init'
import { browserStorage } from './app/state/storage'
import { appThemeStore } from './features/theme/useTheme'

// Before the first render: <html> carries data-theme from the start, so a dark page never flashes light.
appThemeStore()

const root = document.getElementById('root')
if (!root) throw new Error('Root element #root not found')

// The only clock read in the app (rule: dates flow from here as ISO strings).
const initialState = initState(location.search, browserStorage(), format(new Date(), 'yyyy-MM-dd'))

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <StateProvider initialState={initialState}>
        <App />
      </StateProvider>
    </ErrorBoundary>
  </StrictMode>,
)
