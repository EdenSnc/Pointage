// ============================================================
// POINTAGE — Backup & Restore
// ============================================================

import { db } from './db';

const BACKUP_VERSION = 1;

export interface BackupData {
  version: number;
  exportedAt: string;
  workSessions: unknown[];
  bills: unknown[];
  orderLines: unknown[];
  countEvents: unknown[];
  transportContainers: unknown[];
  extras: unknown[];
  billIdentifierOverrides: unknown[];
  identifierSuggestions: unknown[];
  productProfiles: unknown[];
  auditEvents: unknown[];
}

export async function exportBackup(): Promise<BackupData> {
  const data: BackupData = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    workSessions: await db.workSessions.toArray(),
    bills: await db.bills.toArray(),
    orderLines: await db.orderLines.toArray(),
    countEvents: await db.countEvents.toArray(),
    transportContainers: await db.transportContainers.toArray(),
    extras: await db.extras.toArray(),
    billIdentifierOverrides: await db.billIdentifierOverrides.toArray(),
    identifierSuggestions: await db.identifierSuggestions.toArray(),
    productProfiles: await db.productProfiles.toArray(),
    auditEvents: await db.auditEvents.toArray(),
  };
  return data;
}

export async function importBackup(data: BackupData): Promise<void> {
  if (!data.version || data.version > BACKUP_VERSION) {
    throw new Error(`Version de sauvegarde non supportée: ${data.version}`);
  }

  await db.transaction('rw', db.tables, async () => {
    // Clear all tables
    for (const table of db.tables) {
      await table.clear();
    }

    // Restore data
    if (data.workSessions?.length) await db.workSessions.bulkAdd(data.workSessions as never[]);
    if (data.bills?.length) await db.bills.bulkAdd(data.bills as never[]);
    if (data.orderLines?.length) await db.orderLines.bulkAdd(data.orderLines as never[]);
    if (data.countEvents?.length) await db.countEvents.bulkAdd(data.countEvents as never[]);
    if (data.transportContainers?.length) await db.transportContainers.bulkAdd(data.transportContainers as never[]);
    if (data.extras?.length) await db.extras.bulkAdd(data.extras as never[]);
    if (data.billIdentifierOverrides?.length) await db.billIdentifierOverrides.bulkAdd(data.billIdentifierOverrides as never[]);
    if (data.identifierSuggestions?.length) await db.identifierSuggestions.bulkAdd(data.identifierSuggestions as never[]);
    if (data.productProfiles?.length) await db.productProfiles.bulkAdd(data.productProfiles as never[]);
    if (data.auditEvents?.length) await db.auditEvents.bulkAdd(data.auditEvents as never[]);
  });
}

export function downloadBackup(data: BackupData): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pointage-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function shareBackup(data: BackupData): Promise<boolean> {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const file = new File(
    [blob],
    `pointage-backup-${new Date().toISOString().slice(0, 10)}.json`,
    { type: 'application/json' }
  );

  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        title: 'POINTAGE - Sauvegarde',
        files: [file],
      });
      return true;
    } catch {
      // User cancelled or share failed
    }
  }

  // Fallback to download
  downloadBackup(data);
  return false;
}
