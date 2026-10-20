// Fontes dentro do app (antes vinham do Google Fonts): assim o app abre igual sem internet.
import '@fontsource/public-sans/latin-400.css'
import '@fontsource/public-sans/latin-500.css'
import '@fontsource/public-sans/latin-600.css'
import '@fontsource/public-sans/latin-700.css'
import '@fontsource/saira/latin-500.css'
import '@fontsource/saira/latin-600.css'
import '@fontsource/saira/latin-700.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import './index.css'
import { exposeTestHelpers } from '@/offline/connectivity'
import { captureInstallPrompt } from '@/pwa/install'

captureInstallPrompt()
exposeTestHelpers()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
