import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { requestPersistence } from './db'
import { registerSW } from 'virtual:pwa-register'

// Request persistent storage
requestPersistence();

// Auto-update PWA safely without ever interrupting active worker sessions
const updateSW = registerSW({
  onNeedRefresh() {
    // Never interrupt an active count or scan session
    const isActivelyCounting =
      window.location.hash.includes('/line/') ||
      window.location.hash.includes('/scan') ||
      document.activeElement?.tagName === 'INPUT';

    if (!isActivelyCounting) {
      updateSW(true);
    } else {
      console.log('Mise à jour prête : différée pour ne pas interrompre la saisie en cours.');
    }
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
