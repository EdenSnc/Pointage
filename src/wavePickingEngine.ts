// ============================================================
// POINTAGE — High-Velocity Wave Picking Engine
// Consolidated picking across high-volume bills during rush hours
// Minimizes warehouse walking distance & maximizes pick speed
// ============================================================

import type { Bill, OrderLine, ProductProfile, Stage } from './types';
import { sortLinesByWarehouseZone, getZoneShortLabel } from './warehouseZones';

export interface WavePickAllocation {
  billId: number;
  billNumber: string;
  client: string;
  orderedQty: number;
  currentCounted: number;
  remainingQty: number;
  cartons: number;
  looseUnits: number;
  isCompleted: boolean;
}

export interface WavePickItem {
  reference: string;
  designation: string;
  ean?: string;
  warehouseZone?: string;
  zoneShortLabel: string;
  outerPackSize: number;
  totalOrderedQty: number;
  totalRemainingQty: number;
  totalCartonsToPick: number;
  totalLooseUnitsToPick: number;
  billCount: number;
  allocations: WavePickAllocation[];
  isFullyPicked: boolean;
}

export interface WavePickingSummary {
  totalBills: number;
  totalUniqueItems: number;
  totalCartonsToPick: number;
  totalLooseUnitsToPick: number;
  totalPiecesRemaining: number;
  activeStage: Stage;
  items: WavePickItem[];
  zonesCovered: string[];
}

/**
 * Consolidates lines across multiple active bills into a single optimal Wave Picking list.
 * Sorted by physical warehouse zone circuit to eliminate backtracking.
 */
export function generateWavePickingPlan(params: {
  bills: Bill[];
  lines: OrderLine[];
  catalog?: ProductProfile[];
  stage?: Stage;
}): WavePickingSummary {
  const { bills, lines, catalog = [], stage = 'preparation' } = params;

  const activeBills = bills.filter((b) => b.status !== 'completed');
  const activeBillIds = new Set(activeBills.map((b) => b.id));

  // Map bill lookup for fast retrieval
  const billMap = new Map<number, Bill>();
  activeBills.forEach((b) => {
    if (b.id) billMap.set(b.id, b);
  });

  // Map catalog for outer pack and zone lookups
  const catalogMap = new Map<string, ProductProfile>();
  catalog.forEach((p) => {
    catalogMap.set(p.reference.toUpperCase(), p);
    if (p.ean) catalogMap.set(p.ean, p);
  });

  // Aggregate lines by canonical reference
  const aggregatedMap = new Map<string, {
    reference: string;
    designation: string;
    ean?: string;
    warehouseZone?: string;
    outerPackSize: number;
    allocations: WavePickAllocation[];
  }>();

  for (const line of lines) {
    if (!activeBillIds.has(line.billId)) continue;
    const parentBill = billMap.get(line.billId);
    if (!parentBill) continue;

    const refKey = (line.reference || 'INCONNU').trim().toUpperCase();
    const profile = catalogMap.get(refKey);

    const outerPack = line.outerPackSize || profile?.outerPackSize || 1;
    const zone = line.warehouseZone || profile?.warehouseZone || 'CH_NW';

    // Current stage progress
    const remaining = Math.max(0, line.orderedQty);

    const alloc: WavePickAllocation = {
      billId: line.billId,
      billNumber: parentBill.billNumber || `BL-${line.billId}`,
      client: parentBill.client || 'CLIENT DIVERS',
      orderedQty: line.orderedQty,
      currentCounted: 0, // will be updated with actual counts if provided
      remainingQty: remaining,
      cartons: Math.floor(remaining / outerPack),
      looseUnits: remaining % outerPack,
      isCompleted: remaining === 0,
    };

    if (!aggregatedMap.has(refKey)) {
      aggregatedMap.set(refKey, {
        reference: line.reference || refKey,
        designation: line.designation || profile?.designation || refKey,
        ean: line.ean || profile?.ean,
        warehouseZone: zone,
        outerPackSize: outerPack,
        allocations: [alloc],
      });
    } else {
      const existing = aggregatedMap.get(refKey)!;
      existing.allocations.push(alloc);
      if (!existing.ean && line.ean) existing.ean = line.ean;
      if (!existing.warehouseZone && zone) existing.warehouseZone = zone;
    }
  }

  // Convert to WavePickItem array
  const waveItems: WavePickItem[] = [];
  const zonesCoveredSet = new Set<string>();

  for (const [_, itemData] of aggregatedMap.entries()) {
    const totalOrdered = itemData.allocations.reduce((sum, a) => sum + a.orderedQty, 0);
    const totalRemaining = itemData.allocations.reduce((sum, a) => sum + a.remainingQty, 0);
    const totalCartons = Math.floor(totalRemaining / itemData.outerPackSize);
    const totalLoose = totalRemaining % itemData.outerPackSize;

    if (itemData.warehouseZone) {
      zonesCoveredSet.add(itemData.warehouseZone);
    }

    waveItems.push({
      reference: itemData.reference,
      designation: itemData.designation,
      ean: itemData.ean,
      warehouseZone: itemData.warehouseZone,
      zoneShortLabel: getZoneShortLabel(itemData.warehouseZone),
      outerPackSize: itemData.outerPackSize,
      totalOrderedQty: totalOrdered,
      totalRemainingQty: totalRemaining,
      totalCartonsToPick: totalCartons,
      totalLooseUnitsToPick: totalLoose,
      billCount: itemData.allocations.length,
      allocations: itemData.allocations,
      isFullyPicked: totalRemaining === 0,
    });
  }

  // Sort by warehouse optimal picking circuit
  waveItems.sort((a, b) => {
    const zoneA = a.warehouseZone || '';
    const zoneB = b.warehouseZone || '';
    if (zoneA !== zoneB) {
      return zoneA.localeCompare(zoneB);
    }
    return a.reference.localeCompare(b.reference);
  });

  const totalCartonsToPick = waveItems.reduce((acc, it) => acc + it.totalCartonsToPick, 0);
  const totalLooseUnitsToPick = waveItems.reduce((acc, it) => acc + it.totalLooseUnitsToPick, 0);
  const totalPiecesRemaining = waveItems.reduce((acc, it) => acc + it.totalRemainingQty, 0);

  return {
    totalBills: activeBills.length,
    totalUniqueItems: waveItems.length,
    totalCartonsToPick,
    totalLooseUnitsToPick,
    totalPiecesRemaining,
    activeStage: stage,
    items: waveItems,
    zonesCovered: Array.from(zonesCoveredSet),
  };
}

/**
 * Formats a clean WhatsApp / Print text summary for the forklift / warehouse pickers.
 */
export function formatWavePickingManifest(summary: WavePickingSummary): string {
  const dateStr = new Date().toLocaleDateString('fr-DZ');
  const timeStr = new Date().toLocaleTimeString('fr-DZ', { hour: '2-digit', minute: '2-digit' });

  const lines = [
    '========================================',
    '⚡ POINTAGE — FEUILLE DE VAGUE (WAVE PICK)',
    `DATE : ${dateStr} À ${timeStr}`,
    `BONS REGROUPÉS : ${summary.totalBills} BONS ACTIFS`,
    `VOLUME TOTAL : ${summary.totalCartonsToPick} CARTONS (${summary.totalPiecesRemaining.toLocaleString('fr-DZ')} PCS)`,
    '========================================',
    '',
    'PARCOURS DE RAMASSE PAR ZONE ENTROPÔT :',
  ];

  let currentZone = '';
  summary.items.forEach((item, idx) => {
    const z = item.zoneShortLabel || 'Zone standard';
    if (z !== currentZone) {
      currentZone = z;
      lines.push('');
      lines.push(`📍 [${currentZone.toUpperCase()}]`);
      lines.push('----------------------------------------');
    }

    const ctnDesc = item.totalCartonsToPick > 0 ? `${item.totalCartonsToPick} ctns (x${item.outerPackSize})` : '';
    const looseDesc = item.totalLooseUnitsToPick > 0 ? `${item.totalLooseUnitsToPick} vrac` : '';
    const qtySummary = [ctnDesc, looseDesc].filter(Boolean).join(' + ') || `${item.totalRemainingQty} pcs`;

    lines.push(`${idx + 1}. [${item.reference}] ${item.designation}`);
    lines.push(`   À RAMASSER : ${qtySummary} (Pour ${item.billCount} bons)`);

    // Detail per bill
    const billBreakdowns = item.allocations
      .map((a) => `${a.billNumber}: ${a.remainingQty} pcs`)
      .join(' | ');
    lines.push(`   Répartition : ${billBreakdowns}`);
  });

  lines.push('');
  lines.push('========================================');
  lines.push('Fin de la vague. Ramasser sur palette quai.');
  lines.push('========================================');

  return lines.join('\n');
}
