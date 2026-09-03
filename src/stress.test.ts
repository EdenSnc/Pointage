// ============================================================
// POINTAGE — Deep Stress & Edge-Case Test Suite
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  calcBatchQty,
  calcDiscrepancy,
  calcPackBreakdown,
  calcBillProgress,
  lineBlocksCompletion,
  generateReferenceAliases,
  smartSearchScore,
  sumStageEvents,
  getStageTotals,
} from './logic';
import { parseImportJSON, validateImport } from './importer';
import type { OrderLine, CountEvent, Bill } from './types';

function makeLine(overrides: Partial<OrderLine> = {}): OrderLine {
  return {
    id: 1,
    billId: 1,
    originalNo: '1',
    originalPage: 1,
    originalReference: 'REF-100',
    originalEan: '300000000001',
    originalDesignation: 'Test Article',
    originalOrderedQty: 100,
    no: '1',
    page: 1,
    reference: 'REF-100',
    ean: '300000000001',
    designation: 'Test Article',
    orderedQty: 100,
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

describe('Deep Stress 1: Mathematical Boundary Cases in Packaging & Counting', () => {
  it('handles zero values across all inputs', () => {
    expect(calcBatchQty(0, 0, 0, null, null)).toBe(0);
    expect(calcBatchQty(0, 0, 0, 24, 6)).toBe(0);
  });

  it('handles extreme and huge warehouse quantities without overflow or loss of precision', () => {
    // 500 outer cartons of 1000 units = 500,000 units
    expect(calcBatchQty(500, 0, 0, 1000, null)).toBe(500000);
    // 250 inner packs of 12 + 750 loose
    expect(calcBatchQty(0, 250, 750, null, 12)).toBe(3750);
  });

  it('safely handles missing or 0 pack sizes without dividing by zero', () => {
    const { fullPacks, loose } = calcPackBreakdown(55, 0);
    expect(fullPacks).toBe(0);
    expect(loose).toBe(55);

    const breakdownNeg = calcPackBreakdown(55, -5);
    expect(breakdownNeg.fullPacks).toBe(0);
    expect(breakdownNeg.loose).toBe(55);

    const breakdown1 = calcPackBreakdown(55, 1);
    expect(breakdown1.fullPacks).toBe(0);
    expect(breakdown1.loose).toBe(55);
  });

  it('correctly calculates pack breakdown for standard carton sizes', () => {
    // 130 units with pack size 24 -> 5 full packs (120) + 10 loose
    const { fullPacks, loose } = calcPackBreakdown(130, 24);
    expect(fullPacks).toBe(5);
    expect(loose).toBe(10);
  });
});

describe('Deep Stress 2: Discrepancy & Modification Scenarios', () => {
  it('handles 0 expected quantity with counted units (unplanned goods received)', () => {
    const line = makeLine({ orderedQty: 0 });
    const disc = calcDiscrepancy(line, 15);
    expect(disc.isOver).toBe(true);
    expect(disc.over).toBe(15);
    expect(disc.remaining).toBe(0);
    expect(disc.isExact).toBe(false);
  });

  it('handles expected quantity with 0 counted (complete shortage)', () => {
    const line = makeLine({ orderedQty: 50 });
    const disc = calcDiscrepancy(line, 0);
    expect(disc.isShort).toBe(true);
    expect(disc.remaining).toBe(50);
    expect(disc.isExact).toBe(false);
    expect(disc.isOver).toBe(false);
  });

  it('correctly flags modified line when expected quantity changed from original manifest', () => {
    const line = makeLine({
      originalOrderedQty: 100,
      orderedQty: 60, // supervisor edited expected quantity down to 60
    });
    const disc = calcDiscrepancy(line, 60);
    expect(disc.isModified).toBe(true);
    expect(disc.isExact).toBe(true);
    expect(disc.expected).toBe(60);
    expect(disc.remaining).toBe(0);
  });

  it('reconciles overages cleanly when counted > expected', () => {
    const line = makeLine({ orderedQty: 40 });
    const disc = calcDiscrepancy(line, 45);
    expect(disc.isOver).toBe(true);
    expect(disc.over).toBe(5);
    expect(disc.remaining).toBe(0);
    expect(disc.isExact).toBe(false);
  });
});

describe('Deep Stress 3: Compound Reference Parsing & Alias Fuzzing', () => {
  it('parses multi-item range suffixes (e.g. 70380/84 -> 5 distinct references)', () => {
    const aliases = generateReferenceAliases('70380/84');
    expect(aliases).toEqual(['70380', '70381', '70382', '70383', '70384']);
  });

  it('parses space-separated compound codes (e.g. "48002 48008")', () => {
    const aliases = generateReferenceAliases('48002 48008');
    expect(aliases).toContain('48002');
    expect(aliases).toContain('48008');
  });

  it('safely rejects invalid or non-range suffixes', () => {
    // Suffix is less than base suffix (not an increasing range)
    expect(generateReferenceAliases('70380/20')).toEqual([]);
    // Suffix range too wide (> 20 items to prevent memory explosion)
    expect(generateReferenceAliases('1000/9999')).toEqual([]);
    // Non-numeric or null
    expect(generateReferenceAliases('')).toEqual([]);
    expect(generateReferenceAliases(null)).toEqual([]);
    expect(generateReferenceAliases('ABC/DEF')).toEqual([]);
  });
});

describe('Deep Stress 4: Smart Search Priority & Input Normalization', () => {
  const line = makeLine({
    no: '7',
    reference: 'REF-777',
    originalReference: 'ORIG-777',
    ean: '400000000007',
    designation: 'Cahier de dessin 7mm grand format',
    referenceAliases: ['REF777', '777'],
  });

  it('returns -1 for empty, null, or whitespace-only queries', () => {
    expect(smartSearchScore(line, '')).toBe(-1);
    expect(smartSearchScore(line, '   ')).toBe(-1);
  });

  it('matches case-insensitively and trims whitespace', () => {
    expect(smartSearchScore(line, '  ref-777  ')).toBe(1);
    expect(smartSearchScore(line, 'orig-777')).toBe(2);
    expect(smartSearchScore(line, 'ref777')).toBe(6);
    expect(smartSearchScore(line, 'dessin')).toBe(8);
  });

  it('guarantees that exact reference beats exact N° which beats EAN which beats designation', () => {
    const sRef = smartSearchScore(line, 'REF-777', 1);
    const sNo = smartSearchScore(line, '7', 1);
    const sEan = smartSearchScore(line, '400000000007', 1);
    const sName = smartSearchScore(line, 'cahier', 1);

    expect(sRef).toBe(1);
    expect(sNo).toBe(3);
    expect(sEan).toBe(4);
    expect(sName).toBe(8);

    expect(sRef).toBeLessThan(sNo);
    expect(sNo).toBeLessThan(sEan);
    expect(sEan).toBeLessThan(sName);
  });
});

describe('Deep Stress 5: Bill Progress & Multi-Status Aggregation', () => {
  it('computes 0% for bills with zero lines or only cancelled lines', () => {
    const progressEmpty = calcBillProgress([], new Map(), 'preparation');
    expect(progressEmpty.percent).toBe(0);
    expect(progressEmpty.total).toBe(0);

    const cancelledLine = makeLine({ id: 1, status: 'cancelled' });
    const progressCancelled = calcBillProgress([cancelledLine], new Map(), 'preparation');
    expect(progressCancelled.percent).toBe(0);
    expect(progressCancelled.total).toBe(0);
  });

  it('accurately computes multi-stage progress with active and fulfilled lines', () => {
    const line1 = makeLine({ id: 1, orderedQty: 20 });
    const line2 = makeLine({ id: 2, orderedQty: 30 });
    const line3 = makeLine({ id: 3, orderedQty: 40 });

    const eventsMap = new Map<number, CountEvent[]>();
    // Line 1 is fulfilled (20/20)
    eventsMap.set(1, [{
      id: 1, billId: 1, orderLineId: 1, stage: 'preparation',
      quantity: 20, containerId: null, outcome: null, undone: false, createdAt: ''
    }]);
    // Line 2 has partial count (15/30) -> not done
    eventsMap.set(2, [{
      id: 2, billId: 1, orderLineId: 2, stage: 'preparation',
      quantity: 15, containerId: null, outcome: null, undone: false, createdAt: ''
    }]);
    // Line 3 has overage count (50/40) -> done!
    eventsMap.set(3, [{
      id: 3, billId: 1, orderLineId: 3, stage: 'preparation',
      quantity: 50, containerId: null, outcome: null, undone: false, createdAt: ''
    }]);

    const progress = calcBillProgress([line1, line2, line3], eventsMap, 'preparation');
    expect(progress.total).toBe(3);
    expect(progress.done).toBe(2); // Line 1 & Line 3 are done
    expect(progress.percent).toBe(67); // 2/3 = 67%
  });
});

describe('Deep Stress 6: JSON Parser Resilience and Schema Fuzzing', () => {
  it('handles invalid JSON strings without crashing', () => {
    const res1 = parseImportJSON('{ invalid: json');
    expect(res1.payload).toBeNull();
    expect(res1.parseError).toContain('Erreur de parsing');

    const res2 = parseImportJSON('null');
    expect(res2.payload).toBeNull();

    const res3 = parseImportJSON('');
    expect(res3.payload).toBeNull();
  });

  it('accepts array of bills format directly without { bills: [...] } wrapper', () => {
    const raw = JSON.stringify([
      {
        billNumber: 'BL-DIRECT-ARRAY',
        client: 'CLIENT DIRECT',
        lines: [{ no: '1', designation: 'Art 1', quantity: 10 }],
      },
    ]);
    const res = parseImportJSON(raw);
    expect(res.parseError).toBeNull();
    expect(res.payload?.bills?.length).toBe(1);
    expect(res.payload?.bills?.[0].billNumber).toBe('BL-DIRECT-ARRAY');
  });

  it('accepts single bill object format directly', () => {
    const raw = JSON.stringify({
      billNumber: 'BL-SINGLE',
      client: 'CLIENT UNIQUE',
      lines: [{ no: '1', designation: 'Art 1', quantity: 25 }],
    });
    const res = parseImportJSON(raw);
    expect(res.parseError).toBeNull();
    expect(res.payload?.bills?.length).toBe(1);
    expect(res.payload?.bills?.[0].client).toBe('CLIENT UNIQUE');
  });

  it('flags bills with no lines or empty lines array as errors', () => {
    const payload = {
      bills: [
        { billNumber: 'BL-EMPTY', client: 'CLIENT', lines: [] },
      ],
    };
    const issues = validateImport(payload);
    expect(issues.some(i => i.field === 'lines' && i.severity === 'error')).toBe(true);
  });
});
