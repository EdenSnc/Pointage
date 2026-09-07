// ============================================================
// POINTAGE — Cross-Bill Stock Reallocation & Shortage Resolution
// Handles urgent stock borrowing (dépannage inter-bons) and
// clean shortage sign-off without touching other customer orders.
// ============================================================

import { db } from './db';
import { sumStageEvents } from './logic';
import type { Bill, OrderLine, Stage, TransportContainer } from './types';

export interface CrossBillPreparedStockOption {
  bill: Bill;
  line: OrderLine;
  preparedQty: number;
  allocatedContainers: string[];
}

/**
 * Normalizes text for loose designation matching if reference/EAN are absent.
 */
function cleanText(t: string | null | undefined): string {
  if (!t) return '';
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Searches active bills in the warehouse for other customers who have
 * prepared stock of this exact same product.
 */
export async function findCrossBillPreparedStock(
  currentBillId: number,
  targetLine: OrderLine
): Promise<CrossBillPreparedStockOption[]> {
  if (!targetLine || !currentBillId) return [];

  const targetRef = targetLine.reference?.trim().toLowerCase();
  const targetEan = targetLine.ean?.trim();
  const targetDesig = cleanText(targetLine.designation);

  if (!targetRef && !targetEan && !targetDesig) return [];

  // 1. Get all other active bills
  const allBills = await db.bills
    .where('status')
    .equals('active')
    .toArray();

  const otherBills = allBills.filter((b) => b.id !== currentBillId);
  if (otherBills.length === 0) return [];

  const otherBillIds = otherBills.map((b) => b.id!);
  const allOtherLines = await db.orderLines
    .where('billId')
    .anyOf(otherBillIds)
    .toArray();

  // 2. Filter lines that match target product
  const matchingLines = allOtherLines.filter((l) => {
    if (l.status === 'cancelled' || l.status === 'removed_by_revision') return false;

    if (targetRef && l.reference && l.reference.trim().toLowerCase() === targetRef) {
      return true;
    }
    if (targetEan && l.ean && l.ean.trim() === targetEan) {
      return true;
    }
    if (targetDesig && cleanText(l.designation) === targetDesig) {
      return true;
    }
    return false;
  });

  if (matchingLines.length === 0) return [];

  const matchingLineIds = matchingLines.map((l) => l.id!);
  const events = await db.countEvents
    .where('orderLineId')
    .anyOf(matchingLineIds)
    .toArray();

  const eventsByLine = new Map<number, typeof events>();
  for (const e of events) {
    const arr = eventsByLine.get(e.orderLineId) || [];
    arr.push(e);
    eventsByLine.set(e.orderLineId, arr);
  }

  // 3. Collect containers map
  const containers = await db.transportContainers
    .where('billId')
    .anyOf(otherBillIds)
    .toArray();
  const containerMap = new Map<number, TransportContainer>();
  for (const c of containers) {
    if (c.id != null) containerMap.set(c.id, c);
  }

  const results: CrossBillPreparedStockOption[] = [];

  for (const line of matchingLines) {
    if (!line.id) continue;
    const parentBill = otherBills.find((b) => b.id === line.billId);
    if (!parentBill) continue;

    const lineEvents = eventsByLine.get(line.id) || [];
    let prepQty = sumStageEvents(lineEvents, 'preparation');
    // If preparation total is 0, check chargement as well
    if (prepQty <= 0) {
      prepQty = sumStageEvents(lineEvents, 'chargement');
    }

    if (prepQty > 0) {
      const containerLabels = new Set<string>();
      for (const e of lineEvents) {
        if (!e.undone && e.quantity > 0 && e.containerId) {
          const cont = containerMap.get(e.containerId);
          if (cont) containerLabels.add(cont.label);
        }
      }

      results.push({
        bill: parentBill,
        line,
        preparedQty: prepQty,
        allocatedContainers: Array.from(containerLabels),
      });
    }
  }

  return results;
}

export interface CrossBillReallocationParams {
  fromBill: Bill;
  fromLine: OrderLine;
  toBill: Bill;
  toLine: OrderLine;
  quantity: number;
  stage: Stage;
  reason?: string;
  operatorName?: string;
}

/**
 * Performs atomic inter-bill transfer of prepared items with audit trail.
 */
export async function executeCrossBillReallocation(
  params: CrossBillReallocationParams
): Promise<{ success: boolean; quantity: number }> {
  const { fromBill, fromLine, toBill, toLine, quantity, stage, reason, operatorName } = params;
  if (quantity <= 0 || !fromBill.id || !fromLine.id || !toBill.id || !toLine.id) {
    return { success: false, quantity: 0 };
  }

  const now = new Date().toISOString();
  const opLabel = operatorName ? `par ${operatorName}` : '';
  const reasonText = reason || 'Dépannage urgent camion au quai';

  // Perform atomic updates across bills in Dexie
  await db.transaction('rw', [db.countEvents, db.orderLines, db.auditEvents, db.bills], async () => {
    // 1. Source Bill (Customer A): Deduct prepared quantity
    await db.countEvents.add({
      billId: fromBill.id!,
      orderLineId: fromLine.id!,
      stage: 'preparation',
      quantity: -quantity,
      containerId: null,
      outcome: null,
      note: `Dépannage: -${quantity} pcs transférées vers ${toBill.client} (${toBill.billNumber}) ${opLabel}`.trim(),
      undone: false,
      createdAt: now,
    });

    await db.orderLines.update(fromLine.id!, {
      reallocatedQty: (fromLine.reallocatedQty || 0) - quantity,
      reallocatedToBillId: toBill.id!,
      reallocationNote: `Dépannage urgent: ${quantity} pcs prélevées pour ${toBill.client} (${toBill.billNumber})`,
      updatedAt: now,
    });

    await db.auditEvents.add({
      billId: fromBill.id!,
      orderLineId: fromLine.id!,
      stage: 'preparation',
      type: 'cross_bill_reallocation',
      oldValue: String(fromLine.orderedQty),
      newValue: `-${quantity} pcs`,
      reason: `Prélèvement dépannage vers ${toBill.client} (${toBill.billNumber}) : ${reasonText} ${opLabel}`.trim(),
      timestamp: now,
    });

    // 2. Target Bill (Customer B): Add quantity into current stage
    await db.countEvents.add({
      billId: toBill.id!,
      orderLineId: toLine.id!,
      stage,
      quantity,
      containerId: null,
      outcome: 'accepted',
      note: `Dépannage: +${quantity} pcs prélevées sur ${fromBill.client} (${fromBill.billNumber}) ${opLabel}`.trim(),
      undone: false,
      createdAt: now,
    });

    await db.orderLines.update(toLine.id!, {
      reallocatedQty: (toLine.reallocatedQty || 0) + quantity,
      reallocatedFromBillId: fromBill.id!,
      reallocationNote: `Dépannage reçu: +${quantity} pcs depuis ${fromBill.client} (${fromBill.billNumber})`,
      updatedAt: now,
    });

    await db.auditEvents.add({
      billId: toBill.id!,
      orderLineId: toLine.id!,
      stage,
      type: 'cross_bill_reallocation',
      oldValue: String(toLine.orderedQty),
      newValue: `+${quantity} pcs`,
      reason: `Réception dépannage depuis ${fromBill.client} (${fromBill.billNumber}) : ${reasonText} ${opLabel}`.trim(),
      timestamp: now,
    });
  });

  return { success: true, quantity };
}

export interface ResolveShortageParams {
  billId: number;
  lineId: number;
  stage: Stage;
  deliveredQty: number;
  missingQty: number;
  operatorName?: string;
  note?: string;
}

/**
 * Formally signs off a line with only remaining warehouse stock,
 * preserving other customer bills intact and logging the shortage.
 */
export async function resolveShortageAsPartialStock(
  params: ResolveShortageParams
): Promise<void> {
  const { billId, lineId, stage, deliveredQty, missingQty, operatorName, note } = params;
  const now = new Date().toISOString();
  const opLabel = operatorName ? `par ${operatorName}` : '';
  const reasonText = note || `Stock entrepôt épuisé : ${deliveredQty} livrées, ${missingQty} manquantes en rupture`;

  await db.transaction('rw', [db.orderLines, db.auditEvents], async () => {
    const updates: Partial<OrderLine> = {
      shortageResolvedAsPartial: true,
      reallocationNote: reasonText,
      updatedAt: now,
    };
    if (deliveredQty === 0) {
      updates.status = 'out_of_stock';
    }

    await db.orderLines.update(lineId, updates);

    await db.auditEvents.add({
      billId,
      orderLineId: lineId,
      stage,
      type: 'shortage_partial_delivery',
      oldValue: `Commandé: ${deliveredQty + missingQty}`,
      newValue: `Livré: ${deliveredQty} (Manque: ${missingQty})`,
      reason: `${reasonText} ${opLabel}`.trim(),
      timestamp: now,
    });
  });
}

/**
 * Restores quantity on Customer A's line when replenishment arrives from supplier.
 */
export async function replenishReallocatedLine(
  billId: number,
  lineId: number,
  replenishQty: number,
  operatorName?: string
): Promise<void> {
  if (replenishQty <= 0) return;
  const now = new Date().toISOString();
  const opLabel = operatorName ? `par ${operatorName}` : '';

  await db.transaction('rw', [db.countEvents, db.orderLines, db.auditEvents], async () => {
    await db.countEvents.add({
      billId,
      orderLineId: lineId,
      stage: 'preparation',
      quantity: replenishQty,
      containerId: null,
      outcome: 'accepted',
      note: `Réapprovisionnement fournisseur suite dépannage ${opLabel}`.trim(),
      undone: false,
      createdAt: now,
    });

    const line = await db.orderLines.get(lineId);
    const newReallocated = (line?.reallocatedQty || 0) + replenishQty;

    await db.orderLines.update(lineId, {
      reallocatedQty: newReallocated >= 0 ? null : newReallocated,
      reallocatedToBillId: newReallocated >= 0 ? null : line?.reallocatedToBillId,
      reallocationNote: newReallocated >= 0 ? null : line?.reallocationNote,
      updatedAt: now,
    });

    await db.auditEvents.add({
      billId,
      orderLineId: lineId,
      stage: 'preparation',
      type: 'quantity_changed',
      oldValue: `Dépanné (-${replenishQty})`,
      newValue: `Réapprovisionné (+${replenishQty})`,
      reason: `Réassort fournisseur reçu ${opLabel}`.trim(),
      timestamp: now,
    });
  });
}
