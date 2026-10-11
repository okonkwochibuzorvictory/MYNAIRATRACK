import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { InstallBanner } from './pwa/install'
import { registerServiceWorker } from './pwa/register'
import './theme.css'

registerServiceWorker()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <InstallBanner />
  </React.StrictMode>,
)
