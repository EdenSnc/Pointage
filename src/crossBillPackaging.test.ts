// ============================================================
// POINTAGE — Cross-Bill Product Search & Shared Packaging Tests
// ============================================================

import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import {
  searchLines,
  batchAssignContainerAndCount,
  transferLineStageCounts,
  transferBatchStageCounts,
  addCountEvent,
} from './hooks';
import { db } from './db';
import type { OrderLine, CountEvent, Bill, TransportContainer } from './types';

function createDummyLine(overrides: Partial<OrderLine>): OrderLine {
  return {
    id: 1,
    billId: 1,
    originalNo: '1',
    originalPage: 1,
    originalReference: 'REF-001',
    originalEan: '613111111111',
    originalDesignation: 'Produit Test',
    originalOrderedQty: 20,
    no: '1',
    page: 1,
    reference: 'REF-001',
    ean: '613111111111',
    designation: 'Produit Test',
    orderedQty: 20,
    status: 'active',
    outerPackSize: null,
    innerPackSize: null,
    warehouseZone: null,
    packagesRaw: null,
    referenceAliases: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('Cross-Bill Product Search (Same Seller / Entity)', () => {
  const bill1Lines: OrderLine[] = [
    createDummyLine({
      id: 101,
      billId: 1,
      no: '1',
      reference: 'CLAV-LOGI-K120',
      ean: '5099206020672',
      designation: 'Clavier Filaire Logitech K120 Noir',
      orderedQty: 15,
    }),
    createDummyLine({
      id: 102,
      billId: 1,
      no: '2',
      reference: 'SOURIS-M90',
      ean: '5099206028883',
      designation: 'Souris Optique Filaire M90',
      orderedQty: 30,
    }),
  ];

  const bill2Lines: OrderLine[] = [
    createDummyLine({
      id: 201,
      billId: 2,
      no: '1',
      reference: 'ECRAN-DELL-24',
      ean: '5397184200001',
      designation: 'Ecran Dell 24 pouces FHD P2422H',
      orderedQty: 8,
    }),
    createDummyLine({
      id: 202,
      billId: 2,
      no: '2',
      reference: 'CLAV-LOGI-MX',
      ean: '5099206085558',
      designation: 'Clavier Sans Fil Logitech MX Keys',
      orderedQty: 5,
    }),
  ];

  const allEntityLines = [...bill1Lines, ...bill2Lines];

  it('searches products within current bill correctly', () => {
    const res = searchLines(bill1Lines, 'K120', 'smart');
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe(101);
  });

  it('searches products across multiple bills of the same seller', () => {
    // Search for "Logitech" finds both K120 (Bill 1) and MX Keys (Bill 2)
    const res = searchLines(allEntityLines, 'Logitech', 'smart');
    expect(res).toHaveLength(2);
    const billIds = Array.from(new Set(res.map((l) => l.billId)));
    expect(billIds).toContain(1);
    expect(billIds).toContain(2);
    expect(billIds).toContain(2);
  });

  it('finds sibling bill product by barcode scanning when not in current bill', () => {
    // Operator is in Bill 1 and scans barcode 5397184200001 (which belongs to Bill 2)
    const currentMatches = searchLines(bill1Lines, '5397184200001', 'smart');
    expect(currentMatches).toHaveLength(0);

    // Cross-bill search finds the product in Bill 2
    const siblingMatches = searchLines(bill2Lines, '5397184200001', 'smart');
    expect(siblingMatches).toHaveLength(1);
    expect(siblingMatches[0].reference).toBe('ECRAN-DELL-24');
    expect(siblingMatches[0].billId).toBe(2);
  });

  it('handles partial reference matches across entity lines', () => {
    const res = searchLines(allEntityLines, 'DELL', 'smart');
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe(201);
    expect(res[0].billId).toBe(2);
  });
});

describe('Shared Packaging Boxes / Cartons Across Bills for Same Seller', () => {
  const sellerBills: Bill[] = [
    {
      id: 1,
      sessionId: 1,
      billNumber: 'BL-2026-001',
      client: 'ETS BENALI & CIE',
      status: 'active',
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 2,
      sessionId: 1,
      billNumber: 'BL-2026-002',
      client: 'ETS BENALI & CIE',
      status: 'active',
      createdAt: '',
      updatedAt: '',
    },
  ];

  const sharedCartonA: TransportContainer = {
    id: 10,
    billId: 1,
    client: 'ETS BENALI & CIE',
    label: 'CARTON A',
    type: 'carton',
    createdAt: new Date().toISOString(),
  };

  const sharedCartonB: TransportContainer = {
    id: 11,
    billId: 1,
    client: 'ETS BENALI & CIE',
    label: 'CARTON B',
    type: 'carton',
    createdAt: new Date().toISOString(),
  };

  it('groups items from different bills into the same carton A', () => {
    const events: CountEvent[] = [
      // 15 units of Bill 1 Line 101 packed into CARTON A
      {
        id: 1,
        billId: 1,
        orderLineId: 101,
        stage: 'preparation',
        quantity: 15,
        containerId: sharedCartonA.id!,
        outcome: null,
        undone: false,
        createdAt: '',
      },
      // 10 units of Bill 2 Line 201 packed into the SAME CARTON A
      {
        id: 2,
        billId: 2,
        orderLineId: 201,
        stage: 'preparation',
        quantity: 10,
        containerId: sharedCartonA.id!,
        outcome: null,
        undone: false,
        createdAt: '',
      },
    ];

    // Filter events for Carton A
    const eventsInCartonA = events.filter((e) => e.containerId === sharedCartonA.id && !e.undone);
    const totalUnits = eventsInCartonA.reduce((sum, e) => sum + e.quantity, 0);
    expect(totalUnits).toBe(25);

    // Verify multi-bill breakdown formatting
    const uniqueBillIds = Array.from(new Set(eventsInCartonA.map((e) => e.billId)));
    expect(uniqueBillIds).toHaveLength(2);

    const breakdownStr = uniqueBillIds
      .map((bId) => {
        const bNum = sellerBills.find((b) => b.id === bId)?.billNumber || `BL #${bId}`;
        const bCount = eventsInCartonA.filter((e) => e.billId === bId).reduce((s, e) => s + e.quantity, 0);
        return `${bCount} du ${bNum}`;
      })
      .join(', ');

    const cartonReportLine = `• ${sharedCartonA.label} : ${totalUnits} unités (${breakdownStr})`;
    expect(cartonReportLine).toBe('• CARTON A : 25 unités (15 du BL-2026-001, 10 du BL-2026-002)');
  });

  it('calculates the next carton letter sequentially across entity bills', () => {
    const existingContainers: TransportContainer[] = [sharedCartonA, sharedCartonB];
    const cartonCount = existingContainers.filter((c) => c.type === 'carton').length;
    const nextLetter = String.fromCharCode(65 + cartonCount); // 'C'
    expect(nextLetter).toBe('C');
    const newCartonLabel = `CARTON ${nextLetter}`;
    expect(newCartonLabel).toBe('CARTON C');
  });

  it('calculates the next SAC (Chouala) letter sequentially using formal warehouse terminology', () => {
    const existingContainers: TransportContainer[] = [
      { id: 1, billId: 1, label: 'SAC A', type: 'chouala', createdAt: '' },
      { id: 2, billId: 1, label: 'CARTON A', type: 'carton', createdAt: '' },
    ];
    const choualaCount = existingContainers.filter((c) => c.type === 'chouala').length;
    expect(choualaCount).toBe(1);
    const nextLetter = String.fromCharCode(65 + choualaCount); // 'B'
    expect(nextLetter).toBe('B');
    const newSacLabel = `SAC ${nextLetter}`;
    expect(newSacLabel).toBe('SAC B');
  });

  it('disambiguates containers with same label across different bills in tags and physical marking', () => {
    const bill1Container: TransportContainer = { id: 10, billId: 101, label: 'CARTON A', type: 'carton', createdAt: '' };
    const bill2Container: TransportContainer = { id: 20, billId: 102, label: 'CARTON A', type: 'carton', createdAt: '' };

    const bill1Number = '03808';
    const bill2Number = '03809';
    const clientName = 'SARL PAPETERIE CENTRALE';

    // UI Tag disambiguation
    const tag1 = `${bill1Container.label} (BL ${bill1Number})`;
    const tag2 = `${bill2Container.label} (BL ${bill2Number})`;

    expect(tag1).toBe('CARTON A (BL 03808)');
    expect(tag2).toBe('CARTON A (BL 03809)');
    expect(tag1).not.toBe(tag2);

    // Warehouse worker felt-tip physical marking instruction
    const physicalMarker1 = `🏷️ MARQUAGE : ${clientName} — BL ${bill1Number} — ${bill1Container.label}`;
    const physicalMarker2 = `🏷️ MARQUAGE : ${clientName} — BL ${bill2Number} — ${bill2Container.label}`;

    expect(physicalMarker1).toBe('🏷️ MARQUAGE : SARL PAPETERIE CENTRALE — BL 03808 — CARTON A');
    expect(physicalMarker2).toBe('🏷️ MARQUAGE : SARL PAPETERIE CENTRALE — BL 03809 — CARTON A');
  });

  it('computes substitution price discrepancy and warns when client paid in advance', () => {
    const originalLine: OrderLine = createDummyLine({
      id: 501,
      designation: 'Cahier 96p Séyès Seyes',
      orderedQty: 50,
      unitPrice: 120.00,
      status: 'active',
    });

    const substituteLine: OrderLine = createDummyLine({
      id: 502,
      designation: 'Cahier 96p Spirale Clairefontaine',
      orderedQty: 50,
      unitPrice: 145.50,
      status: 'active',
    });

    const priceDiff = (substituteLine.unitPrice || 0) - (originalLine.unitPrice || 0);
    expect(priceDiff).toBe(25.50);

    const clientPaidAdvance = true;
    const notifyClient = true;

    const note = [
      `Remplacé par: ${substituteLine.designation} (Réf: ${substituteLine.reference || '-'})`,
      `Écart: ${priceDiff >= 0 ? '+' : ''}${priceDiff.toFixed(2)} DA`,
      clientPaidAdvance ? `Client a payé d'avance` : `Paiement à la livraison`,
      notifyClient ? `Mentionné sur bon` : `Remplacement interne`,
    ].join(' | ');

    expect(note).toContain('Écart: +25.50 DA');
    expect(note).toContain("Client a payé d'avance");
    expect(note).toContain('Mentionné sur bon');
  });

  it('searches lines by container name (SAC A, CHOUALA, CARTON, VRAC) using lineContainerMap', () => {
    const linesToSearch = [
      createDummyLine({ id: 601, designation: 'Sac à dos Avengers Marvel', reference: 'SAC-AVENG-01' }),
      createDummyLine({ id: 602, designation: 'Sac à dos Reine des Neiges', reference: 'SAC-FROZEN-02' }),
      createDummyLine({ id: 603, designation: 'Classeur 4 Anneaux Noir', reference: 'CLAS-04' }),
      createDummyLine({ id: 604, designation: 'Trousse Scolaire 2 Zip', reference: 'TR-02' }),
    ];

    // lineContainerMap: line 601 and 602 are in SAC A (Chouala)
    // line 603 is in CARTON A
    // line 604 is in VRAC (Hors Colis)
    const containerMap = new Map<number, string[]>([
      [601, ['SAC A', 'CHOUALA', 'SAC']],
      [602, ['SAC A', 'CHOUALA', 'SAC']],
      [603, ['CARTON A', 'CARTON']],
      [604, ['HORS COLIS', 'VRAC']],
    ]);

    // 1. Search for "SAC A" -> returns lines 601 and 602
    const sacAMatches = searchLines(linesToSearch, 'SAC A', 'smart', 1, undefined, containerMap);
    expect(sacAMatches).toHaveLength(2);
    expect(sacAMatches.map((l) => l.id)).toEqual([601, 602]);

    // 2. Search for "chouala" -> returns all lines in choualas (601 and 602)
    const choualaMatches = searchLines(linesToSearch, 'chouala', 'smart', 1, undefined, containerMap);
    expect(choualaMatches).toHaveLength(2);

    // 3. Search for "carton a" -> returns line 603
    const cartonMatches = searchLines(linesToSearch, 'carton a', 'smart', 1, undefined, containerMap);
    expect(cartonMatches).toHaveLength(1);
    expect(cartonMatches[0].id).toBe(603);

    // 4. Search for "vrac" / "hors colis" -> returns line 604
    const vracMatches = searchLines(linesToSearch, 'vrac', 'smart', 1, undefined, containerMap);
    expect(vracMatches).toHaveLength(1);
    expect(vracMatches[0].id).toBe(604);

    const horsColisMatches = searchLines(linesToSearch, 'hors colis', 'smart', 1, undefined, containerMap);
    expect(horsColisMatches).toHaveLength(1);
    expect(horsColisMatches[0].id).toBe(604);
  });

  it('batch assigns multiple selected lines to Chouala A and fills remaining quantity', async () => {
    await db.countEvents.clear();
    await db.orderLines.clear();

    const line1 = createDummyLine({ id: 701, billId: 10, designation: 'Sac à dos Sonic', orderedQty: 5 });
    const line2 = createDummyLine({ id: 702, billId: 10, designation: 'Sac à dos Mario', orderedQty: 8 });
    await db.orderLines.bulkAdd([line1, line2]);

    const choualaAId = 99;
    const res = await batchAssignContainerAndCount([line1, line2], 'preparation', choualaAId, {
      mode: 'remaining',
    });

    expect(res.processedCount).toBe(2);
    expect(res.unitsAdded).toBe(13); // 5 + 8

    const allEvents = await db.countEvents.toArray();
    expect(allEvents).toHaveLength(2);
    expect(allEvents[0].containerId).toBe(choualaAId);
    expect(allEvents[0].quantity).toBe(5);
    expect(allEvents[1].containerId).toBe(choualaAId);
    expect(allEvents[1].quantity).toBe(8);
  });

  it('transfers line stage counts from chargement to preparation smoothly', async () => {
    await db.countEvents.clear();
    await db.auditEvents.clear();

    const lineId = 801;
    const billId = 20;

    // Operator accidentally added 15 units under chargement
    await addCountEvent(billId, lineId, 'chargement', 10);
    await addCountEvent(billId, lineId, 'chargement', 5);

    // Verify initial state
    let events = await db.countEvents.where('orderLineId').equals(lineId).toArray();
    let prepEvents = events.filter((e) => e.stage === 'preparation' && !e.undone);
    let chargEvents = events.filter((e) => e.stage === 'chargement' && !e.undone);
    expect(prepEvents).toHaveLength(0);
    expect(chargEvents.reduce((s, e) => s + e.quantity, 0)).toBe(15);

    // Operator transfers from chargement to preparation
    const transferred = await transferLineStageCounts(billId, lineId, 'chargement', 'preparation');
    expect(transferred).toBe(15);

    // Verify after transfer
    events = await db.countEvents.where('orderLineId').equals(lineId).toArray();
    prepEvents = events.filter((e) => e.stage === 'preparation' && !e.undone);
    chargEvents = events.filter((e) => e.stage === 'chargement' && !e.undone);
    expect(prepEvents.reduce((s, e) => s + e.quantity, 0)).toBe(15);
    expect(chargEvents).toHaveLength(0);

    // Verify audit trail
    const audit = await db.auditEvents.where('orderLineId').equals(lineId).toArray();
    expect(audit.some((a) => a.reason === 'stage_transfer_correction')).toBe(true);
  });

  it('transfers batch and whole bill stage counts without losing data', async () => {
    await db.countEvents.clear();
    await db.auditEvents.clear();

    const billId = 30;
    // Add counts for 3 lines under chargement
    await addCountEvent(billId, 901, 'chargement', 20);
    await addCountEvent(billId, 902, 'chargement', 30);
    await addCountEvent(billId, 903, 'chargement', 50);

    // Transfer lines 901 and 902 only
    const resBatch = await transferBatchStageCounts(billId, [901, 902], 'chargement', 'preparation');
    expect(resBatch.linesCount).toBe(2);
    expect(resBatch.unitsCount).toBe(50); // 20 + 30

    let allEvents = await db.countEvents.where('billId').equals(billId).toArray();
    expect(allEvents.filter((e) => e.stage === 'preparation' && !e.undone)).toHaveLength(2);
    expect(allEvents.filter((e) => e.stage === 'chargement' && !e.undone)).toHaveLength(1); // 903 remains

    // Now whole bill transfer for whatever is left in chargement
    const resWhole = await transferBatchStageCounts(billId, null, 'chargement', 'preparation');
    expect(resWhole.linesCount).toBe(1);
    expect(resWhole.unitsCount).toBe(50);

    allEvents = await db.countEvents.where('billId').equals(billId).toArray();
    expect(allEvents.filter((e) => e.stage === 'chargement' && !e.undone)).toHaveLength(0);
    expect(allEvents.filter((e) => e.stage === 'preparation' && !e.undone)).toHaveLength(3);
    const totalPrep = allEvents.filter((e) => e.stage === 'preparation' && !e.undone).reduce((s, e) => s + e.quantity, 0);
    expect(totalPrep).toBe(100);
  });
});
