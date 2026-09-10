/**
 * ============================================================
 * ANDROID BACK BUTTON TRAP & ALWAYS-ON FULLSCREEN SUBSYSTEM
 * ============================================================
 *
 * Strategy:
 * 1. Request HTML5 fullscreen ONCE on the first user interaction (tap/click).
 *    - Android Chrome shows the security notification ONCE. It auto-hides after ~3s.
 *    - We never re-trigger from scratch after that initial engagement.
 *
 * 2. If Android drops fullscreen via Back button, we re-request in popstate.
 *    Android Chrome typically does NOT re-show the notification for immediate
 *    re-requests within the same user-gesture context.
 *
 * 3. Virtual history trap prevents the app from quitting on Back at root.
 *
 * 4. Screen WakeLock keeps the display awake during warehouse shifts.
 *
 * 5. PWA install hooks for 1-click installation (installed PWA = zero notifications).
 */

// Check if currently active in HTML5 Fullscreen
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

// Request HTML5 fullscreen with throttle to avoid spamming the OS notification
export async function requestAppFullscreen(force = false): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  if (isFullscreenActive()) return true;

  const now = Date.now();
  // 2-second cooldown to prevent notification re-queue
  if (!force && now - lastFsAttempt < 2000) {
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

  // Track whether we've already engaged fullscreen this session
  let fullscreenEngaged = false;

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

  // 2. Engage fullscreen on first user click (one-shot).
  //    This is the ONLY place we initiate fullscreen from scratch.
  //    The Android notification will show ONCE and auto-hide after ~3s.
  //    In installed PWA mode, we skip this entirely (already fullscreen natively).
  const handleFirstInteraction = () => {
    if (fullscreenEngaged || isFullscreenActive() || isStandaloneApp()) {
      // Already done or not needed — stop listening
      window.removeEventListener('click', handleFirstInteraction, true);
      return;
    }
    requestAppFullscreen(true).then((ok) => {
      if (ok) {
        fullscreenEngaged = true;
        // Remove listener — we only need to do this once
        window.removeEventListener('click', handleFirstInteraction, true);
      }
    }).catch(() => {});
  };
  window.addEventListener('click', handleFirstInteraction, { capture: true, passive: true });

  // 3. Intercept popstate (Android Physical/Gesture Back Button)
  const handlePopState = (_e: PopStateEvent) => {
    // If fullscreen was dropped by Android back gesture, re-engage it immediately.
    // popstate from hardware Back carries a valid user gesture activation,
    // so requestFullscreen can succeed. Android typically doesn't re-show
    // the notification for re-requests after back-exit.
    if (fullscreenEngaged && !isFullscreenActive() && !isStandaloneApp()) {
      requestAppFullscreen(true).catch(() => {});
    }

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

  // 4. Resume from background / lockscreen
  const handleResume = () => {
    if (document.visibilityState === 'visible') {
      // Re-acquire screen wake lock on resume
      requestScreenWakeLock().catch(() => {});
      // If we had fullscreen before, try to re-engage
      if (fullscreenEngaged && !isFullscreenActive() && !isStandaloneApp()) {
        requestAppFullscreen(true).catch(() => {});
      }
    }
  };
  document.addEventListener('visibilitychange', handleResume);
  window.addEventListener('pageshow', handleResume);
  window.addEventListener('focus', handleResume);

  // Request initial screen wake lock on mount
  requestScreenWakeLock().catch(() => {});

  return () => {
    window.removeEventListener('click', handleFirstInteraction, { capture: true } as any);
    window.removeEventListener('popstate', handlePopState);
    document.removeEventListener('visibilitychange', handleResume);
    window.removeEventListener('pageshow', handleResume);
    window.removeEventListener('focus', handleResume);
  };
}
