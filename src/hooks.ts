// ============================================================
// POINTAGE — React Hooks for DB operations
// ============================================================

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import type {
  OrderLine,
  TransportContainer,
  Stage,
  AuditEvent,
  LineStatus,
  PointageOutcome,
  ChangeReason,
  BillIdentifierOverride,
  ProductProfile,
} from './types';
import { smartSearchScore } from './logic';

// ---------- Session ----------
export function useActiveSession() {
  return useLiveQuery(() =>
    db.workSessions.where('status').equals('active').first()
  );
}

// ---------- Bills ----------
export function useSessionBills(sessionId: number | undefined) {
  return useLiveQuery(
    () =>
      sessionId !== undefined
        ? db.bills.where('sessionId').equals(sessionId).toArray()
        : [],
    [sessionId],
    []
  );
}

export function useBill(billId: number | undefined) {
  return useLiveQuery(
    () => (billId !== undefined ? db.bills.get(billId) : undefined),
    [billId]
  );
}

// ---------- Order Lines ----------
export function useBillLines(billId: number | undefined) {
  return useLiveQuery(
    () =>
      billId !== undefined
        ? db.orderLines.where('billId').equals(billId).toArray()
        : [],
    [billId],
    []
  );
}

export function useAllSessionLines(sessionId: number | undefined) {
  return useLiveQuery(
    async () => {
      if (!sessionId) return [];
      const bills = await db.bills
        .where('sessionId')
        .equals(sessionId)
        .toArray();
      const billIds = bills.map((b) => b.id!);
      if (billIds.length === 0) return [];
      return db.orderLines.where('billId').anyOf(billIds).toArray();
    },
    [sessionId],
    []
  );
}

export function useOrderLine(lineId: number | undefined) {
  return useLiveQuery(
    () => (lineId !== undefined ? db.orderLines.get(lineId) : undefined),
    [lineId]
  );
}

// ---------- Count Events ----------
export function useLineEvents(orderLineId: number | undefined) {
  return useLiveQuery(
    () =>
      orderLineId !== undefined
        ? db.countEvents
            .where('orderLineId')
            .equals(orderLineId)
            .toArray()
        : [],
    [orderLineId],
    []
  );
}

export function useBillEvents(billId: number | undefined) {
  return useLiveQuery(
    () =>
      billId !== undefined
        ? db.countEvents.where('billId').equals(billId).toArray()
        : [],
    [billId],
    []
  );
}

// ---------- Transport Containers ----------
export function useBillContainers(billId: number | undefined) {
  return useLiveQuery(
    () =>
      billId !== undefined
        ? db.transportContainers
            .where('billId')
            .equals(billId)
            .toArray()
        : [],
    [billId],
    []
  );
}

// ---------- Extras ----------
export function useBillExtras(billId: number | undefined) {
  return useLiveQuery(
    () =>
      billId !== undefined
        ? db.extras.where('billId').equals(billId).toArray()
        : [],
    [billId],
    []
  );
}

export function useSessionExtras(sessionId: number | undefined) {
  return useLiveQuery(
    () =>
      sessionId !== undefined
        ? db.extras.where('sessionId').equals(sessionId).toArray()
        : [],
    [sessionId],
    []
  );
}

// ---------- Audit ----------
export function useBillAudit(billId: number | undefined) {
  return useLiveQuery(
    () =>
      billId !== undefined
        ? db.auditEvents.where('billId').equals(billId).toArray()
        : [],
    [billId],
    []
  );
}

// ---------- Identifier Overrides ----------
export function useBillOverrides(billId: number | undefined) {
  return useLiveQuery(
    () =>
      billId !== undefined
        ? db.billIdentifierOverrides
            .where('billId')
            .equals(billId)
            .toArray()
        : [],
    [billId],
    []
  );
}

export function useAllSessionOverrides(sessionId: number | undefined) {
  return useLiveQuery(
    async () => {
      if (!sessionId) return [];
      const bills = await db.bills
        .where('sessionId')
        .equals(sessionId)
        .toArray();
      const billIds = bills.map((b) => b.id!);
      if (billIds.length === 0) return [];
      return db.billIdentifierOverrides.where('billId').anyOf(billIds).toArray();
    },
    [sessionId],
    []
  );
}

// ---------- Product Profiles ----------
export function useProductProfile(reference: string | null | undefined) {
  return useLiveQuery(
    () =>
      reference
        ? db.productProfiles.where('reference').equals(reference).first()
        : undefined,
    [reference]
  );
}

// ---------- Actions ----------

export async function addCountEvent(
  billId: number,
  orderLineId: number,
  stage: Stage,
  quantity: number,
  containerId: number | null = null,
  outcome: PointageOutcome | null = null,
  note: string | null = null
): Promise<number> {
  return db.countEvents.add({
    billId,
    orderLineId,
    stage,
    quantity,
    containerId,
    outcome,
    note: note?.trim() || null,
    undone: false,
    createdAt: new Date().toISOString(),
  });
}


export async function undoLastCount(
  orderLineId: number,
  stage: Stage
): Promise<boolean> {
  const events = await db.countEvents
    .where('orderLineId')
    .equals(orderLineId)
    .toArray();
  const stageEvents = events
    .filter((e) => e.stage === stage && !e.undone)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (stageEvents.length === 0) return false;

  const last = stageEvents[0];
  await db.countEvents.update(last.id!, { undone: true });

  // Audit
  await db.auditEvents.add({
    billId: last.billId,
    orderLineId,
    stage,
    type: 'count_event_undone',
    oldValue: String(last.quantity),
    newValue: null,
    reason: null,
    timestamp: new Date().toISOString(),
  });

  return true;
}

export async function updateOrderLineField(
  lineId: number,
  field: string,
  oldVal: string | number | null,
  newVal: string | number | null,
  reason: ChangeReason | string = 'other'
): Promise<void> {
  const line = await db.orderLines.get(lineId);
  if (!line) return;

  const updates: Partial<OrderLine> = { [field]: newVal, updatedAt: new Date().toISOString() };
  await db.orderLines.update(lineId, updates);

  let auditType: AuditEvent['type'] = 'quantity_changed';
  if (field === 'orderedQty') auditType = 'quantity_changed';
  else if (field === 'reference') auditType = 'reference_corrected';
  else if (field === 'ean') auditType = 'ean_corrected';
  else if (field === 'designation') auditType = 'designation_corrected';
  else if (field === 'no') auditType = 'no_corrected';
  else if (field === 'page') auditType = 'page_corrected';
  else if (field === 'status') auditType = 'status_changed';

  await db.auditEvents.add({
    billId: line.billId,
    orderLineId: lineId,
    stage: null,
    type: auditType,
    oldValue: oldVal != null ? String(oldVal) : null,
    newValue: newVal != null ? String(newVal) : null,
    reason: String(reason),
    timestamp: new Date().toISOString(),
  });
}

export async function updateLineStatus(
  lineId: number,
  status: LineStatus,
  reason?: string
): Promise<void> {
  const line = await db.orderLines.get(lineId);
  if (!line) return;

  await db.orderLines.update(lineId, {
    status,
    updatedAt: new Date().toISOString(),
  });

  let auditType: AuditEvent['type'] = 'status_changed';
  if (status === 'out_of_stock') auditType = 'line_out_of_stock';
  else if (status === 'cancelled') auditType = 'line_cancelled';
  else if (status === 'not_found') auditType = 'line_not_found';
  else if (status === 'removed_by_revision') auditType = 'line_removed_by_revision';
  else if (status === 'active') auditType = 'line_reactivated';


  await db.auditEvents.add({
    billId: line.billId,
    orderLineId: lineId,
    stage: null,
    type: auditType,
    oldValue: line.status,
    newValue: status,
    reason: reason || null,
    timestamp: new Date().toISOString(),
  });
}

export async function createTransportContainer(
  billId: number
): Promise<TransportContainer> {
  const existing = await db.transportContainers
    .where('billId')
    .equals(billId)
    .toArray();

  const cartonCount = existing.filter((c) => c.type === 'carton').length;
  const nextLetter = String.fromCharCode(65 + cartonCount); // A, B, C...

  const container: TransportContainer = {
    billId,
    label: `CARTON ${nextLetter}`,
    type: 'carton',
    createdAt: new Date().toISOString(),
  };

  const id = await db.transportContainers.add(container);
  return { ...container, id };
}


export async function addExtra(
  sessionId: number,
  billId: number | null,
  stage: Stage,
  data: {
    scannedEan?: string;
    reference?: string;
    designation?: string;
    quantity: number;
  }
): Promise<number> {
  return db.extras.add({
    billId,
    sessionId,
    scannedEan: data.scannedEan || null,
    reference: data.reference || null,
    designation: data.designation || null,
    quantity: data.quantity,
    stage,
    createdAt: new Date().toISOString(),
  });
}

export async function addIdentifierOverride(
  billId: number,
  orderLineId: number,
  scannedValue: string,
  fieldType: 'ean' | 'reference'
): Promise<void> {
  await db.billIdentifierOverrides.add({
    billId,
    orderLineId,
    scannedValue,
    fieldType,
    createdAt: new Date().toISOString(),
  });
}

export async function addIdentifierSuggestion(
  scannedValue: string,
  fieldType: 'ean' | 'reference',
  line: OrderLine
): Promise<void> {
  await db.identifierSuggestions.add({
    scannedValue,
    fieldType,
    targetReference: line.reference,
    targetEan: line.ean,
    targetDesignation: line.designation,
    createdAt: new Date().toISOString(),
  });
}

export async function saveProductProfile(
  reference: string,
  data: Partial<ProductProfile>
): Promise<void> {
  const existing = await db.productProfiles
    .where('reference')
    .equals(reference)
    .first();
  if (existing) {
    await db.productProfiles.update(existing.id!, {
      ...data,
      updatedAt: new Date().toISOString(),
    });
  } else {
    await db.productProfiles.add({
      reference,
      outerPackSize: data.outerPackSize ?? null,
      innerPackSize: data.innerPackSize ?? null,
      warehouseZone: data.warehouseZone ?? null,
      updatedAt: new Date().toISOString(),
    });
  }
}

// ---------- Search ----------
export function searchLines(
  lines: OrderLine[],
  query: string,
  mode: 'smart' | 'no' | 'ref' | 'ean' | 'name',
  billId?: number,
  overrides?: BillIdentifierOverride[]
): OrderLine[] {
  const q = query.trim().toLowerCase();
  if (!q) return lines;

  const cleanQ = q.replace(/[^a-z0-9]/gi, '');

  if (mode === 'no') {
    return lines.filter((l) => l.no === q);
  }
  if (mode === 'ref') {
    return lines.filter(
      (l) =>
        l.reference?.toLowerCase().includes(q) ||
        l.originalReference?.toLowerCase().includes(q) ||
        (cleanQ.length >= 2 && (
          (l.reference && l.reference.toLowerCase().replace(/[^a-z0-9]/gi, '').includes(cleanQ)) ||
          (l.originalReference && l.originalReference.toLowerCase().replace(/[^a-z0-9]/gi, '').includes(cleanQ))
        )) ||
        l.referenceAliases.some((a) => a.toLowerCase().includes(q))
    );
  }
  if (mode === 'ean') {
    // Also check overrides
    const overrideLineIds = (overrides || [])
      .filter((o) => (
        o.scannedValue.toLowerCase().includes(q) ||
        (cleanQ.length >= 3 && o.scannedValue.replace(/[^a-z0-9]/gi, '').includes(cleanQ))
      ) && o.fieldType === 'ean')
      .map((o) => o.orderLineId);

    return lines.filter(
      (l) =>
        l.ean?.toLowerCase().includes(q) ||
        l.originalEan?.toLowerCase().includes(q) ||
        (cleanQ.length >= 3 && (
          (l.ean && l.ean.replace(/[^a-z0-9]/gi, '').includes(cleanQ)) ||
          (l.originalEan && l.originalEan.replace(/[^a-z0-9]/gi, '').includes(cleanQ))
        )) ||
        overrideLineIds.includes(l.id!)
    );
  }
  if (mode === 'name') {
    return lines.filter((l) =>
      l.designation.toLowerCase().includes(q)
    );
  }

  // SMART mode
  const scored = lines
    .map((l) => ({
      line: l,
      score: smartSearchScore(l, q, billId),
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => a.score - b.score);

  // Also check overrides for smart mode
  if (overrides) {
    const overrideLineIds = overrides
      .filter((o) => o.scannedValue.toLowerCase() === q)
      .map((o) => o.orderLineId);
    if (overrideLineIds.length > 0) {
      const overrideLines = lines.filter(
        (l) =>
          overrideLineIds.includes(l.id!) &&
          !scored.some((s) => s.line.id === l.id)
      );
      // Insert at priority 6.5 (between alias and designation)
      const insertIdx = scored.findIndex((s) => s.score > 6);
      const items = overrideLines.map((l) => ({ line: l, score: 6.5 }));
      scored.splice(insertIdx >= 0 ? insertIdx : scored.length, 0, ...items);
    }
  }

  return scored.map((s) => s.line);
}
