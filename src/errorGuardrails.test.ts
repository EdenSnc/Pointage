import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkDoubleScanBounce,
  resetBounceTracker,
  inspectOvercount,
  validatePackagingMagnitude,
  auditBillIntegrityForStage,
  generateDeliverySeal,
  verifySealIntegrity,
  assertBillNotSealed,
} from './errorGuardrails';
import type { OrderLine, CountEvent, Bill, ShipmentTrip } from './types';

describe('Error Guardrails & Poka-Yoke Engine', () => {
  beforeEach(() => {
    resetBounceTracker();
  });

  describe('1. checkDoubleScanBounce', () => {
    it('allows initial scan', () => {
      const res = checkDoubleScanBounce(101, 1);
      expect(res.isBounce).toBe(false);
    });

    it('flags identical scan within window as bounce', () => {
      checkDoubleScanBounce(101, 1, 500);
      const second = checkDoubleScanBounce(101, 1, 500);
      expect(second.isBounce).toBe(true);
      expect(second.message).toContain('Double-scan évité');
    });

    it('allows scan for different lineId within same window', () => {
      checkDoubleScanBounce(101, 1, 500);
      const diffLine = checkDoubleScanBounce(102, 1, 500);
      expect(diffLine.isBounce).toBe(false);
    });

    it('allows scan for different qty within same window', () => {
      checkDoubleScanBounce(101, 1, 500);
      const diffQty = checkDoubleScanBounce(101, 24, 500);
      expect(diffQty.isBounce).toBe(false);
    });
  });

  describe('2. inspectOvercount', () => {
    const line: OrderLine = {
      id: 1,
      billId: 10,
      no: '1',
      page: 1,
      reference: 'STYLO-BLEU',
      ean: '6131234567890',
      designation: 'Stylo à bille Bleu',
      orderedQty: 50,
      originalNo: '1',
      originalPage: 1,
      originalReference: 'STYLO-BLEU',
      originalEan: '6131234567890',
      originalDesignation: 'Stylo à bille Bleu',
      originalOrderedQty: 50,
      status: 'active',
      outerPackSize: 20,
      innerPackSize: 5,
      warehouseZone: 'CH_NW',
      packagesRaw: null,
      referenceAliases: [],
      createdAt: '2026-09-27T00:00:00Z',
      updatedAt: '2026-09-27T00:00:00Z',
    };

    it('returns proceed when count within ordered quantity', () => {
      const res = inspectOvercount(line, 20, 10);
      expect(res.isOvercount).toBe(false);
      expect(res.newTotal).toBe(30);
      expect(res.recommendation).toBe('proceed');
    });

    it('detects overcount and offers clamp_to_exact when remaining items exist', () => {
      // 40 already counted of 50. Operator taps +20 (outer pack).
      const res = inspectOvercount(line, 40, 20);
      expect(res.isOvercount).toBe(true);
      expect(res.newTotal).toBe(60);
      expect(res.excessQty).toBe(10);
      expect(res.suggestedClampedQty).toBe(10); // only 10 needed to reach 50!
      expect(res.recommendation).toBe('clamp_to_exact');
      expect(res.message).toContain('Ajuster au juste nécessaire');
    });

    it('flags severe overcount when quantity exceeds double the order', () => {
      // 50 ordered, operator adds 100
      const res = inspectOvercount(line, 0, 100);
      expect(res.isOvercount).toBe(true);
      expect(res.isSevereOvercount).toBe(true);
    });
  });

  describe('3. validatePackagingMagnitude', () => {
    it('flags confusion when typing total ordered quantity in cartons', () => {
      // Ordered: 100 pcs. Pack size: 50 pcs. Operator enters 100 Cartons (= 5,000 pcs)
      const res = validatePackagingMagnitude(100, 'carton', 50, 100);
      expect(res.isSuspicious).toBe(true);
      expect(res.calculatedPieces).toBe(5000);
      expect(res.suggestedUnit).toBe('piece');
      expect(res.reason).toContain('Vouliez-vous saisir 100 pièces');
    });

    it('accepts normal carton count that fits the order', () => {
      // Ordered: 100 pcs. Pack size: 50 pcs. Operator enters 2 Cartons (= 100 pcs)
      const res = validatePackagingMagnitude(2, 'carton', 50, 100);
      expect(res.isSuspicious).toBe(false);
      expect(res.calculatedPieces).toBe(100);
    });

    it('accepts piece entries within reasonable bounds', () => {
      const res = validatePackagingMagnitude(50, 'piece', 50, 50);
      expect(res.isSuspicious).toBe(false);
    });
  });

  describe('4. auditBillIntegrityForStage', () => {
    const lines: OrderLine[] = [
      {
        id: 1,
        billId: 10,
        no: '1',
        page: 1,
        reference: 'REF-A',
        ean: '111',
        designation: 'Cahier 96P',
        orderedQty: 100,
        originalNo: '1',
        originalPage: 1,
        originalReference: 'REF-A',
        originalEan: '111',
        originalDesignation: 'Cahier 96P',
        originalOrderedQty: 100,
        status: 'active',
        outerPackSize: 10,
        innerPackSize: null,
        warehouseZone: null,
        packagesRaw: null,
        referenceAliases: [],
        createdAt: '2026-09-27T00:00:00Z',
        updatedAt: '2026-09-27T00:00:00Z',
      },
      {
        id: 2,
        billId: 10,
        no: '2',
        page: 1,
        reference: 'REF-B',
        ean: '222',
        designation: 'Stylo Rouge',
        orderedQty: 50,
        originalNo: '2',
        originalPage: 1,
        originalReference: 'REF-B',
        originalEan: '222',
        originalDesignation: 'Stylo Rouge',
        originalOrderedQty: 50,
        status: 'active',
        outerPackSize: 50,
        innerPackSize: null,
        warehouseZone: null,
        packagesRaw: null,
        referenceAliases: [],
        createdAt: '2026-09-27T00:00:00Z',
        updatedAt: '2026-09-27T00:00:00Z',
      },
      {
        id: 3,
        billId: 10,
        no: '3',
        page: 1,
        reference: 'REF-C',
        ean: '333',
        designation: 'Gomme Blanche',
        orderedQty: 20,
        originalNo: '3',
        originalPage: 1,
        originalReference: 'REF-C',
        originalEan: '333',
        originalDesignation: 'Gomme Blanche',
        originalOrderedQty: 20,
        status: 'active',
        outerPackSize: 20,
        innerPackSize: null,
        warehouseZone: null,
        packagesRaw: null,
        referenceAliases: [],
        createdAt: '2026-09-27T00:00:00Z',
        updatedAt: '2026-09-27T00:00:00Z',
      },
    ];

    it('identifies uncounted items and flags severity as critical', () => {
      const events: CountEvent[] = [
        {
          id: 1,
          billId: 10,
          orderLineId: 1,
          stage: 'preparation',
          quantity: 100,
          outcome: null,
          undone: false,
          createdAt: '2026-09-27T00:00:00Z',
        },
      ];

      const audit = auditBillIntegrityForStage(lines, events, 'preparation');
      expect(audit.exactCount).toBe(1);
      expect(audit.uncountedCount).toBe(2);
      expect(audit.canSafelySignOff).toBe(false);
      expect(audit.severity).toBe('critical');
      expect(audit.uncountedLines.map((l) => l.no)).toEqual(['2', '3']);
    });

    it('identifies perfect compliance with clean status', () => {
      const events: CountEvent[] = [
        { id: 1, billId: 10, orderLineId: 1, stage: 'preparation', quantity: 100, outcome: null, undone: false, createdAt: '' },
        { id: 2, billId: 10, orderLineId: 2, stage: 'preparation', quantity: 50, outcome: null, undone: false, createdAt: '' },
        { id: 3, billId: 10, orderLineId: 3, stage: 'preparation', quantity: 20, outcome: null, undone: false, createdAt: '' },
      ];

      const audit = auditBillIntegrityForStage(lines, events, 'preparation');
      expect(audit.exactCount).toBe(3);
      expect(audit.uncountedCount).toBe(0);
      expect(audit.shortCount).toBe(0);
      expect(audit.overCount).toBe(0);
      expect(audit.canSafelySignOff).toBe(true);
      expect(audit.severity).toBe('clean');
    });

    it('detects shortages and surplus', () => {
      const events: CountEvent[] = [
        { id: 1, billId: 10, orderLineId: 1, stage: 'pointage', quantity: 90, outcome: 'accepted', undone: false, createdAt: '' }, // short 10
        { id: 2, billId: 10, orderLineId: 2, stage: 'pointage', quantity: 55, outcome: 'accepted', undone: false, createdAt: '' }, // over 5
        { id: 3, billId: 10, orderLineId: 3, stage: 'pointage', quantity: 20, outcome: 'accepted', undone: false, createdAt: '' }, // exact
      ];

      const audit = auditBillIntegrityForStage(lines, events, 'pointage');
      expect(audit.exactCount).toBe(1);
      expect(audit.shortCount).toBe(1);
      expect(audit.overCount).toBe(1);
      expect(audit.severity).toBe('warnings');
      expect(audit.shortLines[0].diff).toBe(10);
      expect(audit.overLines[0].diff).toBe(5);
    });
  });

  describe('5. Cryptographic Digital Seal & Anti-Tamper', () => {
    const payload = {
      tripNumber: 1,
      billNumber: 'BL-2026-0901',
      client: 'ETS BENALI FOURNITURES',
      driverName: 'Yassine',
      truckPlate: '00123-116-31',
      totalUnits: 170,
      totalContainers: 3,
      lines: [
        { reference: 'CAHIER-96', quantity: 100 },
        { reference: 'STYLO-BLEU', quantity: 70 },
      ],
      timestamp: '2026-09-27T10:00:00.000Z',
    };

    it('generates SHA-256 seal and short verification code', async () => {
      const seal = await generateDeliverySeal(payload);
      expect(seal.sealHash).toMatch(/^SHA256:[a-f0-9]{64}$/);
      expect(seal.shortCode).toMatch(/^SEAL-[A-F0-9]{8}$/);
      expect(seal.serializedPayload).toContain('BL-2026-0901');
      expect(seal.serializedPayload).toContain('YASSINE');
    });

    it('verifies valid seal correctly', async () => {
      const seal = await generateDeliverySeal(payload);
      const verification = await verifySealIntegrity(seal.sealHash, payload);
      expect(verification.isValid).toBe(true);
    });

    it('detects tampering if payload has been modified', async () => {
      const seal = await generateDeliverySeal(payload);
      const tamperedPayload = {
        ...payload,
        totalUnits: 150, // 20 units subtracted by unauthorized party!
      };
      const verification = await verifySealIntegrity(seal.sealHash, tamperedPayload);
      expect(verification.isValid).toBe(false);
    });

    it('asserts that sealed bills block unauthorized operations', () => {
      const bill: Bill = {
        id: 10,
        sessionId: 1,
        billNumber: 'BL-2026-0901',
        client: 'ETS BENALI',
        status: 'active',
        isSealed: true,
        sealHash: 'SHA256:abc1234567890abcdef1234567890abcdef1234567890abcdef1234567890abc',
        createdAt: '',
        updatedAt: '',
      };

      const result = assertBillNotSealed(bill, 'Suppression de ligne');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('est scellé cryptographiquement');
    });

    it('allows operations on unsealed bills', () => {
      const bill: Bill = {
        id: 10,
        sessionId: 1,
        billNumber: 'BL-2026-0901',
        client: 'ETS BENALI',
        status: 'active',
        isSealed: false,
        createdAt: '',
        updatedAt: '',
      };

      const result = assertBillNotSealed(bill, 'Ajout de quantité');
      expect(result.allowed).toBe(true);
    });
  });
});
