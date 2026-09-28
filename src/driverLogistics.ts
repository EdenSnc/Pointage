// ============================================================
// POINTAGE — Assigned Delivery Drivers (Chauffeurs Livreurs)
// Algerian Distribution Logistics (Yassine, Djaber, Mourad...)
// ============================================================

import { db } from './db';

export const DEFAULT_DRIVERS: string[] = ['Yassine', 'Djaber', 'Mourad', 'Nassim', 'Samir'];

const DRIVER_ROSTER_KEY = 'pointage_driver_roster';

export function loadDriverRoster(): string[] {
  try {
    const raw = localStorage.getItem(DRIVER_ROSTER_KEY);
    if (!raw) return [...DEFAULT_DRIVERS];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return Array.from(new Set([...DEFAULT_DRIVERS, ...parsed]));
    }
  } catch {
    // Fallback to default
  }
  return [...DEFAULT_DRIVERS];
}

export function saveDriverToRoster(driverName: string): string[] {
  const clean = driverName.trim();
  if (!clean) return loadDriverRoster();
  const formatted = clean.charAt(0).toUpperCase() + clean.slice(1);
  const current = loadDriverRoster();
  const next = Array.from(new Set([...current, formatted]));
  try {
    localStorage.setItem(DRIVER_ROSTER_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

export async function assignDriverToBill(billId: number, driverName: string | null): Promise<void> {
  const clean = driverName?.trim() || null;
  const formatted = clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : null;
  await db.bills.update(billId, {
    driverName: formatted,
    updatedAt: new Date().toISOString(),
  });
  if (formatted) {
    saveDriverToRoster(formatted);
  }
}
