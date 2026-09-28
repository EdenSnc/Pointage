// ============================================================
// POINTAGE — Client-Centric Architecture & Gate Check Tests
// ============================================================

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';
import { isSameClientEntity, normalizeClientEntityKey } from './logic';
import type { Bill, OrderLine } from './types';

describe('Client-Centric Architecture & Gate Check Verification', () => {
  beforeEach(async () => {
    await db.bills.clear();
    await db.orderLines.clear();
    await db.countEvents.clear();
  });

  describe('1. Client-Centric Grouping Logic', () => {
    it('groups multiple bills of the same client into a single customer group', () => {
      const bills: Bill[] = [
        { id: 1, sessionId: 1, billNumber: 'BL-001', client: 'KRAL MARKT', status: 'active' },
        { id: 2, sessionId: 1, billNumber: 'BL-002', client: 'KRAL MARKT (GHELIZANE)', status: 'active' },
        { id: 3, sessionId: 1, billNumber: 'BL-003', client: 'SARL BLEU BLANC NAKHIL', status: 'active' },
        { id: 4, sessionId: 1, billNumber: 'BL-004', client: 'BLEU BLANC NAKHIL', status: 'active' },
        { id: 5, sessionId: 1, billNumber: 'BL-005', client: 'ETS MOHAMED BENALI', status: 'active' },
      ];

      type Group = { client: string; bills: Bill[] };
      const groups: Group[] = [];

      for (const b of bills) {
        const bClient = (b.client || 'CLIENT DIVERS').trim();
        const existing = groups.find((g) => isSameClientEntity(g.client, bClient));
        if (existing) {
          existing.bills.push(b);
          if (bClient.length > existing.client.length && normalizeClientEntityKey(bClient) !== 'CLIENT DIVERS') {
            existing.client = bClient;
          }
        } else {
          groups.push({
            client: bClient,
            bills: [b],
          });
        }
      }

      // 5 bills should consolidate into exactly 3 client cards
      expect(groups.length).toBe(3);

      const kralGroup = groups.find((g) => isSameClientEntity(g.client, 'KRAL MARKT'));
      expect(kralGroup).toBeDefined();
      expect(kralGroup?.bills.length).toBe(2);
      expect(kralGroup?.bills.map((b) => b.billNumber)).toEqual(['BL-001', 'BL-002']);

      const bleuBlancGroup = groups.find((g) => isSameClientEntity(g.client, 'BLEU BLANC NAKHIL'));
      expect(bleuBlancGroup).toBeDefined();
      expect(bleuBlancGroup?.bills.length).toBe(2);

      const benaliGroup = groups.find((g) => isSameClientEntity(g.client, 'MOHAMED BENALI'));
      expect(benaliGroup).toBeDefined();
      expect(benaliGroup?.bills.length).toBe(1);
    });

    it('groups all variants of Kralmarkt and branches into a single place card', () => {
      const bills: Bill[] = [
        { id: 10, sessionId: 1, billNumber: 'BL-10', client: 'KRALMARKT', status: 'active' },
        { id: 11, sessionId: 1, billNumber: 'BL-11', client: 'KRAL MARKT', status: 'active' },
        { id: 12, sessionId: 1, billNumber: 'BL-12', client: 'KRAL MARKET', status: 'active' },
        { id: 13, sessionId: 1, billNumber: 'BL-13', client: 'KRAL MARKT BECHAR', status: 'active' },
        { id: 14, sessionId: 1, billNumber: 'BL-14', client: 'KRAL MARKT GHELIZANE', status: 'active' },
        { id: 15, sessionId: 1, billNumber: 'BL-15', client: 'MAGASIN KRAL MARKT', status: 'active' },
      ];

      type Group = { client: string; bills: Bill[] };
      const groups: Group[] = [];

      for (const b of bills) {
        const bClient = (b.client || 'CLIENT DIVERS').trim();
        const existing = groups.find(
          (g) => isSameClientEntity(g.client, bClient) || g.bills.some((gb) => isSameClientEntity(gb.client, bClient))
        );
        if (existing) {
          existing.bills.push(b);
        } else {
          groups.push({
            client: bClient,
            bills: [b],
          });
        }
      }

      // All 6 variations must consolidate into EXACTLY 1 single card!
      expect(groups.length).toBe(1);
      expect(groups[0].bills.length).toBe(6);
    });

    it('determines the correct navigation destination based on single vs multi-bill status', () => {
      const getNavigationTarget = (client: string, clientBills: Bill[]) => {
        if (clientBills.length === 1 && clientBills[0].id) {
          return `/bill/${clientBills[0].id}`;
        }
        return `/client-bills/${encodeURIComponent(client)}`;
      };

      const singleBill: Bill[] = [{ id: 42, sessionId: 1, billNumber: 'BL-042', client: 'BENALI', status: 'active' }];
      expect(getNavigationTarget('BENALI', singleBill)).toBe('/bill/42');

      const multiBills: Bill[] = [
        { id: 10, sessionId: 1, billNumber: 'BL-010', client: 'KRAL MARKT', status: 'active' },
        { id: 11, sessionId: 1, billNumber: 'BL-011', client: 'KRAL MARKT', status: 'active' },
      ];
      expect(getNavigationTarget('KRAL MARKT', multiBills)).toBe('/client-bills/KRAL%20MARKT');
    });
  });

  describe('2. Gate Check (Contrôle Sortie Camion & Paperwork Reconciliation)', () => {
    it('persists paperworkVerified and paperworkVerifiedAt in IndexedDB', async () => {
      const billId = await db.bills.add({
        sessionId: 1,
        billNumber: 'BL-2024-100',
        client: 'LIBRAIRIE CENTRALE',
        status: 'active',
        paperworkVerified: false,
      });

      let bill = await db.bills.get(billId);
      expect(bill?.paperworkVerified).toBe(false);

      const timestamp = new Date().toISOString();
      await db.bills.update(billId, {
        paperworkVerified: true,
        paperworkVerifiedAt: timestamp,
      });

      bill = await db.bills.get(billId);
      expect(bill?.paperworkVerified).toBe(true);
      expect(bill?.paperworkVerifiedAt).toBe(timestamp);
    });

    it('identifies single-article bills to alert warehouse operators before truck leaves', async () => {
      const bill1Id = await db.bills.add({
        sessionId: 1,
        billNumber: 'BL-MULTI',
        client: 'CLIENT A',
        status: 'active',
      });
      const bill2Id = await db.bills.add({
        sessionId: 1,
        billNumber: 'BL-SINGLE',
        client: 'CLIENT B',
        status: 'active',
      });

      // Bill 1 has 3 items
      await db.orderLines.bulkAdd([
        { billId: bill1Id, no: '1', reference: 'REF-1', designation: 'Item 1', orderedQty: 10, originalNo: '1', originalPage: 1, originalReference: 'REF-1', originalEan: '', originalDesignation: 'Item 1', originalOrderedQty: 10, page: 1, ean: '' },
        { billId: bill1Id, no: '2', reference: 'REF-2', designation: 'Item 2', orderedQty: 20, originalNo: '2', originalPage: 1, originalReference: 'REF-2', originalEan: '', originalDesignation: 'Item 2', originalOrderedQty: 20, page: 1, ean: '' },
        { billId: bill1Id, no: '3', reference: 'REF-3', designation: 'Item 3', orderedQty: 5, originalNo: '3', originalPage: 1, originalReference: 'REF-3', originalEan: '', originalDesignation: 'Item 3', originalOrderedQty: 5, page: 1, ean: '' },
      ]);

      // Bill 2 has only 1 item (high risk of paper being forgotten at the office)
      await db.orderLines.add({
        billId: bill2Id,
        no: '1',
        reference: 'REF-SOLO',
        designation: 'Trousse Simple',
        orderedQty: 12,
        originalNo: '1',
        originalPage: 1,
        originalReference: 'REF-SOLO',
        originalEan: '',
        originalDesignation: 'Trousse Simple',
        originalOrderedQty: 12,
        page: 1,
        ean: '',
      });

      const allLines = await db.orderLines.toArray();
      const linesCountByBill = new Map<number, number>();
      for (const l of allLines) {
        linesCountByBill.set(l.billId, (linesCountByBill.get(l.billId) || 0) + 1);
      }

      expect(linesCountByBill.get(bill1Id)).toBe(3);
      expect(linesCountByBill.get(bill2Id)).toBe(1);

      const isSingleArticle = (id: number) => linesCountByBill.get(id) === 1;
      expect(isSingleArticle(bill1Id)).toBe(false);
      expect(isSingleArticle(bill2Id)).toBe(true);
    });

    it('performs batch validation and batch reset for a full shipment truck', async () => {
      const ids: number[] = [];
      for (let i = 1; i <= 5; i++) {
        const id = await db.bills.add({
          sessionId: 1,
          billNumber: `BL-TRUCK-${i}`,
          client: `DESTINATAIRE ${i}`,
          status: 'active',
          paperworkVerified: false,
        });
        ids.push(id);
      }

      // Batch validate all
      const now = new Date().toISOString();
      await db.transaction('rw', db.bills, async () => {
        for (const id of ids) {
          await db.bills.update(id, { paperworkVerified: true, paperworkVerifiedAt: now });
        }
      });

      let updatedBills = await db.bills.where('id').anyOf(ids).toArray();
      expect(updatedBills.every((b) => b.paperworkVerified === true)).toBe(true);
      expect(updatedBills.every((b) => b.paperworkVerifiedAt === now)).toBe(true);

      // Batch reset for next truck
      await db.transaction('rw', db.bills, async () => {
        for (const id of ids) {
          await db.bills.update(id, { paperworkVerified: false, paperworkVerifiedAt: null });
        }
      });

      updatedBills = await db.bills.where('id').anyOf(ids).toArray();
      expect(updatedBills.every((b) => b.paperworkVerified === false)).toBe(true);
      expect(updatedBills.every((b) => b.paperworkVerifiedAt === null)).toBe(true);
    });
  });
});
