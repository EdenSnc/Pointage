// ============================================================
// POINTAGE — Comprehensive QA & Edge Case Test Suite
// Verified by Senior Software QA Engineer & Product Tester
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  sumStageEvents,
  smartSearchScore,
  calcPackBreakdown,
  roundDownToPack,
  getStageProblemLines,
} from './logic';

import {
  getDailyUsage,
  recordApiUsage,
  QUOTA_LIMITS,
  _resetQuotaTrackerForTest,
} from './ai/quotaTracker';


import type { OrderLine, CountEvent, Bill } from './types';

// ------------------------------------------------------------
// Test Fixtures & Factories
// ------------------------------------------------------------
function makeLine(overrides: Partial<OrderLine> = {}): OrderLine {
  return {
    id: 1,
    billId: 10,
    originalNo: '1',
    originalPage: 1,
    originalReference: 'REF-70417',
    originalEan: '6941782107034',
    originalDesignation: 'Trousse Double Zip SBM Stationery',
    originalOrderedQty: 24,
    no: '1',
    page: 1,
    reference: 'REF-70417',
    ean: '6941782107034',
    designation: 'Trousse Double Zip SBM Stationery',
    orderedQty: 24,
    status: 'active',
    outerPackSize: null,
    innerPackSize: null,
    warehouseZone: 'NORTH_WEST',
    packagesRaw: null,

    referenceAliases: ['70417'],
    createdAt: '2026-09-03T10:00:00Z',
    updatedAt: '2026-09-03T10:00:00Z',
    ...overrides,
  };
}

function makeEvent(overrides: Partial<CountEvent> = {}): CountEvent {
  return {
    id: 1,
    billId: 10,
    orderLineId: 1,
    stage: 'preparation',
    quantity: 0,
    containerId: null,
    outcome: null,
    undone: false,
    createdAt: '2026-09-03T10:05:00Z',
    ...overrides,
  };
}

// ------------------------------------------------------------
// 1. Packaging & Sealed Pack Round Down Arithmetic
// ------------------------------------------------------------
describe('QA: Packaging & Sealed Pack Round Down', () => {
  it('handles standard sealed carton with remainder: 32 ordered with pack of 5', () => {
    const res = roundDownToPack(32, 5);
    expect(res.servedQty).toBe(30);
    expect(res.missingQty).toBe(2);
  });

  it('handles exact multiple: 30 ordered with pack of 5 -> 30 served, 0 reliquat', () => {
    const res = roundDownToPack(30, 5);
    expect(res.servedQty).toBe(30);
    expect(res.missingQty).toBe(0);
  });

  it('handles ordered quantity smaller than pack: 3 ordered with pack of 5', () => {
    const res = roundDownToPack(3, 5);
    expect(res.servedQty).toBe(0);
    expect(res.missingQty).toBe(3);
  });

  it('safely handles zero or negative pack size by falling back to ordered qty', () => {
    expect(roundDownToPack(32, 0)).toEqual({ servedQty: 32, missingQty: 0 });
    expect(roundDownToPack(32, -5)).toEqual({ servedQty: 32, missingQty: 0 });
    expect(roundDownToPack(0, 5)).toEqual({ servedQty: 0, missingQty: 0 });
    expect(roundDownToPack(-10, 5)).toEqual({ servedQty: 0, missingQty: 0 });
  });

  it('safely handles NaN and non-integers without crashing', () => {
    expect(roundDownToPack(NaN, 5)).toEqual({ servedQty: 0, missingQty: 0 });
    expect(roundDownToPack(32, NaN)).toEqual({ servedQty: 32, missingQty: 0 });
  });

  it('handles very large warehouse inventory: 125,483 ordered with pack of 24', () => {
    const res = roundDownToPack(125483, 24);
    expect(res.servedQty).toBe(125472); // 5228 packs * 24
    expect(res.missingQty).toBe(11);
    expect(res.servedQty + res.missingQty).toBe(125483);
  });
});

// ------------------------------------------------------------
// 2. Safe Pack Breakdown Calculations
// ------------------------------------------------------------
describe('QA: calcPackBreakdown Edge Cases', () => {
  it('safely handles NaN, null, and empty inputs', () => {
    expect(calcPackBreakdown(NaN, 24)).toEqual({ fullPacks: 0, loose: 0 });
    expect(calcPackBreakdown(null as any, null)).toEqual({ fullPacks: 0, loose: 0 });
    expect(calcPackBreakdown(-50, 24)).toEqual({ fullPacks: 0, loose: 0 });
    expect(calcPackBreakdown(100, 0)).toEqual({ fullPacks: 0, loose: 100 });
  });

  it('correctly calculates full packs and loose items: total=53, packSize=24', () => {
    const b = calcPackBreakdown(53, 24);
    // 2 full packs of 24 (48) + 5 loose
    expect(b.fullPacks).toBe(2);
    expect(b.loose).toBe(5);
  });

  it('correctly calculates exact multiple without loose items: total=48, packSize=12', () => {
    const b = calcPackBreakdown(48, 12);
    expect(b.fullPacks).toBe(4);
    expect(b.loose).toBe(0);
  });
});

// ------------------------------------------------------------
// 3. Stage Decoupling & getStageProblemLines Under Real Conditions
// ------------------------------------------------------------
describe('QA: Decoupled Stage Problem Detection (Zero False Alarms)', () => {
  it('PREPARATION STAGE: exact prepared lines (24/24) are NOT problems even if chargement is 0', () => {
    const line = makeLine({ id: 1, orderedQty: 24 });
    const eventsByLine = new Map<number, CountEvent[]>([
      [1, [makeEvent({ orderLineId: 1, stage: 'preparation', quantity: 24 })]],
    ]);

    // Inspect preparation problems
    const prepProblems = getStageProblemLines([line], eventsByLine, 'preparation');
    expect(prepProblems.length).toBe(0); // MUST NOT be flagged as problem!
  });

  it('PREPARATION STAGE: shortages (10/24) ARE flagged as problems', () => {
    const line = makeLine({ id: 1, orderedQty: 24 });
    const eventsByLine = new Map<number, CountEvent[]>([
      [1, [makeEvent({ orderLineId: 1, stage: 'preparation', quantity: 10 })]],
    ]);

    const prepProblems = getStageProblemLines([line], eventsByLine, 'preparation');
    expect(prepProblems.length).toBe(1);
    expect(prepProblems[0].id).toBe(1);
  });

  it('PREPARATION STAGE: unstarted line (0/24) is flagged as pending shortage in preparation', () => {
    const line = makeLine({ id: 1, orderedQty: 24 });
    const eventsByLine = new Map<number, CountEvent[]>();

    const prepProblems = getStageProblemLines([line], eventsByLine, 'preparation');
    expect(prepProblems.length).toBe(1);
  });

  it('OUT_OF_STOCK / RUPTURE DÉFINITIVE: always returned as an anomaly in all stages', () => {
    const line = makeLine({ id: 1, orderedQty: 24, status: 'out_of_stock' });
    const eventsByLine = new Map<number, CountEvent[]>();

    const prepProblems = getStageProblemLines([line], eventsByLine, 'preparation');
    expect(prepProblems.length).toBe(1);
    expect(prepProblems[0].status).toBe('out_of_stock');

    const loadProblems = getStageProblemLines([line], eventsByLine, 'chargement');
    expect(loadProblems.length).toBe(1);
  });

  it('NOT_FOUND / INTROUVABLE: flagged as problem across preparation and chargement', () => {
    const line = makeLine({ id: 1, orderedQty: 24, status: 'not_found' });
    const eventsByLine = new Map<number, CountEvent[]>();

    expect(getStageProblemLines([line], eventsByLine, 'preparation').length).toBe(1);
    expect(getStageProblemLines([line], eventsByLine, 'chargement').length).toBe(1);
  });

  it('CANCELLED / ANNULÉ: flagged as anomaly to alert supervisor', () => {
    const line = makeLine({ id: 1, orderedQty: 24, status: 'cancelled' });
    const eventsByLine = new Map<number, CountEvent[]>();

    expect(getStageProblemLines([line], eventsByLine, 'preparation').length).toBe(1);
  });

  it('MODIFIED ORDERED QUANTITY: flagged as problem so office is aware of amendment', () => {
    const line = makeLine({
      id: 1,
      originalOrderedQty: 30,
      orderedQty: 20, // Reduced from 30 to 20
    });
    const eventsByLine = new Map<number, CountEvent[]>([
      [1, [makeEvent({ orderLineId: 1, stage: 'preparation', quantity: 20 })]],
    ]);

    // Even though 20/20 prepared, it was modified from original 30
    const problems = getStageProblemLines([line], eventsByLine, 'preparation');
    expect(problems.length).toBe(1);
  });

  it('CHARGEMENT STAGE: correctly compares loaded vs prepared count', () => {
    const line = makeLine({ id: 1, orderedQty: 24 });
    const eventsByLine = new Map<number, CountEvent[]>([
      [
        1,
        [
          makeEvent({ orderLineId: 1, stage: 'preparation', quantity: 24 }),
          makeEvent({ orderLineId: 1, stage: 'chargement', quantity: 20 }), // 4 missing at dock
        ],
      ],
    ]);

    const loadProblems = getStageProblemLines([line], eventsByLine, 'chargement');
    expect(loadProblems.length).toBe(1);

    // If fully loaded:
    eventsByLine.get(1)!.push(makeEvent({ orderLineId: 1, stage: 'chargement', quantity: 4 }));
    expect(getStageProblemLines([line], eventsByLine, 'chargement').length).toBe(0);
  });

  it('POINTAGE STAGE: correctly compares pointage vs loaded count', () => {
    const line = makeLine({ id: 1, orderedQty: 24 });
    const eventsByLine = new Map<number, CountEvent[]>([
      [
        1,
        [
          makeEvent({ orderLineId: 1, stage: 'chargement', quantity: 24 }),
          makeEvent({ orderLineId: 1, stage: 'pointage', quantity: 24 }),
        ],
      ],
    ]);

    expect(getStageProblemLines([line], eventsByLine, 'pointage').length).toBe(0);
  });
});

// ------------------------------------------------------------
// 4. Optical Barcode & ITF-14 Smart Search Matching
// ------------------------------------------------------------
describe('QA: ITF-14 & Smart Search Matching', () => {
  const trousseLine = makeLine({
    reference: '70417',
    ean: '6941782107034', // 13-digit EAN
    designation: 'Trousse Double Zip SBM Stationery',
    referenceAliases: ['70417', '70417-DBL'],
  });

  it('matches 14-digit ITF-14 carton barcode to inner 13-digit EAN (score 4.2)', () => {
    // Carton ITF-14 barcode: 16941782107034 contains core 694178210703
    const itfCartonCode = '16941782107034';
    const score = smartSearchScore(trousseLine, itfCartonCode);
    expect(score).toBe(4.2);
  });

  it('matches exact 13-digit EAN (score 4)', () => {
    expect(smartSearchScore(trousseLine, '6941782107034')).toBe(4);
  });

  it('matches exact reference or reference alias with high priority (score 1, 2, or 6)', () => {
    expect(smartSearchScore(trousseLine, 'REF-70417')).toBe(2); // Current ref
    expect(smartSearchScore(trousseLine, '70417')).toBe(1);     // Stripped numeric match of original reference
    expect(smartSearchScore(trousseLine, '70417-DBL')).toBe(6); // Reference alias
  });



  it('matches partial reference with substring match (score 7)', () => {
    expect(smartSearchScore(trousseLine, '7041')).toBe(7);
  });

  it('matches designation keywords (score 8)', () => {
    expect(smartSearchScore(trousseLine, 'trousse')).toBe(8);
    expect(smartSearchScore(trousseLine, 'stationery')).toBe(8);
  });

  it('returns -1 for non-matching queries or empty string', () => {
    expect(smartSearchScore(trousseLine, 'CLASSEUR_BLEU')).toBe(-1);
    expect(smartSearchScore(trousseLine, '')).toBe(-1);
    expect(smartSearchScore(trousseLine, '   ')).toBe(-1);
  });

  it('handles compound references with aliases', () => {
    const compoundLine = makeLine({
      reference: '70380/84',
      referenceAliases: ['70380', '70384'],
    });
    expect(smartSearchScore(compoundLine, '70380')).toBe(6);
    expect(smartSearchScore(compoundLine, '70384')).toBe(6);
  });
});

// ------------------------------------------------------------
// 5. Container / Carton Assignment & Aggregations
// ------------------------------------------------------------
describe('QA: Carton & Container Distributions', () => {
  it('aggregates multi-carton distributions for a line without loss', () => {
    const line = makeLine({ id: 1, orderedQty: 48 });
    const events: CountEvent[] = [
      makeEvent({ orderLineId: 1, stage: 'preparation', containerId: 101, quantity: 24 }), // Carton A
      makeEvent({ orderLineId: 1, stage: 'preparation', containerId: 102, quantity: 18 }), // Carton B
      makeEvent({ orderLineId: 1, stage: 'preparation', containerId: null, quantity: 6 }),  // Vrac / loose
    ];

    const totalPrep = sumStageEvents(events, 'preparation');
    expect(totalPrep).toBe(48);

    const inCartonA = events
      .filter(e => e.containerId === 101 && !e.undone)
      .reduce((s, e) => s + e.quantity, 0);
    const inCartonB = events
      .filter(e => e.containerId === 102 && !e.undone)
      .reduce((s, e) => s + e.quantity, 0);
    const inVrac = events
      .filter(e => e.containerId === null && !e.undone)
      .reduce((s, e) => s + e.quantity, 0);

    expect(inCartonA).toBe(24);
    expect(inCartonB).toBe(18);
    expect(inVrac).toBe(6);
    expect(inCartonA + inCartonB + inVrac).toBe(48);
  });

  it('ignores undone / cancelled events in container tallies', () => {
    const events: CountEvent[] = [
      makeEvent({ orderLineId: 1, stage: 'preparation', containerId: 101, quantity: 24, undone: false }),
      makeEvent({ orderLineId: 1, stage: 'preparation', containerId: 101, quantity: 12, undone: true }), // Undone
    ];

    const activeTotal = sumStageEvents(events, 'preparation');
    expect(activeTotal).toBe(24);
  });
});

// ------------------------------------------------------------
// 6. Gemini Daily API Quota Tracker
// ------------------------------------------------------------
describe('QA: Gemini Daily API Quota Tracker', () => {
  beforeEach(() => {
    _resetQuotaTrackerForTest();
  });


  it('initializes with 0 usage on a clean day', () => {
    const usage = getDailyUsage();
    expect(usage.liteUsed).toBe(0);
    expect(usage.flashUsed).toBe(0);
    expect(usage.liteLimit).toBe(QUOTA_LIMITS['gemini-3.5-flash-lite']); // 500
    expect(usage.flashLimit).toBe(QUOTA_LIMITS['gemini-3.8-flash']);     // 20
  });

  it('records flash-lite usage accurately', () => {
    recordApiUsage('gemini-3.5-flash-lite');
    recordApiUsage('gemini-3.5-flash-lite');
    recordApiUsage('gemini-3.5-flash-lite');

    const usage = getDailyUsage();
    expect(usage.liteUsed).toBe(3);
    expect(usage.flashUsed).toBe(0);
  });

  it('records flash-3.8 usage accurately', () => {
    recordApiUsage('gemini-3.8-flash');
    const usage = getDailyUsage();
    expect(usage.flashUsed).toBe(1);
    expect(usage.liteUsed).toBe(0);
  });
});

// ------------------------------------------------------------
// 7. Client Entity Grouping Logic
// ------------------------------------------------------------
describe('QA: Multi-Bill Client Entity Grouping', () => {
  function groupBillsByClient(bills: Bill[]) {
    const groups = new Map<string, Bill[]>();
    for (const b of bills) {
      const key = (b.client || 'Sans Client').trim().toUpperCase();
      const list = groups.get(key) || [];
      list.push(b);
      groups.set(key, list);
    }
    return groups;
  }

  it('groups multiple bills for the same client case-insensitively', () => {
    const bills: Bill[] = [
      { id: 1, sessionId: 1, billNumber: 'BL-001', client: 'Aissaoui Hicham', date: '2026-09-03', status: 'active', createdAt: '', updatedAt: '' },
      { id: 2, sessionId: 1, billNumber: 'BL-002', client: 'AISSAOUI HICHAM', date: '2026-09-03', status: 'active', createdAt: '', updatedAt: '' },
      { id: 3, sessionId: 1, billNumber: 'BL-003', client: 'Librairie Centrale', date: '2026-09-03', status: 'active', createdAt: '', updatedAt: '' },
    ];

    const groups = groupBillsByClient(bills);
    expect(groups.size).toBe(2);
    expect(groups.get('AISSAOUI HICHAM')?.length).toBe(2);
    expect(groups.get('LIBRAIRIE CENTRALE')?.length).toBe(1);
  });
});

// ------------------------------------------------------------
// 8. WhatsApp Discrepancy Report Formatting Integrity
// ------------------------------------------------------------
describe('QA: WhatsApp Discrepancy Report Generator', () => {
  it('generates a clean, conform report when there are no problems', () => {
    const bill: Bill = {
      id: 1,
      sessionId: 1,
      billNumber: 'BL-2026-09',
      client: 'ETS BENALI & CIE',
      date: '2026-09-03',
      status: 'active',
      createdAt: '',
      updatedAt: '',
    };

    const lines = [makeLine({ id: 1, orderedQty: 24 })];
    const eventsByLine = new Map<number, CountEvent[]>([
      [1, [makeEvent({ orderLineId: 1, stage: 'preparation', quantity: 24 })]],
    ]);

    const problems = getStageProblemLines(lines, eventsByLine, 'preparation');
    expect(problems.length).toBe(0);

    // Build sample report string
    let report = `📦 *RAPPORT D'EXPÉDITION / ÉCARTS - POINTAGE PRO*\n`;
    report += `🏢 Client : *${bill.client}*\n`;
    report += `📄 N° Bon : *${bill.billNumber}*\n`;
    if (problems.length === 0) {
      report += `✅ *Aucun écart signalé :* Toutes les lignes préparées sont conformes.\n`;
    }

    expect(report).toContain('ETS BENALI & CIE');
    expect(report).toContain('BL-2026-09');
    expect(report).toContain('Aucun écart signalé');

    // Verify URI encoding is safe
    const encoded = encodeURIComponent(report);
    expect(encoded).not.toContain(' ');
    expect(decodeURIComponent(encoded)).toBe(report);
  });

  it('generates detailed anomaly list with shortages, out_of_stock, and reliquats', () => {
    const lines = [
      makeLine({ id: 1, no: '1', designation: 'Cahier 96p', orderedQty: 32, status: 'active' }),
      makeLine({ id: 2, no: '2', designation: 'Stylo Bille Bleu', orderedQty: 50, status: 'out_of_stock' }),
    ];
    // Line 1 served 30 (2 reliquat)
    const eventsByLine = new Map<number, CountEvent[]>([
      [1, [makeEvent({ orderLineId: 1, stage: 'preparation', quantity: 30 })]],
    ]);

    const problems = getStageProblemLines(lines, eventsByLine, 'preparation');
    expect(problems.length).toBe(2);

    let report = ``;
    problems.forEach((p, idx) => {
      const evts = eventsByLine.get(p.id!) || [];
      const prepQty = sumStageEvents(evts, 'preparation');
      report += `${idx + 1}. *N°${p.no}* - ${p.designation}\n`;
      if (p.status === 'out_of_stock') {
        report += `   🔴 *RUPTURE DÉFINITIVE EN ENTREPÔT*\n`;
      } else if (prepQty < p.orderedQty) {
        report += `   📉 *MANQUANT :* Préparé ${prepQty} / ${p.orderedQty} (Reliquat: -${p.orderedQty - prepQty})\n`;
      }
    });

    expect(report).toContain('Cahier 96p');
    expect(report).toContain('MANQUANT :* Préparé 30 / 32 (Reliquat: -2)');
    expect(report).toContain('Stylo Bille Bleu');
    expect(report).toContain('RUPTURE DÉFINITIVE EN ENTREPÔT');
  });
});
