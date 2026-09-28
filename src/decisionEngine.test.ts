import { describe, it, expect } from 'vitest';
import {
  analyzeB2BOrderOpportunities,
  generateRepTourRecommendations,
  simulateOrderMargin,
  calculateWarehouseValuation,
  PRESET_RETAIL_BUNDLES,
} from './decisionEngine';
import type { ClientAccount, OrderItem, ProductProfile } from './types';

describe('Decision Support Engine (Aide à la Décision & Finance)', () => {
  describe('B2B Wholesale Ordering Decision Intelligence', () => {
    const testClient: ClientAccount = {
      name: 'Benali Grossiste',
      clientType: 'grossiste',
      creditLimit: 500000,
      currentBalance: 400000,
      tierDiscountPercent: 5,
      updatedAt: new Date().toISOString(),
    };

    it('triggers financial credit risk alert when new order exceeds credit limit', () => {
      const items: OrderItem[] = [
        { reference: 'STY-01', designation: 'Carton Stylos', unitPrice: 8000, quantity: 15, totalPrice: 120000 },
      ]; // 120,000 DA + 400,000 DA = 520,000 DA > 500,000 DA

      const result = analyzeB2BOrderOpportunities({ items, client: testClient });
      expect(result.creditRisk).not.toBeNull();
      expect(result.creditRisk?.type).toBe('overdue_credit_warning');
      expect(result.creditRisk?.urgency).toBe('high');
      expect(result.creditRisk?.potentialMoneyImpactDa).toBe(20000); // 520,000 - 500,000
    });

    it('calculates volume discount upsell when order is close to tier threshold', () => {
      const items: OrderItem[] = [
        { reference: 'CAH-01', designation: 'Carton Cahiers', unitPrice: 4000, quantity: 18, totalPrice: 72000 },
      ]; // 18 cartons -> 2 cartons away from 20 cartons tier (+3%)

      const result = analyzeB2BOrderOpportunities({ items, client: testClient });
      expect(result.volumeUpsell).not.toBeNull();
      expect(result.volumeUpsell?.neededCartons).toBe(2);
      expect(result.volumeUpsell?.extraDiscountPercent).toBe(3);
      expect(result.volumeUpsell?.potentialGainDa).toBeGreaterThan(0);
    });

    it('recommends golden products missing from the cart', () => {
      const catalog: ProductProfile[] = [
        {
          reference: 'GOLD-01',
          designation: 'Roller Gel Star SBM',
          isGoldenProduct: true,
          wholesalePrice: 1500,
          outerPackSize: 24,
          innerPackSize: 6,
          warehouseZone: null,
          updatedAt: new Date().toISOString(),
        },
      ];
      const items: OrderItem[] = [
        { reference: 'OTHER-01', designation: 'Gomme', unitPrice: 200, quantity: 5, totalPrice: 1000 },
      ];

      const result = analyzeB2BOrderOpportunities({ items, client: testClient, productCatalog: catalog });
      const goldenInsight = result.insights.find((i) => i.type === 'high_margin_golden');
      expect(goldenInsight).toBeDefined();
      expect(goldenInsight?.title).toContain('GOLD-01');
    });
  });

  describe('Commercial Field Rep Tour Recommendations', () => {
    const clients: ClientAccount[] = [
      {
        id: 1,
        name: 'Client Sain',
        clientType: 'librairie',
        creditLimit: 500000,
        currentBalance: 50000,
        tierDiscountPercent: 4,
        assignedRep: 'Yassine',
        lastOrderDate: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 2,
        name: 'Client Endetté Alerte',
        clientType: 'grossiste',
        creditLimit: 300000,
        currentBalance: 390000, // Plafond Dépassé
        tierDiscountPercent: 5,
        assignedRep: 'Yassine',
        lastOrderDate: '2026-08-01',
        updatedAt: new Date().toISOString(),
      },
      {
        id: 3,
        name: 'Client Inactif',
        clientType: 'librairie',
        creditLimit: 400000,
        currentBalance: 210000,
        tierDiscountPercent: 3,
        assignedRep: 'Yassine',
        lastOrderDate: '2026-08-10',
        updatedAt: new Date().toISOString(),
      },
    ];

    it('ranks the most indebted client first to maximize cash recovery', () => {
      const recommendations = generateRepTourRecommendations(clients, 'Yassine');
      expect(recommendations[0].name).toBe('Client Endetté Alerte');
      expect(recommendations[0].tourScore).toBeGreaterThan(recommendations[1].tourScore);
      expect(recommendations[0].priorityReason).toContain('Plafond de crédit dépassé');
      expect(recommendations[0].targetCashDa).toBe(390000);
    });
  });

  describe('Commercial Margin Simulation', () => {
    it('accurately calculates profit and detects healthy vs tight margins', () => {
      const items: OrderItem[] = [
        { reference: 'STY-01', designation: 'Boite Stylos', unitPrice: 1000, costPrice: 700, quantity: 10, totalPrice: 10000 },
      ];

      // 5% discount: Revenue = 9,500 DA, Cost = 7,000 DA, Profit = 2,500 DA (26% margin -> excellent)
      const sim1 = simulateOrderMargin(items, 5);
      expect(sim1.finalRevenueDa).toBe(9500);
      expect(sim1.netProfitDa).toBe(2500);
      expect(sim1.marginHealth).toBe('excellent');

      // 25% discount: Revenue = 7,500 DA, Cost = 7,000 DA, Profit = 500 DA (7% margin -> tight)
      const sim2 = simulateOrderMargin(items, 25);
      expect(sim2.marginPercent).toBeLessThan(12);
      expect(sim2.marginHealth).toBe('tight');

      // 35% discount: Revenue = 6,500 DA, Cost = 7,000 DA, Profit = -500 DA (loss)
      const sim3 = simulateOrderMargin(items, 35);
      expect(sim3.netProfitDa).toBeLessThan(0);
      expect(sim3.marginHealth).toBe('loss');
    });
  });

  describe('Retail B2C Bundles', () => {
    it('contains presets with real consumer savings and positive prices', () => {
      expect(PRESET_RETAIL_BUNDLES.length).toBeGreaterThan(0);
      for (const bundle of PRESET_RETAIL_BUNDLES) {
        expect(bundle.priceDa).toBeGreaterThan(0);
        expect(bundle.savingsDa).toBeGreaterThan(0);
        expect(bundle.items.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Warehouse Operations Valuation', () => {
    it('estimates active preparation and dispatched inventory values in Dinars', () => {
      const bills = [{ status: 'in_progress' }, { status: 'done' }, { status: 'done' }];
      const catalog: ProductProfile[] = [
        {
          reference: 'DORM-01',
          designation: 'Cahier Ancien Format',
          stockQty: 250,
          wholesalePrice: 400,
          isGoldenProduct: false,
          outerPackSize: 24,
          innerPackSize: 6,
          warehouseZone: null,
          updatedAt: new Date().toISOString(),
        },
      ];

      const val = calculateWarehouseValuation({ bills, productCatalog: catalog });
      expect(val.preparationValueDa).toBe(82000);
      expect(val.activeDispatchedValueDa).toBe(230000);
      expect(val.deadStockSuggestions).toHaveLength(1);
      expect(val.dormantStockValueDa).toBeGreaterThan(0);
    });
  });
});
