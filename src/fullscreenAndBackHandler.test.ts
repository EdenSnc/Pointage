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
    it('always returns false as fullscreen is completely disabled', () => {
      expect(isFullscreenActive()).toBe(false);
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
    it('is a disabled no-op returning false', async () => {
      const res = await requestAppFullscreen(true);
      expect(res).toBe(false);
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

    it('does not trigger fullscreen requests on popstate, keeping navigation clean and static', async () => {
      const cleanup = setupAndroidBackAndFullscreenGuard();
      const mockReq = (globalThis as any).document.documentElement.requestFullscreen;

      mockReq.mockClear();
      (globalThis as any).window.dispatchEvent({ type: 'popstate' });

      // No requestFullscreen called — avoiding Android system bar exit jolt
      expect(mockReq).not.toHaveBeenCalled();

      cleanup();
    });

    it('requests screen wake lock on visibilitychange resume without forcing fullscreen', async () => {
      resetWakeLockForTesting();
      const cleanup = setupAndroidBackAndFullscreenGuard();
      const wakeLockMock = (globalThis as any).navigator.wakeLock.request;
      const mockReq = (globalThis as any).document.documentElement.requestFullscreen;

      wakeLockMock.mockClear();
      mockReq.mockClear();

      resetWakeLockForTesting();
      (globalThis as any).document.dispatchEvent({ type: 'visibilitychange' });

      expect(wakeLockMock).toHaveBeenCalledWith('screen');
      expect(mockReq).not.toHaveBeenCalled();

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
