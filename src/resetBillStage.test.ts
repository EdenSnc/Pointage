import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';
import { resetBillStageCounts } from './hooks';

describe('resetBillStageCounts - Whole Phase Count Reset', () => {
  beforeEach(async () => {
    await db.bills.clear();
    await db.orderLines.clear();
    await db.countEvents.clear();
    await db.auditEvents.clear();
  });

  it('resets all active events for the target stage and leaves other stages intact', async () => {
    // 1. Setup a test bill
    const billId = await db.bills.add({
      sessionId: 1,
      billNumber: 'BL-999',
      client: 'ETS TAHAR',
      status: 'active',
      preparedBy: 'Amine',
      preparedAt: '2026-09-09T08:00:00.000Z',
      checkedBy: 'Karim',
      checkedAt: '2026-09-09T08:30:00.000Z',
    });

    // 2. Setup 2 order lines
    const line1Id = await db.orderLines.add({
      billId,
      no: '1',
      reference: 'STYLO-BLEU',
      designation: 'Stylo Bleu 50pcs',
      orderedQty: 100,
      status: 'active',
      page: 1,
      originalNo: '1',
      originalPage: 1,
      originalReference: 'STYLO-BLEU',
      originalDesignation: 'Stylo Bleu 50pcs',
      originalOrderedQty: 100,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const line2Id = await db.orderLines.add({
      billId,
      no: '2',
      reference: 'CAHIER-96P',
      designation: 'Cahier 96p',
      orderedQty: 60,
      status: 'active',
      page: 1,
      originalNo: '2',
      originalPage: 1,
      originalReference: 'CAHIER-96P',
      originalDesignation: 'Cahier 96p',
      originalOrderedQty: 60,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 3. Add count events in 'preparation' (total 90 pieces)
    await db.countEvents.add({
      billId,
      orderLineId: line1Id,
      stage: 'preparation',
      quantity: 50,
      undone: false,
      createdAt: new Date().toISOString(),
    });
    await db.countEvents.add({
      billId,
      orderLineId: line2Id,
      stage: 'preparation',
      quantity: 40,
      undone: false,
      createdAt: new Date().toISOString(),
    });

    // 4. Add count events in 'pointage' (total 60 pieces) - must remain intact!
    const pointageEvtId = await db.countEvents.add({
      billId,
      orderLineId: line1Id,
      stage: 'pointage',
      quantity: 60,
      undone: false,
      createdAt: new Date().toISOString(),
    });

    // 5. Execute reset of 'preparation'
    const result = await resetBillStageCounts(billId, 'preparation');

    expect(result.resetEventsCount).toBe(2);
    expect(result.resetUnitsCount).toBe(90);
    expect(result.affectedLinesCount).toBe(2);

    // 6. Verify preparation events are marked undone
    const prepEvents = await db.countEvents
      .where('billId')
      .equals(billId)
      .toArray();

    const activePrep = prepEvents.filter((e) => e.stage === 'preparation' && !e.undone);
    expect(activePrep.length).toBe(0);

    const undonePrep = prepEvents.filter((e) => e.stage === 'preparation' && e.undone);
    expect(undonePrep.length).toBe(2);

    // 7. Verify pointage events were NOT touched
    const pointageEvt = await db.countEvents.get(pointageEvtId);
    expect(pointageEvt?.undone).toBe(false);
    expect(pointageEvt?.quantity).toBe(60);

    // 8. Verify bill's preparation sign-off is cleared, but checkedBy is preserved
    const updatedBill = await db.bills.get(billId);
    expect(updatedBill?.preparedBy).toBeNull();
    expect(updatedBill?.preparedAt).toBeNull();
    expect(updatedBill?.checkedBy).toBe('Karim');

    // 9. Verify audit event was logged
    const auditLogs = await db.auditEvents.where('billId').equals(billId).toArray();
    expect(auditLogs.length).toBe(1);
    expect(auditLogs[0].stage).toBe('preparation');
    expect(auditLogs[0].type).toBe('count_event_undone');
    expect(auditLogs[0].reason).toBe('reset_entire_phase');
    expect(auditLogs[0].oldValue).toContain('90 pièces (2 articles)');
  });

  it('returns zeroes safely when no active count events exist for that stage', async () => {
    const billId = await db.bills.add({
      sessionId: 1,
      billNumber: 'BL-100',
      client: 'SARL OMEGA',
      status: 'active',
    });

    const result = await resetBillStageCounts(billId, 'chargement');
    expect(result.resetEventsCount).toBe(0);
    expect(result.resetUnitsCount).toBe(0);
    expect(result.affectedLinesCount).toBe(0);

    const auditLogs = await db.auditEvents.where('billId').equals(billId).toArray();
    expect(auditLogs.length).toBe(0);
  });
});
