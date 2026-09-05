// ============================================================
// POINTAGE — Importer Unit & Integration Tests
// Tests multi-page bill merging, deduplication, and handwritten note support
// ============================================================

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeBillNumber,
  isSameBill,
  parseImportJSON,
  validateImport,
  importBills,
} from './importer';
import { db } from './db';

describe('importer — normalizeBillNumber & isSameBill', () => {
  it('normalizes bill numbers by stripping prefixes and punctuation', () => {
    expect(normalizeBillNumber('BC/0U126/03835')).toBe('0U12603835');
    expect(normalizeBillNumber('0U126/03835')).toBe('0U12603835');
    expect(normalizeBillNumber('BL-2026-001')).toBe('2026001');
    expect(normalizeBillNumber('BL/OU126/03221')).toBe('OU12603221');
    expect(normalizeBillNumber('FACTURE: 99412')).toBe('99412');
    expect(normalizeBillNumber('COMMANDE_12345')).toBe('12345');
    expect(normalizeBillNumber(null)).toBe('');
    expect(normalizeBillNumber(undefined)).toBe('');
  });

  it('matches identical normalized bill numbers', () => {
    expect(isSameBill('BC/0U126/03835', 'Aissaoui', '0U126/03835', 'Aissaoui')).toBe(true);
    expect(isSameBill('BL-2026-001', 'Client A', '2026001', 'Client A')).toBe(true);
    // Distinct bill numbers should not match
    expect(isSameBill('BC/0U126/03835', 'Aissaoui', 'BC/0U126/03836', 'Aissaoui')).toBe(false);
  });

  it('handles handwritten notes with generic bill numbers via client matching', () => {
    expect(isSameBill('NOTE-MANUSCRITE', 'STE SARL LOGISTIQUE', 'NOTE-MANUSCRITE', 'STE SARL LOGISTIQUE')).toBe(true);
    // Generic client names do not falsely match
    expect(isSameBill('NOTE-MANUSCRITE', 'Client Divers', 'NOTE-MANUSCRITE', 'Client Inconnu')).toBe(false);
  });
});

describe('importer — Handwritten notes & sparse lines', () => {
  it('validates lines that only contain reference and quantity (no barcode, no designation)', () => {
    const payload = {
      bills: [
        {
          billNumber: 'NOTE-SCRAP',
          client: 'CLIENT A',
          lines: [
            { reference: '70380/84', quantity: 10 },
            { reference: 'CL-500', quantity: 5 },
          ],
        },
      ],
    };

    const issues = validateImport(payload);
    const errors = issues.filter((i) => i.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('parses manual JSON payload reliably', () => {
    const jsonStr = JSON.stringify({
      bills: [
        {
          billNumber: 'BL-999',
          client: 'SARL TEST',
          lines: [{ reference: 'REF-1', quantity: 2 }],
        },
      ],
    });

    const parsed = parseImportJSON(jsonStr);
    expect(parsed.parseError).toBeNull();
    expect(parsed.payload?.bills).toHaveLength(1);
  });
});

describe('importer — Multi-Page Same-Bill Merging in DB', () => {
  beforeEach(async () => {
    await db.bills.clear();
    await db.orderLines.clear();
    await db.auditEvents.clear();
  });

  it('merges subsequent page into existing active bill instead of creating duplicate', async () => {
    const sessionId = 1;

    // 1. First Scan: Page 1 of BL BC/0U126/03835 (3 lines)
    const page1Payload = {
      bills: [
        {
          billNumber: 'BC/0U126/03835',
          client: 'AISSAOUI HICHAM',
          lines: [
            { no: '1', page: 1, reference: 'REF-A', designation: 'Produit A', quantity: 10 },
            { no: '2', page: 1, reference: 'REF-B', designation: 'Produit B', quantity: 5 },
            { no: '3', page: 1, reference: 'REF-C', designation: 'Produit C', quantity: 20 },
          ],
        },
      ],
    };

    const res1 = await importBills(page1Payload, sessionId);
    expect(res1.bills).toHaveLength(1);
    expect(res1.lineCount).toBe(3);

    const billsInDb1 = await db.bills.toArray();
    expect(billsInDb1).toHaveLength(1);
    const initialBillId = billsInDb1[0].id!;

    // 2. Second Scan: Page 2 of same BL (different formatting "0U126/03835")
    const page2Payload = {
      bills: [
        {
          billNumber: '0U126/03835',
          client: 'AISSAOUI HICHAM',
          lines: [
            { no: '4', page: 2, reference: 'REF-D', designation: 'Produit D', quantity: 15 },
            { no: '5', page: 2, reference: 'REF-E', designation: 'Produit E', quantity: 8 },
          ],
        },
      ],
    };

    const res2 = await importBills(page2Payload, sessionId);
    // Should NOT create a second bill
    const billsInDb2 = await db.bills.toArray();
    expect(billsInDb2).toHaveLength(1);
    expect(billsInDb2[0].id).toBe(initialBillId);

    // Order lines for this bill should now be 5
    const linesInDb = await db.orderLines.where('billId').equals(initialBillId).toArray();
    expect(linesInDb).toHaveLength(5);
    expect(res2.mergedBills).toHaveLength(1);
    expect(res2.mergedBills[0].addedLinesCount).toBe(2);

    // Check audit events
    const audits = await db.auditEvents.where('billId').equals(initialBillId).toArray();
    expect(audits.some((a) => a.reason === 'Page additionnelle importée')).toBe(true);
  });

  it('deduplicates overlapping lines when photographing multiple pages', async () => {
    const sessionId = 1;

    // Scan 1
    await importBills(
      {
        bills: [
          {
            billNumber: 'BL-100',
            client: 'CLIENT DEDUP',
            lines: [
              { no: '1', reference: 'REF-1', designation: 'Article 1', quantity: 10 },
              { no: '2', reference: 'REF-2', designation: 'Article 2', quantity: 20 },
            ],
          },
        ],
      },
      sessionId
    );

    // Scan 2 with overlapping line 2 and new line 3
    const res2 = await importBills(
      {
        bills: [
          {
            billNumber: 'BL-100',
            client: 'CLIENT DEDUP',
            lines: [
              { no: '2', reference: 'REF-2', designation: 'Article 2', quantity: 20 }, // duplicate
              { no: '3', reference: 'REF-3', designation: 'Article 3', quantity: 30 }, // new
            ],
          },
        ],
      },
      sessionId
    );

    expect(res2.mergedBills[0].addedLinesCount).toBe(1);

    const allLines = await db.orderLines.toArray();
    expect(allLines).toHaveLength(3); // Line 1, Line 2, Line 3
  });

  it('creates separate bills when bill numbers actually differ', async () => {
    const sessionId = 1;

    await importBills(
      {
        bills: [
          {
            billNumber: 'BL-001',
            client: 'CLIENT 1',
            lines: [{ no: '1', reference: 'REF-1', quantity: 5 }],
          },
        ],
      },
      sessionId
    );

    await importBills(
      {
        bills: [
          {
            billNumber: 'BL-002',
            client: 'CLIENT 2',
            lines: [{ no: '1', reference: 'REF-2', quantity: 5 }],
          },
        ],
      },
      sessionId
    );

    const allBills = await db.bills.toArray();
    expect(allBills).toHaveLength(2);
  });
});
