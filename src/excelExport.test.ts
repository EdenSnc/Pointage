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
    expect(wb.SheetNames.length).toBe(1);
    const sheetName = wb.SheetNames[0];
    expect(sheetName).toBe('BC_OU126_03808');
    const ws = wb.Sheets[sheetName];
    expect(ws).toBeDefined();

    // Verify cell content matching authentic warehouse paper bills 1:1
    // Row 1: Bon de commande : BC/OU126/03808
    expect(ws['A1'].v).toContain('Bon de commande : BC/OU126/03808');
    // Row 9: Headers: N°, CODE, Désignation, QTÉ, U.M, Colisage, PU
    expect(ws['A9'].v).toBe('N°');
    expect(ws['B9'].v).toBe('CODE');
    expect(ws['C9'].v).toBe('Désignation');
    expect(ws['D9'].v).toBe('QTÉ');
    expect(ws['E9'].v).toBe('U.M');
    expect(ws['F9'].v).toBe('Colisage');
    expect(ws['G9'].v).toBe('PU');

    // Row 10: First data row
    expect(ws['A10'].v).toBe('1');
    expect(ws['B10'].v).toBe('84012');
    expect(ws['C10'].v).toBe('CORRECTEUR STYLO');
    expect(ws['D10'].v).toBe(100);
    expect(ws['G10'].v).toBe(42.50);

    // Bottom Summary: TOTAL TTC formula
    expect(ws['F12'].v).toBe('TOTAL TTC');
    expect(ws['G12'].f).toBe('SUMPRODUCT(D10:D10, G10:G10)');
    expect(ws['G12'].v).toBe(4250.00);
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

  it('validates invoice totals when supplier applied a discount percentage (remise)', () => {
    // 100 * 100 = 10,000 DA gross total. 5% discount -> 9,500 DA net TTC.
    const lines = [
      { quantity: 100, unitPrice: 100.00 },
    ];

    const result = validateFinancialChecksum(lines, 9500.00, 5);
    expect(result.isValid).toBe(true);
    expect(result.computedTotal).toBe(10000.00);
    expect(result.discrepancy).toBe(0);
  });

  it('handles rounding differences within 0.10 DA tolerance', () => {
    // 3 lines with slight centime rounding difference
    const lines = [
      { quantity: 3, unitPrice: 33.33 }, // 99.99
    ];
    // Printed total on document says 100.00 (0.01 DA difference)
    const result = validateFinancialChecksum(lines, 100.00);
    expect(result.isValid).toBe(true);
    expect(result.discrepancy).toBe(-0.01);
  });

  it('handles empty lines, missing prices, and null printed totals gracefully', () => {
    expect(validateFinancialChecksum([], 100.00).isValid).toBe(true);
    expect(validateFinancialChecksum([{ quantity: 10 }], null).isValid).toBe(true);
    expect(validateFinancialChecksum([{ quantity: 10, unitPrice: null }], 100.00).isValid).toBe(true);
  });
});

describe('excelExport — Extensive Edge Cases Resilience', () => {
  const dummyBill: Bill = {
    id: 99,
    sessionId: 1,
    billNumber: 'BC/OU126/03808',
    client: 'TEST & CO "DISTRIB" / BLIDA',
    date: '2026-09-06',
    status: 'active',
    createdAt: '2026-09-06T10:00:00Z',
    updatedAt: '2026-09-06T10:00:00Z',
  };

  it('handles an empty bill with 0 lines without crashing or producing corrupt formulas', () => {
    const rows = buildFinalBillRows([], new Map());
    expect(rows).toEqual([]);

    const data = compileFinalBillData(dummyBill, rows);
    expect(data.totalOrderedQty).toBe(0);
    expect(data.totalActualQty).toBe(0);
    expect(data.totalDiffQty).toBe(0);
    expect(data.totalAmountTtc).toBe(0);
    expect(data.isPriced).toBe(false);

    const wb = createFinalBillWorkbook(data);
    expect(wb.SheetNames.length).toBe(1);
    const ws = wb.Sheets[wb.SheetNames[0]];
    expect(ws).toBeDefined();
    expect(ws['A10'].v).toBe('-');
    expect(ws['C10'].v).toBe('Aucun article dans cette sélection');
  });

  it('handles onlyPresent filter when all counts are 0', () => {
    const lines: OrderLine[] = [
      {
        id: 1,
        billId: 99,
        originalNo: '1',
        originalPage: 1,
        originalReference: 'REF-01',
        originalEan: null,
        originalDesignation: 'Article 1',
        originalOrderedQty: 10,
        originalUnitPrice: null,
        no: '1',
        page: 1,
        reference: 'REF-01',
        ean: null,
        designation: 'Article 1',
        orderedQty: 10,
        unitPrice: null,
        status: 'active',
        outerPackSize: null,
        innerPackSize: null,
        warehouseZone: null,
        packagesRaw: null,
        referenceAliases: [],
        createdAt: '2026-09-06T10:00:00Z',
        updatedAt: '2026-09-06T10:00:00Z',
      },
    ];

    // No events recorded -> actualQty = 0
    const rows = buildFinalBillRows(lines, new Map(), { onlyPresent: true });
    expect(rows.length).toBe(0);

    const data = compileFinalBillData(dummyBill, rows);
    const wb = createFinalBillWorkbook(data);
    expect(wb.SheetNames.length).toBe(1);
    expect(wb.Sheets[wb.SheetNames[0]]).toBeDefined();
  });

  it('handles missing line references, designations, colisage, and EANs with safe fallbacks', () => {
    const lines: OrderLine[] = [
      {
        id: 50,
        billId: 99,
        originalNo: '5',
        originalPage: 1,
        originalReference: null,
        originalEan: null,
        originalDesignation: '',
        originalOrderedQty: 5,
        originalUnitPrice: null,
        no: '5',
        page: 1,
        reference: null as any,
        ean: null,
        designation: '',
        orderedQty: 5,
        unitPrice: null,
        status: 'active',
        outerPackSize: null,
        innerPackSize: null,
        warehouseZone: null,
        packagesRaw: null,
        referenceAliases: [],
        createdAt: '2026-09-06T10:00:00Z',
        updatedAt: '2026-09-06T10:00:00Z',
      },
    ];

    const rows = buildFinalBillRows(lines, new Map());
    expect(rows.length).toBe(1);
    expect(rows[0].code).toBe('ART-5');
    expect(rows[0].designation).toBe('Article sans désignation');
    expect(rows[0].ean).toBeNull();
    expect(rows[0].colisage).toBe('1,00');
  });

  it('handles item added on the fly (orderedQty = 0, actualQty > 0) as SURPLUS', () => {
    const lines: OrderLine[] = [
      {
        id: 77,
        billId: 99,
        originalNo: '99',
        originalPage: 1,
        originalReference: 'EXTRA-01',
        originalEan: '6131234567890',
        originalDesignation: 'Article Extra Hors Bon',
        originalOrderedQty: 0,
        originalUnitPrice: 250.00,
        no: '99',
        page: 1,
        reference: 'EXTRA-01',
        ean: '6131234567890',
        designation: 'Article Extra Hors Bon',
        orderedQty: 0,
        unitPrice: 250.00,
        status: 'active',
        outerPackSize: null,
        innerPackSize: null,
        warehouseZone: null,
        packagesRaw: null,
        referenceAliases: [],
        createdAt: '2026-09-06T10:00:00Z',
        updatedAt: '2026-09-06T10:00:00Z',
      },
    ];

    const eventsMap = new Map<number, CountEvent[]>([
      [
        77,
        [
          {
            id: 1,
            billId: 99,
            orderLineId: 77,
            stage: 'preparation',
            quantity: 15,
            packType: 'units',
            outcome: 'accepted',
            undone: false,
            createdAt: '2026-09-06T10:05:00Z',
          },
        ],
      ],
    ]);

    const rows = buildFinalBillRows(lines, eventsMap);
    expect(rows[0].orderedQty).toBe(0);
    expect(rows[0].actualQty).toBe(15);
    expect(rows[0].diffQty).toBe(15);
    expect(rows[0].status).toBe('SURPLUS');
    expect(rows[0].observation).toContain('Article hors bon / surplus (+15)');
    expect(rows[0].totalTtc).toBe(3750.00);
  });

  it('handles refused and damaged count events properly', () => {
    const lines: OrderLine[] = [
      {
        id: 88,
        billId: 99,
        originalNo: '1',
        originalPage: 1,
        originalReference: 'REF-AVARIE',
        originalEan: null,
        originalDesignation: 'Carton Endommagé',
        originalOrderedQty: 10,
        originalUnitPrice: 100.00,
        no: '1',
        page: 1,
        reference: 'REF-AVARIE',
        ean: null,
        designation: 'Carton Endommagé',
        orderedQty: 10,
        unitPrice: 100.00,
        status: 'active',
        outerPackSize: null,
        innerPackSize: null,
        warehouseZone: null,
        packagesRaw: null,
        referenceAliases: [],
        createdAt: '2026-09-06T10:00:00Z',
        updatedAt: '2026-09-06T10:00:00Z',
      },
    ];

    const eventsMap = new Map<number, CountEvent[]>([
      [
        88,
        [
          {
            id: 2,
            billId: 99,
            orderLineId: 88,
            stage: 'preparation',
            quantity: 5,
            packType: 'units',
            outcome: 'damaged_refused',
            undone: false,
            createdAt: '2026-09-06T10:10:00Z',
          },
        ],
      ],
    ]);

    const rows = buildFinalBillRows(lines, eventsMap);
    expect(rows[0].status).toBe('AVARIE');
    expect(rows[0].observation).toContain('Marchandise avariée / refusée au pointage');
  });

  it('caps long WhatsApp message anomaly lists at 20 items to prevent URL overflow', () => {
    // Generate 35 anomaly rows
    const rows = Array.from({ length: 35 }, (_, idx) => ({
      no: String(idx + 1),
      code: `REF-${idx + 1}`,
      ean: null,
      designation: `Produit Anormal ${idx + 1}`,
      colisage: null,
      orderedQty: 10,
      actualQty: 0,
      diffQty: -10,
      unitPrice: 50.00,
      totalTtc: 0,
      status: 'MANQUANT' as const,
      observation: 'Non reçu (0 / 10)',
    }));

    const data = {
      billNumber: 'BC/OU126/03808',
      client: 'TEST',
      date: '2026-09-06',
      totalOrderedQty: 350,
      totalActualQty: 0,
      totalDiffQty: -350,
      totalAmountTtc: 0,
      isPriced: true,
      checksumValid: true,
      rows,
    };

    const msg = formatFinalBillWhatsAppMessage(data);
    expect(msg).toContain('DETAIL DES ANOMALIES & ECARTS (35)');
    expect(msg).toContain('20. [REF-20]');
    expect(msg).not.toContain('21. [REF-21]');
    expect(msg).toContain('... et 15 autres anomalies (voir fichier Excel .xlsx complet ci-joint)');
  });
});
