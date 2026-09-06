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

export function useEntityEvents(client: string | undefined) {
  return useLiveQuery(
    async () => {
      if (!client) return [];
      const trimmed = client.trim().toLowerCase();
      const allBills = await db.bills.toArray();
      const clientBillIds = allBills
        .filter((b) => b.client && b.client.trim().toLowerCase() === trimmed)
        .map((b) => b.id!);
      if (clientBillIds.length === 0) return [];
      return db.countEvents.where('billId').anyOf(clientBillIds).toArray();
    },
    [client],
    []
  );
}

// ---------- Transport Containers (Shared Across Bills of Same Seller/Client) ----------
export function useBillContainers(billId: number | undefined) {
  return useLiveQuery(
    async () => {
      if (billId === undefined) return [];
      const currentBill = await db.bills.get(billId);
      const client = currentBill?.client?.trim();

      // Find all bill IDs belonging to the same client/seller
      let clientBillIds: number[] = [billId];
      if (client) {
        const siblingBills = await db.bills.where('client').equals(client).toArray();
        clientBillIds = Array.from(new Set([...clientBillIds, ...siblingBills.map((b) => b.id!)]));
      }

      const allContainers = await db.transportContainers.toArray();
      const relevant = allContainers.filter((c) => {
        if (client && c.client && c.client.trim().toLowerCase() === client.toLowerCase()) return true;
        if (c.billId && clientBillIds.includes(c.billId)) return true;
        return false;
      });

      // Natural alphanumeric sort: CARTON A, CARTON B, CARTON C...
      relevant.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
      return relevant;
    },
    [billId],
    []
  );
}

export function useEntityContainers(client: string | undefined) {
  return useLiveQuery(
    async () => {
      if (!client) return [];
      const trimmed = client.trim();
      const siblingBills = await db.bills.where('client').equals(trimmed).toArray();
      const clientBillIds = siblingBills.map((b) => b.id!);

      const allContainers = await db.transportContainers.toArray();
      const relevant = allContainers.filter((c) => {
        if (c.client && c.client.trim().toLowerCase() === trimmed.toLowerCase()) return true;
        if (c.billId && clientBillIds.includes(c.billId)) return true;
        return false;
      });

      relevant.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
      return relevant;
    },
    [client],
    []
  );
}

// ---------- Cross-Bill Queries for Same Seller/Client Entity ----------
export function useEntityBills(client: string | undefined) {
  return useLiveQuery(
    async () => {
      if (!client) return [];
      return db.bills.where('client').equals(client.trim()).toArray();
    },
    [client],
    []
  );
}

export function useEntityLines(client: string | undefined) {
  return useLiveQuery(
    async () => {
      if (!client) return [];
      const bills = await db.bills.where('client').equals(client.trim()).toArray();
      const billIds = bills.map((b) => b.id!).filter((id) => id != null);
      if (billIds.length === 0) return [];
      return db.orderLines.where('billId').anyOf(billIds).toArray();
    },
    [client],
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

export async function undoLastBillCount(
  billId: number,
  stage: Stage
): Promise<boolean> {
  const events = await db.countEvents
    .where('billId')
    .equals(billId)
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
    orderLineId: last.orderLineId,
    stage,
    type: 'count_event_undone',
    oldValue: String(last.quantity),
    newValue: null,
    reason: null,
    timestamp: new Date().toISOString(),
  });

  return true;
}

/**
 * Resets all active count events for a specific line and stage back to 0.
 */
export async function resetLineStageCount(
  orderLineId: number,
  stage: Stage
): Promise<number> {
  const events = await db.countEvents
    .where('orderLineId')
    .equals(orderLineId)
    .toArray();
  const activeEvents = events.filter((e) => e.stage === stage && !e.undone);
  if (activeEvents.length === 0) return 0;

  const totalReset = activeEvents.reduce((s, e) => s + e.quantity, 0);

  for (const ev of activeEvents) {
    await db.countEvents.update(ev.id!, { undone: true });
  }

  const sample = activeEvents[0];
  await db.auditEvents.add({
    billId: sample.billId,
    orderLineId,
    stage,
    type: 'count_event_undone',
    oldValue: String(totalReset),
    newValue: '0',
    reason: 'reset_to_zero',
    timestamp: new Date().toISOString(),
  });

  return totalReset;
}

/**
 * Sets the exact counted quantity for a specific line and stage directly.
 * Marks existing active events undone and creates a single event with the target quantity.
 */
export async function setLineStageTotalCount(
  billId: number,
  orderLineId: number,
  stage: Stage,
  targetQty: number,
  outcome: PointageOutcome | null = null,
  note: string | null = null
): Promise<void> {
  const safeTarget = Math.max(0, targetQty);
  await resetLineStageCount(orderLineId, stage);

  if (safeTarget > 0) {
    await addCountEvent(
      billId,
      orderLineId,
      stage,
      safeTarget,
      null,
      outcome,
      note
    );
  }
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
  billId: number,
  client?: string,
  customLabel?: string,
  type: 'carton' | 'chouala' | 'loose' | 'large' = 'carton'
): Promise<TransportContainer> {
  const currentBill = await db.bills.get(billId);
  const resolvedClient = client || currentBill?.client?.trim();

  let existingContainers: TransportContainer[] = [];
  if (resolvedClient) {
    const siblingBills = await db.bills.where('client').equals(resolvedClient).toArray();
    const clientBillIds = Array.from(new Set([billId, ...siblingBills.map((b) => b.id!)]));
    const allContainers = await db.transportContainers.toArray();
    existingContainers = allContainers.filter((c) => {
      if (c.client && c.client.trim().toLowerCase() === resolvedClient.toLowerCase()) return true;
      if (c.billId && clientBillIds.includes(c.billId)) return true;
      return false;
    });
  } else {
    existingContainers = await db.transportContainers.where('billId').equals(billId).toArray();
  }

  const countForType = existingContainers.filter((c) => c.type === type).length;
  let nextLetter = '';
  if (countForType < 26) {
    nextLetter = String.fromCharCode(65 + countForType);
  } else {
    const first = String.fromCharCode(65 + Math.floor(countForType / 26) - 1);
    const second = String.fromCharCode(65 + (countForType % 26));
    nextLetter = `${first}${second}`;
  }

  const defaultPrefix = type === 'chouala' ? 'SAC' : 'CARTON';
  const container: TransportContainer = {
    billId,
    client: resolvedClient,
    label: customLabel || `${defaultPrefix} ${nextLetter}`,
    type,
    createdAt: new Date().toISOString(),
  };

  const id = await db.transportContainers.add(container);
  return { ...container, id };
}

export async function substituteOrderLine(
  originalLineId: number,
  substituteLineId: number,
  clientPaidAdvance: boolean,
  notifyClient: boolean,
  note?: string
): Promise<void> {
  const origLine = await db.orderLines.get(originalLineId);
  const subLine = await db.orderLines.get(substituteLineId);
  if (!origLine || !subLine) return;

  const priceDiff = (subLine.unitPrice || 0) - (origLine.unitPrice || 0);
  const fullNote = [
    `Remplacé par: ${subLine.designation} (Réf: ${subLine.reference || '-'})`,
    `Écart: ${priceDiff >= 0 ? '+' : ''}${priceDiff.toFixed(2)} DA`,
    clientPaidAdvance ? `Client a payé d'avance` : `Paiement à la livraison`,
    notifyClient ? `Mentionné sur bon` : `Remplacement interne`,
    note ? `Note: ${note}` : '',
  ].filter(Boolean).join(' | ');

  await db.orderLines.update(originalLineId, {
    status: 'out_of_stock',
    substitutedById: substituteLineId,
    substitutionNote: fullNote,
    updatedAt: new Date().toISOString(),
  });

  await db.orderLines.update(substituteLineId, {
    substituteForId: originalLineId,
    substitutionNote: `Remplace: ${origLine.designation}`,
    updatedAt: new Date().toISOString(),
  });

  await db.auditEvents.add({
    billId: origLine.billId,
    orderLineId: originalLineId,
    stage: null,
    type: 'product_substituted',
    oldValue: origLine.designation,
    newValue: subLine.designation,
    reason: fullNote,
    timestamp: new Date().toISOString(),
  });
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
