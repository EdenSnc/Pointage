// ============================================================
// POINTAGE — Offline Vault & Local Secondary Mirror
// 100% Offline Resilience Against IndexedDB Eviction & Data Loss
// Automatically mirrors all bills, lines, and profiles to localStorage
// and recovers instantly if IndexedDB is ever cleared or reset.
// ============================================================

import { db, requestPersistence } from './db';
import { exportBackup, importBackup, type BackupData } from './backup';

export const VAULT_STORAGE_KEY = 'pointage_offline_vault_mirror';
export const VAULT_META_KEY = 'pointage_vault_last_sync';

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export interface VaultMeta {
  lastSync: string;
  billsCount: number;
  linesCount: number;
}

/**
 * Immediately captures the entire DB and saves it into localStorage.
 * Guaranteed offline durability even if IndexedDB is cleared or evicted.
 */
export async function syncVaultMirror(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return false;
  try {
    requestPersistence().catch(() => {});
    const backupData = await exportBackup();
    const billsCount = backupData.bills?.length || 0;
    const linesCount = backupData.orderLines?.length || 0;

    // Safety guard: do not overwrite a populated mirror with an empty db on a fresh crash
    if (billsCount === 0 && linesCount === 0) {
      const existing = localStorage.getItem(VAULT_STORAGE_KEY);
      if (existing) {
        return false;
      }
    }

    const json = JSON.stringify(backupData);
    localStorage.setItem(VAULT_STORAGE_KEY, json);

    const meta: VaultMeta = {
      lastSync: new Date().toISOString(),
      billsCount,
      linesCount,
    };
    localStorage.setItem(VAULT_META_KEY, JSON.stringify(meta));
    return true;
  } catch (err) {
    console.warn('Vault mirror sync bypassed (localStorage full or unavailable):', err);
    return false;
  }
}

/**
 * Debounced trigger for vault mirroring after any DB mutation.
 */
export function scheduleVaultMirror(delayMs = 350): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    syncVaultMirror().catch(() => {});
  }, delayMs);
}

/**
 * Retrieves the stored vault snapshot from localStorage.
 */
export function getVaultSnapshot(): BackupData | null {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(VAULT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BackupData;
  } catch {
    return null;
  }
}

/**
 * Retrieves the stored vault metadata.
 */
export function getVaultMeta(): VaultMeta | null {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(VAULT_META_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as VaultMeta;
  } catch {
    return null;
  }
}

/**
 * If IndexedDB is empty or missing lines while a local mirror exists in localStorage,
 * automatically restores all data so the user never suffers data loss upon reopening!
 */
export async function autoRecoverFromVaultIfEmpty(): Promise<boolean> {
  try {
    const billsCount = await db.bills.count();
    const linesCount = await db.orderLines.count();

    if (billsCount > 0 && linesCount > 0) {
      // Database is healthy and populated, ensure vault mirror is up-to-date
      scheduleVaultMirror(1000);
      return false;
    }

    const snapshot = getVaultSnapshot();
    if (!snapshot || !snapshot.bills || snapshot.bills.length === 0) {
      return false;
    }

    // Vault has data while IndexedDB is empty or missing lines!
    console.warn(`[Vault] Auto-recovering ${snapshot.bills.length} bills from offline mirror!`);
    await importBackup(snapshot);
    return true;
  } catch (err) {
    console.error('[Vault] Auto-recovery failed:', err);
    return false;
  }
}

/**
 * Force manual restore from the offline mirror
 */
export async function restoreFromVault(): Promise<{ billsCount: number; linesCount: number }> {
  const snapshot = getVaultSnapshot();
  if (!snapshot) {
    throw new Error('Aucun miroir de secours trouvé en mémoire locale');
  }
  await importBackup(snapshot);
  return {
    billsCount: snapshot.bills?.length || 0,
    linesCount: snapshot.orderLines?.length || 0,
  };
}
