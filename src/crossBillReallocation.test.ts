import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';
import {
  findCrossBillPreparedStock,
  executeCrossBillReallocation,
  resolveShortageAsPartialStock,
  replenishReallocatedLine,
} from './crossBillReallocation';
import { sumStageEvents } from './logic';

describe('Cross-Customer Urgent Stock Reallocation & Shortage System', () => {
  beforeEach(async () => {
    await db.bills.clear();
    await db.orderLines.clear();
    await db.countEvents.clear();
    await db.transportContainers.clear();
    await db.auditEvents.clear();
  });

  it('detects prepared stock of the same product on customer A bill when customer B is missing quantity', async () => {
    // 1. Create Bill A (Customer A: ETS BENALI) with 50 units prepared
    const billAId = await db.bills.add({
      sessionId: 1,
      billNumber: 'BL-BENALI-01',
      client: 'ETS BENALI',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const lineAId = await db.orderLines.add({
      billId: billAId,
      no: '1',
      originalNo: '1',
      page: 1,
      originalPage: 1,
      reference: 'CLASSEUR-CHR-40',
      originalReference: 'CLASSEUR-CHR-40',
      ean: '613000111222',
      originalEan: '613000111222',
      designation: 'CLASSEUR CHROME 40MM BLEU',
      originalDesignation: 'CLASSEUR CHROME 40MM BLEU',
      orderedQty: 50,
      originalOrderedQty: 50,
      status: 'active',
      outerPackSize: 10,
      innerPackSize: null,
      warehouseZone: 'NORTH_EAST',
      packagesRaw: null,
      referenceAliases: ['CLASSEUR-CHR-40'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Assign to Carton A on Bill A
    const containerAId = await db.transportContainers.add({
      billId: billAId,
      label: 'CARTON A',
      type: 'carton',
      createdAt: new Date().toISOString(),
    });

    await db.countEvents.add({
      billId: billAId,
      orderLineId: lineAId,
      stage: 'preparation',
      quantity: 50,
      containerId: containerAId,
      outcome: 'accepted',
      undone: false,
      createdAt: new Date().toISOString(),
    });

    // 2. Create Bill B (Customer B: SARL SBM) at dock in chargement, needs 50 units
    const billBId = await db.bills.add({
      sessionId: 1,
      billNumber: 'BL-SBM-02',
      client: 'SARL SBM',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const lineBId = await db.orderLines.add({
      billId: billBId,
      no: '1',
      originalNo: '1',
      page: 1,
      originalPage: 1,
      reference: 'CLASSEUR-CHR-40',
      originalReference: 'CLASSEUR-CHR-40',
      ean: '613000111222',
      originalEan: '613000111222',
      designation: 'CLASSEUR CHROME 40MM BLEU',
      originalDesignation: 'CLASSEUR CHROME 40MM BLEU',
      orderedQty: 50,
      originalOrderedQty: 50,
      status: 'active',
      outerPackSize: 10,
      innerPackSize: null,
      warehouseZone: 'NORTH_EAST',
      packagesRaw: null,
      referenceAliases: ['CLASSEUR-CHR-40'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const targetLine = await db.orderLines.get(lineBId);
    expect(targetLine).toBeDefined();

    // 3. Search for cross-bill prepared stock
    const available = await findCrossBillPreparedStock(billBId, targetLine!);
    expect(available.length).toBe(1);
    expect(available[0].bill.client).toBe('ETS BENALI');
    expect(available[0].preparedQty).toBe(50);
    expect(available[0].allocatedContainers).toContain('CARTON A');
  });

  it('transfers 45 units from customer A to customer B with double audit trail and negative adjustment on A', async () => {
    // Setup Bill A & Bill B
    const billAId = await db.bills.add({
      sessionId: 1,
      billNumber: 'BL-A',
      client: 'CLIENT A',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const lineAId = await db.orderLines.add({
      billId: billAId,
      no: '1',
      originalNo: '1',
      page: 1,
      originalPage: 1,
      reference: 'STYLO-BLEU',
      originalReference: 'STYLO-BLEU',
      ean: null,
      originalEan: null,
      designation: 'STYLO BILLE BLEU',
      originalDesignation: 'STYLO BILLE BLEU',
      orderedQty: 50,
      originalOrderedQty: 50,
      status: 'active',
      outerPackSize: 50,
      innerPackSize: null,
      warehouseZone: null,
      packagesRaw: null,
      referenceAliases: ['STYLO-BLEU'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    // Customer A has 50 prepared
    await db.countEvents.add({
      billId: billAId,
      orderLineId: lineAId,
      stage: 'preparation',
      quantity: 50,
      undone: false,
      outcome: 'accepted',
      createdAt: new Date().toISOString(),
    });

    const billBId = await db.bills.add({
      sessionId: 1,
      billNumber: 'BL-B',
      client: 'CLIENT B',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const lineBId = await db.orderLines.add({
      billId: billBId,
      no: '1',
      originalNo: '1',
      page: 1,
      originalPage: 1,
      reference: 'STYLO-BLEU',
      originalReference: 'STYLO-BLEU',
      ean: null,
      originalEan: null,
      designation: 'STYLO BILLE BLEU',
      originalDesignation: 'STYLO BILLE BLEU',
      orderedQty: 50,
      originalOrderedQty: 50,
      status: 'active',
      outerPackSize: 50,
      innerPackSize: null,
      warehouseZone: null,
      packagesRaw: null,
      referenceAliases: ['STYLO-BLEU'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    // Customer B only found 5 remaining in the warehouse
    await db.countEvents.add({
      billId: billBId,
      orderLineId: lineBId,
      stage: 'chargement',
      quantity: 5,
      undone: false,
      outcome: 'accepted',
      createdAt: new Date().toISOString(),
    });

    const billA = (await db.bills.get(billAId))!;
    const lineA = (await db.orderLines.get(lineAId))!;
    const billB = (await db.bills.get(billBId))!;
    const lineB = (await db.orderLines.get(lineBId))!;

    // Perform urgent reallocation: take 45 units from Client A to give to Client B
    const res = await executeCrossBillReallocation({
      fromBill: billA,
      fromLine: lineA,
      toBill: billB,
      toLine: lineB,
      quantity: 45,
      stage: 'chargement',
      reason: 'Camion au quai prêt à partir',
      operatorName: 'Amine',
    });

    expect(res.success).toBe(true);
    expect(res.quantity).toBe(45);

    // Verify Client A counts: 50 - 45 = 5 remaining prepared
    const eventsA = await db.countEvents.where('orderLineId').equals(lineAId).toArray();
    const totalPrepA = sumStageEvents(eventsA, 'preparation');
    expect(totalPrepA).toBe(5);

    // Verify Client B counts: 5 + 45 = 50 in chargement (100% complete!)
    const eventsB = await db.countEvents.where('orderLineId').equals(lineBId).toArray();
    const totalLoadB = sumStageEvents(eventsB, 'chargement');
    expect(totalLoadB).toBe(50);

    // Verify Audit trails
    const audits = await db.auditEvents.toArray();
    expect(audits.some((a) => a.billId === billAId && a.type === 'cross_bill_reallocation')).toBe(true);
    expect(audits.some((a) => a.billId === billBId && a.type === 'cross_bill_reallocation')).toBe(true);

    // Verify line metadata
    const updatedLineA = await db.orderLines.get(lineAId);
    expect(updatedLineA?.reallocatedQty).toBe(-45);
    expect(updatedLineA?.reallocatedToBillId).toBe(billBId);

    const updatedLineB = await db.orderLines.get(lineBId);
    expect(updatedLineB?.reallocatedQty).toBe(45);
    expect(updatedLineB?.reallocatedFromBillId).toBe(billAId);
  });

  it('records shortage sign-off when workers choose to leave customer A intact and deliver partial stock', async () => {
    const billId = await db.bills.add({
      sessionId: 1,
      billNumber: 'BL-PARTIAL',
      client: 'CLIENT DIVERS',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const lineId = await db.orderLines.add({
      billId,
      no: '1',
      originalNo: '1',
      page: 1,
      originalPage: 1,
      reference: 'REF-RUPTURE',
      originalReference: 'REF-RUPTURE',
      ean: null,
      originalEan: null,
      designation: 'ARTICLE EN RUPTURE',
      originalDesignation: 'ARTICLE EN RUPTURE',
      orderedQty: 50,
      originalOrderedQty: 50,
      status: 'active',
      outerPackSize: null,
      innerPackSize: null,
      warehouseZone: null,
      packagesRaw: null,
      referenceAliases: ['REF-RUPTURE'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Resolve as partial delivery (5 delivered, 45 shortage)
    await resolveShortageAsPartialStock({
      billId,
      lineId,
      stage: 'chargement',
      deliveredQty: 5,
      missingQty: 45,
      operatorName: 'Amine',
    });

    const updatedLine = await db.orderLines.get(lineId);
    expect(updatedLine?.shortageResolvedAsPartial).toBe(true);
    expect(updatedLine?.reallocationNote).toContain('Stock entrepôt épuisé');

    const audits = await db.auditEvents.where('billId').equals(billId).toArray();
    expect(audits.some((a) => a.type === 'shortage_partial_delivery')).toBe(true);
  });

  it('replenishes customer A line when supplier restock arrives later', async () => {
    const billId = await db.bills.add({
      sessionId: 1,
      billNumber: 'BL-RESTOCK',
      client: 'CLIENT A',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const lineId = await db.orderLines.add({
      billId,
      no: '1',
      originalNo: '1',
      page: 1,
      originalPage: 1,
      reference: 'REF-RESTOCK',
      originalReference: 'REF-RESTOCK',
      ean: null,
      originalEan: null,
      designation: 'ARTICLE PRELEVE',
      originalDesignation: 'ARTICLE PRELEVE',
      orderedQty: 50,
      originalOrderedQty: 50,
      status: 'active',
      outerPackSize: null,
      innerPackSize: null,
      warehouseZone: null,
      packagesRaw: null,
      referenceAliases: ['REF-RESTOCK'],
      reallocatedQty: -45,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Supplier arrives: replenish 45 units on Client A
    await replenishReallocatedLine(billId, lineId, 45, 'Mohamed');

    const lineAfter = await db.orderLines.get(lineId);
    expect(lineAfter?.reallocatedQty).toBeNull(); // restored to normal

    const events = await db.countEvents.where('orderLineId').equals(lineId).toArray();
    expect(sumStageEvents(events, 'preparation')).toBe(45);
  });
});
