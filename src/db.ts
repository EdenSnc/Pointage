// ============================================================
// POINTAGE — Dexie Database
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
} from './types';

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

  constructor() {
    super('pointage-db');

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
  }
}

export const db = new PointageDB();

// Request persistent storage
export async function requestPersistence(): Promise<boolean> {
  if (navigator.storage && navigator.storage.persist) {
    return navigator.storage.persist();
  }
  return false;
}
