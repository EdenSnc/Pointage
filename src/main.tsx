import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { requestPersistence } from './db'
import { registerSW } from 'virtual:pwa-register'

// Request persistent storage
requestPersistence();

// Auto-update PWA as soon as a new version is pushed to GitHub Pages
const updateSW = registerSW({
  onNeedRefresh() {
    updateSW(true);
  },
  onOfflineReady() {
    console.log('Pointage Pro prêt pour le travail hors-ligne');
  },
});


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
