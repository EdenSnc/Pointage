import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  db,
  getAllRentreeCampaigns,
  getRentreeCampaignById,
  saveRentreeCampaign,
  getRentreeVoyagesByCampaign,
  saveRentreeVoyage,
  getRentreeItemsByVoyage,
  saveRentreeItem,
  seedInitialRentreeDataIfEmpty,
  saveClientAccount,
} from './db';
import {
  calculateCampaignKPIs,
  calculateVoyageKPIs,
  evaluateItemStatus,
  applyCreditNoteToClientAccount,
  generateWhatsAppReturnManifest,
} from './rentreeReturnsEngine';
import type { RentreeReturnCampaign, RentreeReturnVoyage, RentreeReturnItem } from './types';

describe('Rentree Returns Logistics & Finance Engine', () => {
  beforeEach(async () => {
    await db.rentreeCampaigns.clear();
    await db.rentreeVoyages.clear();
    await db.rentreeItems.clear();
    await db.clientAccounts.clear();
  });

  describe('evaluateItemStatus', () => {
    it('returns pending when both returnedCartons and returnedLooseUnits are 0', () => {
      const item: RentreeReturnItem = {
        campaignId: 1,
        voyageId: 1,
        reference: 'CAH-96P',
        designation: 'Cahier 96P Seyes',
        category: 'scolaire',
        outerPackSize: 40,
        expectedCartons: 50,
        expectedUnits: 2000,
        returnedCartons: 0,
        returnedLooseUnits: 0,
        damagedCartons: 0,
        damagedUnits: 0,
        unitPriceDa: 65,
        status: 'pending',
        createdAt: '2026-09-28',
        updatedAt: '2026-09-28',
      };
      expect(evaluateItemStatus(item)).toBe('pending');
    });

    it('returns damaged_only when only damaged cartons are pointed', () => {
      const item: RentreeReturnItem = {
        campaignId: 1,
        voyageId: 1,
        reference: 'CAH-96P',
        designation: 'Cahier 96P Seyes',
        category: 'scolaire',
        outerPackSize: 40,
        expectedCartons: 50,
        expectedUnits: 2000,
        returnedCartons: 0,
        returnedLooseUnits: 0,
        damagedCartons: 5,
        damagedUnits: 200,
        unitPriceDa: 65,
        status: 'pending',
        createdAt: '2026-09-28',
        updatedAt: '2026-09-28',
      };
      expect(evaluateItemStatus(item)).toBe('damaged_only');
    });

    it('returns conforme when returned cartons match expected with 0 damages', () => {
      const item: RentreeReturnItem = {
        campaignId: 1,
        voyageId: 1,
        reference: 'STY-BLU',
        designation: 'Stylo Bleu Ballpoint',
        category: 'scolaire',
        outerPackSize: 50,
        expectedCartons: 20,
        expectedUnits: 1000,
        returnedCartons: 20,
        returnedLooseUnits: 0,
        damagedCartons: 0,
        damagedUnits: 0,
        unitPriceDa: 25,
        status: 'pending',
        createdAt: '2026-09-28',
        updatedAt: '2026-09-28',
      };
      expect(evaluateItemStatus(item)).toBe('conforme');
    });

    it('returns surplus when total pointed cartons exceed expected', () => {
      const item: RentreeReturnItem = {
        campaignId: 1,
        voyageId: 1,
        reference: 'CAH-288P',
        designation: 'Cahier 288P',
        category: 'scolaire',
        outerPackSize: 20,
        expectedCartons: 10,
        expectedUnits: 200,
        returnedCartons: 12,
        returnedLooseUnits: 0,
        damagedCartons: 0,
        damagedUnits: 0,
        unitPriceDa: 210,
        status: 'pending',
        createdAt: '2026-09-28',
        updatedAt: '2026-09-28',
      };
      expect(evaluateItemStatus(item)).toBe('surplus');
    });

    it('returns shortage when total pointed cartons are lower than expected', () => {
      const item: RentreeReturnItem = {
        campaignId: 1,
        voyageId: 1,
        reference: 'TRO-ZIP',
        designation: 'Trousse Zip',
        category: 'scolaire',
        outerPackSize: 30,
        expectedCartons: 30,
        expectedUnits: 900,
        returnedCartons: 20,
        returnedLooseUnits: 0,
        damagedCartons: 3,
        damagedUnits: 90,
        unitPriceDa: 180,
        status: 'pending',
        createdAt: '2026-09-28',
        updatedAt: '2026-09-28',
      };
      expect(evaluateItemStatus(item)).toBe('shortage');
    });
  });

  describe('calculateVoyageKPIs', () => {
    it('correctly aggregates expected, pointed, avaries, and values in DA', () => {
      const items: RentreeReturnItem[] = [
        {
          campaignId: 1,
          voyageId: 2,
          reference: 'CAH-96P',
          designation: 'Cahier 96P Seyes',
          category: 'scolaire',
          outerPackSize: 40,
          expectedCartons: 30,
          expectedUnits: 1200,
          returnedCartons: 28,
          returnedLooseUnits: 0,
          damagedCartons: 2,
          damagedUnits: 80,
          unitPriceDa: 65, // 28 * 40 * 65 = 72,800 DA
          status: 'shortage',
          createdAt: '2026-09-28',
          updatedAt: '2026-09-28',
        },
        {
          campaignId: 1,
          voyageId: 2,
          reference: 'REG-30CM',
          designation: 'Regle 30cm Plastique',
          category: 'scolaire',
          outerPackSize: 100,
          expectedCartons: 20,
          expectedUnits: 2000,
          returnedCartons: 20,
          returnedLooseUnits: 0,
          damagedCartons: 1,
          damagedUnits: 100,
          unitPriceDa: 30, // 20 * 100 * 30 = 60,000 DA
          status: 'conforme',
          createdAt: '2026-09-28',
          updatedAt: '2026-09-28',
        },
      ];

      const kpis = calculateVoyageKPIs(items);
      expect(kpis.expectedCartons).toBe(50);
      expect(kpis.returnedCartons).toBe(48);
      expect(kpis.damagedCartons).toBe(3);
      expect(kpis.salableValueDa).toBe(72800 + 60000); // 132,800 DA
      expect(kpis.lossAvarieDa).toBe(2 * 40 * 65 + 1 * 100 * 30); // 5,200 + 3,000 = 8,200 DA
    });

    it('handles empty voyage gracefully without crashing', () => {
      const kpis = calculateVoyageKPIs([]);
      expect(kpis.expectedCartons).toBe(0);
      expect(kpis.returnedCartons).toBe(0);
      expect(kpis.damagedCartons).toBe(0);
      expect(kpis.salableValueDa).toBe(0);
      expect(kpis.lossAvarieDa).toBe(0);
    });
  });

  describe('calculateCampaignKPIs', () => {
    it('aggregates across multiple voyages and items', () => {
      const voyages: RentreeReturnVoyage[] = [
        {
          id: 1,
          campaignId: 1,
          voyageNumber: 1,
          voyageCode: 'VOY-01',
          vehiclePlate: '08-30129',
          driverName: 'Karim',
          arrivalSite: 'kral_bechar',
          arrivalDate: '2026-09-25',
          status: 'reconciled',
          totalExpectedCartons: 100,
          totalReturnedCartons: 98,
          totalAvarieCartons: 2,
          totalFinancialValueDa: 490000,
          createdAt: '2026-09-28',
          updatedAt: '2026-09-28',
        },
        {
          id: 2,
          campaignId: 1,
          voyageNumber: 2,
          voyageCode: 'VOY-02',
          vehiclePlate: '31-88412',
          driverName: 'Mourad',
          arrivalSite: 'oran_surface',
          status: 'unloading',
          totalExpectedCartons: 100,
          totalReturnedCartons: 95,
          totalAvarieCartons: 3,
          totalFinancialValueDa: 570000,
          createdAt: '2026-09-28',
          updatedAt: '2026-09-28',
        },
      ];

      const allItems: RentreeReturnItem[] = [
        {
          campaignId: 1,
          voyageId: 1,
          reference: 'P1',
          designation: 'Produit 1',
          category: 'scolaire',
          outerPackSize: 10,
          expectedCartons: 100,
          expectedUnits: 1000,
          returnedCartons: 98,
          returnedLooseUnits: 0,
          damagedCartons: 2,
          damagedUnits: 20,
          unitPriceDa: 500,
          status: 'conforme',
          createdAt: '2026-09-28',
          updatedAt: '2026-09-28',
        },
        {
          campaignId: 1,
          voyageId: 2,
          reference: 'P2',
          designation: 'Produit 2',
          category: 'scolaire',
          outerPackSize: 10,
          expectedCartons: 100,
          expectedUnits: 1000,
          returnedCartons: 95,
          returnedLooseUnits: 0,
          damagedCartons: 3,
          damagedUnits: 30,
          unitPriceDa: 600,
          status: 'shortage',
          createdAt: '2026-09-28',
          updatedAt: '2026-09-28',
        },
      ];

      const kpis = calculateCampaignKPIs(voyages, allItems);
      expect(kpis.totalExpectedCartons).toBe(200);
      expect(kpis.totalReturnedCartons).toBe(193); // 98 + 95
      expect(kpis.totalAvarieCartons).toBe(5); // 2 + 3
      expect(kpis.totalReturnedUnits).toBe(98 * 10 + 95 * 10); // 1,930
      expect(kpis.totalAvarieUnits).toBe(2 * 10 + 3 * 10); // 50
      expect(kpis.totalSalableValueDa).toBe(98 * 10 * 500 + 95 * 10 * 600); // 490,000 + 570,000 = 1,060,000 DA
      expect(kpis.totalLossAvarieDa).toBe(2 * 10 * 500 + 3 * 10 * 600); // 10,000 + 18,000 = 28,000 DA
      expect(kpis.completionPercent).toBe(99); // (193 + 5) / 200 = 99%
    });
  });

  describe('applyCreditNoteToClientAccount', () => {
    it('creates or updates client account and accurately deducts credit note', async () => {
      // Pre-seed a client with an existing balance
      await saveClientAccount({
        name: 'Kral Markt Béchar',
        currentBalance: 500000,
        creditLimit: 1000000,
        clientType: 'gros',
        tierDiscountPercent: 0,
        wilayaCode: '08',
        phone: '049 81 22 45',
        notes: 'Client distributeur Sud',
      });

      const result = await applyCreditNoteToClientAccount(
        'Kral Markt Béchar',
        185000
      );

      expect(result.success).toBe(true);
      expect(result.previousBalance).toBe(500000);
      expect(result.creditAmount).toBe(185000);
      expect(result.newBalance).toBe(315000);

      // Verify in DB
      const updated = await db.clientAccounts.where('name').equalsIgnoreCase('Kral Markt Béchar').first();
      expect(updated).toBeDefined();
      expect(updated?.currentBalance).toBe(315000);
      expect(updated?.notes).toContain('Décharge Retour Rentrée');
    });

    it('returns error message if client account does not exist', async () => {
      const result = await applyCreditNoteToClientAccount(
        'NonExistentClient',
        50000
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('introuvable');
    });
  });

  describe('generateWhatsAppReturnManifest', () => {
    it('generates a clean professional return receipt with zero emojis', () => {
      const campaign: RentreeReturnCampaign = {
        title: 'Retour Fin de Campagne Rentrée 2026',
        seasonYear: 2026,
        status: 'in_progress',
        clientOrOrigin: 'Kral Markt Béchar',
        totalExpectedCartons: 50,
        totalReturnedCartons: 48,
        totalAvarieCartons: 2,
        totalFinancialValueDa: 120000,
        createdAt: '2026-09-28',
        updatedAt: '2026-09-28',
      };

      const voyage: RentreeReturnVoyage = {
        campaignId: 1,
        voyageNumber: 1,
        voyageCode: 'VOY-RENTREE-01',
        arrivalSite: 'kral_bechar',
        vehiclePlate: '08-30129',
        driverName: 'Karim',
        arrivalDate: '2026-09-25',
        status: 'reconciled',
        totalExpectedCartons: 50,
        totalReturnedCartons: 48,
        totalAvarieCartons: 2,
        totalFinancialValueDa: 120000,
        createdAt: '2026-09-28',
        updatedAt: '2026-09-28',
      };

      const items: RentreeReturnItem[] = [
        {
          campaignId: 1,
          voyageId: 1,
          reference: 'CAH-96P-SEYES',
          designation: 'Cahier 96P Seyes 24x32',
          category: 'scolaire',
          outerPackSize: 40,
          expectedCartons: 50,
          expectedUnits: 2000,
          returnedCartons: 48,
          returnedLooseUnits: 0,
          damagedCartons: 2,
          damagedUnits: 80,
          unitPriceDa: 65,
          reintegratedZone: 'CH_CTR',
          status: 'shortage',
          createdAt: '2026-09-28',
          updatedAt: '2026-09-28',
        },
      ];

      const manifest = generateWhatsAppReturnManifest({ campaign, voyage, items });

      // Verify content
      expect(manifest).toContain('MANIFESTE DE RETOUR');
      expect(manifest).toContain('Kral Markt Béchar');
      expect(manifest).toContain('08-30129');
      expect(manifest).toContain('Karim');
      expect(manifest).toContain('CAH-96P-SEYES');
      expect(manifest).toContain('CH_CTR');
      expect(manifest).toContain('DA');

      // STRICT ZERO EMOJIS RULE: Check for standard emoji Unicode patterns
      const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
      expect(emojiRegex.test(manifest)).toBe(false);
    });
  });

  describe('Dexie Seed & CRUD Operations', () => {
    it('seeds realistic multi-voyage return data when database is empty', async () => {
      await seedInitialRentreeDataIfEmpty();

      const campaigns = await getAllRentreeCampaigns();
      expect(campaigns.length).toBeGreaterThan(0);

      const campaign = campaigns[0];
      expect(campaign.title).toContain('Rentrée');

      const voyages = await getRentreeVoyagesByCampaign(campaign.id!);
      expect(voyages.length).toBe(3);

      const kralVoyage = voyages.find((v) => v.arrivalSite === 'kral_bechar');
      expect(kralVoyage).toBeDefined();
      expect(kralVoyage?.driverName).toContain('Karim');

      const items = await getRentreeItemsByVoyage(kralVoyage!.id!);
      expect(items.length).toBeGreaterThan(0);
      expect(items[0].reference).toBeDefined();
    });

    it('saves updated item and updates pointed count', async () => {
      await seedInitialRentreeDataIfEmpty();
      const campaigns = await getAllRentreeCampaigns();
      const voyages = await getRentreeVoyagesByCampaign(campaigns[0].id!);
      const items = await getRentreeItemsByVoyage(voyages[0].id!);

      const target = items[0];
      const newConformes = target.returnedCartons + 5;
      await saveRentreeItem({
        ...target,
        returnedCartons: newConformes,
      });

      const updatedItems = await getRentreeItemsByVoyage(voyages[0].id!);
      const updatedTarget = updatedItems.find((i) => i.id === target.id);
      expect(updatedTarget?.returnedCartons).toBe(newConformes);
    });
  });
});
