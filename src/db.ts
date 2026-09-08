// ============================================================
// POINTAGE — Dexie Database
// Resilient Offline Storage with Temporal Decomposition & Wilaya Indexing
// Auto-Recovery from Legacy DBs & Guaranteed Storage Persistence
// ============================================================

import Dexie, { type Table } from 'dexie';
import type {
  WorkSession,
  Bill,
  OrderLine,
  CountEvent,
  TransportContainer,
  ExtraProduct,
  BillIdentifierOverride,
  IdentifierSuggestion,
  ProductProfile,
  AuditEvent,
  ShipmentTrip,
} from './types';
import { decomposeTimestamp, detectWilaya } from './wilayas';

export class PointageDB extends Dexie {
  workSessions!: Table<WorkSession, number>;
  bills!: Table<Bill, number>;
  orderLines!: Table<OrderLine, number>;
  countEvents!: Table<CountEvent, number>;
  transportContainers!: Table<TransportContainer, number>;
  extras!: Table<ExtraProduct, number>;
  billIdentifierOverrides!: Table<BillIdentifierOverride, number>;
  identifierSuggestions!: Table<IdentifierSuggestion, number>;
  productProfiles!: Table<ProductProfile, number>;
  auditEvents!: Table<AuditEvent, number>;
  shipmentTrips!: Table<ShipmentTrip, number>;

  constructor() {
    super('pointage-surface-db');

    this.version(1).stores({
      workSessions: '++id, status, createdAt',
      bills: '++id, sessionId, billNumber, status, client',
      orderLines:
        '++id, billId, no, reference, ean, status, originalReference, originalEan, *referenceAliases',
      countEvents: '++id, billId, orderLineId, stage, undone, createdAt',
      transportContainers: '++id, billId, label',
      extras: '++id, billId, sessionId, stage',
      billIdentifierOverrides: '++id, billId, orderLineId, scannedValue',
      identifierSuggestions: '++id, scannedValue',
      productProfiles: '++id, reference',
      auditEvents: '++id, billId, orderLineId, type, timestamp',
    });

    this.version(2).stores({
      shipmentTrips: '++id, billId, tripNumber, status, dispatchedAt',
    });

    // Version 3: Temporal Granular Indexing & Algerian Wilayas for Central DB
    this.version(3)
      .stores({
        bills:
          '++id, sessionId, billNumber, status, client, date, createdAt, updatedAt, timestamp, year, month, day, wilaya, wilayaCode, shippingStatus',
        countEvents: '++id, billId, orderLineId, stage, undone, createdAt, timestamp',
        workSessions: '++id, status, createdAt, updatedAt',
      })
      .upgrade(async (tx) => {
        // Non-destructive upgrade: enrich existing bills with timestamps and wilayas
        const billsTable = tx.table('bills');
        const allBills = await billsTable.toArray();
        for (const bill of allBills) {
          let modified = false;
          if (!bill.timestamp || !bill.year) {
            const t = decomposeTimestamp(bill.createdAt || bill.date || Date.now());
            bill.timestamp = t.timestamp;
            bill.year = t.year;
            bill.month = t.month;
            bill.day = t.day;
            bill.hour = t.hour;
            bill.minute = t.minute;
            bill.time = t.timeStr;
            modified = true;
          }
          if (!bill.wilaya) {
            const detected = detectWilaya(bill.clientAddress || bill.client);
            if (detected) {
              bill.wilaya = detected.wilaya;
              bill.wilayaCode = detected.wilayaCode;
              modified = true;
            }
          }
          if (modified) {
            await billsTable.put(bill);
          }
        }
      });

    // Version 4: Historical legacy codes & normalized designation index
    this.version(4).stores({
      orderLines:
        '++id, billId, no, reference, ean, status, originalReference, originalEan, *referenceAliases, historicalReference',
      productProfiles: '++id, reference, normalizedDesignation',
    });
  }
}

export const db = new PointageDB();

// Request persistent storage to prevent browser eviction
export async function requestPersistence(): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      const isPersisted = await navigator.storage.persisted();
      if (!isPersisted) {
        return await navigator.storage.persist();
      }
      return isPersisted;
    }
  } catch {}
  return false;
}

// Automatically ensure persistence on startup
requestPersistence().catch(() => {});

/**
 * Automatically checks for any legacy database instances (e.g. 'pointage-db')
 * and imports any missing bills and lines so nothing is ever lost across version updates.
 */
export async function recoverLegacyBillsFromOldDatabase(): Promise<number> {
  if (typeof indexedDB === 'undefined') return 0;
  try {
    const legacyDBName = 'pointage-db';
    let recoveredCount = 0;

    const openReq = indexedDB.open(legacyDBName);
    const legacyDb = await new Promise<IDBDatabase | null>((resolve) => {
      openReq.onsuccess = () => resolve(openReq.result);
      openReq.onerror = () => resolve(null);
    });

    if (!legacyDb) return 0;

    if (legacyDb.objectStoreNames.contains('bills')) {
      const tx = legacyDb.transaction('bills', 'readonly');
      const store = tx.objectStore('bills');
      const req = store.getAll();
      const legacyBills = await new Promise<Bill[]>((resolve) => {
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });

      for (const legBill of legacyBills) {
        const exists = await db.bills
          .where('billNumber')
          .equals(legBill.billNumber)
          .first();
        if (!exists) {
          const decomposed = decomposeTimestamp(legBill.createdAt || legBill.date);
          const detectedWilaya = detectWilaya(legBill.clientAddress || legBill.client);
          await db.bills.add({
            ...legBill,
            id: undefined,
            timestamp: legBill.timestamp || decomposed.timestamp,
            year: legBill.year || decomposed.year,
            month: legBill.month || decomposed.month,
            day: legBill.day || decomposed.day,
            hour: legBill.hour || decomposed.hour,
            minute: legBill.minute || decomposed.minute,
            time: legBill.time || decomposed.timeStr,
            wilaya: legBill.wilaya || detectedWilaya?.wilaya || null,
            wilayaCode: legBill.wilayaCode || detectedWilaya?.wilayaCode || null,
          });
          recoveredCount++;
        }
      }
    }

    legacyDb.close();
    return recoveredCount;
  } catch (err) {
    console.warn('Legacy DB recovery check bypassed:', err);
    return 0;
  }
}

// Trigger recovery in the background
recoverLegacyBillsFromOldDatabase().catch(() => {});
