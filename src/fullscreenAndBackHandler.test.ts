import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isFullscreenActive,
  isStandaloneApp,
  requestAppFullscreen,
  requestScreenWakeLock,
  setupAndroidBackAndFullscreenGuard,
  subscribePwaInstall,
  resetWakeLockForTesting,
} from './fullscreenAndBackHandler';

describe('fullscreenAndBackHandler Subsystem', () => {
  let listeners: Record<string, Function[]> = {};
  let docListeners: Record<string, Function[]> = {};
  let mockHistoryState: any = null;
  let mockHash = '#/';

  beforeEach(() => {
    vi.restoreAllMocks();
    listeners = {};
    docListeners = {};
    mockHistoryState = null;
    mockHash = '#/';

    (globalThis as any).localStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };

    (globalThis as any).window = {
      location: {
        get hash() {
          return mockHash;
        },
        set hash(v: string) {
          mockHash = v;
        },
        href: 'http://localhost:4173/' + mockHash,
      },
      history: {
        get state() {
          return mockHistoryState;
        },
        replaceState: vi.fn((state: any) => {
          mockHistoryState = state;
        }),
        pushState: vi.fn((state: any) => {
          mockHistoryState = state;
        }),
      },
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
      addEventListener: vi.fn((event: string, cb: Function) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(cb);
      }),
      removeEventListener: vi.fn((event: string, cb: Function) => {
        if (listeners[event]) {
          listeners[event] = listeners[event].filter((f) => f !== cb);
        }
      }),
      dispatchEvent: (e: any) => {
        const cbs = listeners[e.type] || [];
        cbs.forEach((cb) => cb(e));
        return true;
      },
    };

    (globalThis as any).document = {
      fullscreenElement: null,
      webkitFullscreenElement: null,
      mozFullScreenElement: null,
      msFullscreenElement: null,
      visibilityState: 'visible',
      documentElement: {
        requestFullscreen: vi.fn().mockResolvedValue(undefined),
      },
      addEventListener: vi.fn((event: string, cb: Function) => {
        if (!docListeners[event]) docListeners[event] = [];
        docListeners[event].push(cb);
      }),
      removeEventListener: vi.fn((event: string, cb: Function) => {
        if (docListeners[event]) {
          docListeners[event] = docListeners[event].filter((f) => f !== cb);
        }
      }),
      dispatchEvent: (e: any) => {
        const cbs = docListeners[e.type] || [];
        cbs.forEach((cb) => cb(e));
        return true;
      },
    };

    try {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          wakeLock: {
            request: vi.fn().mockResolvedValue({
              released: false,
              addEventListener: vi.fn(),
            }),
          },
        },
        configurable: true,
        writable: true,
      });
    } catch {}
  });

  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).document;
  });

  describe('isFullscreenActive', () => {
    it('returns false when no fullscreen element is present', () => {
      expect(isFullscreenActive()).toBe(false);
    });

    it('returns true when document.fullscreenElement is set', () => {
      (globalThis as any).document.fullscreenElement = {};
      expect(isFullscreenActive()).toBe(true);
    });

    it('detects vendor-prefixed webkitFullscreenElement', () => {
      (globalThis as any).document.webkitFullscreenElement = {};
      expect(isFullscreenActive()).toBe(true);
    });
  });

  describe('isStandaloneApp', () => {
    it('returns false in normal browser tab mode', () => {
      expect(isStandaloneApp()).toBe(false);
    });

    it('returns true when matchMedia indicates display-mode: standalone', () => {
      (globalThis as any).window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('standalone'),
      }));

      expect(isStandaloneApp()).toBe(true);
    });
  });

  describe('requestAppFullscreen', () => {
    it('requests fullscreen with navigationUI: "hide"', async () => {
      const res = await requestAppFullscreen(true);
      expect(res).toBe(true);
      expect((globalThis as any).document.documentElement.requestFullscreen).toHaveBeenCalledWith({
        navigationUI: 'hide',
      });
    });

    it('throttles rapid sequential requests unless force=true', async () => {
      const mockReq = (globalThis as any).document.documentElement.requestFullscreen;

      // First forced call succeeds
      await requestAppFullscreen(true);
      expect(mockReq).toHaveBeenCalledTimes(1);

      // Second immediate call without force is throttled
      const throttled = await requestAppFullscreen(false);
      expect(throttled).toBe(false);
      expect(mockReq).toHaveBeenCalledTimes(1);

      // Third forced call succeeds
      const forced = await requestAppFullscreen(true);
      expect(forced).toBe(true);
      expect(mockReq).toHaveBeenCalledTimes(2);
    });
  });

  describe('setupAndroidBackAndFullscreenGuard', () => {
    it('initializes history state guard buffer on setup', () => {
      const cleanup = setupAndroidBackAndFullscreenGuard();

      expect((globalThis as any).window.history.replaceState).toHaveBeenCalledWith(
        expect.objectContaining({ pointage_guard: true }),
        '',
        expect.any(String)
      );
      expect((globalThis as any).window.history.pushState).toHaveBeenCalledWith(
        expect.objectContaining({ pointage_guard: true }),
        '',
        expect.any(String)
      );

      cleanup();
    });

    it('intercepts popstate at root to prevent quitting app', () => {
      mockHash = '#/';
      const onRootBackMock = vi.fn();

      const cleanup = setupAndroidBackAndFullscreenGuard({
        onRootBack: onRootBackMock,
      });

      const pushSpy = (globalThis as any).window.history.pushState;
      pushSpy.mockClear();

      // Trigger popstate as Android Back button does
      (globalThis as any).window.dispatchEvent({ type: 'popstate' });

      expect(pushSpy).toHaveBeenCalledWith(
        expect.objectContaining({ pointage_guard: true, isGuard: true }),
        '',
        expect.any(String)
      );
      expect(onRootBackMock).toHaveBeenCalledTimes(1);

      cleanup();
    });

    it('allows modal closing on back button without quitting', () => {
      mockHash = '#/';
      const closeModalMock = vi.fn().mockReturnValue(true);

      const cleanup = setupAndroidBackAndFullscreenGuard({
        onCloseModal: closeModalMock,
      });

      const pushSpy = (globalThis as any).window.history.pushState;
      pushSpy.mockClear();

      (globalThis as any).window.dispatchEvent({ type: 'popstate' });

      expect(closeModalMock).toHaveBeenCalledTimes(1);
      // Re-pushes guard state so user remains protected
      expect(pushSpy).toHaveBeenCalledWith(
        expect.objectContaining({ pointage_guard: true, isGuard: true }),
        '',
        expect.any(String)
      );

      cleanup();
    });

    it('does not call requestFullscreen on popstate to prevent Android notification spam', () => {
      const cleanup = setupAndroidBackAndFullscreenGuard();
      const mockReq = (globalThis as any).document.documentElement.requestFullscreen;
      mockReq.mockClear();

      (globalThis as any).window.dispatchEvent({ type: 'popstate' });

      expect(mockReq).not.toHaveBeenCalled();

      cleanup();
    });

    it('requests screen wake lock on visibilitychange when returning to app', () => {
      resetWakeLockForTesting();
      const cleanup = setupAndroidBackAndFullscreenGuard();
      const wakeLockMock = (globalThis as any).navigator.wakeLock.request;
      wakeLockMock.mockClear();

      // Release previous lock and simulate resume
      resetWakeLockForTesting();
      (globalThis as any).document.dispatchEvent({ type: 'visibilitychange' });

      expect(wakeLockMock).toHaveBeenCalledWith('screen');

      cleanup();
    });
  });

  describe('subscribePwaInstall', () => {
    it('notifies subscriber of initial status and allows unsubscribe', () => {
      const callback = vi.fn();
      const unsub = subscribePwaInstall(callback);

      expect(callback).toHaveBeenCalledWith(false);

      unsub();
    });
  });
});
