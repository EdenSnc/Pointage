// ============================================================
// POINTAGE — Final Bill & Excel Export Unit Tests
// Tests financial precision, Excel formulas, and zero-error integrity
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  buildFinalBillRows,
  compileFinalBillData,
  createFinalBillWorkbook,
  formatFinalBillWhatsAppMessage,
} from './excelExport';
import { validateFinancialChecksum } from './ai/geminiProvider';
import type { OrderLine, CountEvent, Bill } from './types';

describe('excelExport — buildFinalBillRows & compileFinalBillData', () => {
  const dummyBill: Bill = {
    id: 10,
    sessionId: 1,
    billNumber: 'BC/OU126/03808',
    client: 'TROTEC',
    date: '2026-09-02',
    status: 'active',
    createdAt: '2026-09-02T10:00:00Z',
    updatedAt: '2026-09-02T10:00:00Z',
  };

  const dummyLines: OrderLine[] = [
    {
      id: 101,
      billId: 10,
      originalNo: '1',
      originalPage: 1,
      originalReference: '84012',
      originalEan: null,
      originalDesignation: 'CORRECTEUR STYLO 10 ML',
      originalOrderedQty: 120,
      originalUnitPrice: 42.50,
      no: '1',
      page: 1,
      reference: '84012',
      ean: null,
      designation: 'CORRECTEUR STYLO 10 ML',
      orderedQty: 120,
      unitPrice: 42.50,
      status: 'active',
      outerPackSize: null,
      innerPackSize: null,
      warehouseZone: null,
      packagesRaw: '0,21',
      referenceAliases: ['84012'],
      createdAt: '2026-09-02T10:00:00Z',
      updatedAt: '2026-09-02T10:00:00Z',
    },
    {
      id: 102,
      billId: 10,
      originalNo: '2',
      originalPage: 1,
      originalReference: '47703',
      originalEan: null,
      originalDesignation: 'NOTEBOOK A5',
      originalOrderedQty: 20,
      originalUnitPrice: 560.00,
      no: '2',
      page: 1,
      reference: '47703',
      ean: null,
      designation: 'NOTEBOOK A5',
      orderedQty: 20,
      unitPrice: 560.00,
      status: 'active',
      outerPackSize: null,
      innerPackSize: null,
      warehouseZone: null,
      packagesRaw: '0,20',
      referenceAliases: ['47703'],
      createdAt: '2026-09-02T10:00:00Z',
      updatedAt: '2026-09-02T10:00:00Z',
    },
    {
      id: 103,
      billId: 10,
      originalNo: '3',
      originalPage: 1,
      originalReference: '65150',
      originalEan: null,
      originalDesignation: 'ALBUM TARIF',
      originalOrderedQty: 32,
      originalUnitPrice: 490.00,
      no: '3',
      page: 1,
      reference: '65150',
      ean: null,
      designation: 'ALBUM TARIF',
      orderedQty: 32,
      unitPrice: 490.00,
      status: 'active',
      outerPackSize: null,
      innerPackSize: null,
      warehouseZone: null,
      packagesRaw: '1,00',
      referenceAliases: ['65150'],
      createdAt: '2026-09-02T10:00:00Z',
      updatedAt: '2026-09-02T10:00:00Z',
    },
  ];

  it('calculates exact quantities, shortages, and financial amounts with 0% error', () => {
    const eventsByLine = new Map<number, CountEvent[]>();

    // Line 1: Ordered 120, physically counted 100 (20 missing!)
    eventsByLine.set(101, [
      {
        id: 1,
        billId: 10,
        orderLineId: 101,
        stage: 'preparation',
        quantity: 100,
        containerId: null,
        outcome: null,
        undone: false,
        createdAt: '2026-09-02T10:05:00Z',
      },
    ]);

    // Line 2: Ordered 20, physically counted 20 (Exact match)
    eventsByLine.set(102, [
      {
        id: 2,
        billId: 10,
        orderLineId: 102,
        stage: 'preparation',
        quantity: 20,
        containerId: null,
        outcome: null,
        undone: false,
        createdAt: '2026-09-02T10:10:00Z',
      },
    ]);

    // Line 3: Ordered 32, physically counted 0 (Completely missing / 0 counted)
    eventsByLine.set(103, []);

    const rows = buildFinalBillRows(dummyLines, eventsByLine, { stage: 'preparation' });
    expect(rows).toHaveLength(3);

    // Check Line 1
    expect(rows[0].actualQty).toBe(100);
    expect(rows[0].diffQty).toBe(-20);
    expect(rows[0].status).toBe('MANQUANT');
    // 100 * 42.50 = 4250.00 DA
    expect(rows[0].totalTtc).toBe(4250.00);

    // Check Line 2
    expect(rows[1].actualQty).toBe(20);
    expect(rows[1].diffQty).toBe(0);
    expect(rows[1].status).toBe('CONFORME');
    // 20 * 560.00 = 11200.00 DA
    expect(rows[1].totalTtc).toBe(11200.00);

    // Check Line 3
    expect(rows[2].actualQty).toBe(0);
    expect(rows[2].diffQty).toBe(-32);
    expect(rows[2].status).toBe('MANQUANT');
    expect(rows[2].totalTtc).toBe(0);

    const compiled = compileFinalBillData(dummyBill, rows);
    expect(compiled.totalOrderedQty).toBe(172); // 120 + 20 + 32
    expect(compiled.totalActualQty).toBe(120);  // 100 + 20 + 0
    expect(compiled.totalDiffQty).toBe(-52);    // 120 - 172
    // Total Amount = 4250.00 + 11200.00 = 15450.00 DA
    expect(compiled.totalAmountTtc).toBe(15450.00);
    expect(compiled.isPriced).toBe(true);
  });

  it('filters only present items when onlyPresent option is true', () => {
    const eventsByLine = new Map<number, CountEvent[]>();
    eventsByLine.set(101, [
      { id: 1, billId: 10, orderLineId: 101, stage: 'preparation', quantity: 10, containerId: null, outcome: null, undone: false, createdAt: '' },
    ]);
    // 102 and 103 have 0
    eventsByLine.set(102, []);
    eventsByLine.set(103, []);

    const rows = buildFinalBillRows(dummyLines, eventsByLine, { stage: 'preparation', onlyPresent: true });
    expect(rows).toHaveLength(1);
    expect(rows[0].code).toBe('84012');
  });
});

describe('excelExport — createFinalBillWorkbook', () => {
  it('creates workbook with worksheet and correct formula headers', () => {
    const rows = [
      {
        no: '1',
        code: '84012',
        ean: '1234567890123',
        designation: 'CORRECTEUR STYLO',
        colisage: '0,21',
        orderedQty: 120,
        actualQty: 100,
        diffQty: -20,
        unitPrice: 42.50,
        totalTtc: 4250.00,
        status: 'MANQUANT' as const,
        observation: 'Manquant (-20)',
      },
    ];

    const data = {
      billNumber: 'BC/OU126/03808',
      client: 'TROTEC',
      date: '2026-09-02',
      totalOrderedQty: 120,
      totalActualQty: 100,
      totalDiffQty: -20,
      totalAmountTtc: 4250.00,
      isPriced: true,
      checksumValid: true,
      rows,
    };

    const wb = createFinalBillWorkbook(data);
    expect(wb.SheetNames).toContain('BL_FINAL_SURFACE');
    const ws = wb.Sheets['BL_FINAL_SURFACE'];
    expect(ws).toBeDefined();

    // Verify cell formulas in worksheet
    // Row 6 is first data row:
    // H6 has formula for diff (G6-F6)
    // J6 has formula for total (G6*I6)
    expect(ws['H6'].f).toBe('G6-F6');
    expect(ws['J6'].f).toBe('G6*I6');
  });
});

describe('excelExport — formatFinalBillWhatsAppMessage', () => {
  it('formats clean message without any emojis and accurate numbers', () => {
    const data = {
      billNumber: 'BC/OU126/03808',
      client: 'TROTEC',
      date: '2026-09-02',
      totalOrderedQty: 120,
      totalActualQty: 100,
      totalDiffQty: -20,
      totalAmountTtc: 4250.00,
      isPriced: true,
      checksumValid: true,
      rows: [
        {
          no: '1',
          code: '84012',
          ean: null,
          designation: 'CORRECTEUR STYLO',
          colisage: null,
          orderedQty: 120,
          actualQty: 100,
          diffQty: -20,
          unitPrice: 42.50,
          totalTtc: 4250.00,
          status: 'MANQUANT' as const,
          observation: 'Manquant (-20)',
        },
      ],
    };

    const msg = formatFinalBillWhatsAppMessage(data);
    // Strict verification: ZERO emojis allowed in text!
    expect(msg).not.toMatch(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u);
    expect(msg).toContain('Client : *TROTEC*');
    expect(msg).toContain('Pieces receptionnees : *100*');
    expect(msg).toContain('Ecart total pieces : *-20*');
    expect(msg).toContain('4 250,00 DA');
  });
});

describe('ai — validateFinancialChecksum (0% Error Guardrail)', () => {
  it('validates matching printed total with exact line sums', () => {
    // 120 * 42.50 = 5100, 20 * 560 = 11200. Total = 16300.00
    const lines = [
      { quantity: 120, unitPrice: 42.50 },
      { quantity: 20, unitPrice: 560.00 },
    ];

    const result = validateFinancialChecksum(lines, 16300.00);
    expect(result.isValid).toBe(true);
    expect(result.discrepancy).toBe(0);
    expect(result.computedTotal).toBe(16300.00);
    expect(result.warning).toBeUndefined();
  });

  it('detects and flags OCR misreadings or discrepancies as invalid', () => {
    const lines = [
      { quantity: 120, unitPrice: 42.50 }, // 5100
      { quantity: 20, unitPrice: 560.00 }, // 11200
    ];

    // If printed on document was 18000.00 (e.g. OCR misread a price or missed an item)
    const result = validateFinancialChecksum(lines, 18000.00);
    expect(result.isValid).toBe(false);
    expect(result.discrepancy).toBe(-1700.00);
    expect(result.warning).toBeDefined();
    expect(result.warning).toContain('Écart de calcul détecté');
  });
});
