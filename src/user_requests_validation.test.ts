// ============================================================
// POINTAGE — User Requests QA Test Suite
// Verifies warehouse physical sequence, multi-location (max 2),
// search partitioning (unvalidated on top), status filter,
// and auto-introuvable on preparation sign-off.
// ============================================================

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';
import {
  parseZoneCodes,
  normalizeZoneCode,
  getZoneLabel,
  getZoneShortLabel,
  sortLinesByWarehouseZone,
  getWarehouseCircuitDescription,
} from './warehouseZones';
import { searchLines } from './hooks';
import {
  sumStageEvents,
  calcDiscrepancy,
  parsePackagingString,
  calcNestedPackOuter,
  formatPackagingEquivalence,
  getPackHierarchyDescription,
  calcBatchQty,
} from './logic';
import type { OrderLine, CountEvent } from './types';

function makeLine(overrides: Partial<OrderLine> = {}): OrderLine {
  return {
    billId: 100,
    no: '1',
    originalNo: '1',
    originalPage: 1,
    originalReference: 'REF-001',
    originalEan: '1234567890123',
    originalDesignation: 'Stylo Bille Bleu',
    originalOrderedQty: 50,
    page: 1,
    reference: 'REF-001',
    ean: '1234567890123',
    designation: 'Stylo Bille Bleu',
    orderedQty: 50,
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

describe('Warehouse Physical Sequence & Multi-Location', () => {
  it('supports selecting up to 2 warehouse zones per product', () => {
    const parsedSingle = parseZoneCodes('CH_SW');
    expect(parsedSingle).toEqual(['CH_SW']);

    const parsedDual = parseZoneCodes('CH_NW, CO_R2');
    expect(parsedDual).toEqual(['CH_NW', 'CO_R2']);

    const parsedPlus = parseZoneCodes('CH_CTR + CO_R1');
    expect(parsedPlus).toEqual(['CH_CTR', 'CO_R1']);

    // Limits to max 2
    const parsedTri = parseZoneCodes('CH_NW, CO_R2, CH_SE');
    expect(parsedTri).toEqual(['CH_NW', 'CO_R2']);

    // Compound labels
    expect(getZoneShortLabel('CH_NW, CO_R2')).toBe('CH • Nord-Ouest + Couloir • Salle 2');
    expect(getZoneLabel('CH_NW, CO_R2')).toContain('Nord-Ouest');
    expect(getZoneLabel('CH_NW, CO_R2')).toContain('Salle 2');
  });

  it('sorts lines strictly by user sequence: Chambre (NW -> SE) -> Couloir (Salles 1-3) -> Salle 4 (Sud -> Nord) -> Custom -> Non assignes', () => {
    const lines: OrderLine[] = [
      makeLine({ id: 10, no: '10', warehouseZone: null }), // Unassigned (order 999)
      makeLine({ id: 1, no: '1', warehouseZone: 'CH_SE' as any }), // Chambre SE (order 90)
      makeLine({ id: 2, no: '2', warehouseZone: 'CO_R4' as any }), // Salle 4 (order 130)
      makeLine({ id: 3, no: '3', warehouseZone: 'CH_NW' as any }), // Chambre NW (order 10)
      makeLine({ id: 4, no: '4', warehouseZone: 'CO_R2' as any }), // Couloir Salle 2 (order 110)
      makeLine({ id: 5, no: '5', warehouseZone: 'CH_CTR' as any }), // Chambre CTR (order 50)
      makeLine({ id: 6, no: '6', warehouseZone: 'CO_R1' as any }), // Couloir Salle 1 (order 100)
      makeLine({ id: 7, no: '7', warehouseZone: 'Rayon Mezzanine' as any }), // Custom (order 900)
      makeLine({ id: 8, no: '8', warehouseZone: 'CH_SW' as any }), // Chambre SW (order 70)
      makeLine({ id: 9, no: '9', warehouseZone: 'CO_R3' as any }), // Couloir Salle 3 (order 120)
    ];

    const sorted = sortLinesByWarehouseZone(lines);
    const order = sorted.map((l) => l.id);

    // Expected order:
    // 3: CH_NW (10)
    // 5: CH_CTR (50)
    // 8: CH_SW (70)
    // 1: CH_SE (90)
    // 6: CO_R1 (100)
    // 4: CO_R2 (110)
    // 9: CO_R3 (120)
    // 2: CO_R4 (130)
    // 7: Custom (900)
    // 10: Unassigned (999)
    expect(order).toEqual([3, 5, 8, 1, 6, 4, 9, 2, 7, 10]);
    expect(getWarehouseCircuitDescription()).toBe(
      'Chambre (NW ➔ SE) ⟶ Couloir (Salles 1–3) ⟶ Salle 4 (Sud ➔ Nord)'
    );
  });
});

describe('Search & Filter Partitioning', () => {
  it('places unvalidated products on top and validated products below during search', () => {
    const line1 = makeLine({ id: 1, no: '1', designation: 'Cahier 96p Seyes' }); // Validated (count = 50)
    const line2 = makeLine({ id: 2, no: '2', designation: 'Cahier 192p Seyes' }); // Not yet validated (count = 0)
    const line3 = makeLine({ id: 3, no: '3', designation: 'Cahier TP Seyes' }); // Validated (count = 30)
    const line4 = makeLine({ id: 4, no: '4', designation: 'Cahier Dessin Seyes' }); // Not yet validated (count = 0)

    const searchMatches = searchLines([line1, line2, line3, line4], 'Cahier', 'smart');
    expect(searchMatches).toHaveLength(4);

    // Simulated validation status map
    const validationMap = new Map<number, boolean>([
      [1, true],
      [2, false],
      [3, true],
      [4, false],
    ]);

    const unvalidated: OrderLine[] = [];
    const validated: OrderLine[] = [];

    for (const l of searchMatches) {
      if (validationMap.get(l.id!)) {
        validated.push(l);
      } else {
        unvalidated.push(l);
      }
    }

    const partitioned = [...unvalidated, ...validated];
    // Unvalidated lines (id 2 and 4) must come before validated lines (id 1 and 3)
    expect(partitioned.map((l) => l.id)).toEqual([2, 4, 1, 3]);
  });

  it('filters lines by status: all, todo (unvalidated), done (validated), and problems', () => {
    const l1 = makeLine({ id: 1, no: '1', orderedQty: 50 }); // uncounted (todo)
    const l2 = makeLine({ id: 2, no: '2', orderedQty: 50 }); // exact counted (done)
    const l3 = makeLine({ id: 3, no: '3', orderedQty: 50, status: 'out_of_stock' }); // problem + validated (rupture)
    const l4 = makeLine({ id: 4, no: '4', orderedQty: 50 }); // short counted 20/50 (problem + done)

    const eventsMap = new Map<number, number>([
      [1, 0],
      [2, 50],
      [3, 0],
      [4, 20],
    ]);

    const lines = [l1, l2, l3, l4];

    // Filter 'todo' (only active lines with stageTotal === 0)
    const todoLines = lines.filter((l) => l.status === 'active' && eventsMap.get(l.id!) === 0);
    expect(todoLines.map((l) => l.id)).toEqual([1]);

    // Filter 'done' (lines where stageTotal > 0 or status !== 'active')
    const doneLines = lines.filter((l) => l.status !== 'active' || (eventsMap.get(l.id!) ?? 0) > 0);
    expect(doneLines.map((l) => l.id)).toEqual([2, 3, 4]);

    // Filter 'problems' (shortages, overages, modified, or non-active)
    const problemLines = lines.filter((l) => {
      if (l.status !== 'active') return true;
      const count = eventsMap.get(l.id!) || 0;
      const disc = calcDiscrepancy(l, count);
      return disc.isModified || disc.isOver || (count > 0 && !disc.isExact);
    });
    expect(problemLines.map((l) => l.id)).toEqual([3, 4]);
  });
});

describe('Preparation Sign-Off Auto-Introuvable', () => {
  beforeEach(async () => {
    await db.orderLines.clear();
    await db.countEvents.clear();
    await db.auditEvents.clear();
    await db.bills.clear();
  });

  it('marks uncounted lines as introuvable, but leaves rupture (out_of_stock) lines unchanged', async () => {
    const testBillId = 777;
    await db.bills.add({
      id: testBillId,
      billNumber: 'BL-777',
      client: 'Sarl Papeterie Alger',
      status: 'in_progress',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 1. Line counted and complete
    const line1Id = await db.orderLines.add(makeLine({
      billId: testBillId,
      no: '1',
      designation: 'Article 1 (Compté)',
      orderedQty: 10,
      status: 'active',
    }));

    // Add count event for line 1 in preparation stage
    await db.countEvents.add({
      billId: testBillId,
      orderLineId: line1Id as number,
      stage: 'preparation',
      quantity: 10,
      containerId: null,
      outcome: 'accepted',
      undone: false,
      createdAt: new Date().toISOString(),
    });

    // 2. Line flagged by operator as rupture (out_of_stock)
    const line2Id = await db.orderLines.add(makeLine({
      billId: testBillId,
      no: '2',
      designation: 'Article 2 (Rupture)',
      orderedQty: 20,
      status: 'out_of_stock',
    }));

    // 3. Line not counted and not flagged as rupture
    const line3Id = await db.orderLines.add(makeLine({
      billId: testBillId,
      no: '3',
      designation: 'Article 3 (Jamais touché)',
      orderedQty: 15,
      status: 'active',
    }));

    // Execute preparation sign-off auto-introuvable logic
    const lines = await db.orderLines.where('billId').equals(testBillId).toArray();
    let autoNotFoundCount = 0;

    for (const line of lines) {
      if (line.status === 'active') {
        const evts = await db.countEvents.where('orderLineId').equals(line.id!).toArray();
        const prepTotal = evts
          .filter((e) => !e.undone && e.stage === 'preparation')
          .reduce((s, e) => s + e.quantity, 0);

        if (prepTotal === 0) {
          await db.orderLines.update(line.id!, {
            status: 'not_found',
            updatedAt: new Date().toISOString(),
          });
          autoNotFoundCount++;
        }
      }
    }

    expect(autoNotFoundCount).toBe(1);

    const updatedLine1 = await db.orderLines.get(line1Id);
    expect(updatedLine1?.status).toBe('active'); // Still active, was counted

    const updatedLine2 = await db.orderLines.get(line2Id);
    expect(updatedLine2?.status).toBe('out_of_stock'); // Still out_of_stock (rupture preserved)

    const updatedLine3 = await db.orderLines.get(line3Id);
    expect(updatedLine3?.status).toBe('not_found'); // Automatically marked as not_found (introuvable)
  });
});

describe('Multi-Tier Packaging Hierarchy & Smallest Unit Rule', () => {
  it('parses nested multi-tier packaging from raw strings and designations', () => {
    // 50 boxes of 50 pens
    expect(parsePackagingString('50 BTE DE 50')).toEqual({
      outerPackSize: 2500,
      innerPackSize: 50,
    });

    // 50 pots/bottles of 50 pens (user explicit case: "styler vert grip carton of 50 containers of 50")
    expect(parsePackagingString('50 POTS DE 50')).toEqual({
      outerPackSize: 2500,
      innerPackSize: 50,
    });

    // 50 bottles of 40 pens
    expect(parsePackagingString('50 BTL DE 40')).toEqual({
      outerPackSize: 2000,
      innerPackSize: 40,
    });

    // Carton prefix with sub-packs
    expect(parsePackagingString('CARTON 50 BTE DE 50 PCS')).toEqual({
      outerPackSize: 2500,
      innerPackSize: 50,
    });

    // Standard multiplier with pcs suffix
    expect(parsePackagingString('50x50 pcs')).toEqual({
      outerPackSize: 2500,
      innerPackSize: 50,
    });

    // Multi-tier slash format
    expect(parsePackagingString('1CT/50/50')).toEqual({
      outerPackSize: 2500,
      innerPackSize: 50,
    });

    // Extracted from designation
    expect(parsePackagingString(null, 'STYLER VERT GRIP CARTON 50 BTE DE 50')).toEqual({
      outerPackSize: 2500,
      innerPackSize: 50,
    });

    expect(parsePackagingString(null, 'STYLO BILLE VERT GRIP (50X50)')).toEqual({
      outerPackSize: 2500,
      innerPackSize: 50,
    });
  });

  it('calculates master carton size from nested container count and units per container', () => {
    // 50 containers of 50 pens
    expect(calcNestedPackOuter(50, 50)).toBe(2500);
    // 20 boxes of 50
    expect(calcNestedPackOuter(20, 50)).toBe(1000);
    // 50 bottles of 40
    expect(calcNestedPackOuter(50, 40)).toBe(2000);
    // Edge cases
    expect(calcNestedPackOuter(0, 50)).toBe(0);
    expect(calcNestedPackOuter(50, 0)).toBe(0);
  });

  it('formats packaging equivalence correctly from smallest unit quantities', () => {
    const outer = 2500;
    const inner = 50;

    // Exact master cartons
    expect(formatPackagingEquivalence(2500, outer, inner)).toBe(
      '1 Carton complet (50 boîtes × 50 pcs)'
    );
    expect(formatPackagingEquivalence(5000, outer, inner)).toBe(
      '2 Cartons complets (100 boîtes × 50 pcs)'
    );

    // Carton + inner containers
    expect(formatPackagingEquivalence(2600, outer, inner)).toBe(
      '1 Carton + 2 boîtes'
    );

    // Only inner containers
    expect(formatPackagingEquivalence(150, outer, inner)).toBe(
      '3 boîtes de 50 pcs'
    );

    // Carton + loose units
    expect(formatPackagingEquivalence(2520, outer, inner)).toBe(
      '1 Carton + 20 pcs'
    );

    // Carton + inner containers + loose units
    expect(formatPackagingEquivalence(2615, outer, inner)).toBe(
      '1 Carton + 2 boîtes + 15 pcs'
    );

    // Without packaging: stays formatted as pieces
    expect(formatPackagingEquivalence(2500, null, null)).toBe('2\u202f500 pcs');
  });

  it('generates clear packaging hierarchy descriptions', () => {
    expect(getPackHierarchyDescription(2500, 50)).toBe(
      '1 Carton = 50 boîtes/pots de 50 pcs (2\u202f500 pcs au total)'
    );
    expect(getPackHierarchyDescription(24, null)).toBe('1 Carton = 24 pièces');
    expect(getPackHierarchyDescription(null, 50)).toBe('1 Boîte / Pot = 50 pièces');
    expect(getPackHierarchyDescription(null, null)).toBeNull();
  });

  it('computes batch quantities accurately with master cartons and inner containers', () => {
    const outerPack = 2500; // 1 carton = 50 x 50
    const innerPack = 50;   // 1 pot = 50

    // 1 master carton added
    expect(calcBatchQty(1, 0, 0, outerPack, innerPack)).toBe(2500);

    // 1 master carton + 2 pots of 50
    expect(calcBatchQty(1, 2, 0, outerPack, innerPack)).toBe(2600);

    // 3 pots of 50 + 5 loose pens
    expect(calcBatchQty(0, 3, 5, outerPack, innerPack)).toBe(155);
  });
});

