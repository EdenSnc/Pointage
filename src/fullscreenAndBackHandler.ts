/**
 * ============================================================
 * ANDROID BACK BUTTON TRAP & ALWAYS-ON FULLSCREEN SUBSYSTEM
 * ============================================================
 *
 * Senior Engineering Architecture:
 * 1. ALWAYS-ON FULLSCREEN (Zero Negotiation):
 *    - Passes { navigationUI: 'hide' } to inform Android Chrome to conceal navigation bars.
 *    - 1200ms throttle cooldown prevents event listener flooding and eliminates repeated OS notifications.
 *    - Listens only to completed interactions ('pointerup') instead of 8 simultaneous events.
 *    - Automatically recovers on visibilitychange, pageshow, and focus upon returning from background/lockscreen.
 *    - Screen WakeLock API integration keeps the terminal display active during warehouse shifts.
 *    - One-touch capture recovery guarantees instant fullscreen restoration on user touch if ever dropped.
 *
 * 2. ANDROID BACK BUTTON TRAP:
 *    - Maintains a persistent history state buffer ({ pointage_guard: true }).
 *    - When the Android hardware/gesture Back button is pressed on the root screen (#/):
 *      Intercepts popstate and re-pushes the guard, preventing Android from exiting the tab or quitting the app.
 *    - Because popstate carries user activation in Android Chrome, it immediately re-engages fullscreen
 *      if Android attempted to drop it on the back gesture.
 *
 * 3. PWA INSTALL INTEGRATION:
 *    - In an installed PWA (WebAPK), Android OS PERMANENTLY suppresses the
 *      "to quit fullscreen drag from the top and touch the back" notification.
 *    - Captures beforeinstallprompt to allow seamless 1-tap installation.
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

// Check if running as an installed standalone PWA (WebAPK)
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

// Re-usable, rate-limited fullscreen activation
export async function requestAppFullscreen(force = false): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  if (isFullscreenActive()) return true;

  const now = Date.now();
  // Cooldown to prevent spamming Android OS notification queue
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
    // navigationUI: 'hide' explicitly requests Android Chrome to hide system bars
    const p = req.call(elem, { navigationUI: 'hide' });
    if (p && typeof p.then === 'function') {
      await p;
      return true;
    }
    return true;
  } catch {
    // Fallback for older WebKit engines without parameter support
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
    // Android Chrome popstate carries active user gesture activation!
    // If Android attempted to exit HTML5 fullscreen on back gesture, immediately re-request it:
    if (!isFullscreenActive()) {
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

  // 3. Clean user interaction engagement (pointerup triggers with user gesture, without multi-event flooding)
  const handleInteraction = () => {
    if (!isFullscreenActive()) {
      requestAppFullscreen().catch(() => {});
    }
  };
  window.addEventListener('pointerup', handleInteraction, { capture: true, passive: true });

  // 4. One-touch immediate re-engagement helper
  let armedTouch = false;
  const armOneTouchRestore = () => {
    if (armedTouch || isFullscreenActive()) return;
    armedTouch = true;
    const touchRestore = () => {
      armedTouch = false;
      window.removeEventListener('pointerdown', touchRestore, true);
      window.removeEventListener('touchstart', touchRestore, true);
      if (!isFullscreenActive()) {
        requestAppFullscreen(true).catch(() => {});
      }
    };
    window.addEventListener('pointerdown', touchRestore, { capture: true, passive: true });
    window.addEventListener('touchstart', touchRestore, { capture: true, passive: true });
  };

  // 5. Watchdog on fullscreenchange: if dropped, arm immediate one-touch restore
  const handleFullscreenChange = () => {
    if (!isFullscreenActive()) {
      armOneTouchRestore();
    }
  };
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
  document.addEventListener('mozfullscreenchange', handleFullscreenChange);

  // 6. Resume from background / lockscreen (visibilitychange, pageshow, focus)
  const handleResume = () => {
    if (document.visibilityState === 'visible') {
      // Attempt immediate silent fullscreen
      requestAppFullscreen(true).catch(() => {});
      // Re-acquire screen wake lock
      requestScreenWakeLock().catch(() => {});
      // Arm one-touch restore for guaranteed activation on first user tap
      armOneTouchRestore();
    }
  };
  document.addEventListener('visibilitychange', handleResume);
  window.addEventListener('pageshow', handleResume);
  window.addEventListener('focus', handleResume);

  // Soft keyboard dismissal
  const handleFocusOut = () => {
    setTimeout(() => {
      if (!isFullscreenActive()) requestAppFullscreen().catch(() => {});
    }, 250);
  };
  window.addEventListener('focusout', handleFocusOut, { capture: true, passive: true });

  // Initial attempt on mount
  requestAppFullscreen().catch(() => {});
  requestScreenWakeLock().catch(() => {});

  return () => {
    window.removeEventListener('popstate', handlePopState);
    window.removeEventListener('pointerup', handleInteraction, { capture: true } as any);
    document.removeEventListener('fullscreenchange', handleFullscreenChange);
    document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
    document.removeEventListener('visibilitychange', handleResume);
    window.removeEventListener('pageshow', handleResume);
    window.removeEventListener('focus', handleResume);
    window.removeEventListener('focusout', handleFocusOut, { capture: true } as any);
  };
}
