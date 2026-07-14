import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

registerSW({
  onNeedRefresh() {
    console.log('A new service worker is available and will be used once you reload.')
  },
  onOfflineReady() {
    console.log('The app is now cached and available offline.')
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
