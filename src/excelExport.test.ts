// ============================================================
// POINTAGE — Final Bill & Excel Export Unit Tests
// Tests financial precision, Excel formulas, and zero-error integrity
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  buildFinalBillRows,
  compileFinalBillData,
  createFinalBillWorkbook,
  createInvoiceWorkbook,
  createDeliveryNoteWorkbook,
  createWorkshopDeliveryWorkbook,
  createOrderBillWorkbook,
  resolveDocumentType,
  formatFinalBillWhatsAppMessage,
} from './excelExport';
import { formatDzdAmountInWords, numberToWordsFr } from './frenchNumberToWords';
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

  it('enables native gridlines and table cell borders in the Excel workbook', () => {
    const finalData = compileFinalBillData(dummyBill, [
      {
        no: '1',
        code: '84012',
        ean: null,
        designation: 'CORRECTEUR STYLO 10 ML',
        colisage: '1,00',
        orderedQty: 120,
        actualQty: 120,
        diffQty: 0,
        unitPrice: 42.50,
        totalTtc: 5100.00,
        status: 'CONFORME',
        observation: '',
      },
    ]);

    const wb = createFinalBillWorkbook(finalData);
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];

    // Verify native gridlines view
    expect(ws['!views']).toBeDefined();
    expect(ws['!views']![0].showGridLines).toBe(true);

    // Verify table header outline border on cell A9
    expect(ws['A9']).toBeDefined();
    expect(ws['A9'].s).toBeDefined();
    expect(ws['A9'].s.border).toBeDefined();
    expect(ws['A9'].s.border.top.style).toBe('thin');

    // Verify data row border on cell A10
    expect(ws['A10']).toBeDefined();
    expect(ws['A10'].s).toBeDefined();
    expect(ws['A10'].s.border).toBeDefined();
    expect(ws['A10'].s.border.bottom.style).toBe('thin');
  });
});

describe('excelExport — 1:1 Warehouse Document Replicas & Differentiation', () => {
  const sajInvoiceData = {
    billNumber: 'SAJ/2026/5435',
    client: 'BLEU BLANC NAKHIL',
    date: '06/09/2026',
    agentName: 'ShowOr',
    clientAddress: '95 ET 96 LOTS ZONE D\'ACTIVITE - BIR EL DJIR - ORAN',
    paymentMode: 'GMS2026+++ GMS',
    nif: '002131112400617',
    rc: '21B 2124006-00/31',
    bcNumber: '03885',
    totalOrderedQty: 14,
    totalActualQty: 14,
    totalDiffQty: 0,
    totalAmountTtc: 36555.22,
    totalHt: 32209.00,
    totalHtNet: 30718.67,
    totalRemise: 1490.33,
    totalTva: 5836.55,
    totalRemPaiement: 1044.17,
    totalAvecRemise: 35511.05,
    amountInWords: 'TRENTE-SIX MILLE CINQ CENT CINQUANTE-CINQ DZD ET VINGT-DEUX CENTIMES',
    isPriced: true,
    checksumValid: true,
    rows: [
      {
        no: '1',
        code: '71662',
        ean: '6941782115565',
        designation: 'SAC A DOS MOYEN 22 L 4 MO 71662',
        colisage: '0,06',
        orderedQty: 3,
        actualQty: 3,
        diffQty: 0,
        unitPrice: 3332.50,
        discountPercent: 0,
        totalTtc: 9997.50,
        status: 'CONFORME' as const,
        observation: 'Conforme',
      },
      {
        no: '2',
        code: '71706',
        ean: '6941782116005',
        designation: 'SAC A DOS PRESCOLAIRE 10 L 6 MO 71706',
        colisage: '2,00',
        orderedQty: 2,
        actualQty: 2,
        diffQty: 0,
        unitPrice: 1526.75,
        discountPercent: 15,
        totalTtc: 2595.47,
        status: 'CONFORME' as const,
        observation: 'Conforme',
      },
      {
        no: '3',
        code: '71689',
        ean: '6941782115831',
        designation: 'SAC A DOS PRESCOLAIRE 8 L 5 MO 71689',
        colisage: '0,10',
        orderedQty: 5,
        actualQty: 5,
        diffQty: 0,
        unitPrice: 1376.40,
        discountPercent: 15,
        totalTtc: 5849.70,
        status: 'CONFORME' as const,
        observation: 'Conforme',
      },
      {
        no: '4',
        code: '71660',
        ean: '6941782115541',
        designation: 'SAC A DOS PRIMAIRE 22 L 4 MO 71660',
        colisage: '0,08',
        orderedQty: 4,
        actualQty: 4,
        diffQty: 0,
        unitPrice: 3069.00,
        discountPercent: 0,
        totalTtc: 12276.00,
        status: 'CONFORME' as const,
        observation: 'Conforme',
      },
    ],
  };

  it('correctly resolves document type based on bill numbers and item characteristics', () => {
    // Invoice
    expect(resolveDocumentType({ ...sajInvoiceData, billNumber: 'Invoice SAJ/2026/5435' })).toBe('invoice');
    expect(resolveDocumentType({ ...sajInvoiceData, billNumber: 'FACT-2026-098' })).toBe('invoice');

    // BL Officiel (starts with BL and contains valid EANs)
    expect(resolveDocumentType({ ...sajInvoiceData, billNumber: 'BL/OU126/03615' })).toBe('bl_official');

    // BL Atelier (starts with BL but no valid EANs)
    const workshopData = {
      ...sajInvoiceData,
      billNumber: 'BL/OU126/03608',
      rows: sajInvoiceData.rows.map((r) => ({ ...r, ean: null })),
    };
    expect(resolveDocumentType(workshopData)).toBe('bl_workshop');

    // Bon de commande
    expect(resolveDocumentType({ ...sajInvoiceData, billNumber: 'BC/OU126/03808' })).toBe('bon_commande');

    // Explicit override takes precedence
    expect(resolveDocumentType(workshopData, 'invoice')).toBe('invoice');
  });

  it('replicates Facture Commerciale (Invoice SAJ/2026/5435) 1:1 with formulas, totals & words', () => {
    const wb = createInvoiceWorkbook(sajInvoiceData);
    const ws = wb.Sheets[wb.SheetNames[0]];
    expect(ws).toBeDefined();

    // Top Header
    expect(ws['A1'].v).toContain('Invoice SAJ/2026/5435');
    expect(ws['A3'].v).toBe('Par: ShowOr');
    expect(ws['G1'].v).toContain('Bir El Djir , le : 06/09/2026');

    // Client box
    expect(ws['E2'].v).toContain('BLEU BLANC NAKHIL');
    expect(ws['E6'].v).toContain('NIF : 002131112400617');
    expect(ws['E7'].v).toContain('RC : 21B 2124006-00/31');

    // Table Column Headers (Row 9)
    expect(ws['A9'].v).toBe('N°');
    expect(ws['B9'].v).toBe('CODE');
    expect(ws['C9'].v).toBe('Désignation');
    expect(ws['D9'].v).toBe('QTÉ');
    expect(ws['E9'].v).toBe('Colisage');
    expect(ws['F9'].v).toBe('Qté/Carton');
    expect(ws['G9'].v).toBe('PU');
    expect(ws['H9'].v).toBe('MONTANT HT');
    expect(ws['I9'].v).toBe('TVA');
    expect(ws['J9'].v).toBe('Rem(%)');
    expect(ws['K9'].v).toBe('Rem. Paiement(%)');

    // First Data Row (Row 10)
    expect(ws['A10'].v).toBe('1');
    expect(ws['B10'].v).toBe('71662');
    expect(ws['C10'].v).toBe('SAC A DOS MOYEN 22 L 4 MO 71662');
    expect(ws['D10'].v).toBe(3);
    expect(ws['G10'].v).toBe(3332.50);
    expect(ws['H10'].f).toBe('D10*G10');
    expect(ws['H10'].v).toBe(9997.50);
    expect(ws['I10'].v).toBe('19%');

    // 7-line totals block on right
    // TOTAL HT
    expect(ws['G15'].v).toBe('TOTAL HT');
    expect(ws['H15'].v).toBe(32209.00);
    // TOTAL HT NET
    expect(ws['G16'].v).toBe('TOTAL HT NET');
    expect(ws['H16'].v).toBe(30718.67);
    // REMISE
    expect(ws['G17'].v).toBe('REMISE');
    expect(ws['H17'].v).toBe(1490.33);
    // TVA
    expect(ws['G18'].v).toBe('TVA');
    expect(ws['H18'].v).toBe(5836.55);
    // TOTAL TTC
    expect(ws['G19'].v).toBe('TOTAL TTC');
    expect(ws['H19'].v).toBe(36555.22);
    // REM PAIEMENT
    expect(ws['G20'].v).toBe('REM PAIEMENT');
    expect(ws['H20'].v).toBe(1044.17);
    // TOTAL AVEC REMISE
    expect(ws['G21'].v).toBe('TOTAL AVEC REMISE');
    expect(ws['H21'].v).toBe(35511.05);

    // Legal wording on left
    expect(ws['A15'].v).toBe('Arrêté la Présente Facture à la Somme de:');
    expect(ws['A16'].v).toContain('TRENTE-SIX MILLE CINQ CENT CINQUANTE-CINQ DZD ET VINGT-DEUX CENTIMES');
    expect(ws['A18'].v).toContain('Conditions de règlement: GMS2026+++ GMS');
  });

  it('replicates Bon de Livraison Officiel (BL/OU126/03615) 1:1 with SARL SBM header and BC link', () => {
    const wb = createDeliveryNoteWorkbook(sajInvoiceData);
    const ws = wb.Sheets[wb.SheetNames[0]];
    expect(ws).toBeDefined();

    // Company Header
    expect(ws['A1'].v).toBe('SARL S.B.M IMP/EXP');
    expect(ws['A2'].v).toContain('Capital Social');
    expect(ws['D5'].v).toBe('RC: 09 B 0118597');
    expect(ws['D7'].v).toBe('NIF: 000931011859707');

    // Document and BC Number
    expect(ws['A10'].v).toContain('BON DE LIVRAISON : SAJ/2026/5435');
    expect(ws['D18'].v).toContain('N° BC:03885');

    // Table Header (Row 20)
    expect(ws['A20'].v).toBe('N°');
    expect(ws['B20'].v).toBe('Référence');
    expect(ws['C20'].v).toBe('EAN');
    expect(ws['D20'].v).toBe('Désignation');
    expect(ws['E20'].v).toBe('QTÉ');

    // EAN stored strictly as string to prevent scientific notation (e.g. 6.94E+12)
    const eanCell = ws['C21'];
    expect(eanCell.t).toBe('s');
    expect(eanCell.v).toBe('6941782115565');

    // Total pieces
    expect(ws['D26'].v).toBe('TOTAL QTÉ');
    expect(ws['E26'].f).toBe('SUM(E21:E24)');
    expect(ws['E26'].v).toBe(14);

    // Amount in words
    expect(ws['A28'].v).toContain('Arrêté le présent Bon de Livraison à la quantité de : QUATORZE PIÈCE(S)');

    // Signatures
    expect(ws['A30'].v).toBe('Accusé de Réception Client');
    expect(ws['D30'].v).toBe('Cachet et Signature Magasin / Expédition');
  });

  it('replicates Bordereau Atelier (BL/OU126/03608) with LOT and Packages columns', () => {
    const wb = createWorkshopDeliveryWorkbook(sajInvoiceData);
    const ws = wb.Sheets[wb.SheetNames[0]];
    expect(ws).toBeDefined();

    // Headers
    expect(ws['A10'].v).toBe('N°');
    expect(ws['B10'].v).toBe('Référence');
    expect(ws['C10'].v).toBe('Désignation');
    expect(ws['D10'].v).toBe('LOT');
    expect(ws['E10'].v).toBe('QTÉ');
    expect(ws['F10'].v).toBe('Packages');

    // Data Row
    expect(ws['A11'].v).toBe('1');
    expect(ws['B11'].v).toBe('71662');
    expect(ws['E11'].v).toBe(3);
    expect(ws['F11'].v).toBe('0,06');

    // Total and Visa
    expect(ws['D16'].v).toBe('TOTAL QTÉ');
    expect(ws['E16'].v).toBe(14);
    expect(ws['A18'].v).toBe('Visa Préparateur / Chef d\'Atelier');
  });

  it('converts numbers to official Algerian DZD invoice words accurately', () => {
    expect(formatDzdAmountInWords(36555.22)).toBe('TRENTE-SIX MILLE CINQ CENT CINQUANTE-CINQ DZD ET VINGT-DEUX CENTIMES');
    expect(formatDzdAmountInWords(100)).toBe('CENT DZD');
    expect(formatDzdAmountInWords(120)).toBe('CENT VINGT DZD');
    expect(formatDzdAmountInWords(51)).toBe('CINQUANTE ET UN DZD');
    expect(numberToWordsFr(51)).toBe('CINQUANTE ET UN');
    expect(numberToWordsFr(14)).toBe('QUATORZE');
    expect(numberToWordsFr(0)).toBe('ZÉRO');
  });

  it('formats WhatsApp message differently for Invoice vs BL Officiel', () => {
    // Invoice message has financial totals
    const invoiceMsg = formatFinalBillWhatsAppMessage(sajInvoiceData, 'invoice');
    expect(invoiceMsg).toContain('FACTURE COMMERCIALE (SAJ / SHOWOR)');
    expect(invoiceMsg).toContain('36 555,22 DA');
    expect(invoiceMsg).toContain('TRENTE-SIX MILLE CINQ CENT CINQUANTE-CINQ DZD ET VINGT-DEUX CENTIMES');

    // BL message has BC reference and pieces without prices
    const blMsg = formatFinalBillWhatsAppMessage(sajInvoiceData, 'bl_official');
    expect(blMsg).toContain('BON DE LIVRAISON OFFICIEL (SARL S.B.M IMP/EXP)');
    expect(blMsg).toContain('N° Bon de Commande (BC) : *03885*');
    expect(blMsg).toContain('Pieces receptionnees : *14*');
  });

  it('creates order bill workbook directly with createOrderBillWorkbook', () => {
    const wb = createOrderBillWorkbook(sajInvoiceData);
    expect(wb.SheetNames.length).toBe(1);
    const ws = wb.Sheets[wb.SheetNames[0]];
    expect(ws['A1'].v).toContain('Bon de commande : SAJ/2026/5435');
  });
});

describe('excelExport — Comprehensive Edge Cases & Precision Testing', () => {
  it('handles formatDzdAmountInWords edge cases including singular centime, rollover and large numbers', () => {
    // Zero
    expect(formatDzdAmountInWords(0)).toBe('ZÉRO DZD');
    // Singular centime
    expect(formatDzdAmountInWords(100.01)).toBe('CENT DZD ET UN CENTIME');
    // Plural centimes
    expect(formatDzdAmountInWords(100.02)).toBe('CENT DZD ET DEUX CENTIMES');
    expect(formatDzdAmountInWords(100.99)).toBe('CENT DZD ET QUATRE-VINGT-DIX-NEUF CENTIMES');
    // Floating point precision rollover (e.g. 99.999 -> 100.00)
    expect(formatDzdAmountInWords(99.999)).toBe('CENT DZD');
    // Negative or NaN
    expect(formatDzdAmountInWords(-50)).toBe('ZÉRO DZD');
    expect(formatDzdAmountInWords(NaN)).toBe('ZÉRO DZD');

    // Complex French grammar numbers
    expect(formatDzdAmountInWords(71.00)).toBe('SOIXANTE ET ONZE DZD');
    expect(formatDzdAmountInWords(80.00)).toBe('QUATRE-VINGTS DZD');
    expect(formatDzdAmountInWords(81.00)).toBe('QUATRE-VINGT-UN DZD');
    expect(formatDzdAmountInWords(91.00)).toBe('QUATRE-VINGT-ONZE DZD');
    expect(formatDzdAmountInWords(99.00)).toBe('QUATRE-VINGT-DIX-NEUF DZD');
    expect(formatDzdAmountInWords(200.00)).toBe('DEUX CENTS DZD');
    expect(formatDzdAmountInWords(201.00)).toBe('DEUX CENT UN DZD');
    expect(formatDzdAmountInWords(1000.00)).toBe('MILLE DZD');
    expect(formatDzdAmountInWords(2000.00)).toBe('DEUX MILLE DZD');
    expect(formatDzdAmountInWords(20000000.00)).toBe('VINGT MILLIONS DZD');
    expect(formatDzdAmountInWords(1500000.00)).toBe('UN MILLION CINQ CENTS MILLE DZD');
  });

  it('strictly preserves leading zeros in 13-digit EAN barcodes as string cells in Excel', () => {
    const data = {
      billNumber: 'BL/OU126/03615',
      client: 'TEST',
      date: '2026-09-06',
      totalOrderedQty: 10,
      totalActualQty: 10,
      totalDiffQty: 0,
      totalAmountTtc: 0,
      isPriced: false,
      checksumValid: true,
      rows: [
        {
          no: '1',
          code: 'REF-01',
          // EAN starting with 0!
          ean: '0123456789012',
          designation: 'Article avec zéro initial',
          colisage: null,
          orderedQty: 10,
          actualQty: 10,
          diffQty: 0,
          unitPrice: null,
          totalTtc: null,
          status: 'CONFORME' as const,
          observation: '',
        },
        {
          no: '2',
          code: 'REF-02',
          // Null EAN
          ean: null,
          designation: 'Article sans EAN',
          colisage: null,
          orderedQty: 5,
          actualQty: 5,
          diffQty: 0,
          unitPrice: null,
          totalTtc: null,
          status: 'CONFORME' as const,
          observation: '',
        },
      ],
    };

    const wb = createDeliveryNoteWorkbook(data);
    const ws = wb.Sheets[wb.SheetNames[0]];

    // First row: EAN cell C21 must have leading zero preserved as string
    const cellEan1 = ws['C21'];
    expect(cellEan1.t).toBe('s');
    expect(cellEan1.v).toBe('0123456789012');
    expect(cellEan1.v.startsWith('0')).toBe(true);

    // Second row: Null EAN should render as '-'
    const cellEan2 = ws['C22'];
    expect(cellEan2.t).toBe('s');
    expect(cellEan2.v).toBe('-');
  });

  it('handles empty delivery note and invoice workbooks without crashing', () => {
    const emptyData = {
      billNumber: 'BL/EMPTY',
      client: 'EMPTY CLIENT',
      date: '2026-09-06',
      totalOrderedQty: 0,
      totalActualQty: 0,
      totalDiffQty: 0,
      totalAmountTtc: 0,
      isPriced: false,
      checksumValid: true,
      rows: [],
    };

    const wbBL = createDeliveryNoteWorkbook(emptyData);
    expect(wbBL.SheetNames.length).toBe(1);
    const wsBL = wbBL.Sheets[wbBL.SheetNames[0]];
    expect(wsBL['D21'].v).toContain('Aucun article');

    const wbInv = createInvoiceWorkbook(emptyData);
    expect(wbInv.SheetNames.length).toBe(1);
    const wsInv = wbInv.Sheets[wbInv.SheetNames[0]];
    expect(wsInv['C10'].v).toContain('Aucun article');

    const wbWork = createWorkshopDeliveryWorkbook(emptyData);
    expect(wbWork.SheetNames.length).toBe(1);
    const wsWork = wbWork.Sheets[wbWork.SheetNames[0]];
    expect(wsWork['C11'].v).toContain('Aucun article');
  });

  it('handles resolveDocumentType with strange, lowercase, or empty strings', () => {
    const base = {
      billNumber: '',
      client: 'TEST',
      date: '2026-09-06',
      totalOrderedQty: 0,
      totalActualQty: 0,
      totalDiffQty: 0,
      totalAmountTtc: 0,
      isPriced: false,
      checksumValid: true,
      rows: [],
    };

    // Case insensitive
    expect(resolveDocumentType({ ...base, billNumber: 'invoice-2026' })).toBe('invoice');
    expect(resolveDocumentType({ ...base, billNumber: 'saj-blida' })).toBe('invoice');
    expect(resolveDocumentType({ ...base, billNumber: 'facture_01' })).toBe('invoice');
    expect(resolveDocumentType({ ...base, billNumber: 'commande-gros' })).toBe('bon_commande');

    // Empty billNumber with priced items -> defaults to invoice
    expect(resolveDocumentType({ ...base, billNumber: '   ', isPriced: true })).toBe('invoice');

    // Empty billNumber with barcode rows -> defaults to bl_official
    const eanRows = [{
      no: '1', code: 'C', ean: '6941782115831', designation: 'D',
      colisage: null, orderedQty: 1, actualQty: 1, diffQty: 0,
      unitPrice: null, totalTtc: null, status: 'CONFORME' as const, observation: '',
    }];
    expect(resolveDocumentType({ ...base, billNumber: '', rows: eanRows })).toBe('bl_official');

    // Empty billNumber with no prices and no barcodes -> defaults to bl_workshop
    expect(resolveDocumentType({ ...base, billNumber: '' })).toBe('bl_workshop');
  });

  it('handles compileFinalBillData with line discounts, bill discount, and null prices', () => {
    const dummyBill = {
      id: 1,
      sessionId: 1,
      billNumber: 'INV-TEST',
      client: 'CLIENT TEST',
      status: 'active' as const,
      discountPercent: 5, // 5% payment discount
      createdAt: '',
      updatedAt: '',
    };

    const rows = [
      {
        no: '1',
        code: 'ART-1',
        ean: null,
        designation: 'Article 1',
        colisage: '1,00',
        orderedQty: 10,
        actualQty: 10,
        diffQty: 0,
        unitPrice: 100.00,
        discountPercent: 10, // 10% line discount
        totalTtc: 1000.00,
        status: 'CONFORME' as const,
        observation: '',
      },
      {
        no: '2',
        code: 'ART-2',
        ean: null,
        designation: 'Article gratuit / sans prix',
        colisage: '1,00',
        orderedQty: 5,
        actualQty: 5,
        diffQty: 0,
        unitPrice: null, // No price!
        discountPercent: null,
        totalTtc: null,
        status: 'CONFORME' as const,
        observation: '',
      },
    ];

    const data = compileFinalBillData(dummyBill as any, rows);
    // Gross HT: 10 * 100 = 1000.00
    expect(data.totalHt).toBe(1000.00);
    // Line discount: 10% of 1000 = 100.00
    expect(data.totalRemise).toBe(100.00);
    // Net HT: 1000 - 100 = 900.00
    expect(data.totalHtNet).toBe(900.00);
    // TVA (19%): 900 * 0.19 = 171.00
    expect(data.totalTva).toBe(171.00);
    // Total TTC: 1000.00
    expect(data.totalAmountTtc).toBe(1000.00);
    // Remise paiement (5% on 1000): 50.00
    expect(data.totalRemPaiement).toBe(50.00);
    // Total avec remise: 950.00
    expect(data.totalAvecRemise).toBe(950.00);
    expect(data.amountInWords).toContain('MILLE DZD');
  });

  it('correctly includes operator attribution in export data, workshop visa, and WhatsApp dispatch', () => {
    const billWithOps: Bill = {
      id: 20,
      sessionId: 1,
      billNumber: 'BL/OU126/03608',
      client: 'BLEU BLANC NAKHIL',
      date: '2026-09-07',
      status: 'active',
      preparedBy: 'Amine',
      loadedBy: 'Mohamed',
      checkedBy: 'Walid',
      createdAt: '2026-09-07T10:00:00Z',
      updatedAt: '2026-09-07T10:00:00Z',
    };

    const rows = [
      {
        no: '1',
        code: 'ART-1',
        ean: null,
        designation: 'Article Test',
        colisage: '1,00',
        orderedQty: 10,
        actualQty: 10,
        diffQty: 0,
        unitPrice: 50.0,
        discountPercent: null,
        totalTtc: 500.0,
        status: 'CONFORME' as const,
        observation: '',
      },
    ];

    const data = compileFinalBillData(billWithOps, rows);
    expect(data.preparedBy).toBe('Amine');
    expect(data.loadedBy).toBe('Mohamed');
    expect(data.checkedBy).toBe('Walid');

    // Workshop workbook includes operator visa
    const wb = createWorkshopDeliveryWorkbook(data);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const sheetValues = Object.values(sheet).map((cell: any) => cell?.v).filter(Boolean);
    expect(sheetValues.some((v) => typeof v === 'string' && v.includes('Visa Préparateur : Amine'))).toBe(true);

    // WhatsApp dispatch contains operator accountability block
    const whatsapp = formatFinalBillWhatsAppMessage(data, 'bl_workshop');
    expect(whatsapp).toContain('Préparé par : *Amine*');
    expect(whatsapp).toContain('Chargé par : *Mohamed*');
    expect(whatsapp).toContain('Pointé par : *Walid*');
  });
});



