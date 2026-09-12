/**
 * ============================================================
 * ANDROID BACK BUTTON TRAP & SCREEN WAKELOCK SUBSYSTEM
 * ============================================================
 *
 * Fullscreen is completely disabled across the application to prevent
 * Android Chrome/WebAPK system bar pop-in jolts and navigation issues.
 *
 * Strategy:
 * 1. Virtual history trap prevents the app from quitting on Back at root.
 * 2. Screen WakeLock keeps the display awake during warehouse shifts.
 * 3. Standard PWA standalone window mode with static, stable system UI.
 */

// Fullscreen is completely disabled
export function isFullscreenActive(): boolean {
  return false;
}

// Check if running as an installed standalone PWA (WebAPK / iOS Standalone)
export function isStandaloneApp(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as any)?.standalone === true ||
    (typeof document !== 'undefined' && Boolean(document.referrer?.includes('android-app://')))
  );
}

// Deprecated no-op: HTML5 fullscreen is permanently disabled
export async function requestAppFullscreen(_force = false): Promise<boolean> {
  return false;
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
 * Setup Android Hardware/Gesture Back Button Trap and Wake Lock Guardian
 * (HTML5 fullscreen is NOT auto-requested, avoiding Android system bar pop-in jolts on Back)
 */
export function setupAndroidBackAndFullscreenGuard(options?: GuardOptions): () => void {
  if (typeof window === 'undefined') return () => {};

  try {
    localStorage.removeItem('pointage_fullscreen_default');
    localStorage.removeItem('pointage_is_pwa');

    // Actively exit HTML5 fullscreen if currently active
    const doc = document as any;
    if (doc && (doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement)) {
      const exit = doc.exitFullscreen || doc.webkitExitFullscreen || doc.mozCancelFullScreen || doc.msExitFullscreen;
      if (exit) exit.call(doc).catch(() => {});
    }
  } catch {}

  // 1. Initialise History Guard buffer so Back button never exhausts history or closes the app
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

  // 3. Resume from background / lockscreen
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
