// ============================================================
// POINTAGE — Unit Tests for Business Logic
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  calcBatchQty,
  sumStageEvents,
  calcDiscrepancy,
  generateReferenceAliases,
  smartSearchScore,
  calcPackBreakdown,
  lineBlocksCompletion,
} from './logic';
import type { CountEvent, OrderLine } from './types';

function makeEvent(overrides: Partial<CountEvent> = {}): CountEvent {
  return {
    id: 1,
    billId: 1,
    orderLineId: 1,
    stage: 'preparation',
    quantity: 0,
    containerId: null,
    outcome: null,
    undone: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeLine(overrides: Partial<OrderLine> = {}): OrderLine {
  return {
    id: 1,
    billId: 1,
    originalNo: '1',
    originalPage: 1,
    originalReference: 'REF001',
    originalEan: '1234567890123',
    originalDesignation: 'Test product',
    originalOrderedQty: 100,
    no: '1',
    page: 1,
    reference: 'REF001',
    ean: '1234567890123',
    designation: 'Test product',
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

describe('Package arithmetic', () => {
  it('inner = 12, 11 inner + 5 loose = 137', () => {
    expect(calcBatchQty(0, 11, 5, null, 12)).toBe(137);
  });

  it('nested: outer=144, inner=12, 2 outer + 3 inner + 5 loose = 329', () => {
    expect(calcBatchQty(2, 3, 5, 144, 12)).toBe(329);
  });

  it('loose only', () => {
    expect(calcBatchQty(0, 0, 42, null, null)).toBe(42);
  });

  it('outer only', () => {
    expect(calcBatchQty(3, 0, 0, 144, null)).toBe(432);
  });
});

describe('Remaining / Over', () => {
  it('expected 120, current 72 = 48 remaining', () => {
    const line = makeLine({ orderedQty: 120 });
    const d = calcDiscrepancy(line, 72);
    expect(d.remaining).toBe(48);
    expect(d.isShort).toBe(true);
    expect(d.isOver).toBe(false);
    expect(d.isExact).toBe(false);
  });

  it('expected 120, current 132 = 12 over', () => {
    const line = makeLine({ orderedQty: 120 });
    const d = calcDiscrepancy(line, 132);
    expect(d.over).toBe(12);
    expect(d.isOver).toBe(true);
    expect(d.isShort).toBe(false);
  });

  it('expected 120, current 120 = exact', () => {
    const line = makeLine({ orderedQty: 120 });
    const d = calcDiscrepancy(line, 120);
    expect(d.isExact).toBe(true);
    expect(d.remaining).toBe(0);
    expect(d.over).toBe(0);
  });
});

describe('Bill modification', () => {
  it('original 72, current 60, prepared 72 = modified + 12 over', () => {
    const line = makeLine({
      originalOrderedQty: 72,
      orderedQty: 60,
    });
    const d = calcDiscrepancy(line, 72);
    expect(d.isModified).toBe(true);
    expect(d.over).toBe(12);
    expect(d.isOver).toBe(true);
    expect(d.expected).toBe(60);
    expect(d.counted).toBe(72);
  });
});

describe('Independent stages', () => {
  it('prepared 120, loaded remains 0 until LOAD event', () => {
    const events: CountEvent[] = [
      makeEvent({ stage: 'preparation', quantity: 120 }),
    ];
    expect(sumStageEvents(events, 'preparation')).toBe(120);
    expect(sumStageEvents(events, 'chargement')).toBe(0);
    expect(sumStageEvents(events, 'pointage')).toBe(0);
  });
});

describe('Pointage outcomes', () => {
  it('loaded 120, accepted 108, damaged refused 12, missing 0', () => {
    const loadEvents: CountEvent[] = [
      makeEvent({ stage: 'chargement', quantity: 120 }),
    ];
    const pointageEvents: CountEvent[] = [
      makeEvent({ stage: 'pointage', quantity: 108, outcome: 'accepted' }),
      makeEvent({ stage: 'pointage', quantity: 12, outcome: 'damaged_refused' }),
    ];
    expect(sumStageEvents(loadEvents, 'chargement')).toBe(120);
    const totalPointage = sumStageEvents(pointageEvents, 'pointage');
    expect(totalPointage).toBe(120);
    // missing = loaded - total pointage accounted
    expect(120 - totalPointage).toBe(0);
  });
});

describe('Not found / Cancelled', () => {
  it('not found line = shortage of full expected', () => {
    const line = makeLine({ orderedQty: 72, status: 'not_found' });
    const d = calcDiscrepancy(line, 0);
    expect(d.remaining).toBe(72);
    expect(d.isShort).toBe(true);
  });

  it('cancelled line does not block completion', () => {
    const line = makeLine({ status: 'cancelled' });
    expect(lineBlocksCompletion(line)).toBe(false);
  });
});

describe('Compound reference aliases', () => {
  it('70380/84 generates range aliases', () => {
    const aliases = generateReferenceAliases('70380/84');
    expect(aliases).toContain('70380');
    expect(aliases).toContain('70381');
    expect(aliases).toContain('70382');
    expect(aliases).toContain('70383');
    expect(aliases).toContain('70384');
    expect(aliases.length).toBe(5);
  });

  it('search 70382 matches alias', () => {
    const line = makeLine({
      reference: '70380/84',
      referenceAliases: generateReferenceAliases('70380/84'),
    });
    const score = smartSearchScore(line, '70382');
    expect(score).toBe(6); // alias match priority
  });

  it('space-separated tokens indexed', () => {
    const aliases = generateReferenceAliases('48002 48008');
    expect(aliases).toContain('48002');
    expect(aliases).toContain('48008');
  });

  it('plain reference produces no aliases', () => {
    const aliases = generateReferenceAliases('25073');
    expect(aliases).toEqual([]);
  });
});

describe('Pack breakdown', () => {
  it('137 units, pack 12 = 11 full + 5 loose', () => {
    const { fullPacks, loose } = calcPackBreakdown(137, 12);
    expect(fullPacks).toBe(11);
    expect(loose).toBe(5);
  });

  it('no pack size = all loose', () => {
    const { fullPacks, loose } = calcPackBreakdown(42, null);
    expect(fullPacks).toBe(0);
    expect(loose).toBe(42);
  });
});

describe('Undone events excluded', () => {
  it('undone events are not counted', () => {
    const events: CountEvent[] = [
      makeEvent({ stage: 'preparation', quantity: 50, undone: false }),
      makeEvent({ stage: 'preparation', quantity: 30, undone: true }),
      makeEvent({ stage: 'preparation', quantity: 20, undone: false }),
    ];
    expect(sumStageEvents(events, 'preparation')).toBe(70);
  });
});

describe('Smart search ranking and priority', () => {
  it('exact reference (score 1) outranks exact N° (score 3)', () => {
    const lineRef = makeLine({ reference: '12', no: '12' });
    // Search "12" matches reference first
    expect(smartSearchScore(lineRef, '12', 1)).toBe(1);
  });

  it('exact N° in selected bill scores 3', () => {
    const line = makeLine({ billId: 1, no: '5', reference: 'XYZ' });
    expect(smartSearchScore(line, '5', 1)).toBe(3);
  });

  it('exact N° in global search scores 3.1', () => {
    const line = makeLine({ billId: 1, no: '5', reference: 'XYZ' });
    expect(smartSearchScore(line, '5')).toBe(3.1);
  });

  it('exact EAN (score 4) outranks designation (score 8)', () => {
    const line = makeLine({ ean: '12345678', designation: 'Contains 12345678 inside' });
    expect(smartSearchScore(line, '12345678')).toBe(4);
  });

  it('number inside designation does not outrank exact N° or reference', () => {
    const lineWithNumInName = makeLine({ no: '99', designation: 'CAHIER 96 PAGES A4' });
    const lineExactNo = makeLine({ no: '96', designation: 'STYLO' });

    const scoreName = smartSearchScore(lineWithNumInName, '96', 1); // 8 (partial designation)
    const scoreExactNo = smartSearchScore(lineExactNo, '96', 1);    // 3 (exact N°)

    expect(scoreExactNo).toBeLessThan(scoreName);
  });
});

describe('Status blocking rules', () => {
  it('active line blocks completion', () => {
    expect(lineBlocksCompletion(makeLine({ status: 'active' }))).toBe(true);
  });

  it('not_found line blocks completion (never treated as cancelled)', () => {
    expect(lineBlocksCompletion(makeLine({ status: 'not_found' }))).toBe(true);
  });

  it('cancelled line does not block completion', () => {
    expect(lineBlocksCompletion(makeLine({ status: 'cancelled' }))).toBe(false);
  });

  it('removed_by_revision line does not block completion', () => {
    expect(lineBlocksCompletion(makeLine({ status: 'removed_by_revision' }))).toBe(false);
  });
});

