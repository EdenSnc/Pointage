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
  roundDownToPack,
  getStageProblemLines,
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

  it('matches partial barcode (e.g. last 4 digits) with score 7.5', () => {
    const line = makeLine({ ean: '6941782117149', reference: 'REF-250' });
    expect(smartSearchScore(line, '17149')).toBe(7.5);
    expect(smartSearchScore(line, '7821')).toBe(7.5);
  });

  it('matches partial reference with score 7', () => {
    const line = makeLine({ reference: '70380/84' });
    expect(smartSearchScore(line, '70380')).toBe(7);
    expect(smartSearchScore(line, '84')).toBe(7);
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

describe('Pack breakdown safety & sealed pack round down', () => {
  it('handles null, NaN, and negative totals safely without throwing', () => {
    expect(calcPackBreakdown(NaN, 12)).toEqual({ fullPacks: 0, loose: 0 });
    expect(calcPackBreakdown(24, NaN)).toEqual({ fullPacks: 0, loose: 24 });
    expect(calcPackBreakdown(-5, 10)).toEqual({ fullPacks: 0, loose: 0 });
    expect(calcPackBreakdown(25, 5)).toEqual({ fullPacks: 5, loose: 0 });
    expect(calcPackBreakdown(32, 5)).toEqual({ fullPacks: 6, loose: 2 });
  });

  it('rounds down to nearest sealed pack size (e.g. 32 with pack 5 -> 30 served, 2 missing)', () => {
    const res5 = roundDownToPack(32, 5);
    expect(res5).toEqual({ servedQty: 30, missingQty: 2 });

    const res12 = roundDownToPack(32, 12);
    expect(res12).toEqual({ servedQty: 24, missingQty: 8 });

    const resNone = roundDownToPack(32, null);
    expect(resNone).toEqual({ servedQty: 32, missingQty: 0 });
  });

  it('matches 14-digit ITF carton barcode to 13-digit child EAN with score 4.2', () => {
    const line = makeLine({ ean: '6941782103293' });
    // Carton ITF-14 has '1' prefix and check digit
    expect(smartSearchScore(line, '16941782103293')).toBe(4.2);
  });
});

describe('Stage-decoupled problem detection (getStageProblemLines)', () => {
  it('in preparation stage: does NOT flag lines as problem just because chargement is 0', () => {
    const line1 = makeLine({ id: 1, orderedQty: 24, originalOrderedQty: 24, status: 'active' });
    const line2 = makeLine({ id: 2, orderedQty: 36, originalOrderedQty: 36, status: 'active' });
    const line3 = makeLine({ id: 3, orderedQty: 10, originalOrderedQty: 10, status: 'out_of_stock' });

    const eventsByLine = new Map<number, CountEvent[]>([
      [1, [makeEvent({ orderLineId: 1, stage: 'preparation', quantity: 24 })]], // fully prepared, load=0, point=0
      [2, [makeEvent({ orderLineId: 2, stage: 'preparation', quantity: 20 })]], // partially prepared (16 short)
      [3, []], // out of stock
    ]);

    const problems = getStageProblemLines([line1, line2, line3], eventsByLine, 'preparation');
    // line1 is 24/24 -> NOT a problem!
    expect(problems.some(l => l.id === 1)).toBe(false);
    // line2 is 20/36 -> problem in preparation!
    expect(problems.some(l => l.id === 2)).toBe(true);
    // line3 is out_of_stock -> problem!
    expect(problems.some(l => l.id === 3)).toBe(true);
    expect(problems).toHaveLength(2);
  });

  it('in chargement stage: flags line if loaded does not match prepared', () => {
    const line1 = makeLine({ id: 1, orderedQty: 24, originalOrderedQty: 24, status: 'active' });

    // Prepared 24, but only 20 loaded into truck
    const eventsByLine = new Map<number, CountEvent[]>([
      [1, [
        makeEvent({ orderLineId: 1, stage: 'preparation', quantity: 24 }),
        makeEvent({ orderLineId: 1, stage: 'chargement', quantity: 20 }),
      ]],
    ]);

    const problems = getStageProblemLines([line1], eventsByLine, 'chargement');
    expect(problems).toHaveLength(1);
    expect(problems[0].id).toBe(1);
  });
});


