import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';
import {
  getOperators,
  addOperator,
  renameOperator,
  removeOperator,
  getActiveOperator,
  setActiveOperator,
  assignBillStageOperator,
  assignBatchBillsStageOperator,
  DEFAULT_OPERATORS,
} from './operators';

const memStore: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => memStore[k] ?? null,
  setItem: (k: string, v: string) => { memStore[k] = String(v); },
  removeItem: (k: string) => { delete memStore[k]; },
  clear: () => { Object.keys(memStore).forEach((k) => delete memStore[k]); },
};

describe('Warehouse Operator Roster & Stage Accountability System', () => {
  beforeEach(async () => {
    localStorage.clear();
    await db.bills.clear();
    await db.auditEvents.clear();
  });

  it('returns default operators when storage is empty', () => {
    const list = getOperators();
    expect(list).toEqual(DEFAULT_OPERATORS);
    expect(getActiveOperator()).toBe('Amine');
  });

  it('adds and removes operators cleanly without duplicate or empty entries', () => {
    const updated = addOperator('Youssef');
    expect(updated).toContain('Youssef');
    expect(getOperators()).toContain('Youssef');

    // Duplicate case
    const dup = addOperator('youssef');
    expect(dup.filter((o) => o.toLowerCase() === 'youssef').length).toBe(1);

    // Remove
    const afterRemove = removeOperator('Youssef');
    expect(afterRemove).not.toContain('Youssef');
  });

  it('changes active operator and automatically ensures it is in roster', () => {
    setActiveOperator('Nassim');
    expect(getActiveOperator()).toBe('Nassim');
    expect(getOperators()).toContain('Nassim');
  });

  it('modifies / renames operator and rolls over active operator seamlessly', () => {
    setActiveOperator('Amine');
    expect(getActiveOperator()).toBe('Amine');

    // Rename Amine to Amine B
    const res = renameOperator('Amine', 'Amine B');
    expect(res.success).toBe(true);
    expect(res.list).toContain('Amine B');
    expect(res.list).not.toContain('Amine');
    expect(getActiveOperator()).toBe('Amine B');

    // Reject empty
    const resEmpty = renameOperator('Amine B', '   ');
    expect(resEmpty.success).toBe(false);
    expect(resEmpty.error).toBeDefined();

    // Reject conflict with another existing operator
    const resConflict = renameOperator('Amine B', 'Mohamed');
    expect(resConflict.success).toBe(false);
    expect(resConflict.error).toContain('existe déjà');
  });

  it('assigns stage operator to a bill and logs audit event', async () => {
    const billId = await db.bills.add({
      sessionId: 1,
      billNumber: 'BL-TEST-OP',
      client: 'CLIENT OP',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await assignBillStageOperator(billId, 'preparation', 'Amine');
    const billAfterPrep = await db.bills.get(billId);
    expect(billAfterPrep?.preparedBy).toBe('Amine');
    expect(billAfterPrep?.preparedAt).toBeDefined();

    await assignBillStageOperator(billId, 'chargement', 'Mohamed');
    const billAfterLoad = await db.bills.get(billId);
    expect(billAfterLoad?.loadedBy).toBe('Mohamed');

    await assignBillStageOperator(billId, 'pointage', 'Walid');
    const billAfterPoint = await db.bills.get(billId);
    expect(billAfterPoint?.checkedBy).toBe('Walid');

    // Audit entries
    const audits = await db.auditEvents.where('billId').equals(billId).toArray();
    expect(audits.length).toBe(3);
    expect(audits.some((a) => a.stage === 'preparation' && a.newValue === 'Amine')).toBe(true);
    expect(audits.some((a) => a.stage === 'chargement' && a.newValue === 'Mohamed')).toBe(true);
    expect(audits.some((a) => a.stage === 'pointage' && a.newValue === 'Walid')).toBe(true);
  });

  it('batch assigns an operator to multiple bills for a whole commande in 1 call', async () => {
    const id1 = await db.bills.add({
      sessionId: 1,
      billNumber: 'BL-1',
      client: 'SARL SBM',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const id2 = await db.bills.add({
      sessionId: 1,
      billNumber: 'BL-2',
      client: 'SARL SBM',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const id3 = await db.bills.add({
      sessionId: 1,
      billNumber: 'BL-3',
      client: 'SARL SBM',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const count = await assignBatchBillsStageOperator([id1, id2, id3], 'preparation', 'Amine');
    expect(count).toBe(3);

    const b1 = await db.bills.get(id1);
    const b2 = await db.bills.get(id2);
    const b3 = await db.bills.get(id3);
    expect(b1?.preparedBy).toBe('Amine');
    expect(b2?.preparedBy).toBe('Amine');
    expect(b3?.preparedBy).toBe('Amine');
  });
});
