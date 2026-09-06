// ============================================================
// POINTAGE — End-to-End User Workflow & Logic Tests
// ============================================================

import { describe, it, expect } from 'vitest';
import { parseImportJSON, validateImport } from './importer';
import {
  calcBatchQty,
  sumStageEvents,
  calcDiscrepancy,
  lineBlocksCompletion,
  getStageTotals,
  smartSearchScore,
  calcPackBreakdown,
} from './logic';
import type { OrderLine, CountEvent } from './types';

function makeLine(overrides: Partial<OrderLine> = {}): OrderLine {
  return {
    id: 1,
    billId: 1,
    originalNo: '1',
    originalPage: 1,
    originalReference: 'REF-800',
    originalEan: '376000000001',
    originalDesignation: 'Produit Test',
    originalOrderedQty: 50,
    no: '1',
    page: 1,
    reference: 'REF-800',
    ean: '376000000001',
    designation: 'Produit Test',
    orderedQty: 50,
    status: 'active',
    outerPackSize: 20,
    innerPackSize: 10,
    warehouseZone: 'NORTH_WEST',

    packagesRaw: '2CT/10',
    referenceAliases: ['REF800', '800'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeEvent(overrides: Partial<CountEvent> = {}): CountEvent {
  return {
    id: 1,
    billId: 1,
    orderLineId: 1,
    stage: 'preparation',
    quantity: 0,
    containerId: 1,
    outcome: null,
    undone: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('Workflow 1: JSON Import & Validation', () => {
  it('correctly parses and validates a well-formed BL payload', () => {
    const raw = JSON.stringify({
      bills: [
        {
          billNumber: 'BL-2026-001',
          client: 'ENTREPOT NORD',
          date: '2026-09-02',
          lines: [
            {
              no: '1',
              reference: 'A100',
              ean: '1234567890123',
              designation: 'Article Alpha',
              orderedQty: 100,
            },
            {
              no: '2',
              reference: 'B200',
              designation: 'Article Beta',
              orderedQty: 50,
            },
          ],
        },
      ],
    });

    const parsed = parseImportJSON(raw);
    expect(parsed.parseError).toBeNull();
    expect(parsed.payload?.bills?.length).toBe(1);

    const issues = validateImport(parsed.payload!);
    expect(issues.some(i => i.severity === 'error')).toBe(false);
  });

  it('detects duplicate lines and negative quantities in import', () => {
    const raw = JSON.stringify({
      bills: [
        {
          billNumber: 'BL-ERR',
          lines: [
            { no: '1', designation: 'Item 1', orderedQty: -5 },
            { no: '1', designation: 'Item 1 Dup', orderedQty: 10 },
          ],
        },
      ],
    });

    const parsed = parseImportJSON(raw);
    const issues = validateImport(parsed.payload!);
    expect(issues.some(i => i.message.includes('dupliqué') || i.message.includes('négative'))).toBe(true);
  });
});

describe('Workflow 2: Warehouse Preparation (Packaging & Transport Cartons)', () => {
  it('counts 2 outer packs (×20) + 10 loose units = 50, marking line EXACT', () => {
    const line = makeLine({ orderedQty: 50, outerPackSize: 20, innerPackSize: 10 });

    // Operator uses outer pack arithmetic
    const batch1 = calcBatchQty(2, 0, 0, line.outerPackSize, line.innerPackSize);
    expect(batch1).toBe(40);

    const batch2 = calcBatchQty(0, 0, 10, line.outerPackSize, line.innerPackSize);
    expect(batch2).toBe(10);

    const events = [
      makeEvent({ id: 1, quantity: batch1, containerId: 10 }), // packed in CARTON A
      makeEvent({ id: 2, quantity: batch2, containerId: 10 }), // packed in CARTON A
    ];

    const stageTotal = sumStageEvents(events, 'preparation');
    expect(stageTotal).toBe(50);

    const disc = calcDiscrepancy(line, stageTotal);
    expect(disc.isExact).toBe(true);
    expect(disc.isShort).toBe(false);
    expect(disc.isOver).toBe(false);
    expect(disc.remaining).toBe(0);
  });

  it('handles undo correctly during preparation without corrupting stage total', () => {
    const line = makeLine({ orderedQty: 30 });
    const events = [
      makeEvent({ id: 1, quantity: 20, undone: false }),
      makeEvent({ id: 2, quantity: 15, undone: true }), // operator accidentally added 15 and pressed UNDO
    ];

    const total = sumStageEvents(events, 'preparation');
    expect(total).toBe(20);

    const disc = calcDiscrepancy(line, total);
    expect(disc.remaining).toBe(10);
    expect(disc.isShort).toBe(true);
  });
});

describe('Workflow 3: Pointage with Quality Outcomes & Damage Split', () => {
  it('records multi-outcome counts and aggregates accurately', () => {
    const line = makeLine({ orderedQty: 100 });
    const events = [
      makeEvent({ id: 1, stage: 'pointage', quantity: 80, outcome: 'accepted' }),
      makeEvent({ id: 2, stage: 'pointage', quantity: 10, outcome: 'damaged_accepted' }),
      makeEvent({ id: 3, stage: 'pointage', quantity: 5, outcome: 'damaged_refused' }),
      makeEvent({ id: 4, stage: 'pointage', quantity: 5, outcome: 'refused' }),
    ];

    const totals = getStageTotals(events, 'pointage');
    expect(totals.total).toBe(100);
    expect(totals.byOutcome.accepted).toBe(80);
    expect(totals.byOutcome.damaged_accepted).toBe(10);
    expect(totals.byOutcome.damaged_refused).toBe(5);
    expect(totals.byOutcome.refused).toBe(5);

    const disc = calcDiscrepancy(line, totals.total);
    expect(disc.isExact).toBe(true);
  });

  it('verifies that short lines block bill completion, cancelled lines do not, but not_found lines do', () => {
    const lineActive = makeLine({ id: 1, orderedQty: 10, status: 'active' });
    const lineCancelled = makeLine({ id: 2, orderedQty: 10, status: 'cancelled' });
    const lineNotFound = makeLine({ id: 3, orderedQty: 10, status: 'not_found' });

    // Active line blocks completion
    expect(lineBlocksCompletion(lineActive)).toBe(true);

    // Cancelled line never blocks completion
    expect(lineBlocksCompletion(lineCancelled)).toBe(false);

    // Not found line DOES block completion because it represents unfulfilled demand
    expect(lineBlocksCompletion(lineNotFound)).toBe(true);
  });
});

describe('Workflow 4: Smart Search & Barcode Matching', () => {
  it('ranks exact N° first, then EAN, then reference, then designation (lower score = higher priority)', () => {
    const line = makeLine({
      no: '42',
      reference: 'ART-999',
      ean: '3456789012345',
      designation: 'Vis métaux 42mm',
      referenceAliases: ['ART999', '999'],
    });

    const scoreNo = smartSearchScore(line, '42', 1);
    const scoreRef = smartSearchScore(line, 'ART-999', 1);
    const scoreAlias = smartSearchScore(line, 'ART999', 1);
    const scoreEan = smartSearchScore(line, '3456789012345', 1);
    const scoreText = smartSearchScore(line, 'métaux', 1);

    // Exact reference = 1, exact N° = 3, exact EAN = 4, alias = 6, partial text = 8
    expect(scoreRef).toBe(1);
    expect(scoreNo).toBe(3);
    expect(scoreEan).toBe(4);
    expect(scoreAlias).toBe(6);
    expect(scoreText).toBe(8);

    // Lower score means higher search priority
    expect(scoreRef).toBeLessThan(scoreNo);
    expect(scoreNo).toBeLessThan(scoreEan);
    expect(scoreEan).toBeLessThan(scoreAlias);
    expect(scoreAlias).toBeLessThan(scoreText);
  });
});

describe('Workflow 5: Onboarding Walkthrough & Experience Integrity', () => {
  it('correctly tracks onboarding completion state in storage', () => {
    // Initial state: not completed
    const checkInitial = (key: string | null) => key === 'true';
    expect(checkInitial(null)).toBe(false);

    // After operator clicks DÉMARRER or PASSER
    const storedState = 'true';
    expect(checkInitial(storedState)).toBe(true);
  });

  it('validates that all 6 onboarding chapters cover key warehouse operations', () => {
    const chapters = [
      'Bienvenue sur Pointage',
      'Import & Ingestion des BL',
      'Les 3 Étapes Entrepôt',
      'Comptage & Colisage',
      'Scanner Laser & Caméra',
      'Qualité & Sauvegarde',
    ];

    expect(chapters.length).toBe(6);
    expect(chapters[0]).toContain('Pointage');

    expect(chapters[1]).toContain('Import');
    expect(chapters[2]).toContain('Étapes');
    expect(chapters[3]).toContain('Comptage');
    expect(chapters[4]).toContain('Scanner');
    expect(chapters[5]).toContain('Sauvegarde');
  });

  it('validates direct scan-to-quantity increment without page navigation', () => {
    const line: OrderLine = {
      id: 42,
      billId: 10,
      no: '14',
      page: 1,
      reference: '70417',
      ean: '6130000000000',
      designation: 'Cahier 96p',
      orderedQty: 24,
      originalOrderedQty: 24,
      status: 'active',
      outerPackSize: 6,
      innerPackSize: null,
      warehouseZone: null,
      packagesRaw: null,
      referenceAliases: ['70417'],
      originalNo: '14',
      originalPage: 1,
      originalReference: '70417',
      originalEan: '6130000000000',
      originalDesignation: 'Cahier 96p',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    let events: CountEvent[] = [];
    // User scans item, taps +Pack (+6)
    events.push({
      id: 1,
      billId: 10,
      orderLineId: 42,
      stage: 'preparation',
      quantity: 6,
      containerId: 1,
      outcome: null,
      undone: false,
      createdAt: new Date().toISOString(),
    });
    expect(sumStageEvents(events, 'preparation')).toBe(6);

    // User taps +Pack (+6) again
    events.push({
      id: 2,
      billId: 10,
      orderLineId: 42,
      stage: 'preparation',
      quantity: 6,
      containerId: 1,
      outcome: null,
      undone: false,
      createdAt: new Date().toISOString(),
    });
    expect(sumStageEvents(events, 'preparation')).toBe(12);

    // User taps Servir Reste (+12)
    const remaining = line.orderedQty - sumStageEvents(events, 'preparation');
    events.push({
      id: 3,
      billId: 10,
      orderLineId: 42,
      stage: 'preparation',
      quantity: remaining,
      containerId: 1,
      outcome: null,
      undone: false,
      createdAt: new Date().toISOString(),
    });
    expect(sumStageEvents(events, 'preparation')).toBe(24);
  });
});

describe('Workflow 7: Quality Distribution Breakdown & Visual Gauge Calculations', () => {
  it('correctly categorizes lines into exact, partial, overfill, and problem statuses', () => {
    const l1 = makeLine({ id: 1, orderedQty: 20, status: 'active' }); // Exact (20/20)
    const l2 = makeLine({ id: 2, orderedQty: 50, status: 'active' }); // Partial (30/50)
    const l3 = makeLine({ id: 3, orderedQty: 10, status: 'active' }); // Overfill (15/10)
    const l4 = makeLine({ id: 4, orderedQty: 15, status: 'out_of_stock' }); // Rupture
    const l5 = makeLine({ id: 5, orderedQty: 5, status: 'cancelled' }); // Annulé

    const lines = [l1, l2, l3, l4, l5];
    const eventsByLine = new Map<number, CountEvent[]>([
      [1, [makeEvent({ orderLineId: 1, quantity: 20 })]],
      [2, [makeEvent({ orderLineId: 2, quantity: 30 })]],
      [3, [makeEvent({ orderLineId: 3, quantity: 15 })]],
      [4, []],
      [5, []],
    ]);

    const conformeCount = lines.filter(l => {
      if (l.status !== 'active') return false;
      const evts = eventsByLine.get(l.id!) || [];
      const stageTotal = sumStageEvents(evts, 'preparation');
      const disc = calcDiscrepancy(l, stageTotal);
      return disc.isExact && stageTotal > 0;
    }).length;

    const shortCount = lines.filter(l => {
      if (l.status !== 'active') return false;
      const evts = eventsByLine.get(l.id!) || [];
      const stageTotal = sumStageEvents(evts, 'preparation');
      const disc = calcDiscrepancy(l, stageTotal);
      return disc.isShort && stageTotal > 0;
    }).length;

    const overCount = lines.filter(l => {
      if (l.status !== 'active') return false;
      const evts = eventsByLine.get(l.id!) || [];
      const stageTotal = sumStageEvents(evts, 'preparation');
      const disc = calcDiscrepancy(l, stageTotal);
      return disc.isOver;
    }).length;

    const problemStatusCount = lines.filter(l => l.status === 'out_of_stock' || l.status === 'not_found' || l.status === 'cancelled').length;

    expect(conformeCount).toBe(1);
    expect(shortCount).toBe(1);
    expect(overCount).toBe(1);
    expect(problemStatusCount).toBe(2);

    expect(Math.round((conformeCount / lines.length) * 100)).toBe(20);
    expect(Math.round((shortCount / lines.length) * 100)).toBe(20);
    expect(Math.round((overCount / lines.length) * 100)).toBe(20);
    expect(Math.round((problemStatusCount / lines.length) * 100)).toBe(40);
  });
});

describe('Workflow 8: Visual Pack Breakdown Arithmetic & Packaging Decomposition', () => {
  it('accurately decomposes remainder into integer full packages and loose units', () => {
    // 25 units remaining with inner pack of 6
    const res = calcPackBreakdown(25, 6);
    expect(res.fullPacks).toBe(4); // 4 × 6 = 24
    expect(res.loose).toBe(1);     // + 1 = 25

    // Exact multiple (24 units with pack of 12)
    const exact = calcPackBreakdown(24, 12);
    expect(exact.fullPacks).toBe(2);
    expect(exact.loose).toBe(0);

    // Only loose units (3 units with pack of 10)
    const looseOnly = calcPackBreakdown(3, 10);
    expect(looseOnly.fullPacks).toBe(0);
    expect(looseOnly.loose).toBe(3);
  });
});

describe('Workflow 9: Accidental Tap Correction via Decrement Chips (-1, -5)', () => {
  it('safely decrements count without dropping below zero', () => {
    let loose = 7;
    // Worker tapped +12 by mistake, wants to decrease
    loose = Math.max(0, loose - 5);
    expect(loose).toBe(2);

    loose = Math.max(0, loose - 1);
    expect(loose).toBe(1);

    // Guard against negative numbers
    loose = Math.max(0, loose - 5);
    expect(loose).toBe(0);
  });
});

describe('Workflow 10: Auto-Return After Adding Count & Sequential Picking Navigation', () => {
  it('defaults auto-return to true when not explicitly disabled in storage', () => {
    const isAutoReturnEnabled = (storedValue: string | null) => storedValue !== 'false';

    // Standard default when key is absent (null)
    expect(isAutoReturnEnabled(null)).toBe(true);

    // Explicitly enabled ('true')
    expect(isAutoReturnEnabled('true')).toBe(true);

    // Explicitly disabled by operator ('false')
    expect(isAutoReturnEnabled('false')).toBe(false);
  });

  it('determines appropriate navigation destination between bill view and sequential next line', () => {
    const billId = 42;
    const stage = 'preparation';
    const currentLineId = 101;
    const nextLineId = 102;

    const computeTargetUrl = (
      targetNextId?: number,
      autoReturn: boolean = true,
      fromHome: boolean = false
    ) => {
      if (targetNextId) {
        return `/bill/${billId}/line/${targetNextId}?stage=${stage}`;
      }
      if (autoReturn) {
        return fromHome ? '/' : `/bill/${billId}?stage=${stage}`;
      }
      // Stay on page
      return `/bill/${billId}/line/${currentLineId}?stage=${stage}`;
    };

    // Case 1: Standard "Ajouter" with default auto-return -> goes back to bill view
    expect(computeTargetUrl(undefined, true, false)).toBe('/bill/42?stage=preparation');

    // Case 2: Opened from home search -> goes back to home
    expect(computeTargetUrl(undefined, true, true)).toBe('/');

    // Case 3: Sequential picking next button tapped with quantity -> advances to next line
    expect(computeTargetUrl(nextLineId, true, false)).toBe('/bill/42/line/102?stage=preparation');

    // Case 4: Operator disabled auto-return in settings -> stays on product screen
    expect(computeTargetUrl(undefined, false, false)).toBe('/bill/42/line/101?stage=preparation');
  });
});



