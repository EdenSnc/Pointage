// ============================================================
// WAREHOUSE ZONE TAXONOMY & SPATIAL MANAGEMENT
// ============================================================

import { db } from './db';
import { saveProductProfile } from './hooks';
import type { OrderLine, ProductProfile, WarehouseZone } from './types';

export interface WarehouseZoneOption {
  code: string;
  label: string;
  shortLabel: string;
  category: 'chambre' | 'couloir' | 'custom';
  compassRow?: number; // 1 = North, 2 = Middle, 3 = South
  compassCol?: number; // 1 = West, 2 = Center, 3 = East
  roomNumber?: number; // 1 = Salle 1 (South), 2 = Salle 2, 3 = Salle 3, 4 = Salle 4 (North)
  order: number;
}

export const WAREHOUSE_ZONES: WarehouseZoneOption[] = [
  // --- Chambre Principale (Spatial Compass Grid: NW to SE sweep) ---
  // User sequence: Chambre (NW → SE)
  {
    code: 'CH_NW',
    label: 'Chambre Principale • Nord-Ouest',
    shortLabel: 'CH • Nord-Ouest',
    category: 'chambre',
    compassRow: 1,
    compassCol: 1,
    order: 10,
  },
  {
    code: 'CH_N',
    label: 'Chambre Principale • Nord',
    shortLabel: 'CH • Nord',
    category: 'chambre',
    compassRow: 1,
    compassCol: 2,
    order: 20,
  },
  {
    code: 'CH_NE',
    label: 'Chambre Principale • Nord-Est',
    shortLabel: 'CH • Nord-Est',
    category: 'chambre',
    compassRow: 1,
    compassCol: 3,
    order: 30,
  },
  {
    code: 'CH_W',
    label: 'Chambre Principale • Ouest (Accès Couloir)',
    shortLabel: 'CH • Ouest',
    category: 'chambre',
    compassRow: 2,
    compassCol: 1,
    order: 40,
  },
  {
    code: 'CH_CTR',
    label: 'Chambre Principale • Centre / Milieu',
    shortLabel: 'CH • Centre',
    category: 'chambre',
    compassRow: 2,
    compassCol: 2,
    order: 50,
  },
  {
    code: 'CH_E',
    label: 'Chambre Principale • Est',
    shortLabel: 'CH • Est',
    category: 'chambre',
    compassRow: 2,
    compassCol: 3,
    order: 60,
  },
  {
    code: 'CH_SW',
    label: 'Chambre Principale • Sud-Ouest (Entrée)',
    shortLabel: 'CH • Sud-Ouest',
    category: 'chambre',
    compassRow: 3,
    compassCol: 1,
    order: 70,
  },
  {
    code: 'CH_S',
    label: 'Chambre Principale • Sud',
    shortLabel: 'CH • Sud',
    category: 'chambre',
    compassRow: 3,
    compassCol: 2,
    order: 80,
  },
  {
    code: 'CH_SE',
    label: 'Chambre Principale • Sud-Est',
    shortLabel: 'CH • Sud-Est',
    category: 'chambre',
    compassRow: 3,
    compassCol: 3,
    order: 90,
  },

  // --- Couloir (Hallway: Salles 1–3 then Salle 4 Sud → Nord) ---
  // Salles 1 to 3
  {
    code: 'CO_R1',
    label: 'Couloir • Salle 1 (Sud / Entrée)',
    shortLabel: 'Couloir • Salle 1',
    category: 'couloir',
    roomNumber: 1,
    order: 100,
  },
  {
    code: 'CO_R2',
    label: 'Couloir • Salle 2',
    shortLabel: 'Couloir • Salle 2',
    category: 'couloir',
    roomNumber: 2,
    order: 110,
  },
  {
    code: 'CO_R3',
    label: 'Couloir • Salle 3',
    shortLabel: 'Couloir • Salle 3',
    category: 'couloir',
    roomNumber: 3,
    order: 120,
  },
  // Salle 4 (Sud → Nord)
  {
    code: 'CO_R4',
    label: 'Couloir • Salle 4 (Nord)',
    shortLabel: 'Couloir • Salle 4',
    category: 'couloir',
    roomNumber: 4,
    order: 130,
  },
];

// Mapping for legacy or alias codes
const LEGACY_ZONE_MAP: Record<string, string> = {
  NORTH_WEST: 'CH_NW',
  NORTH_EAST: 'CH_NE',
  SOUTH_WEST: 'CH_SW',
  SOUTH_EAST: 'CH_SE',
  LITTLE_ROOM_ENTRANCE: 'CO_R1',
  LITTLE_ROOM_DEEP: 'CO_R2',
  CO_R4_S: 'CO_R4',
  CO_R4_A1: 'CO_R4',
  CO_R4_A2: 'CO_R4',
  CO_R4_A3: 'CO_R4',
  CO_R4_A4: 'CO_R4',
  CO_R4_N: 'CO_R4',
};

export function parseZoneCodes(code: string | null | undefined): string[] {
  if (!code) return [];
  const parts = code.split(/[,+]/).map((s) => s.trim()).filter(Boolean);
  const result: string[] = [];
  for (const p of parts) {
    const norm = normalizeZoneCode(p);
    if (norm && !result.includes(norm)) {
      result.push(norm);
    }
  }
  return result.slice(0, 2);
}

export function normalizeZoneCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const trimmed = code.trim();
  if (!trimmed) return null;
  if (trimmed.includes(',') || trimmed.includes('+')) {
    const parsed = parseZoneCodes(trimmed);
    return parsed.length > 0 ? parsed.join(', ') : null;
  }
  return LEGACY_ZONE_MAP[trimmed] || trimmed;
}

export function getZoneInfo(code: string | null | undefined): WarehouseZoneOption | null {
  const norm = normalizeZoneCode(code);
  if (!norm) return null;
  if (norm.includes(',')) {
    const primary = norm.split(',')[0].trim();
    return getZoneInfo(primary);
  }
  const found = WAREHOUSE_ZONES.find((z) => z.code === norm);
  if (found) return found;

  // Custom user rack / zone
  return {
    code: norm,
    label: norm,
    shortLabel: norm,
    category: 'custom',
    order: 900,
  };
}

export function getZoneLabel(code: string | null | undefined): string {
  const codes = parseZoneCodes(code);
  if (codes.length === 0) return '';
  if (codes.length === 1) {
    const info = getZoneInfo(codes[0]);
    return info ? info.label : codes[0];
  }
  return codes
    .map((c) => {
      const info = getZoneInfo(c);
      return info ? info.shortLabel : c;
    })
    .join(' + ');
}

export function getZoneShortLabel(code: string | null | undefined): string {
  const codes = parseZoneCodes(code);
  if (codes.length === 0) return '';
  return codes
    .map((c) => {
      const info = getZoneInfo(c);
      return info ? info.shortLabel : c;
    })
    .join(' + ');
}

/**
 * Updates warehouse location for a product:
 * 1. Persists to the current order line.
 * 2. Persists to the global product profile so future and other current bills know where it is.
 * 3. Updates all matching lines in the active bill.
 * 4. Records an audit event for traceability.
 */
export async function updateProductWarehouseZone(
  lineId: number,
  billId: number,
  reference: string | null | undefined,
  newZone: string | null,
  operatorName?: string
): Promise<void> {
  const currentLine = await db.orderLines.get(lineId);
  const oldZone = currentLine?.warehouseZone || null;
  const normalizedNewZone = (normalizeZoneCode(newZone) || null) as WarehouseZone | null;

  // 1. Update current line
  await db.orderLines.update(lineId, {
    warehouseZone: normalizedNewZone,
    updatedAt: new Date().toISOString(),
  });

  // 2. Update all lines on this bill with same reference
  if (reference) {
    const siblingLines = await db.orderLines
      .where('billId')
      .equals(billId)
      .and((l) => l.reference === reference && l.id !== lineId)
      .toArray();

    for (const sib of siblingLines) {
      if (sib.id) {
        await db.orderLines.update(sib.id, {
          warehouseZone: normalizedNewZone,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    // 3. Persist to master product profile
    await saveProductProfile(reference, {
      warehouseZone: normalizedNewZone,
    });
  }

  // 4. Audit trail
  await db.auditEvents.add({
    billId,
    orderLineId: lineId,
    stage: null,
    type: 'warehouse_zone_changed',
    oldValue: oldZone,
    newValue: normalizedNewZone,
    reason: operatorName ? `Défini par ${operatorName}` : 'Mise à jour emplacement entrepôt',
    timestamp: new Date().toISOString(),
  });
}

/**
 * Sorts lines by warehouse picking path:
 * Chambre (Entrée SW ➔ Sud ➔ Centre ➔ Nord) ⟶ Couloir (Salle 4 ➔ Salle 1 Sud / Sortie) ⟶ Custom ⟶ Non assignés
 * Eliminates backtracking across the facility during order picking.
 */
export function sortLinesByWarehouseZone(
  lines: OrderLine[],
  profilesMap?: Map<string, ProductProfile>
): OrderLine[] {
  return [...lines].sort((a, b) => {
    const zoneA = a.warehouseZone || (a.reference && profilesMap ? profilesMap.get(a.reference)?.warehouseZone : null);
    const zoneB = b.warehouseZone || (b.reference && profilesMap ? profilesMap.get(b.reference)?.warehouseZone : null);

    const primaryA = parseZoneCodes(zoneA)[0];
    const primaryB = parseZoneCodes(zoneB)[0];

    const infoA = getZoneInfo(primaryA);
    const infoB = getZoneInfo(primaryB);

    const orderA = infoA ? infoA.order : 999;
    const orderB = infoB ? infoB.order : 999;

    if (orderA !== orderB) return orderA - orderB;

    // Secondary sort by page then line number
    const pageDiff = (a.page || 0) - (b.page || 0);
    if (pageDiff !== 0) return pageDiff;
    return (Number(a.no) || 0) - (Number(b.no) || 0);
  });
}

/**
 * Returns human-readable description of physical picking circuit
 */
export function getWarehouseCircuitDescription(): string {
  return 'Chambre (NW ➔ SE) ⟶ Couloir (Salles 1–3) ⟶ Salle 4 (Sud ➔ Nord)';
}
