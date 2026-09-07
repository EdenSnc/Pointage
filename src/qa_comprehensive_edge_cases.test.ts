import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';
import {
  calculateDockStock,
  createAndDispatchTrip,
  cancelShipmentTrip,
  formatTripWhatsAppMessage,
  createTripExitWorkbook,
} from './shipmentTrips';
import {
  executeCrossBillReallocation,
  resolveShortageAsPartialStock,
  replenishReallocatedLine,
} from './crossBillReallocation';
import {
  getOperators,
  addOperator,
  removeOperator,
  getActiveOperator,
  setActiveOperator,
  assignBatchBillsStageOperator,
  DEFAULT_OPERATORS,
} from './operators';
import type { OrderLine, Bill } from './types';

const memStore: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => memStore[k] ?? null,
  setItem: (k: string, v: string) => { memStore[k] = String(v); },
  removeItem: (k: string) => { delete memStore[k]; },
  clear: () => { Object.keys(memStore).forEach((k) => delete memStore[k]); },
};

describe('Comprehensive QA & Extreme Edge Cases Suite', () => {
  beforeEach(async () => {
    await db.bills.clear();
    await db.orderLines.clear();
    await db.countEvents.clear();
    await db.transportContainers.clear();
    await db.auditEvents.clear();
    await db.shipmentTrips.clear();
    localStorage.clear();
  });

  // =========================================================================
  // 1. MULTI-TRIP (ROTATIONS CHAUFFEUR) EDGE CASES
  // =========================================================================

  it('Edge Case 1.1: 3-Trip Progressive Dispatch (Voyage 1 -> 2 -> 3) with exact dock depletion', async () => {
    const billId = await db.bills.add({
      sessionId: 1,
      billNumber: 'BL-TRIP-3',
      client: 'ETS TAHAR',
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
      reference: 'ART-60',
      originalReference: 'ART-60',
      ean: '61360',
      originalEan: '61360',
      designation: 'ARTICLE 60 PIECES',
      originalDesignation: 'ARTICLE 60 PIECES',
      orderedQty: 60,
      originalOrderedQty: 60,
      status: 'active',
      outerPackSize: null,
      innerPackSize: null,
      warehouseZone: null,
      packagesRaw: null,
      referenceAliases: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const c1 = await db.transportContainers.add({ billId, label: 'CARTON 1', type: 'carton', createdAt: new Date().toISOString() });
    const c2 = await db.transportContainers.add({ billId, label: 'CARTON 2', type: 'carton', createdAt: new Date().toISOString() });
    const c3 = await db.transportContainers.add({ billId, label: 'CARTON 3', type: 'carton', createdAt: new Date().toISOString() });

    // 20 pcs in each container
    await db.countEvents.add({ billId, orderLineId: lineId, stage: 'preparation', quantity: 20, containerId: c1, outcome: null, undone: false, createdAt: new Date().toISOString() });
    await db.countEvents.add({ billId, orderLineId: lineId, stage: 'preparation', quantity: 20, containerId: c2, outcome: null, undone: false, createdAt: new Date().toISOString() });
    await db.countEvents.add({ billId, orderLineId: lineId, stage: 'preparation', quantity: 20, containerId: c3, outcome: null, undone: false, createdAt: new Date().toISOString() });

    const lines = await db.orderLines.where('billId').equals(billId).toArray();
    const containers = await db.transportContainers.where('billId').equals(billId).toArray();
    const events = await db.countEvents.where('billId').equals(billId).toArray();

    // Voyage 1: 20 pcs
    const t1 = await createAndDispatchTrip({
      billId,
      client: 'ETS TAHAR',
      driverName: 'Mourad',
      containerIds: [c1],
      isLastTrip: false,
    });
    expect(t1.totalUnits).toBe(20);
    let dock = await calculateDockStock(billId, lines, containers, events);
    expect(dock.remainingUnits).toBe(40);
    expect(dock.remainingContainers.length).toBe(2);
    expect(dock.nextTripNumber).toBe(2);

    // Voyage 2: 20 pcs
    const t2 = await createAndDispatchTrip({
      billId,
      client: 'ETS TAHAR',
      driverName: 'Mourad',
      containerIds: [c2],
      isLastTrip: false,
    });
    expect(t2.totalUnits).toBe(20);
    dock = await calculateDockStock(billId, lines, containers, events);
    expect(dock.remainingUnits).toBe(20);
    expect(dock.remainingContainers.length).toBe(1);
    expect(dock.nextTripNumber).toBe(3);

    // Voyage 3: Final 20 pcs
    const t3 = await createAndDispatchTrip({
      billId,
      client: 'ETS TAHAR',
      driverName: 'Mourad',
      containerIds: [c3],
      isLastTrip: true,
    });
    expect(t3.totalUnits).toBe(20);
    dock = await calculateDockStock(billId, lines, containers, events);
    expect(dock.remainingUnits).toBe(0);
    expect(dock.remainingContainers.length).toBe(0);
    expect(dock.isFullyShipped).toBe(true);

    const updatedBill = await db.bills.get(billId);
    expect(updatedBill?.shippingStatus).toBe('fully_shipped');
    expect(updatedBill?.tripCount).toBe(3);
  });

  it('Edge Case 1.2: Trip cancellation correctly restores dock stock and resets bill status', async () => {
    const billId = await db.bills.add({
      sessionId: 1,
      billNumber: 'BL-CANCEL',
      client: 'CLIENT ANNUL',
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
      reference: 'REF-CAN',
      originalReference: 'REF-CAN',
      ean: '613CAN',
      originalEan: '613CAN',
      designation: 'ARTICLE TEST',
      originalDesignation: 'ARTICLE TEST',
      orderedQty: 10,
      originalOrderedQty: 10,
      status: 'active',
      outerPackSize: null,
      innerPackSize: null,
      warehouseZone: null,
      packagesRaw: null,
      referenceAliases: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const c1 = await db.transportContainers.add({ billId, label: 'CARTON A', type: 'carton', createdAt: new Date().toISOString() });
    await db.countEvents.add({ billId, orderLineId: lineId, stage: 'preparation', quantity: 10, containerId: c1, outcome: null, undone: false, createdAt: new Date().toISOString() });

    const lines = await db.orderLines.where('billId').equals(billId).toArray();
    const containers = await db.transportContainers.where('billId').equals(billId).toArray();
    const events = await db.countEvents.where('billId').equals(billId).toArray();

    const trip = await createAndDispatchTrip({
      billId,
      client: 'CLIENT ANNUL',
      containerIds: [c1],
    });
    expect(trip.status).toBe('dispatched');

    let dock = await calculateDockStock(billId, lines, containers, events);
    expect(dock.remainingUnits).toBe(0);
    expect(dock.remainingContainers.length).toBe(0);

    // Cancel trip
    await cancelShipmentTrip(trip.id!, 'Erreur de camion');

    dock = await calculateDockStock(billId, lines, containers, events);
    expect(dock.remainingUnits).toBe(10);
    expect(dock.remainingContainers.length).toBe(1);
    expect(dock.isFullyShipped).toBe(false);

    const bill = await db.bills.get(billId);
    expect(bill?.shippingStatus).toBe('not_shipped');
    expect(bill?.tripCount).toBe(0);
  });

  it('Edge Case 1.3: Handles special characters, non-ASCII text, and emojis in driver & notes', async () => {
    const bill: Bill = {
      id: 50,
      sessionId: 1,
      billNumber: 'BL/SPECIAL/2026',
      client: "SARL L'ÉTOILE & FILS (ORAN)",
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const lines: OrderLine[] = [
      {
        id: 501,
        billId: 50,
        no: '1',
        originalNo: '1',
        page: 1,
        originalPage: 1,
        reference: 'RÉF/ÉLÉM#1',
        originalReference: 'RÉF/ÉLÉM#1',
        ean: '613000',
        originalEan: '613000',
        designation: "ARTICLE SPÉCIAL — AVEC GUILLEMETS ET SYMBOLES & %",
        originalDesignation: "ARTICLE SPÉCIAL — AVEC GUILLEMETS ET SYMBOLES & %",
        orderedQty: 15,
        originalOrderedQty: 15,
        status: 'active',
        outerPackSize: null,
        innerPackSize: null,
        warehouseZone: null,
        packagesRaw: null,
        referenceAliases: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const trip = {
      id: 1,
      billId: 50,
      client: "SARL L'ÉTOILE & FILS (ORAN)",
      tripNumber: 1,
      status: 'dispatched' as const,
      driverName: 'Mourad "L\'As" & مراد',
      truckPlate: '05432-116-16 / Plateau',
      operatorName: 'Amine L\'ouvrier',
      containerIds: [],
      lineQuantities: [{ orderLineId: 501, quantity: 15 }],
      totalUnits: 15,
      totalContainers: 0,
      isLastTrip: true,
      notes: 'Livrer avant 18h00 @ dépôt principal !',
      dispatchedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Excel workbook generation should succeed without error
    const wb = createTripExitWorkbook(trip, bill, lines, [], 0);
    expect(wb.SheetNames).toContain('Voyage_1');

    // WhatsApp formatting should not throw and encode cleanly
    const msg = formatTripWhatsAppMessage(trip, bill, lines, [], 0);
    expect(msg).toContain('Mourad "L\'As" & مراد');
    expect(msg).toContain("SARL L'ÉTOILE & FILS (ORAN)");
    expect(msg).toContain('EXPÉDITION SOLDÉE & COMPLÈTE');
  });

  // =========================================================================
  // 2. CROSS-BILL REALLOCATION & SHORTAGE RESOLUTION EDGE CASES
  // =========================================================================

  it('Edge Case 2.1: Multi-Step Chained Reallocations (Bill A -> Bill B, then Bill A -> Bill C)', async () => {
    const billAId = await db.bills.add({
      sessionId: 1,
      billNumber: 'BL-A',
      client: 'CLIENT A',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const billBId = await db.bills.add({
      sessionId: 1,
      billNumber: 'BL-B',
      client: 'CLIENT B',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const billCId = await db.bills.add({
      sessionId: 1,
      billNumber: 'BL-C',
      client: 'CLIENT C',
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
      reference: 'MULTI-CHAIN-ITEM',
      originalReference: 'MULTI-CHAIN-ITEM',
      ean: '613999',
      originalEan: '613999',
      designation: 'MULTI CHAIN ITEM',
      originalDesignation: 'MULTI CHAIN ITEM',
      orderedQty: 50,
      originalOrderedQty: 50,
      status: 'active',
      outerPackSize: null,
      innerPackSize: null,
      warehouseZone: null,
      packagesRaw: null,
      referenceAliases: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const lineBId = await db.orderLines.add({
      billId: billBId,
      no: '1',
      originalNo: '1',
      page: 1,
      originalPage: 1,
      reference: 'MULTI-CHAIN-ITEM',
      originalReference: 'MULTI-CHAIN-ITEM',
      ean: '613999',
      originalEan: '613999',
      designation: 'MULTI CHAIN ITEM',
      originalDesignation: 'MULTI CHAIN ITEM',
      orderedQty: 20,
      originalOrderedQty: 20,
      status: 'active',
      outerPackSize: null,
      innerPackSize: null,
      warehouseZone: null,
      packagesRaw: null,
      referenceAliases: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const lineCId = await db.orderLines.add({
      billId: billCId,
      no: '1',
      originalNo: '1',
      page: 1,
      originalPage: 1,
      reference: 'MULTI-CHAIN-ITEM',
      originalReference: 'MULTI-CHAIN-ITEM',
      ean: '613999',
      originalEan: '613999',
      designation: 'MULTI CHAIN ITEM',
      originalDesignation: 'MULTI CHAIN ITEM',
      orderedQty: 15,
      originalOrderedQty: 15,
      status: 'active',
      outerPackSize: null,
      innerPackSize: null,
      warehouseZone: null,
      packagesRaw: null,
      referenceAliases: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 50 units prepared on Bill A
    await db.countEvents.add({
      billId: billAId,
      orderLineId: lineAId,
      stage: 'preparation',
      quantity: 50,
      outcome: null,
      undone: false,
      createdAt: new Date().toISOString(),
    });

    // Step 1: Bill B borrows 20 units from Bill A
    let billA = (await db.bills.get(billAId))!;
    let lineA = (await db.orderLines.get(lineAId))!;
    let billB = (await db.bills.get(billBId))!;
    let lineB = (await db.orderLines.get(lineBId))!;

    await executeCrossBillReallocation({
      fromBill: billA,
      fromLine: lineA,
      toBill: billB,
      toLine: lineB,
      quantity: 20,
      stage: 'preparation',
      operatorName: 'Amine',
      reason: 'Dépannage 1',
    });

    let evA = await db.countEvents.where('orderLineId').equals(lineAId).toArray();
    let evB = await db.countEvents.where('orderLineId').equals(lineBId).toArray();
    let qtyA = evA.filter(e => !e.undone).reduce((s, e) => s + e.quantity, 0);
    let qtyB = evB.filter(e => !e.undone).reduce((s, e) => s + e.quantity, 0);
    expect(qtyA).toBe(30);
    expect(qtyB).toBe(20);

    // Step 2: Bill C borrows 15 units from Bill A
    billA = (await db.bills.get(billAId))!;
    lineA = (await db.orderLines.get(lineAId))!;
    const billC = (await db.bills.get(billCId))!;
    const lineC = (await db.orderLines.get(lineCId))!;

    await executeCrossBillReallocation({
      fromBill: billA,
      fromLine: lineA,
      toBill: billC,
      toLine: lineC,
      quantity: 15,
      stage: 'preparation',
      operatorName: 'Mohamed',
      reason: 'Dépannage 2',
    });

    evA = await db.countEvents.where('orderLineId').equals(lineAId).toArray();
    let evC = await db.countEvents.where('orderLineId').equals(lineCId).toArray();
    qtyA = evA.filter(e => !e.undone).reduce((s, e) => s + e.quantity, 0);
    let qtyC = evC.filter(e => !e.undone).reduce((s, e) => s + e.quantity, 0);
    expect(qtyA).toBe(15);
    expect(qtyC).toBe(15);

    // Step 3: Replenish Bill A with new supplier delivery (total debt was 35)
    lineA = (await db.orderLines.get(lineAId))!;
    expect(lineA.reallocatedQty).toBe(-35);
    await replenishReallocatedLine(billAId, lineAId, 35, 'Amine');

    evA = await db.countEvents.where('orderLineId').equals(lineAId).toArray();
    qtyA = evA.filter(e => !e.undone).reduce((s, e) => s + e.quantity, 0);
    expect(qtyA).toBe(50); // Fully restored!
    const lineARestored = (await db.orderLines.get(lineAId))!;
    expect(lineARestored.reallocatedQty == null || lineARestored.reallocatedQty === 0).toBe(true);
  });

  it('Edge Case 2.2: Rupture / Shortage resolution with 0 stock sets status and leaves audit', async () => {
    const billId = await db.bills.add({
      sessionId: 1,
      billNumber: 'BL-RUPTURE',
      client: 'CLIENT RUPTURE',
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
      reference: 'RUPTURE-ITEM',
      originalReference: 'RUPTURE-ITEM',
      ean: '61300099',
      originalEan: '61300099',
      designation: 'ARTICLE TOTALEMENT EN RUPTURE',
      originalDesignation: 'ARTICLE TOTALEMENT EN RUPTURE',
      orderedQty: 12,
      originalOrderedQty: 12,
      status: 'active',
      outerPackSize: null,
      innerPackSize: null,
      warehouseZone: null,
      packagesRaw: null,
      referenceAliases: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await resolveShortageAsPartialStock({
      billId,
      lineId,
      stage: 'chargement',
      deliveredQty: 0,
      missingQty: 12,
      operatorName: 'Walid',
      note: 'Rayons entièrement vides, fournisseur en retard',
    });

    const line = (await db.orderLines.get(lineId))!;
    expect(line.status).toBe('out_of_stock');
    expect(line.shortageResolvedAsPartial).toBe(true);

    const audits = await db.auditEvents.where('orderLineId').equals(lineId).toArray();
    expect(audits.some(a => a.type === 'shortage_partial_delivery')).toBe(true);
  });

  // =========================================================================
  // 3. OPERATOR ROSTER & ACCOUNTABILITY SYSTEM EDGE CASES
  // =========================================================================

  it('Edge Case 3.1: Operator roster trims whitespace, prevents duplicates, and auto-rolls over active operator upon deletion', () => {
    // Initial state
    const initial = getOperators();
    expect(initial).toEqual(DEFAULT_OPERATORS);

    // Add with spaces
    addOperator('   Youssef   ');
    expect(getOperators()).toContain('Youssef');

    // Add duplicate with different casing
    const countBefore = getOperators().length;
    addOperator('youssef');
    expect(getOperators().length).toBe(countBefore);

    // Set active operator to Youssef
    setActiveOperator('Youssef');
    expect(getActiveOperator()).toBe('Youssef');

    // Remove Youssef -> Active operator should safely roll over to first available operator (Amine)
    removeOperator('Youssef');
    expect(getOperators()).not.toContain('Youssef');
    expect(getActiveOperator()).toBe('Amine');
  });

  it('Edge Case 3.2: Batch stage assignment updates all bills of an order', async () => {
    const b1 = await db.bills.add({
      sessionId: 1,
      billNumber: 'BL-1',
      client: 'SARL BATCH',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const b2 = await db.bills.add({
      sessionId: 1,
      billNumber: 'BL-2',
      client: 'SARL BATCH',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await assignBatchBillsStageOperator([b1, b2], 'chargement', 'Mohamed');

    const updatedB1 = (await db.bills.get(b1))!;
    const updatedB2 = (await db.bills.get(b2))!;
    expect(updatedB1.loadedBy).toBe('Mohamed');
    expect(updatedB2.loadedBy).toBe('Mohamed');
    expect(updatedB1.loadedAt).toBeDefined();
    expect(updatedB2.loadedAt).toBeDefined();

    const audits = await db.auditEvents.toArray();
    expect(audits.filter(a => a.type === 'stage_operator_assigned').length).toBe(2);
  });
});
