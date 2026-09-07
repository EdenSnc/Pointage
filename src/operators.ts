// ============================================================
// POINTAGE — Operator Roster & Stage Accountability System
// 100% Offline, Zero friction for warehouse floor workers
// ============================================================

import { db } from './db';
import type { Stage, Bill } from './types';

export const DEFAULT_OPERATORS = ['Amine', 'Mohamed', 'Walid', 'Karim', 'Yacine'];

const STORAGE_KEY_OPERATORS = 'pointage_operators_list';
const STORAGE_KEY_ACTIVE_OPERATOR = 'pointage_active_operator';

let inMemoryFallback: Record<string, string> = {};

function safeGetItem(key: string): string | null {
  if (typeof localStorage !== 'undefined') {
    try {
      return localStorage.getItem(key);
    } catch {}
  }
  return inMemoryFallback[key] ?? null;
}

function safeSetItem(key: string, value: string): void {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(key, value);
      return;
    } catch {}
  }
  inMemoryFallback[key] = value;
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
 * Modifies / renames an existing operator in the roster.
 * Also updates the active operator if the renamed operator was active.
 */
export function renameOperator(
  oldName: string,
  newName: string
): { success: boolean; error?: string; list: string[] } {
  const oldClean = oldName.trim();
  const newClean = newName.trim();
  const current = getOperators();

  if (!newClean) {
    return { success: false, error: 'Le prénom ne peut pas être vide.', list: current };
  }

  // If identical, nothing to change
  if (oldClean === newClean) {
    return { success: true, list: current };
  }

  // Check if target name conflicts with another operator
  const conflict = current.some(
    (o) => o.toLowerCase() === newClean.toLowerCase() && o.toLowerCase() !== oldClean.toLowerCase()
  );
  if (conflict) {
    return { success: false, error: `Le prénom "${newClean}" existe déjà.`, list: current };
  }

  const updated = current.map((o) => (o.toLowerCase() === oldClean.toLowerCase() ? newClean : o));
  safeSetItem(STORAGE_KEY_OPERATORS, JSON.stringify(updated));

  // If the renamed operator was active, update active operator
  const savedActive = safeGetItem(STORAGE_KEY_ACTIVE_OPERATOR);
  if (savedActive && savedActive.trim().toLowerCase() === oldClean.toLowerCase()) {
    safeSetItem(STORAGE_KEY_ACTIVE_OPERATOR, newClean);
  }

  return { success: true, list: updated };
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

  // If deleted operator was active, rollover to the first available operator
  const saved = safeGetItem(STORAGE_KEY_ACTIVE_OPERATOR);
  if (saved && saved.trim().toLowerCase() === clean.toLowerCase()) {
    safeSetItem(STORAGE_KEY_ACTIVE_OPERATOR, final[0]);
  }
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
  const list = getOperators();
  try {
    const saved = safeGetItem(STORAGE_KEY_ACTIVE_OPERATOR);
    if (saved && saved.trim()) {
      const match = list.find((o) => o.toLowerCase() === saved.trim().toLowerCase());
      if (match) return match;
    }
  } catch {}
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
