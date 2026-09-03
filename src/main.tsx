import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { requestPersistence } from './db'
import { registerSW } from 'virtual:pwa-register'

// Request persistent storage
requestPersistence();

// Track pending update state
let updatePending = false;
let isRefreshing = false;

// Auto-update PWA safely and automatically without manual steps
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // A new version is ready in cache: activate immediately
    updateSW(true);
  },
  onRegisteredSW(_swUrl, registration) {
    if (registration) {
      // 1. Check for update immediately on launch
      registration.update().catch(() => {});

      // 2. Poll GitHub Pages for new releases every 45 seconds
      setInterval(() => {
        registration.update().catch(() => {});
      }, 45 * 1000);

      // 3. Check every time the phone is unlocked or user switches back to Pointage
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          registration.update().catch(() => {});
        }
      });
      window.addEventListener('focus', () => {
        registration.update().catch(() => {});
      });
    }
  },
  onOfflineReady() {
    console.log('Pointage Pro prêt pour le travail hors-ligne');
  },
});

// When new service worker takes over, reload cleanly if not actively counting
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (isRefreshing) return;

    const isActivelyCounting =
      window.location.hash.includes('/line/') ||
      window.location.hash.includes('/scan') ||
      document.activeElement?.tagName === 'INPUT';

    if (!isActivelyCounting) {
      isRefreshing = true;
      window.location.reload();
    } else {
      updatePending = true;
      console.log('Mise à jour en attente : sera appliquée dès le retour à la liste.');
    }
  });

  // Automatically apply update as soon as user returns to bill list or home screen
  window.addEventListener('hashchange', () => {
    if (updatePending && !isRefreshing) {
      const stillCounting =
        window.location.hash.includes('/line/') ||
        window.location.hash.includes('/scan');
      if (!stillCounting) {
        isRefreshing = true;
        window.location.reload();
      }
    }
  });
}




createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
