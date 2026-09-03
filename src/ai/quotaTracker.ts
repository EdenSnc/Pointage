import { useState, useEffect } from 'react';

// ============================================================
// POINTAGE — Gemini API Daily Quota Tracker
// Tracks requests per model per day in localStorage
// ============================================================


export interface DailyUsage {
  date: string;
  liteUsed: number;
  liteLimit: number;
  flashUsed: number;
  flashLimit: number;
}

export const QUOTA_LIMITS = {
  'gemini-3.5-flash-lite': 500,
  'gemini-3.8-flash': 20,
} as const;

function getTodayKey(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const memoryStorage: Record<string, string> = {};

function safeGetItem(key: string): string | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    try { return window.localStorage.getItem(key); } catch {}
  }
  return memoryStorage[key] || null;
}

function safeSetItem(key: string, value: string): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    try { window.localStorage.setItem(key, value); return; } catch {}
  }
  memoryStorage[key] = value;
}

export function _resetQuotaTrackerForTest(): void {

  for (const k of Object.keys(memoryStorage)) {
    delete memoryStorage[k];
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    try { window.localStorage.clear(); } catch {}
  }
}

export function getDailyUsage(): DailyUsage {

  const today = getTodayKey();
  const raw = safeGetItem(`pointage_api_usage_${today}`);
  let parsed = { lite: 0, flash: 0 };
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      // ignore
    }
  }

  return {
    date: today,
    liteUsed: parsed.lite || 0,
    liteLimit: QUOTA_LIMITS['gemini-3.5-flash-lite'],
    flashUsed: parsed.flash || 0,
    flashLimit: QUOTA_LIMITS['gemini-3.8-flash'],
  };
}

export function recordApiUsage(modelId: string): void {
  const today = getTodayKey();
  const current = getDailyUsage();

  let lite = current.liteUsed;
  let flash = current.flashUsed;

  if (modelId === 'gemini-3.8-flash') {
    flash += 1;
  } else {
    lite += 1;
  }

  safeSetItem(
    `pointage_api_usage_${today}`,
    JSON.stringify({ lite, flash })
  );


  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pointage-quota-updated'));
  }
}

export function useDailyApiQuota(): DailyUsage {
  const [usage, setUsage] = useState<DailyUsage>(getDailyUsage);

  useEffect(() => {
    const handleUpdate = () => setUsage(getDailyUsage());
    if (typeof window !== 'undefined') {
      window.addEventListener('pointage-quota-updated', handleUpdate);
      return () => window.removeEventListener('pointage-quota-updated', handleUpdate);
    }
  }, []);

  return usage;
}

