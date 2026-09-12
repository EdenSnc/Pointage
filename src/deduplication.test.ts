import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';
import {
  normalizeBillNumber,
  normalizeClientName,
  isClientCompatible,
  isSameBill,
  isDuplicateLine,
  findDuplicateLinesInBill,
  mergeDuplicateLinesInBill,
  findDuplicateBillGroups,
  mergeDuplicateBills,
} from './deduplication';
import type { Bill, OrderLine } from './types';

describe('POINTAGE Deduplication Engine', () => {
  beforeEach(async () => {
    await db.bills.clear();
    await db.orderLines.clear();
    await db.countEvents.clear();
    await db.transportContainers.clear();
  });

  describe('normalizeBillNumber', () => {
    it('normalizes basic numbers by stripping leading zeros from pure digits', () => {
      expect(normalizeBillNumber('00234')).toBe('234');
      expect(normalizeBillNumber('00001')).toBe('1');
      expect(normalizeBillNumber('0')).toBe('0');
    });

    it('preserves leading zeros when alphanumeric codes are present', () => {
      expect(normalizeBillNumber('0U126')).toBe('0U126');
      expect(normalizeBillNumber('00A99')).toBe('00A99');
    });

    it('strips common French/Arabic ERP prefixes and punctuation', () => {
      expect(normalizeBillNumber('BON DE LIVRAISON N° 00542')).toBe('542');
      expect(normalizeBillNumber('BON DE COMMANDE NO: 1044')).toBe('1044');
      expect(normalizeBillNumber('FACTURE PROFORMA N° 12')).toBe('12');
      expect(normalizeBillNumber('BC/2024/099')).toBe('2024099');
      expect(normalizeBillNumber('BL - 888')).toBe('888');
    });

    it('handles empty or null values gracefully', () => {
      expect(normalizeBillNumber('')).toBe('');
      expect(normalizeBillNumber(null)).toBe('');
      expect(normalizeBillNumber(undefined)).toBe('');
    });
  });

  describe('normalizeClientName & isClientCompatible', () => {
    it('strips company legal forms and accents', () => {
      expect(normalizeClientName('SARL ATLAS IMPORT')).toBe('atlasimport');
      expect(normalizeClientName('ETS. EL-HANA & FILS')).toBe('elhanafils');
      expect(normalizeClientName('Société Générale')).toBe('generale');
    });

    it('allows generic clients to be compatible with any other client', () => {
      expect(isClientCompatible('CLIENT DIVERS', 'ETS KACI')).toBe(true);
      expect(isClientCompatible('CLIENT INCONNU', 'SARL ATLAS')).toBe(true);
      expect(isClientCompatible('', 'ETS KACI')).toBe(true);
    });

    it('identifies same clients with different legal forms', () => {
      expect(isClientCompatible('SARL KACI IMPORT', 'KACI IMPORT')).toBe(true);
      expect(isClientCompatible('ETS BOUZID', 'BOUZID')).toBe(true);
    });

    it('rejects completely different clients to prevent wrongful merges', () => {
      expect(isClientCompatible('SARL ATLAS', 'ETS KACI')).toBe(false);
      expect(isClientCompatible('ETS TAHAR', 'PHARMACIE CENTRALE')).toBe(false);
    });
  });

  describe('isSameBill', () => {
    it('matches bills with same normalized number and compatible clients', () => {
      expect(isSameBill('BL-00234', 'SARL KACI', '00234', 'KACI')).toBe(true);
    });

    it('never matches bills with same number but DIFFERENT clients', () => {
      // Critical test: Two different clients with BL "001" must NOT merge!
      expect(isSameBill('BL-001', 'SARL ATLAS', 'BL-001', 'ETS KACI')).toBe(false);
    });

    it('matches bills through identical Bon de Commande (BC) numbers', () => {
      expect(
        isSameBill(
          'AUTO',
          'SARL ATLAS',
          'BL-102',
          'SARL ATLAS',
          'BC-900',
          'BC-900'
        )
      ).toBe(true);
    });

    it('cross-matches when a page bill number equals the other document BC number', () => {
      expect(
        isSameBill(
          'BC-900',
          'SARL ATLAS',
          'BL-500',
          'SARL ATLAS',
          undefined,
          'BC-900'
        )
      ).toBe(true);
    });
  });

  describe('isDuplicateLine', () => {
    const existingLine: OrderLine = {
      id: 1,
      billId: 10,
      no: '1',
      page: 1,
      reference: 'REF-AAA',
      ean: '1234567890123',
      designation: 'DISQUE FREIN VENTILE',
      orderedQty: 10,
      status: 'active',
    };

    it('does NOT drop page 2 line 1 when reference is different (prevents continuation drop bug)', () => {
      const page2Line1 = {
        no: '1',
        page: 2,
        reference: 'REF-BBB',
        designation: 'PLAQUETTE DE FREIN',
        orderedQty: 10, // Same quantity, same line number '1', but totally different article!
      };
      expect(isDuplicateLine(page2Line1, existingLine)).toBe(false);
    });

    it('identifies duplicate line if line number and reference match', () => {
      const dupLine = {
        no: '1',
        reference: 'REF-AAA',
        designation: 'DISQUE FREIN VENTILE',
        orderedQty: 10,
      };
      expect(isDuplicateLine(dupLine, existingLine)).toBe(true);
    });

    it('identifies duplicate line if EAN and quantity match', () => {
      const dupLine = {
        no: '99', // Different or missing line number
        ean: '1234567890123',
        designation: 'DISQUE FREIN VENTILE',
        orderedQty: 10,
      };
      expect(isDuplicateLine(dupLine, existingLine)).toBe(true);
    });

    it('identifies duplicate line when unnumbered but designation and quantity match', () => {
      const dupLine = {
        no: null,
        designation: 'DISQUE FREIN VENTILE',
        orderedQty: 10,
      };
      expect(isDuplicateLine(dupLine, { ...existingLine, no: null })).toBe(true);
    });
  });

  describe('findDuplicateLinesInBill & mergeDuplicateLinesInBill', () => {
    it('detects duplicate lines sharing the same reference within a bill', () => {
      const lines: OrderLine[] = [
        { id: 1, billId: 1, no: '1', reference: 'REF-1', designation: 'PNEU 195/65 R15', orderedQty: 4, status: 'active' },
        { id: 2, billId: 1, no: '2', reference: 'REF-2', designation: 'FILTRE A HUILE', orderedQty: 2, status: 'active' },
        { id: 3, billId: 1, no: '3', reference: 'REF-1', designation: 'PNEU 195/65 R15 (SUITE)', orderedQty: 4, status: 'active' },
      ];
      const dupGroups = findDuplicateLinesInBill(lines);
      expect(dupGroups.size).toBe(1);
      expect(dupGroups.has('ref-1')).toBe(true);
      expect(dupGroups.get('ref-1')!.length).toBe(2);
    });

    it('merges duplicate lines in IndexedDB, summing quantities and transferring count events', async () => {
      const line1Id = await db.orderLines.add({
        billId: 100,
        no: '1',
        reference: 'OIL-5W40',
        designation: 'HUILE MOTEUR 5W40',
        orderedQty: 5,
        originalOrderedQty: 5,
        status: 'active',
      });

      const line2Id = await db.orderLines.add({
        billId: 100,
        no: '4',
        reference: 'OIL-5W40',
        designation: 'HUILE MOTEUR 5W40',
        orderedQty: 3,
        originalOrderedQty: 3,
        status: 'active',
      });

      // Add a count event on the second (duplicate) line
      await db.countEvents.add({
        billId: 100,
        orderLineId: Number(line2Id),
        stage: 'preparation',
        quantity: 3,
        timestamp: new Date().toISOString(),
        undone: false,
      });

      const result = await mergeDuplicateLinesInBill(100);
      expect(result.mergedCount).toBe(1);

      // Verify line1 has consolidated orderedQty = 5 + 3 = 8
      const updatedLine1 = await db.orderLines.get(line1Id);
      expect(updatedLine1?.orderedQty).toBe(8);
      expect(updatedLine1?.originalOrderedQty).toBe(8);

      // Verify line2 is deleted
      const deletedLine2 = await db.orderLines.get(line2Id);
      expect(deletedLine2).toBeUndefined();

      // Verify count event was remapped to line1
      const events = await db.countEvents.where('orderLineId').equals(Number(line1Id)).toArray();
      expect(events.length).toBe(1);
      expect(events[0].quantity).toBe(3);
    });
  });

  describe('findDuplicateBillGroups & mergeDuplicateBills', () => {
    it('finds duplicate bill groups in the bill list', () => {
      const bills: Bill[] = [
        { id: 1, billNumber: 'BL-001', client: 'ETS KACI', date: '2026-09-12', timestamp: 1, year: 2026, month: 9, day: 12, hour: 10, minute: 0, time: '10:00', status: 'active', createdAt: '', updatedAt: '' },
        { id: 2, billNumber: '001', client: 'KACI', date: '2026-09-12', timestamp: 2, year: 2026, month: 9, day: 12, hour: 10, minute: 1, time: '10:01', status: 'active', createdAt: '', updatedAt: '' },
        { id: 3, billNumber: 'BL-002', client: 'SARL ATLAS', date: '2026-09-12', timestamp: 3, year: 2026, month: 9, day: 12, hour: 10, minute: 2, time: '10:02', status: 'active', createdAt: '', updatedAt: '' },
      ];

      const groups = findDuplicateBillGroups(bills);
      expect(groups.length).toBe(1);
      expect(groups[0].primary.id).toBe(1);
      expect(groups[0].duplicates.length).toBe(1);
      expect(groups[0].duplicates[0].id).toBe(2);
    });

    it('merges duplicate bills in IndexedDB without duplicating existing lines', async () => {
      const bill1Id = await db.bills.add({
        billNumber: 'BL-500',
        client: 'ETS AMARA',
        date: '2026-09-12',
        timestamp: 1,
        year: 2026,
        month: 9,
        day: 12,
        hour: 9,
        minute: 0,
        time: '09:00',
        status: 'active',
        createdAt: '',
        updatedAt: '',
      });

      const bill2Id = await db.bills.add({
        billNumber: '500',
        client: 'ETS AMARA',
        date: '2026-09-12',
        timestamp: 2,
        year: 2026,
        month: 9,
        day: 12,
        hour: 9,
        minute: 5,
        time: '09:05',
        status: 'active',
        createdAt: '',
        updatedAt: '',
      });

      // Line already in Bill 1
      await db.orderLines.add({
        billId: Number(bill1Id),
        no: '1',
        reference: 'PROD-A',
        designation: 'ARTICLE A',
        orderedQty: 10,
        status: 'active',
      });

      // Duplicate of Line A in Bill 2 (should NOT be added again)
      await db.orderLines.add({
        billId: Number(bill2Id),
        no: '1',
        reference: 'PROD-A',
        designation: 'ARTICLE A',
        orderedQty: 10,
        status: 'active',
      });

      // Unique line in Bill 2 (should be moved to Bill 1)
      await db.orderLines.add({
        billId: Number(bill2Id),
        no: '2',
        reference: 'PROD-B',
        designation: 'ARTICLE B',
        orderedQty: 5,
        status: 'active',
      });

      const res = await mergeDuplicateBills(Number(bill1Id), [Number(bill2Id)]);
      expect(res.removedBillsCount).toBe(1);
      expect(res.mergedLinesCount).toBe(1);

      // Verify Bill 2 is removed
      const removedBill = await db.bills.get(bill2Id);
      expect(removedBill).toBeUndefined();

      // Verify Bill 1 now has exactly 2 lines (PROD-A and PROD-B)
      const finalLines = await db.orderLines.where('billId').equals(Number(bill1Id)).toArray();
      expect(finalLines.length).toBe(2);
      expect(finalLines.map((l) => l.reference).sort()).toEqual(['PROD-A', 'PROD-B']);
    });
  });
});
