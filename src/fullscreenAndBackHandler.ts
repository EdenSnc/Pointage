/**
 * ============================================================
 * ANDROID BACK BUTTON TRAP & ALWAYS-ON FULLSCREEN SUBSYSTEM
 * ============================================================
 *
 * Senior Engineering Architecture:
 * 1. STANDALONE NATIVE FULLSCREEN (Zero-Notification, Non-Exitable):
 *    - Relies on Native PWA Standalone container (100dvh / 100vw / viewport-fit=cover).
 *    - Eliminates calling HTML5 requestFullscreen() on Android, which is the exact OS trigger
 *      for the security notification ("To exit full screen, drag from the top and touch the back")
 *      and the cause of the Android Back button dropping fullscreen.
 *    - In Standalone PWA mode, the app is 100% fullscreen natively with zero browser UI,
 *      zero security toasts, and the Back button is never hijacked by Chrome to exit fullscreen.
 *    - Dynamically syncs <meta name="theme-color"> to seamlessly blend the Android system
 *      status bar with the app header in both light and dark themes.
 *    - Integrates Screen WakeLock API to keep the warehouse terminal screen awake during shifts.
 *
 * 2. ANDROID HARDWARE / GESTURE BACK BUTTON TRAP:
 *    - Maintains a persistent 2-level virtual history buffer ({ pointage_guard: true }).
 *    - When the Android hardware/gesture Back button is pressed on the root screen (#/):
 *      Intercepts popstate and immediately re-pushes the guard, preventing Android from
 *      exiting the tab, minimizing, or quitting the app.
 *    - When a modal or drawer is open: the back button cleanly dismisses the modal.
 *    - When on sub-routes (#/bill/:id, etc.): navigates back within the app naturally.
 *
 * 3. PWA INSTALLATION HOOKS:
 *    - Captures beforeinstallprompt to provide a 1-click install banner on home screen
 *      and settings modal.
 */

// Check if currently active in HTML5 Fullscreen (if ever manually requested)
export function isFullscreenActive(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as any;
  return !!(
    doc.fullscreenElement ||
    doc.webkitFullscreenElement ||
    doc.mozFullScreenElement ||
    doc.msFullscreenElement
  );
}

// Check if running as an installed standalone PWA (WebAPK / iOS Standalone)
export function isStandaloneApp(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    (window.navigator as any)?.standalone === true ||
    (typeof document !== 'undefined' && Boolean(document.referrer?.includes('android-app://')))
  );
}

let lastFsAttempt = 0;

// Manual/Explicit Fullscreen request for kiosk/tablet setups (throttled)
export async function requestAppFullscreen(force = false): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  if (isFullscreenActive()) return true;

  const now = Date.now();
  if (!force && now - lastFsAttempt < 1200) {
    return false;
  }
  lastFsAttempt = now;

  const elem = document.documentElement as any;
  if (!elem) return false;

  const req =
    elem.requestFullscreen ||
    elem.webkitRequestFullscreen ||
    elem.mozRequestFullScreen ||
    elem.msRequestFullscreen;

  if (!req) return false;

  try {
    const p = req.call(elem, { navigationUI: 'hide' });
    if (p && typeof p.then === 'function') {
      await p;
      return true;
    }
    return true;
  } catch {
    try {
      const p2 = req.call(elem);
      if (p2 && typeof p2.then === 'function') {
        await p2;
        return true;
      }
      return true;
    } catch {
      return false;
    }
  }
}

// Screen WakeLock to prevent phone display sleep during warehouse operations
let activeWakeLock: any = null;

export function resetWakeLockForTesting(): void {
  activeWakeLock = null;
}

export async function requestScreenWakeLock(): Promise<void> {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

  try {
    if (activeWakeLock && !activeWakeLock.released) return;
    activeWakeLock = await (navigator as any).wakeLock.request('screen');
    activeWakeLock.addEventListener('release', () => {
      activeWakeLock = null;
    });
  } catch {}
}

export interface GuardOptions {
  onRootBack?: () => void;
  onCloseModal?: () => boolean;
}

// Global PWA install prompt state
let deferredPrompt: any = null;
const installSubscribers: Set<(canInstall: boolean) => void> = new Set();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: any) => {
    e.preventDefault();
    deferredPrompt = e;
    installSubscribers.forEach((cb) => cb(true));
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installSubscribers.forEach((cb) => cb(false));
  });
}

export function subscribePwaInstall(callback: (canInstall: boolean) => void): () => void {
  installSubscribers.add(callback);
  callback(!!deferredPrompt && !isStandaloneApp());
  return () => {
    installSubscribers.delete(callback);
  };
}

export async function promptPwaInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  try {
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    installSubscribers.forEach((cb) => cb(false));
    return choice?.outcome === 'accepted';
  } catch {
    return false;
  }
}

/**
 * Setup Android Hardware/Gesture Back Button Trap and Always-on Fullscreen Guardian
 */
export function setupAndroidBackAndFullscreenGuard(options?: GuardOptions): () => void {
  if (typeof window === 'undefined') return () => {};

  try {
    localStorage.setItem('pointage_fullscreen_default', 'true');
  } catch {}

  // 1. Initialise History Guard buffer so Back button never exhausts history
  const initHistoryGuard = () => {
    try {
      const state = window.history.state;
      if (!state || !state.pointage_guard) {
        window.history.replaceState({ pointage_guard: true, isBase: true }, '', window.location.href);
        window.history.pushState({ pointage_guard: true, isGuard: true }, '', window.location.href);
      }
    } catch {}
  };
  initHistoryGuard();

  // 2. Intercept popstate (Android Physical/Gesture Back Button)
  const handlePopState = (_e: PopStateEvent) => {
    // Check if an open modal can consume the back button
    if (options?.onCloseModal && options.onCloseModal()) {
      try {
        window.history.pushState({ pointage_guard: true, isGuard: true }, '', window.location.href);
      } catch {}
      return;
    }

    // Check if we are at root home screen (#/ or empty)
    const hash = window.location.hash || '';
    const isRoot = hash === '' || hash === '#/' || hash === '#';

    if (isRoot) {
      // Prevent Android from quitting the app or closing the tab!
      try {
        window.history.pushState({ pointage_guard: true, isGuard: true, ts: Date.now() }, '', window.location.href);
      } catch {}
      if (options?.onRootBack) {
        options.onRootBack();
      }
    }
  };
  window.addEventListener('popstate', handlePopState);

  // 3. Resume from background / lockscreen (visibilitychange, pageshow, focus)
  const handleResume = () => {
    if (document.visibilityState === 'visible') {
      // Re-acquire screen wake lock on resume
      requestScreenWakeLock().catch(() => {});
    }
  };
  document.addEventListener('visibilitychange', handleResume);
  window.addEventListener('pageshow', handleResume);
  window.addEventListener('focus', handleResume);

  // Request initial screen wake lock on mount
  requestScreenWakeLock().catch(() => {});

  return () => {
    window.removeEventListener('popstate', handlePopState);
    document.removeEventListener('visibilitychange', handleResume);
    window.removeEventListener('pageshow', handleResume);
    window.removeEventListener('focus', handleResume);
  };
}
