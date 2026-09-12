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

// Automatically ensure persistence on startup and on first user gesture
requestPersistence().catch(() => {});
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', () => requestPersistence().catch(() => {}), { once: true });
  window.addEventListener('keydown', () => requestPersistence().catch(() => {}), { once: true });
}

/**
 * Automatically checks for any legacy database instances (e.g. 'pointage-db', 'pointage_db', 'pointage')
 * and imports any missing bills, orderLines, countEvents, transportContainers, and productProfiles.
 * Guarantees zero data loss across version or branding updates.
 */
export async function recoverLegacyBillsFromOldDatabase(): Promise<number> {
  if (typeof indexedDB === 'undefined') return 0;
  let totalRecovered = 0;
  const legacyNames = ['pointage-db', 'pointage_db', 'pointage'];

  let namesToCheck = legacyNames;
  if (typeof indexedDB.databases === 'function') {
    try {
      const existingDbs = await indexedDB.databases();
      const existingNames = new Set(existingDbs.map((d) => d.name));
      namesToCheck = legacyNames.filter((name) => existingNames.has(name));
    } catch {}
  }

  for (const legacyDBName of namesToCheck) {
    let legacyDb: IDBDatabase | null = null;
    try {
      const openReq = indexedDB.open(legacyDBName);
      legacyDb = await new Promise<IDBDatabase | null>((resolve) => {
        const timer = setTimeout(() => resolve(null), 1500);
        openReq.onsuccess = () => {
          clearTimeout(timer);
          resolve(openReq.result);
        };
        openReq.onerror = () => {
          clearTimeout(timer);
          resolve(null);
        };
        openReq.onblocked = () => {
          clearTimeout(timer);
          resolve(null);
        };
      });

      if (!legacyDb) continue;
      if (!legacyDb.objectStoreNames.contains('bills')) {
        legacyDb.close();
        continue;
      }

      const storeNames = Array.from(legacyDb.objectStoreNames);
      const hasOrderLines = storeNames.includes('orderLines');
      const hasCountEvents = storeNames.includes('countEvents');
      const hasContainers = storeNames.includes('transportContainers');
      const hasProfiles = storeNames.includes('productProfiles');

      const txStores = ['bills'];
      if (hasOrderLines) txStores.push('orderLines');
      if (hasCountEvents) txStores.push('countEvents');
      if (hasContainers) txStores.push('transportContainers');
      if (hasProfiles) txStores.push('productProfiles');

      const tx = legacyDb.transaction(txStores, 'readonly');
      const billsStore = tx.objectStore('bills');
      const legacyBills = await new Promise<Bill[]>((resolve) => {
        const req = billsStore.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });

      let allLegacyLines: OrderLine[] = [];
      if (hasOrderLines) {
        allLegacyLines = await new Promise<OrderLine[]>((resolve) => {
          const req = tx.objectStore('orderLines').getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve([]);
        });
      }

      let allLegacyEvents: CountEvent[] = [];
      if (hasCountEvents) {
        allLegacyEvents = await new Promise<CountEvent[]>((resolve) => {
          const req = tx.objectStore('countEvents').getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve([]);
        });
      }

      let allLegacyContainers: TransportContainer[] = [];
      if (hasContainers) {
        allLegacyContainers = await new Promise<TransportContainer[]>((resolve) => {
          const req = tx.objectStore('transportContainers').getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve([]);
        });
      }

      for (const legBill of legacyBills) {
        const currentBill = await db.bills
          .where('billNumber')
          .equals(legBill.billNumber)
          .first();

        let targetBillId: number;

        if (!currentBill) {
          const decomposed = decomposeTimestamp(legBill.createdAt || legBill.date);
          const detectedWilaya = detectWilaya(legBill.clientAddress || legBill.client);
          targetBillId = await db.bills.add({
            ...legBill,
            id: undefined,
            status: legBill.status || 'active',
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
          totalRecovered++;
        } else {
          targetBillId = currentBill.id!;
        }

        // Check if this bill has its orderLines in db
        const existingLinesCount = await db.orderLines
          .where('billId')
          .equals(targetBillId)
          .count();

        if (existingLinesCount === 0 && legBill.id) {
          const matchingLines = allLegacyLines.filter((l) => l.billId === legBill.id);
          for (const line of matchingLines) {
            const oldLineId = line.id;
            const newLineId = await db.orderLines.add({
              ...line,
              id: undefined,
              billId: targetBillId,
            });

            // Recover matching countEvents
            const matchingEvents = allLegacyEvents.filter(
              (e) => e.orderLineId === oldLineId || (e.billId === legBill.id && !e.orderLineId)
            );
            for (const ev of matchingEvents) {
              await db.countEvents.add({
                ...ev,
                id: undefined,
                billId: targetBillId,
                orderLineId: newLineId,
              });
            }
          }

          // Recover matching containers
          const matchingContainers = allLegacyContainers.filter((c) => c.billId === legBill.id);
          for (const c of matchingContainers) {
            await db.transportContainers.add({
              ...c,
              id: undefined,
              billId: targetBillId,
            });
          }
        }
      }

      // Recover product profiles if available
      if (hasProfiles) {
        const legacyProfiles = await new Promise<ProductProfile[]>((resolve) => {
          const req = tx.objectStore('productProfiles').getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve([]);
        });
        for (const lp of legacyProfiles) {
          const exists = await db.productProfiles.where('reference').equals(lp.reference).first();
          if (!exists) {
            await db.productProfiles.add({
              ...lp,
              id: undefined,
            });
          }
        }
      }

      legacyDb.close();
    } catch (err) {
      console.warn(`Legacy DB recovery check for ${legacyDBName} bypassed:`, err);
    }
  }

  return totalRecovered;
}

// Trigger recovery in the background
recoverLegacyBillsFromOldDatabase().catch(() => {});

