// ============================================================
// POINTAGE — Device Hardware Profiler & Samsung Galaxy A54 Tuning
// Detects Super AMOLED, 120Hz Refresh, 8GB RAM & Hardware Sensors
// ============================================================

export interface DeviceProfile {
  isSamsungA54: boolean;
  isSamsung: boolean;
  isMobile: boolean;
  hasAmoled: boolean;
  isHighRefreshRate: boolean;
  isBatterySaver: boolean;
  refreshRate: '60hz' | '120hz';
  ramGB: number;
  hardwareConcurrency: number;
  label: string;
  isForcedA54: boolean;
}

let cachedProfile: DeviceProfile | null = null;

export function detectDeviceProfile(): DeviceProfile {
  if (cachedProfile) return cachedProfile;

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) ||
    (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 768px)').matches);

  // User forced toggle for testing or guaranteed A54 mode
  let isForcedA54 = false;
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem) {
      isForcedA54 = localStorage.getItem('pointage_force_a54') === 'true';
    }
  } catch {}

  // Samsung Detection
  const isSamsung = /Samsung|SM-|SAMSUNG/i.test(ua) || isForcedA54;
  
  // Specific Galaxy A54 5G Signatures (SM-A546B, SM-A546E, SM-A546U, SM-A5460, SM-A546W)
  const isA54Model = /SM-A546/i.test(ua);

  // Hardware inspection
  const hardwareConcurrency = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4;
  
  // deviceMemory API (in GB, e.g. 8)
  const navMemory = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  const ramGB = navMemory ? Math.round(navMemory) : 8; // Galaxy A54 5G 8GB target

  // Viewport / Screen Ratio: A54 is 1080x2340 (19.5:9 ratio ~ 2.167)
  let isA54Screen = false;
  if (typeof window !== 'undefined' && window.screen) {
    const w = Math.min(window.screen.width, window.screen.height);
    const h = Math.max(window.screen.width, window.screen.height);
    const ratio = h / (w || 1);
    // Typical viewport in Android Chrome: 412 x 915 with dpr ~2.625
    if (ratio >= 2.14 && ratio <= 2.22 && isSamsung) {
      isA54Screen = true;
    }
  }

  const isSamsungA54 = isForcedA54 || isA54Model || (isSamsung && isA54Screen);
  const hasAmoled = isSamsung || isSamsungA54; // Samsung A-series & S-series feature Super AMOLED

  let label = 'Terminal Web Universel';
  if (isSamsungA54) {
    label = 'Samsung Galaxy A54 5G (Super AMOLED • 60Hz Éco-Batterie)';
  } else if (isSamsung) {
    label = 'Samsung Galaxy (Super AMOLED • Éco)';
  } else if (isMobile) {
    label = 'Mobile Optimisé Batterie';
  }

  cachedProfile = {
    isSamsungA54,
    isSamsung,
    isMobile,
    hasAmoled,
    isHighRefreshRate: false, // User requested 60Hz standard / battery saver lock
    isBatterySaver: true,
    refreshRate: '60hz',
    ramGB,
    hardwareConcurrency,
    label,
    isForcedA54,
  };

  return cachedProfile;
}

/**
 * Injects DOM attributes and custom CSS variables for Galaxy A54 5G & AMOLED screens
 */
export function applyDeviceOptimizations(): DeviceProfile {
  const profile = detectDeviceProfile();
  if (typeof document === 'undefined') return profile;

  const root = document.documentElement;

  if (profile.isSamsungA54) {
    root.setAttribute('data-device', 'samsung-a54');
  } else if (profile.isSamsung) {
    root.setAttribute('data-device', 'samsung');
  }

  if (profile.hasAmoled) {
    root.setAttribute('data-screen', 'amoled');
  }

  // Lock to 60Hz refresh rate and battery saver mode
  root.setAttribute('data-refresh', '60hz');
  root.setAttribute('data-battery-saver', 'true');

  if (profile.ramGB >= 8) {
    root.setAttribute('data-ram', '8gb');
  }

  // Adaptive Battery Status API: enforce power saving if discharging or low battery
  if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
    try {
      (navigator as any).getBattery().then((battery: any) => {
        const updateBatteryState = () => {
          if (typeof document !== 'undefined' && document.documentElement) {
            if (!battery.charging && battery.level <= 0.30) {
              document.documentElement.setAttribute('data-battery-saver', 'true');
            }
          }
        };
        updateBatteryState();
        battery.addEventListener('levelchange', updateBatteryState);
        battery.addEventListener('chargingchange', updateBatteryState);
      }).catch(() => {});
    } catch {}
  }

  return profile;
}

/**
 * Toggles explicit forced A54 mode
 */
export function setForcedA54Mode(enabled: boolean): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('pointage_force_a54', enabled ? 'true' : 'false');
    }
  } catch {}
  cachedProfile = null;
  applyDeviceOptimizations();
}

/**
 * Clear PWA cache and perform a clean reload (unstick stale mobile cache)
 */
export async function clearPwaCacheAndReload(): Promise<void> {
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      for (const key of keys) {
        await caches.delete(key);
      }
    }
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.unregister();
      }
    }
  } catch (err) {
    console.warn('Error clearing caches:', err);
  }
  window.location.reload();
}
