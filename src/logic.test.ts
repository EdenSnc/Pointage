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
  parsePackagingString,
  calcClosestPackRecommendation,
  isDimensionInDesignation,
  serializeCountsForQR,
  parseQRSyncPayload,
  planQRMerge,
  findNormalBackCamera,
  getAvailableBackCameras,
  QRSyncPayload,
} from './logic';

import type { CountEvent, OrderLine, ProductProfile } from './types';
import {
  WAREHOUSE_ZONES,
  normalizeZoneCode,
  getZoneInfo,
  getZoneLabel,
  getZoneShortLabel,
  sortLinesByWarehouseZone,
  getWarehouseCircuitDescription,
} from './warehouseZones';

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

describe('parsePackagingString', () => {
  it('parses total with breakdown "18 (3x6)"', () => {
    const res = parsePackagingString('18 (3x6)');
    expect(res.outerPackSize).toBe(18);
    expect(res.innerPackSize).toBe(6);
  });

  it('parses multiplication "3x6" or "3*6"', () => {
    const res = parsePackagingString('3x6');
    expect(res.outerPackSize).toBe(18);
    expect(res.innerPackSize).toBe(6);
  });

  it('parses cartons "2CT/10" and "1CT/50"', () => {
    expect(parsePackagingString('2CT/10').outerPackSize).toBe(10);
    expect(parsePackagingString('1CT/50').outerPackSize).toBe(50);
    expect(parsePackagingString('Carton 24').outerPackSize).toBe(24);
  });

  it('parses pack sizes from designation if raw is empty', () => {
    const res = parsePackagingString(null, 'PEINTURE PANDA DE 12 34140');
    expect(res.innerPackSize).toBe(12);

    const res2 = parsePackagingString(null, 'MARQUEUR FLUORESCENT EN PRESENTOIR 36 PCS 81216');
    expect(res2.innerPackSize).toBe(36);
  });

  it('rejects dimensions and measurement units (CM, MM, PAGES, ML, GR) from being parsed as packaging', () => {
    // User issue: "REGLE DE 30 CM CRISTAL" should NEVER be parsed as a 30-unit pack!
    expect(parsePackagingString(null, 'REGLE DE 30 CM CRISTAL').innerPackSize).toBeNull();
    expect(parsePackagingString('0,20', 'REGLE DE 30 CM CRISTAL').innerPackSize).toBeNull();
    expect(parsePackagingString(null, 'REGLE 20 CM CRISTAL').innerPackSize).toBeNull();
    expect(parsePackagingString(null, 'CAHIER DE 96 PAGES SEYES').innerPackSize).toBeNull();
    expect(parsePackagingString(null, 'COLLE TRANSPARENTE DE 50 ML').innerPackSize).toBeNull();
    expect(parsePackagingString(null, 'PAPIER PHOTO DE 240 GR').innerPackSize).toBeNull();
    expect(parsePackagingString(null, 'ROULEAU ADHESIF DE 50 M').innerPackSize).toBeNull();
    expect(parsePackagingString(null, 'RUBAN DE 19 MM').innerPackSize).toBeNull();

    // Legitimate packaging units must still be accepted
    expect(parsePackagingString(null, 'BOITE DE 24 FEUTRES').innerPackSize).toBe(24);
    expect(parsePackagingString(null, 'LOT DE 6 CRAYONS HB').innerPackSize).toBe(6);
    expect(parsePackagingString(null, 'SACHET DE 100 ELASTIQUES').innerPackSize).toBe(100);
  });

  it('isDimensionInDesignation correctly identifies physical measurement units', () => {
    expect(isDimensionInDesignation(30, 'REGLE DE 30 CM CRISTAL')).toBe(true);
    expect(isDimensionInDesignation(20, 'REGLE 20 CM')).toBe(true);
    expect(isDimensionInDesignation(96, 'CAHIER DE 96 PAGES')).toBe(true);
    expect(isDimensionInDesignation(30, 'PEINTURE PANDA DE 30 34140')).toBe(false);
  });
});

describe('calcClosestPackRecommendation (Wholesale Nearest-Pack Optimizer)', () => {
  it('user scenario 1: ordered 96 with pack of 30 -> closest is 90 (3 packs, -6 loose removed)', () => {
    const rec = calcClosestPackRecommendation(96, 30);
    expect(rec).not.toBeNull();
    expect(rec?.isExactMultiple).toBe(false);
    expect(rec?.lowerPacks).toBe(3);
    expect(rec?.lowerQty).toBe(90);
    expect(rec?.lowerDiff).toBe(-6);
    expect(rec?.upperPacks).toBe(4);
    expect(rec?.upperQty).toBe(120);
    expect(rec?.upperDiff).toBe(24);
    // Closest is 90 (distance 6 vs 24)
    expect(rec?.closestPacks).toBe(3);
    expect(rec?.closestQty).toBe(90);
    expect(rec?.closestDiff).toBe(-6);
    expect(rec?.closestAction).toBe('round_down');
  });

  it('user scenario 2: ordered 115 with pack of 30 -> closest is 120 (4 packs, +5 added to complete pack)', () => {
    const rec = calcClosestPackRecommendation(115, 30);
    expect(rec).not.toBeNull();
    expect(rec?.isExactMultiple).toBe(false);
    expect(rec?.lowerPacks).toBe(3);
    expect(rec?.lowerQty).toBe(90);
    expect(rec?.lowerDiff).toBe(-25);
    expect(rec?.upperPacks).toBe(4);
    expect(rec?.upperQty).toBe(120);
    expect(rec?.upperDiff).toBe(5);
    // Closest is 120 (distance 5 vs 25)
    expect(rec?.closestPacks).toBe(4);
    expect(rec?.closestQty).toBe(120);
    expect(rec?.closestDiff).toBe(5);
    expect(rec?.closestAction).toBe('round_up');
  });

  it('handles exact multiples cleanly with no adjustment', () => {
    const rec = calcClosestPackRecommendation(90, 30);
    expect(rec).not.toBeNull();
    expect(rec?.isExactMultiple).toBe(true);
    expect(rec?.closestPacks).toBe(3);
    expect(rec?.closestQty).toBe(90);
    expect(rec?.closestDiff).toBe(0);
    expect(rec?.closestAction).toBe('exact');
  });

  it('handles tie breaker (equidistant between lower and upper) by safely rounding down', () => {
    // 105 with pack of 30: 90 (-15) vs 120 (+15)
    const rec = calcClosestPackRecommendation(105, 30);
    expect(rec?.closestAction).toBe('round_down');
    expect(rec?.closestQty).toBe(90);
  });

  it('handles pack size 12 with 32 and 28', () => {
    // 32 / 12 -> 24 (-8) vs 36 (+4) -> closest 36
    expect(calcClosestPackRecommendation(32, 12)?.closestQty).toBe(36);
    // 28 / 12 -> 24 (-4) vs 36 (+8) -> closest 24
    expect(calcClosestPackRecommendation(28, 12)?.closestQty).toBe(24);
  });

  it('returns null for invalid inputs (packSize <= 1 or targetQty <= 0)', () => {
    expect(calcClosestPackRecommendation(0, 30)).toBeNull();
    expect(calcClosestPackRecommendation(-10, 30)).toBeNull();
    expect(calcClosestPackRecommendation(50, 1)).toBeNull();
    expect(calcClosestPackRecommendation(50, null)).toBeNull();
  });
});

describe('QR Code Sync & Merge Payload', () => {
  it('serializes and parses QR payload correctly', () => {
    const lines = [
      makeLine({ id: 1, no: '1', reference: '34140' }),
      makeLine({ id: 2, no: '2', reference: '76041' }),
    ];
    const events = [
      makeEvent({ orderLineId: 1, stage: 'preparation', quantity: 18, containerId: 101 }),
      makeEvent({ orderLineId: 2, stage: 'preparation', quantity: 31, containerId: undefined }),
    ];
    const containerMap = new Map<number, string>([[101, 'Carton A']]);

    const qrString = serializeCountsForQR('BC/OU126/03864', 'FAYSAL MEZOUAR', lines, events, containerMap);
    expect(qrString).toContain('BC/OU126/03864');

    const parsed = parseQRSyncPayload(qrString);
    expect(parsed).not.toBeNull();
    expect(parsed?.ptg).toBe(1);
    expect(parsed?.billNumber).toBe('BC/OU126/03864');
    expect(parsed?.counts).toHaveLength(2);
    expect(parsed?.counts[0].no).toBe('1');
    expect(parsed?.counts[0].qty).toBe(18);
    expect(parsed?.counts[0].container).toBe('Carton A');
    expect(parsed?.counts[1].container).toBeUndefined();
  });

  it('plans merge by adding counts into existing events', () => {
    const lines = [
      makeLine({ id: 10, no: '1', reference: 'REF1', designation: 'PROD 1' }),
      makeLine({ id: 20, no: '2', reference: 'REF2', designation: 'PROD 2' }),
    ];
    const existingEvents = [
      makeEvent({ orderLineId: 10, stage: 'preparation', quantity: 5 }),
    ];
    const payload: QRSyncPayload = {
      ptg: 1,
      billNumber: 'BL-100',
      client: 'TEST CLIENT',
      ts: Date.now(),
      counts: [
        { no: '1', stage: 'preparation', qty: 10, container: 'C1' },
        { no: '2', stage: 'preparation', qty: 8 },
        { no: '99', stage: 'preparation', qty: 4 }, // Unmatched line
      ],
    };

    const plan = planQRMerge(lines, existingEvents, payload, 'add');
    expect(plan.matchedLinesCount).toBe(2);
    expect(plan.unmatchedItemsCount).toBe(1);
    expect(plan.totalQtyAdded).toBe(18);

    // Line 1 had 5, adds 10 => 15
    const item1 = plan.items.find(i => i.lineId === 10);
    expect(item1?.currentStageQty).toBe(5);
    expect(item1?.incomingQty).toBe(10);
    expect(item1?.newStageQty).toBe(15);
    expect(item1?.containerName).toBe('C1');

    // Line 2 had 0, adds 8 => 8
    const item2 = plan.items.find(i => i.lineId === 20);
    expect(item2?.currentStageQty).toBe(0);
    expect(item2?.incomingQty).toBe(8);
    expect(item2?.newStageQty).toBe(8);

    expect(plan.unmatched[0].no).toBe('99');
  });

  it('plans merge in replace mode', () => {
    const lines = [
      makeLine({ id: 10, no: '1', reference: 'REF1', designation: 'PROD 1' }),
    ];
    const existingEvents = [
      makeEvent({ orderLineId: 10, stage: 'preparation', quantity: 5 }),
    ];
    const payload: QRSyncPayload = {
      ptg: 1,
      ts: Date.now(),
      counts: [
        { no: '1', stage: 'preparation', qty: 25 },
      ],
    };

    const plan = planQRMerge(lines, existingEvents, payload, 'replace');
    expect(plan.matchedLinesCount).toBe(1);
    const item1 = plan.items[0];
    expect(item1.currentStageQty).toBe(5);
    expect(item1.incomingQty).toBe(20); // delta
    expect(item1.newStageQty).toBe(25);
  });
});

describe('findNormalBackCamera (1x camera selection)', () => {
  it('selects camera2 2 over camera2 0 on Samsung devices', () => {
    const devices = [
      { deviceId: 'wide-0', label: 'camera2 0, facing back', kind: 'videoinput' },
      { deviceId: 'front-1', label: 'camera2 1, facing front', kind: 'videoinput' },
      { deviceId: 'main-2', label: 'camera2 2, facing back', kind: 'videoinput' },
    ];
    expect(findNormalBackCamera(devices)).toBe('main-2');
  });

  it('filters out ultra-wide and 0.5x labels', () => {
    const devices = [
      { deviceId: 'wide-id', label: 'Back Ultra Wide (0.5x)', kind: 'videoinput' },
      { deviceId: 'main-id', label: 'Back Camera 1 (Standard 1x)', kind: 'videoinput' },
    ];
    expect(findNormalBackCamera(devices)).toBe('main-id');
  });

  it('discards front camera and returns sole back camera', () => {
    const devices = [
      { deviceId: 'front-id', label: 'Front Camera', kind: 'videoinput' },
      { deviceId: 'back-id', label: 'Back Camera', kind: 'videoinput' },
    ];
    expect(findNormalBackCamera(devices)).toBe('back-id');
  });

  it('handles empty device list gracefully', () => {
    expect(findNormalBackCamera([])).toBeNull();
  });

  it('selects standard wide camera when ultra-wide is also present', () => {
    const devices = [
      { deviceId: 'uw', label: 'camera2 0, facing back, Ultra-Wide 0.5x', kind: 'videoinput' },
      { deviceId: 'main', label: 'camera2 1, facing back, Wide Angle', kind: 'videoinput' },
      { deviceId: 'macro', label: 'camera2 3, facing back, Macro', kind: 'videoinput' },
    ];
    expect(findNormalBackCamera(devices)).toBe('main');
  });

  it('getAvailableBackCameras excludes Capteur 1 (ultra-wide) and returns Capteur 2 as main sensor', () => {
    const devices = [
      { deviceId: 'uw', label: 'camera2 0, facing back, Ultra Wide', kind: 'videoinput' },
      { deviceId: 'front', label: 'camera2 1, facing front', kind: 'videoinput' },
      { deviceId: 'main', label: 'camera2 2, facing back', kind: 'videoinput' },
    ];
    const result = getAvailableBackCameras(devices);
    // Capteur 1 (uw) is strictly excluded
    expect(result.length).toBe(1);
    expect(result[0].deviceId).toBe('main');
    expect(result[0].isLikely1x).toBe(true);
    expect(result[0].cleanName).toContain('Capteur 2');
    expect(result[0].cleanName).toContain('Principal 1×');
  });
});

describe('Multi-operator concurrent pointage & commutative delta aggregation', () => {
  it('combines independent delta events from multiple operators commutatively (A + B = B + A)', () => {
    const line = makeLine({ id: 42, orderedQty: 100 });
    const eventWorkerA = makeEvent({
      id: 101,
      orderLineId: 42,
      stage: 'pointage',
      quantity: 50,
      outcome: 'accepted',
      createdAt: '2026-09-08T08:00:00.000Z',
    });
    const eventWorkerB = makeEvent({
      id: 102,
      orderLineId: 42,
      stage: 'pointage',
      quantity: 50,
      outcome: 'accepted',
      createdAt: '2026-09-08T08:00:01.000Z',
    });

    // Order 1: A then B
    const totalOrder1 = sumStageEvents([eventWorkerA, eventWorkerB], 'pointage');
    expect(totalOrder1).toBe(100);
    const disc1 = calcDiscrepancy(line, totalOrder1);
    expect(disc1.isExact).toBe(true);
    expect(disc1.remaining).toBe(0);

    // Order 2: B then A (network latency / asynchronous sync)
    const totalOrder2 = sumStageEvents([eventWorkerB, eventWorkerA], 'pointage');
    expect(totalOrder2).toBe(100);
    const disc2 = calcDiscrepancy(line, totalOrder2);
    expect(disc2.isExact).toBe(true);
  });

  it('correctly aggregates split pointage (compliant + damaged_refused with notes)', () => {
    const line = makeLine({ id: 55, orderedQty: 100 });
    const compliantBatch = makeEvent({
      id: 201,
      orderLineId: 55,
      stage: 'pointage',
      quantity: 80,
      outcome: 'accepted',
    });
    const damagedBatch = makeEvent({
      id: 202,
      orderLineId: 55,
      stage: 'pointage',
      quantity: 20,
      outcome: 'damaged_refused',
    });

    const total = sumStageEvents([compliantBatch, damagedBatch], 'pointage');
    expect(total).toBe(100);

    const disc = calcDiscrepancy(line, total);
    expect(disc.isExact).toBe(true);
    expect(disc.remaining).toBe(0);
  });

  it('correctly calculates batch quantity when stepping outer vs inner vs units', () => {
    const outerPack = 24;
    const innerPack = 6;

    // Stepping units
    let loose = 5;
    expect(calcBatchQty(0, 0, loose, outerPack, innerPack)).toBe(5);

    // Stepping inner packs (+2 packs of 6)
    let innerCount = 2;
    expect(calcBatchQty(0, innerCount, loose, outerPack, innerPack)).toBe(17);

    // Stepping outer cartons (+3 cartons of 24)
    let outerCount = 3;
    expect(calcBatchQty(outerCount, innerCount, loose, outerPack, innerPack)).toBe(89);
  });
});

describe('Warehouse Zones Taxonomy & Utilities', () => {
  it('contains structured zones for Chambre (9 compass zones) and Couloir (4 Salles)', () => {
    expect(WAREHOUSE_ZONES.length).toBe(13);

    const chambre = WAREHOUSE_ZONES.filter((z) => z.category === 'chambre');
    expect(chambre.length).toBe(9); // 3x3 compass grid

    const couloir = WAREHOUSE_ZONES.filter((z) => z.category === 'couloir');
    expect(couloir.length).toBe(4); // Salles 1 to 4
  });

  it('correctly normalizes legacy zone codes and Salle 4 sub-alleys', () => {
    expect(normalizeZoneCode('NORTH_WEST')).toBe('CH_NW');
    expect(normalizeZoneCode('NORTH_EAST')).toBe('CH_NE');
    expect(normalizeZoneCode('SOUTH_WEST')).toBe('CH_SW');
    expect(normalizeZoneCode('SOUTH_EAST')).toBe('CH_SE');
    expect(normalizeZoneCode('LITTLE_ROOM_ENTRANCE')).toBe('CO_R1');
    expect(normalizeZoneCode('LITTLE_ROOM_DEEP')).toBe('CO_R2');
    expect(normalizeZoneCode('CO_R4_S')).toBe('CO_R4');
    expect(normalizeZoneCode('CO_R4_A1')).toBe('CO_R4');
    expect(normalizeZoneCode('CO_R4_A2')).toBe('CO_R4');
    expect(normalizeZoneCode('CO_R4_A3')).toBe('CO_R4');
    expect(normalizeZoneCode('CO_R4_A4')).toBe('CO_R4');
    expect(normalizeZoneCode('CO_R4_N')).toBe('CO_R4');
    expect(normalizeZoneCode('  CH_CTR  ')).toBe('CH_CTR');
    expect(normalizeZoneCode(null)).toBeNull();
    expect(normalizeZoneCode('')).toBeNull();
  });

  it('retrieves detailed zone information and short labels', () => {
    const sw = getZoneInfo('CH_SW');
    expect(sw).not.toBeNull();
    expect(sw?.category).toBe('chambre');
    expect(sw?.compassRow).toBe(3);
    expect(sw?.compassCol).toBe(1);

    expect(getZoneShortLabel('CH_CTR')).toBe('CH • Centre');
    expect(getZoneShortLabel('CO_R4')).toBe('Couloir • Salle 4');
    expect(getZoneLabel('CO_R1')).toBe('Couloir • Salle 1 (Sud / Entrée)');

    // Custom shelf / rack
    const custom = getZoneInfo('Rayon B-04');
    expect(custom?.category).toBe('custom');
    expect(custom?.shortLabel).toBe('Rayon B-04');
    expect(getZoneLabel(null)).toBe('');
  });

  it('sorts lines according to continuous non-backtracking warehouse picking circuit', () => {
    const lines: OrderLine[] = [
      makeLine({ id: 1, no: '1', warehouseZone: null }), // Unassigned (order 999)
      makeLine({ id: 2, no: '2', warehouseZone: 'CO_R1' as any }), // Couloir Salle 1 (order 100)
      makeLine({ id: 3, no: '3', warehouseZone: 'CH_SW' as any }), // Chambre SW (order 70)
      makeLine({ id: 4, no: '4', warehouseZone: 'CH_NE' as any }), // Chambre NE (order 30)
      makeLine({ id: 5, no: '5', warehouseZone: 'CO_R4' as any }), // Couloir Salle 4 Nord (order 130)
      makeLine({ id: 6, no: '6', warehouseZone: 'CH_CTR' as any }), // Chambre Centre (order 50)
      makeLine({ id: 7, no: '7', warehouseZone: 'Rack Custom' as any }), // Custom (order 900)
    ];

    const sorted = sortLinesByWarehouseZone(lines);
    const sortedIds = sorted.map((l) => l.id);

    // Expected sequence: Chambre (NW -> SE) -> Couloir (Salles 1-3) -> Salle 4 (Sud -> Nord) -> Custom -> Non assignés:
    // CH_NE (30) -> CH_CTR (50) -> CH_SW (70) -> CO_R1 (100) -> CO_R4 (130) -> Rack Custom (900) -> Unassigned (999)
    expect(sortedIds).toEqual([4, 6, 3, 2, 5, 7, 1]);
  });

  it('inherits zone from product profile map when line zone is null', () => {
    const lines: OrderLine[] = [
      makeLine({ id: 1, no: '1', reference: 'REF_COULOIR', warehouseZone: null }),
      makeLine({ id: 2, no: '2', reference: 'REF_CHAMBRE', warehouseZone: null }),
    ];

    const profilesMap = new Map<string, ProductProfile>([
      ['REF_COULOIR', { reference: 'REF_COULOIR', warehouseZone: 'CO_R4', updatedAt: '' } as any],
      ['REF_CHAMBRE', { reference: 'REF_CHAMBRE', warehouseZone: 'CH_SW', updatedAt: '' } as any],
    ]);

    const sorted = sortLinesByWarehouseZone(lines, profilesMap);
    // CH_SW (order 70) comes before CO_R4 (order 130)
    expect(sorted[0].id).toBe(2);
    expect(sorted[1].id).toBe(1);
  });

  it('provides a human-readable description of the physical picking circuit', () => {
    expect(getWarehouseCircuitDescription()).toBe(
      'Chambre (NW ➔ SE) ⟶ Couloir (Salles 1–3) ⟶ Salle 4 (Sud ➔ Nord)'
    );
  });
});





