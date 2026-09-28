import { describe, it, expect } from 'vitest';
import { generateWavePickingPlan, formatWavePickingManifest } from './wavePickingEngine';
import type { Bill, OrderLine, ProductProfile } from './types';

describe('Wave Picking Engine (High-Velocity Batch Consolidation)', () => {
  const mockBills: Bill[] = [
    {
      id: 1,
      sessionId: 1,
      billNumber: 'BL-001',
      client: 'ETS BENALI',
      status: 'active',
      date: '2026-09-28',
      createdAt: '2026-09-28T08:00:00Z',
      updatedAt: '2026-09-28T08:00:00Z',
    },
    {
      id: 2,
      sessionId: 1,
      billNumber: 'BL-002',
      client: 'PAPETERIE EL MANAR',
      status: 'active',
      date: '2026-09-28',
      createdAt: '2026-09-28T08:15:00Z',
      updatedAt: '2026-09-28T08:15:00Z',
    },
    {
      id: 3,
      sessionId: 1,
      billNumber: 'BL-003',
      client: 'ARCHIVED CLIENT',
      status: 'completed', // Should be excluded from active wave
      date: '2026-09-27',
      createdAt: '2026-09-27T08:00:00Z',
      updatedAt: '2026-09-27T08:00:00Z',
    },
  ];

  const mockLines: OrderLine[] = [
    // BL-001 has 160 pcs of Cahier 96p (pack 80 = 2 cartons)
    {
      id: 101,
      billId: 1,
      no: '1',
      page: 1,
      reference: 'CAH-96P-SBM',
      designation: 'Cahier 96p Seyes SBM',
      orderedQty: 160,
      outerPackSize: 80,
      warehouseZone: 'CH_NW',
      status: 'active',
      originalNo: '1',
      originalPage: 1,
      originalReference: 'CAH-96P-SBM',
      originalDesignation: 'Cahier 96p Seyes SBM',
      originalOrderedQty: 160,
      createdAt: '2026-09-28T08:00:00Z',
      updatedAt: '2026-09-28T08:00:00Z',
    },
    // BL-002 ALSO has 240 pcs of Cahier 96p (pack 80 = 3 cartons)
    {
      id: 102,
      billId: 2,
      no: '1',
      page: 1,
      reference: 'CAH-96P-SBM',
      designation: 'Cahier 96p Seyes SBM',
      orderedQty: 240,
      outerPackSize: 80,
      warehouseZone: 'CH_NW',
      status: 'active',
      originalNo: '1',
      originalPage: 1,
      originalReference: 'CAH-96P-SBM',
      originalDesignation: 'Cahier 96p Seyes SBM',
      originalOrderedQty: 240,
      createdAt: '2026-09-28T08:15:00Z',
      updatedAt: '2026-09-28T08:15:00Z',
    },
    // BL-001 has 20 pcs of Stylos (pack 20 = 1 carton)
    {
      id: 103,
      billId: 1,
      no: '2',
      page: 1,
      reference: 'STY-BOX-50',
      designation: 'Boite Stylos Gel',
      orderedQty: 20,
      outerPackSize: 20,
      warehouseZone: 'CO_R1',
      status: 'active',
      originalNo: '2',
      originalPage: 1,
      originalReference: 'STY-BOX-50',
      originalDesignation: 'Boite Stylos Gel',
      originalOrderedQty: 20,
      createdAt: '2026-09-28T08:00:00Z',
      updatedAt: '2026-09-28T08:00:00Z',
    },
    // BL-003 line should be ignored since bill is completed
    {
      id: 104,
      billId: 3,
      no: '1',
      page: 1,
      reference: 'OLD-ITEM',
      designation: 'Article Archive',
      orderedQty: 100,
      status: 'active',
      originalNo: '1',
      originalPage: 1,
      originalReference: 'OLD-ITEM',
      originalDesignation: 'Article Archive',
      originalOrderedQty: 100,
      createdAt: '2026-09-27T08:00:00Z',
      updatedAt: '2026-09-27T08:00:00Z',
    },
  ];

  it('consolidates items across active bills into single aggregate quantities', () => {
    const wave = generateWavePickingPlan({
      bills: mockBills,
      lines: mockLines,
    });

    expect(wave.totalBills).toBe(2);
    expect(wave.totalUniqueItems).toBe(2); // CAH-96P-SBM and STY-BOX-50

    // Cahier 96p should be aggregated across BL-001 (160) and BL-002 (240) -> 400 pcs
    const cahierItem = wave.items.find((i) => i.reference === 'CAH-96P-SBM');
    expect(cahierItem).toBeDefined();
    expect(cahierItem?.totalOrderedQty).toBe(400);
    expect(cahierItem?.totalCartonsToPick).toBe(5); // 400 / 80 = 5 cartons
    expect(cahierItem?.billCount).toBe(2);
    expect(cahierItem?.allocations).toHaveLength(2);

    // Stylos should have 1 carton
    const styloItem = wave.items.find((i) => i.reference === 'STY-BOX-50');
    expect(styloItem).toBeDefined();
    expect(styloItem?.totalOrderedQty).toBe(20);
    expect(styloItem?.totalCartonsToPick).toBe(1);

    // Total cartons to pick in wave = 5 + 1 = 6 cartons
    expect(wave.totalCartonsToPick).toBe(6);
  });

  it('sorts picking items by warehouse zone circuit to prevent backtracking', () => {
    const wave = generateWavePickingPlan({
      bills: mockBills,
      lines: mockLines,
    });

    // CH_NW comes before CO_R1 alphabetically in zones
    expect(wave.items[0].reference).toBe('CAH-96P-SBM');
    expect(wave.items[1].reference).toBe('STY-BOX-50');
  });

  it('generates a clean WhatsApp and printable manifest for warehouse drivers', () => {
    const wave = generateWavePickingPlan({
      bills: mockBills,
      lines: mockLines,
    });

    const manifest = formatWavePickingManifest(wave);
    expect(manifest).toContain('FEUILLE DE VAGUE (WAVE PICK)');
    expect(manifest).toContain('6 CARTONS');
    expect(manifest).toContain('CAH-96P-SBM');
    expect(manifest).toContain('5 ctns (x80)');
    expect(manifest).toContain('BL-001: 160 pcs | BL-002: 240 pcs');
  });
});
