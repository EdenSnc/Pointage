import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, saveClientAlias, getClientAlias, getAllClientAliases } from './db';
import {
  updateProductWarehouseZone,
  formatLocationWithNote,
  LOCATION_NOTE_PRESETS,
  DEFAULT_WAREHOUSE_SITES,
} from './warehouseZones';
import { importBills } from './importer';
import type { Bill, OrderLine } from './types';

describe('Location Notes & Client Aliases Domain Architecture', () => {
  beforeEach(async () => {
    await db.bills.clear();
    await db.orderLines.clear();
    await db.productProfiles.clear();
    await db.clientAliases.clear();
    await db.auditEvents.clear();
  });

  describe('1. Terrain Location Notes (Note de Terrain sans clavier)', () => {
    it('defines exactly the 6 approved human warehouse location presets', () => {
      expect(LOCATION_NOTE_PRESETS).toEqual([
        'Sous la bâche',
        'Au fond à droite',
        'Au fond à gauche',
        'Au sol',
        'En hauteur',
        'Derrière cartons',
      ]);
    });

    it('formats location with terrain note cleanly', () => {
      expect(formatLocationWithNote('CH • Nord-Ouest', 'Sous la bâche')).toBe(
        'CH • Nord-Ouest — Sous la bâche'
      );
      expect(formatLocationWithNote('Couloir • Salle 2', null)).toBe('Couloir • Salle 2');
      expect(formatLocationWithNote(null, 'Au fond à droite')).toBe('Au fond à droite');
      expect(formatLocationWithNote('', '')).toBe('');
    });

    it('persists locationNote to orderLine, sibling lines, and master ProductProfile', async () => {
      const bId = await db.bills.add({
        sessionId: 1,
        billNumber: 'BL-901',
        client: 'CLIENT TEST',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const line1Id = await db.orderLines.add({
        billId: bId,
        no: '1',
        originalNo: '1',
        reference: '71566',
        designation: 'Trousse Double Zip 566',
        orderedQty: 16,
        status: 'active',
        warehouseZone: 'CH_NW',
        locationNote: null,
        referenceAliases: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const line2Id = await db.orderLines.add({
        billId: bId,
        no: '2',
        originalNo: '2',
        reference: '71566',
        designation: 'Trousse Double Zip 566 (Lot 2)',
        orderedQty: 8,
        status: 'active',
        warehouseZone: 'CH_NW',
        locationNote: null,
        referenceAliases: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await updateProductWarehouseZone(
        line1Id,
        bId,
        '71566',
        'CH_NW',
        'Karim',
        'Sous la bâche'
      );

      // Verify line 1
      const updated1 = await db.orderLines.get(line1Id);
      expect(updated1?.warehouseZone).toBe('CH_NW');
      expect(updated1?.locationNote).toBe('Sous la bâche');

      // Verify sibling line 2
      const updated2 = await db.orderLines.get(line2Id);
      expect(updated2?.warehouseZone).toBe('CH_NW');
      expect(updated2?.locationNote).toBe('Sous la bâche');

      // Verify master catalog ProductProfile
      const profile = await db.productProfiles.where('reference').equals('71566').first();
      expect(profile).toBeDefined();
      expect(profile?.warehouseZone).toBe('CH_NW');
      expect(profile?.locationNote).toBe('Sous la bâche');
    });
  });

  describe('2. Facture Legal Immutability vs Surface Operational Client Alias', () => {
    it('saves and retrieves operational client aliases case-insensitively', async () => {
      await saveClientAlias('SARL BLEU BLANC NAKHIL', 'Kral Markt Béchar');

      const retrieved = await getClientAlias('sarl bleu blanc nakhil');
      expect(retrieved).toBe('Kral Markt Béchar');

      const all = await getAllClientAliases();
      expect(all.length).toBe(1);
      expect(all[0].legalName).toBe('SARL BLEU BLANC NAKHIL');
      expect(all[0].operationalName).toBe('Kral Markt Béchar');
    });

    it('updates existing alias without duplicate entries', async () => {
      await saveClientAlias('SARL BLEU BLANC NAKHIL', 'Kral Markt Béchar');
      await saveClientAlias('SARL BLEU BLANC NAKHIL', 'Kral Markt Béchar (Grand Dépôt)');

      const all = await getAllClientAliases();
      expect(all.length).toBe(1);
      expect(all[0].operationalName).toBe('Kral Markt Béchar (Grand Dépôt)');
    });

    it('automatically applies operational alias on subsequent Excel/JSON imports while preserving legal name', async () => {
      // 1. Operator once renamed SARL BLEU BLANC NAKHIL to Kral Markt Béchar
      await saveClientAlias('SARL BLEU BLANC NAKHIL', 'Kral Markt Béchar');

      // 2. Pre-save a product profile with a terrain location note
      await db.productProfiles.add({
        reference: '71566',
        designation: 'Trousse Double Zip 566',
        warehouseZone: 'CH_NW',
        locationNote: 'Au fond à droite',
        outerPackSize: 12,
        innerPackSize: 1,
        updatedAt: new Date().toISOString(),
      });

      // 3. Import a new bill from official ERP Excel sheet
      const payload = {
        bills: [
          {
            billNumber: 'BL-2026-889',
            client: 'SARL BLEU BLANC NAKHIL',
            date: '2026-09-23',
            lines: [
              {
                no: '1',
                reference: '71566',
                designation: 'Trousse Double Zip 566',
                quantity: 16,
              },
            ],
          },
        ],
      };

      const result = await importBills(payload, 1);
      expect(result.bills.length).toBe(1);

      // 4. Verify the imported bill
      const importedBill = await db.bills.where('billNumber').equals('BL-2026-889').first();
      expect(importedBill).toBeDefined();

      // Legal name is STRICTLY preserved for road checks / DCP
      expect(importedBill?.client).toBe('SARL BLEU BLANC NAKHIL');

      // Operational name is automatically set from memory!
      expect(importedBill?.operationalClient).toBe('Kral Markt Béchar');

      // 5. Verify the order line inherited the location note
      const importedLine = await db.orderLines.where('billId').equals(importedBill!.id!).first();
      expect(importedLine).toBeDefined();
      expect(importedLine?.warehouseZone).toBe('CH_NW');
      expect(importedLine?.locationNote).toBe('Au fond à droite');
    });
  });

  describe('3. Multi-Warehouse Sites', () => {
    it('defines Oran Surface as default and provides Alger and Constantine hubs', () => {
      expect(DEFAULT_WAREHOUSE_SITES.some((s) => s.id === 'oran_surface' && s.isDefault)).toBe(true);
      expect(DEFAULT_WAREHOUSE_SITES.some((s) => s.id === 'oran_usine')).toBe(true);
      expect(DEFAULT_WAREHOUSE_SITES.some((s) => s.id === 'alger_hub')).toBe(true);
      expect(DEFAULT_WAREHOUSE_SITES.some((s) => s.id === 'constantine_hub')).toBe(true);
    });
  });
});
