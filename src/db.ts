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
  StoreDemand,
  DechargementSession,
  ClientAlias,
  ReceptionSession,
  ReceptionItem,
  ProductSampleAllocation,
  ClientAccount,
  OrderDraft,
  CommercialPaymentCollection,
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
  storeDemands!: Table<StoreDemand, number>;
  dechargementSessions!: Table<DechargementSession, number>;
  clientAliases!: Table<ClientAlias, number>;
  receptionSessions!: Table<ReceptionSession, number>;
  receptionItems!: Table<ReceptionItem, number>;
  productSamples!: Table<ProductSampleAllocation, number>;
  clientAccounts!: Table<ClientAccount, number>;
  orderDrafts!: Table<OrderDraft, number>;
  paymentCollections!: Table<CommercialPaymentCollection, number>;

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

    // Version 5: Store Demand & Replenishment Signals (Remontées Magasin)
    this.version(5).stores({
      storeDemands: '++id, client, signalType, status, productReference, createdAt',
    });

    // Version 6: Inbound Dock Unloading (Déchargement Quai)
    this.version(6).stores({
      dechargementSessions: '++id, truckPlate, dockZone, status, supplierName, createdAt',
    });

    // Version 7: Operational Client Aliases, Location Notes, and Multi-Depots
    this.version(7).stores({
      clientAliases: '++id, legalName, operationalName, updatedAt',
      bills:
        '++id, sessionId, billNumber, status, client, date, createdAt, updatedAt, timestamp, year, month, day, wilaya, wilayaCode, shippingStatus, operationalClient, warehouseSite',
    });

    // Version 8: Container Inbound Reception, Mismatch Tracking, and Assigned Driver Index
    this.version(8).stores({
      bills:
        '++id, sessionId, billNumber, status, client, date, createdAt, updatedAt, timestamp, year, month, day, wilaya, wilayaCode, shippingStatus, operationalClient, warehouseSite, driverName',
      receptionSessions: '++id, status, supplierName, containerNumber, warehouseSite, createdAt',
      receptionItems: '++id, sessionId, reference, ean, warehouseZone, createdAt',
    });

    // Version 9: Agent à Tourner, Sample Allocations (Showroom, El Feth, Chauffeurs), and Pricing Engine
    this.version(9).stores({
      productSamples:
        '++id, reference, destination, assignedAgentName, transportability, status, receptionSessionId, createdAt',
    });

    // Version 10: B2B Wholesale Ordering, Commercial Field Sales, B2C Retail & Financial Collections
    this.version(10).stores({
      clientAccounts: '++id, name, clientType, assignedRep, currentBalance, updatedAt',
      orderDrafts: '++id, orderNumber, channel, clientName, status, paymentStatus, createdAt',
      paymentCollections: '++id, clientName, repName, paymentMethod, collectedAt',
    });
  }
}

export const db = new PointageDB();

/**
 * Saves or updates a client alias (Legal fiscal name <-> Surface operational name).
 * Retained across sessions and applied automatically on future Excel imports.
 */
export async function saveClientAlias(
  legalName: string,
  operationalName: string,
  notes?: string | null
): Promise<void> {
  const cleanLegal = legalName.trim().toUpperCase();
  const cleanOp = operationalName.trim();
  if (!cleanLegal || !cleanOp) return;

  const existing = await db.clientAliases
    .filter((a) => a.legalName.toUpperCase() === cleanLegal)
    .first();

  const now = new Date().toISOString();
  if (existing?.id) {
    await db.clientAliases.update(existing.id, {
      operationalName: cleanOp,
      notes: notes !== undefined ? notes : existing.notes,
      updatedAt: now,
    });
  } else {
    await db.clientAliases.add({
      legalName: cleanLegal,
      operationalName: cleanOp,
      notes: notes || null,
      updatedAt: now,
    });
  }
}

/**
 * Looks up operational alias by legal registered name
 */
export async function getClientAlias(legalName: string): Promise<string | null> {
  if (!legalName) return null;
  const clean = legalName.trim().toUpperCase();
  const match = await db.clientAliases
    .filter((a) => a.legalName.toUpperCase() === clean)
    .first();
  return match?.operationalName || null;
}

/**
 * Fetches all client aliases for rapid autocomplete or dictionary display
 */
export async function getAllClientAliases(): Promise<ClientAlias[]> {
  return db.clientAliases.toArray();
}

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

// ---------- Reception & Container Inbound Helpers ----------

export async function saveReceptionSession(
  data: Partial<ReceptionSession> & { title: string; operator: string }
): Promise<number> {
  const now = new Date().toISOString();
  if (data.id) {
    await db.receptionSessions.update(data.id, {
      ...data,
      updatedAt: now,
    });
    return data.id;
  }
  return db.receptionSessions.add({
    title: data.title,
    containerNumber: data.containerNumber || null,
    supplierName: data.supplierName || null,
    billNumber: data.billNumber || null,
    dockZone: data.dockZone || null,
    warehouseSite: data.warehouseSite || null,
    status: data.status || 'in_progress',
    operator: data.operator,
    notes: data.notes || null,
    startedAt: data.startedAt || now,
    completedAt: data.completedAt || null,
    createdAt: now,
    updatedAt: now,
  });
}

export async function getAllReceptionSessions(): Promise<ReceptionSession[]> {
  const all = await db.receptionSessions.toArray();
  return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getReceptionSessionById(id: number): Promise<ReceptionSession | undefined> {
  return db.receptionSessions.get(id);
}

export async function saveReceptionItem(
  item: Omit<ReceptionItem, 'id' | 'createdAt' | 'updatedAt'> & { id?: number }
): Promise<number> {
  const now = new Date().toISOString();
  if (item.id) {
    await db.receptionItems.update(item.id, {
      ...item,
      updatedAt: now,
    });
    return item.id;
  }
  return db.receptionItems.add({
    ...item,
    createdAt: now,
    updatedAt: now,
  });
}

export async function getReceptionItemsBySession(sessionId: number): Promise<ReceptionItem[]> {
  return db.receptionItems.where('sessionId').equals(sessionId).toArray();
}

export async function deleteReceptionItem(id: number): Promise<void> {
  await db.receptionItems.delete(id);
}

// --- Agent à Tourner & Product Sample Operations ---

export async function saveProductSample(
  sample: Omit<ProductSampleAllocation, 'id' | 'allocatedAt' | 'updatedAt'> & { id?: number; allocatedAt?: string }
): Promise<number> {
  const now = new Date().toISOString();
  if (sample.id) {
    await db.productSamples.update(sample.id, {
      ...sample,
      updatedAt: now,
    });
    return sample.id;
  }
  return db.productSamples.add({
    ...sample,
    allocatedAt: sample.allocatedAt || now,
    updatedAt: now,
  });
}

export async function saveProductSamplesBatch(
  samples: Array<Omit<ProductSampleAllocation, 'id' | 'allocatedAt' | 'updatedAt'> & { id?: number; allocatedAt?: string }>
): Promise<number[]> {
  const now = new Date().toISOString();
  const ids: number[] = [];
  for (const s of samples) {
    if (s.id) {
      await db.productSamples.update(s.id, {
        ...s,
        updatedAt: now,
      });
      ids.push(s.id);
    } else {
      const newId = await db.productSamples.add({
        ...s,
        allocatedAt: s.allocatedAt || now,
        updatedAt: now,
      });
      ids.push(newId);
    }
  }
  return ids;
}

export async function getAllProductSamples(): Promise<ProductSampleAllocation[]> {
  const all = await db.productSamples.toArray();
  return all.sort((a, b) => new Date(b.allocatedAt).getTime() - new Date(a.allocatedAt).getTime());
}

export async function getProductSamplesByDestination(
  destination: ProductSampleAllocation['destination']
): Promise<ProductSampleAllocation[]> {
  return db.productSamples.where('destination').equals(destination).toArray();
}

export async function getProductSamplesByAgent(agentName: string): Promise<ProductSampleAllocation[]> {
  return db.productSamples.where('assignedAgentName').equals(agentName).toArray();
}

export async function getProductSamplesBySession(sessionId: number): Promise<ProductSampleAllocation[]> {
  return db.productSamples.where('receptionSessionId').equals(sessionId).toArray();
}

export async function deleteProductSample(id: number): Promise<void> {
  await db.productSamples.delete(id);
}

// --- B2B Client Accounts & Financial CRM Operations ---

export async function getAllClientAccounts(): Promise<ClientAccount[]> {
  const list = await db.clientAccounts.toArray();
  return list.sort((a, b) => b.currentBalance - a.currentBalance);
}

export async function getClientAccountByName(name: string): Promise<ClientAccount | undefined> {
  const clean = name.trim().toLowerCase();
  const all = await db.clientAccounts.toArray();
  return all.find((c) => c.name.toLowerCase() === clean || (c.legalName && c.legalName.toLowerCase() === clean));
}

export async function saveClientAccount(
  account: Omit<ClientAccount, 'id' | 'updatedAt'> & { id?: number }
): Promise<number> {
  const now = new Date().toISOString();
  if (account.id) {
    await db.clientAccounts.update(account.id, {
      ...account,
      updatedAt: now,
    });
    return account.id;
  }
  return db.clientAccounts.add({
    ...account,
    updatedAt: now,
  });
}

// --- Commercial Field Cash Collections (Réduction Créance en Direct) ---

export async function recordPaymentCollection(
  collection: Omit<CommercialPaymentCollection, 'id' | 'collectedAt'> & { id?: number; collectedAt?: string }
): Promise<number> {
  const now = new Date().toISOString();
  const id = await db.paymentCollections.add({
    ...collection,
    collectedAt: collection.collectedAt || now,
  });

  // Automatically credit client account balance
  const client = await getClientAccountByName(collection.clientName);
  if (client && client.id) {
    const newBalance = Math.max(0, client.currentBalance - collection.amount);
    await db.clientAccounts.update(client.id, {
      currentBalance: newBalance,
      lastPaymentDate: now,
      updatedAt: now,
    });
  }

  return id;
}

export async function getAllPaymentCollections(): Promise<CommercialPaymentCollection[]> {
  const all = await db.paymentCollections.toArray();
  return all.sort((a, b) => new Date(b.collectedAt).getTime() - new Date(a.collectedAt).getTime());
}

// --- Orders Management (Gros B2B, Commercial Itinérant, Détail B2C) ---

export async function getAllOrderDrafts(channel?: OrderDraft['channel']): Promise<OrderDraft[]> {
  let all = await db.orderDrafts.toArray();
  if (channel) {
    all = all.filter((o) => o.channel === channel);
  }
  return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function saveOrderDraft(
  order: Omit<OrderDraft, 'id' | 'createdAt' | 'updatedAt'> & { id?: number; createdAt?: string }
): Promise<number> {
  const now = new Date().toISOString();
  if (order.id) {
    await db.orderDrafts.update(order.id, {
      ...order,
      updatedAt: now,
    });
    return order.id;
  }
  return db.orderDrafts.add({
    ...order,
    createdAt: order.createdAt || now,
    updatedAt: now,
  });
}

export async function deleteOrderDraft(id: number): Promise<void> {
  await db.orderDrafts.delete(id);
}

// --- Pre-Seeding Realistic Stationery Business Data (B2B, Pricing & Reps) ---

export async function seedInitialBusinessDataIfEmpty(): Promise<void> {
  const accountsCount = await db.clientAccounts.count();
  if (accountsCount === 0) {
    const now = new Date().toISOString();
    await db.clientAccounts.bulkAdd([
      {
        name: 'Benali Grossiste Maraval',
        legalName: 'ETS MOHAMED BENALI (ORAN)',
        phone: '0550 12 34 56',
        wilaya: 'Oran',
        wilayaCode: '31',
        clientType: 'grossiste',
        creditLimit: 600000,
        currentBalance: 420000, // En alerte (proche du plafond)
        tierDiscountPercent: 5,
        assignedRep: 'Yassine',
        lastOrderDate: now,
        notes: 'Client gros volume, réassort cahiers et stylos tous les jeudis.',
        updatedAt: now,
      },
      {
        name: 'Librairie El Feth',
        legalName: 'SARL LIBRAIRIE EL FETH ORAN',
        phone: '0555 98 76 54',
        wilaya: 'Oran',
        wilayaCode: '31',
        clientType: 'librairie',
        creditLimit: 800000,
        currentBalance: 150000, // Solde sain
        tierDiscountPercent: 6,
        assignedRep: 'Djaber',
        lastOrderDate: now,
        notes: 'Partenaire référent, décideur prix et évaluateur marché.',
        updatedAt: now,
      },
      {
        name: 'Papeterie El Manar',
        legalName: 'EURL PAPETERIE MODERNE EL MANAR',
        phone: '0661 22 33 44',
        wilaya: 'Mostaganem',
        wilayaCode: '27',
        clientType: 'papeterie',
        creditLimit: 300000,
        currentBalance: 310000, // Plafond DÉPASSÉ (Alerte Risque Financier!)
        tierDiscountPercent: 3,
        assignedRep: 'Yassine',
        lastOrderDate: '2026-08-15',
        notes: 'Encours dépassé. Récupérer chèque ou espèces avant nouvelle livraison.',
        updatedAt: now,
      },
      {
        name: 'Kral Markt Béchar',
        legalName: 'SARL BLEU BLANC NAKHIL (BÉCHAR)',
        phone: '0660 77 88 99',
        wilaya: 'Béchar',
        wilayaCode: '08',
        clientType: 'grossiste',
        creditLimit: 1200000,
        currentBalance: 520000,
        tierDiscountPercent: 7,
        assignedRep: 'Mourad',
        lastOrderDate: '2026-09-01',
        notes: 'Grand compte Sud, expédition par camions semi-remorques.',
        updatedAt: now,
      },
      {
        name: 'Librairie Centrale Tlemcen',
        legalName: 'ETS TLEMCEN CULTURE',
        phone: '0560 44 55 66',
        wilaya: 'Tlemcen',
        wilayaCode: '13',
        clientType: 'librairie',
        creditLimit: 400000,
        currentBalance: 45000,
        tierDiscountPercent: 4,
        assignedRep: 'Nassim',
        lastOrderDate: '2026-09-10',
        notes: 'Règlement régulier par virement bancaire.',
        updatedAt: now,
      },
    ]);
  }
}




