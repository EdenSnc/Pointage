import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  detectDeviceProfile,
  applyDeviceOptimizations,
  setForcedA54Mode,
} from './deviceProfile';

describe('deviceProfile - Samsung Galaxy A54 5G & Mobile Optimization', () => {
  let mockStorage: Record<string, string> = {};
  let mockAttributes: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    mockAttributes = {};

    (globalThis as any).localStorage = {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, val: string) => { mockStorage[key] = val; },
      removeItem: (key: string) => { delete mockStorage[key]; },
      clear: () => { mockStorage = {}; },
    };

    (globalThis as any).document = {
      documentElement: {
        setAttribute: (k: string, v: string) => { mockAttributes[k] = v; },
        getAttribute: (k: string) => mockAttributes[k] || null,
        removeAttribute: (k: string) => { delete mockAttributes[k]; },
      },
    };
  });

  afterEach(() => {
    setForcedA54Mode(false);
  });

  it('detects Samsung Galaxy A54 from model string SM-A546B', () => {
    const origDescriptor = Object.getOwnPropertyDescriptor(globalThis.navigator, 'userAgent');
    Object.defineProperty(globalThis.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
      configurable: true,
      writable: true,
    });

    setForcedA54Mode(false);
    const profile = detectDeviceProfile();
    expect(profile.isSamsungA54).toBe(true);
    expect(profile.hasAmoled).toBe(true);
    expect(profile.isHighRefreshRate).toBe(true);

    applyDeviceOptimizations();
    expect(mockAttributes['data-device']).toBe('samsung-a54');
    expect(mockAttributes['data-screen']).toBe('amoled');

    if (origDescriptor) {
      Object.defineProperty(globalThis.navigator, 'userAgent', origDescriptor);
    }
  });

  it('allows explicit forced A54 mode for testing on any device', () => {
    setForcedA54Mode(true);
    const profile = detectDeviceProfile();
    expect(profile.isSamsungA54).toBe(true);
    expect(profile.isForcedA54).toBe(true);

    applyDeviceOptimizations();
    expect(mockAttributes['data-device']).toBe('samsung-a54');
    expect(mockAttributes['data-screen']).toBe('amoled');

    // Turn off forced mode
    setForcedA54Mode(false);
    expect(mockStorage['pointage_force_a54']).toBe('false');
  });
});
