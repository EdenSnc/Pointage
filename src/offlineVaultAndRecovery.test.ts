import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from './db';
import {
  syncVaultMirror,
  getVaultSnapshot,
  getVaultMeta,
  autoRecoverFromVaultIfEmpty,
  restoreFromVault,
  VAULT_STORAGE_KEY,
} from './offlineVault';
import { exportBackup } from './backup';
import type { Bill, OrderLine } from './types';

describe('Offline Vault & Local Mirroring Durability', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(async () => {
    mockStorage = {};
    (globalThis as any).window = globalThis;
    (globalThis as any).localStorage = {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, val: string) => { mockStorage[key] = val; },
      removeItem: (key: string) => { delete mockStorage[key]; },
      clear: () => { mockStorage = {}; },
    };

    await db.bills.clear();
    await db.orderLines.clear();
    await db.countEvents.clear();
    await db.productProfiles.clear();
  });

  afterEach(() => {
    mockStorage = {};
  });

  it('mirrors database into localStorage accurately', async () => {
    const billId = await db.bills.add({
      billNumber: 'BL-VAULT-01',
      client: 'Client Sétif',
      date: '2026-09-12',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await db.orderLines.add({
      billId,
      no: '1',
      reference: 'REF-001',
      designation: 'Cahier 96p',
      orderedQty: 50,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const synced = await syncVaultMirror();
    expect(synced).toBe(true);

    const snapshot = getVaultSnapshot();
    expect(snapshot).not.toBeNull();
    expect(snapshot?.bills.length).toBe(1);
    expect(snapshot?.orderLines.length).toBe(1);

    const meta = getVaultMeta();
    expect(meta).not.toBeNull();
    expect(meta?.billsCount).toBe(1);
    expect(meta?.linesCount).toBe(1);
  });

  it('auto-recovers from localStorage vault if IndexedDB is cleared or empty', async () => {
    // 1. Create data
    const billId = await db.bills.add({
      billNumber: 'BL-RECOVER-99',
      client: 'Grossiste Oran',
      date: '2026-09-12',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await db.orderLines.add({
      billId,
      no: '1',
      reference: 'STYLO-BLEU',
      designation: 'Stylo Bille Bleu',
      orderedQty: 100,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await syncVaultMirror();

    // 2. Simulate complete IndexedDB wipe / eviction
    await db.bills.clear();
    await db.orderLines.clear();
    expect(await db.bills.count()).toBe(0);
    expect(await db.orderLines.count()).toBe(0);

    // 3. Trigger auto-recovery
    const recovered = await autoRecoverFromVaultIfEmpty();
    expect(recovered).toBe(true);

    expect(await db.bills.count()).toBe(1);
    expect(await db.orderLines.count()).toBe(1);

    const recoveredBill = await db.bills.where('billNumber').equals('BL-RECOVER-99').first();
    expect(recoveredBill).toBeDefined();
    expect(recoveredBill?.client).toBe('Grossiste Oran');

    const recoveredLines = await db.orderLines.where('billId').equals(recoveredBill!.id!).toArray();
    expect(recoveredLines.length).toBe(1);
    expect(recoveredLines[0].reference).toBe('STYLO-BLEU');
    expect(recoveredLines[0].orderedQty).toBe(100);
  });

  it('force manual restoreFromVault restores all data', async () => {
    const backup = await exportBackup();
    backup.bills = [
      {
        id: 1,
        billNumber: 'BL-MANUAL-01',
        client: 'Client Alger',
        date: '2026-09-12',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as Bill,
    ];
    backup.orderLines = [
      {
        id: 1,
        billId: 1,
        no: '1',
        reference: 'GOMME-40',
        designation: 'Gomme Blanche',
        orderedQty: 40,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as OrderLine,
    ];

    mockStorage[VAULT_STORAGE_KEY] = JSON.stringify(backup);

    const res = await restoreFromVault();
    expect(res.billsCount).toBe(1);
    expect(res.linesCount).toBe(1);

    expect(await db.bills.count()).toBe(1);
    expect(await db.orderLines.count()).toBe(1);
  });

  it('recovers legacy bills AND their order lines from pointage-db so zero products are lost', async () => {
    const { recoverLegacyBillsFromOldDatabase } = await import('./db');

    // Cleanly delete legacy database first
    await new Promise<void>((resolve) => {
      const delReq = indexedDB.deleteDatabase('pointage-db');
      delReq.onsuccess = delReq.onerror = delReq.onblocked = () => resolve();
    });

    // Setup legacy IndexedDB database
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('pointage-db', 1);
      req.onupgradeneeded = () => {
        const legacyDb = req.result;
        legacyDb.createObjectStore('bills', { keyPath: 'id', autoIncrement: true });
        legacyDb.createObjectStore('orderLines', { keyPath: 'id', autoIncrement: true });
      };
      req.onsuccess = () => {
        const legacyDb = req.result;
        const tx = legacyDb.transaction(['bills', 'orderLines'], 'readwrite');
        const billsStore = tx.objectStore('bills');
        const linesStore = tx.objectStore('orderLines');

        billsStore.add({
          id: 77,
          billNumber: 'BL-LEGACY-777',
          client: 'Client Constantine',
          date: '2026-09-12',
          status: 'active',
          createdAt: new Date().toISOString(),
        });

        linesStore.add({
          id: 101,
          billId: 77,
          no: '1',
          reference: 'CLASSEUR-A4',
          designation: 'Classeur Grand Format A4',
          orderedQty: 25,
          status: 'active',
        });

        tx.oncomplete = () => {
          legacyDb.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });

    const recoveredCount = await recoverLegacyBillsFromOldDatabase();
    expect(recoveredCount).toBe(1);

    const recoveredBill = await db.bills.where('billNumber').equals('BL-LEGACY-777').first();
    expect(recoveredBill).toBeDefined();
    expect(recoveredBill?.client).toBe('Client Constantine');

    // CRITICAL: Verify lines were also recovered and linked to the new bill ID!
    const recoveredLines = await db.orderLines.where('billId').equals(recoveredBill!.id!).toArray();
    expect(recoveredLines.length).toBe(1);
    expect(recoveredLines[0].reference).toBe('CLASSEUR-A4');
    expect(recoveredLines[0].orderedQty).toBe(25);
  });
});

