// ============================================================
// POINTAGE — Operator Roster & Stage Accountability System
// 100% Offline, Zero friction for warehouse floor workers
// ============================================================

import { db } from './db';
import type { Stage, Bill } from './types';

export const DEFAULT_OPERATORS = ['Amine', 'Mohamed', 'Walid', 'Karim', 'Yacine'];

const STORAGE_KEY_OPERATORS = 'pointage_operators_list';
const STORAGE_KEY_ACTIVE_OPERATOR = 'pointage_active_operator';

function safeGetItem(key: string): string | null {
  if (typeof localStorage !== 'undefined') {
    try {
      return localStorage.getItem(key);
    } catch {}
  }
  return null;
}

function safeSetItem(key: string, value: string): void {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(key, value);
    } catch {}
  }
}

/**
 * Retrieves the list of known warehouse operators.
 */
export function getOperators(): string[] {
  try {
    const raw = safeGetItem(STORAGE_KEY_OPERATORS);
    if (!raw) return [...DEFAULT_OPERATORS];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((n) => String(n).trim()).filter(Boolean);
    }
  } catch {}
  return [...DEFAULT_OPERATORS];
}

/**
 * Adds a new operator to the warehouse roster.
 */
export function addOperator(name: string): string[] {
  const clean = name.trim();
  if (!clean) return getOperators();
  const current = getOperators();
  const exists = current.some((o) => o.toLowerCase() === clean.toLowerCase());
  if (!exists) {
    const updated = [...current, clean];
    safeSetItem(STORAGE_KEY_OPERATORS, JSON.stringify(updated));
    return updated;
  }
  return current;
}

/**
 * Removes an operator from the roster.
 */
export function removeOperator(name: string): string[] {
  const clean = name.trim();
  const current = getOperators();
  const updated = current.filter((o) => o.toLowerCase() !== clean.toLowerCase());
  const final = updated.length > 0 ? updated : [...DEFAULT_OPERATORS];
  safeSetItem(STORAGE_KEY_OPERATORS, JSON.stringify(final));
  return final;
}

export const loadOperatorsRoster = getOperators;
export function saveOperatorsRoster(list: string[]): void {
  safeSetItem(STORAGE_KEY_OPERATORS, JSON.stringify(list));
}


/**
 * Gets the current active operator holding this terminal.
 */
export function getActiveOperator(): string {
  try {
    const saved = safeGetItem(STORAGE_KEY_ACTIVE_OPERATOR);
    if (saved && saved.trim()) return saved.trim();
  } catch {}
  const list = getOperators();
  return list[0] || 'Amine';
}

/**
 * Sets the current active operator on this device.
 */
export function setActiveOperator(name: string): void {
  const clean = name.trim();
  if (!clean) return;
  addOperator(clean);
  safeSetItem(STORAGE_KEY_ACTIVE_OPERATOR, clean);
}

/**
 * Assigns an operator to a specific stage on a bill with timestamp and audit trail.
 */
export async function assignBillStageOperator(
  billId: number,
  stage: Stage,
  operatorName: string
): Promise<void> {
  const cleanName = operatorName.trim();
  if (!cleanName) return;

  const now = new Date().toISOString();
  const updateData: Partial<Bill> = {};

  if (stage === 'preparation') {
    updateData.preparedBy = cleanName;
    updateData.preparedAt = now;
  } else if (stage === 'chargement') {
    updateData.loadedBy = cleanName;
    updateData.loadedAt = now;
  } else if (stage === 'pointage') {
    updateData.checkedBy = cleanName;
    updateData.checkedAt = now;
  }

  await db.bills.update(billId, updateData);

  // Record audit trail entry
  await db.auditEvents.add({
    billId,
    orderLineId: null,
    stage,
    type: 'stage_operator_assigned',
    oldValue: null,
    newValue: cleanName,
    reason: `Responsable assigné à l'étape ${stage}: ${cleanName}`,
    timestamp: now,
  });
}

/**
 * Batch assigns an operator to an entire order (multiple bills for the same client).
 */
export async function assignBatchBillsStageOperator(
  billIds: number[],
  stage: Stage,
  operatorName: string
): Promise<number> {
  const cleanName = operatorName.trim();
  if (!cleanName || billIds.length === 0) return 0;

  for (const id of billIds) {
    await assignBillStageOperator(id, stage, cleanName);
  }

  return billIds.length;
}
