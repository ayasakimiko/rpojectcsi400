import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { configureApiClient } from './config/api.js'
import './index.css'
import App from './App.jsx'
import ServerDownOverlay from './components/ServerDownOverlay.jsx'

configureApiClient({ development: import.meta.env.DEV })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <ServerDownOverlay development={import.meta.env.DEV} />
  </StrictMode>,
)

