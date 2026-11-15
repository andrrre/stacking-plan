import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { format } from 'date-fns'
import '@fontsource-variable/inter'
import './styles/tokens.css'
import './styles/global.css'
import { App } from './app/App'
import { StateProvider } from './app/state/StateProvider'
import { initState } from './app/state/init'
import { browserStorage } from './app/state/storage'

const root = document.getElementById('root')
if (!root) throw new Error('Root element #root not found')

// The only clock read in the app (rule: dates flow from here as ISO strings).
const initialState = initState(location.search, browserStorage(), format(new Date(), 'yyyy-MM-dd'))

createRoot(root).render(
  <StrictMode>
    <StateProvider initialState={initialState}>
      <App />
    </StateProvider>
  </StrictMode>,
)
