// ============================================================
// POINTAGE — Domain Types
// ============================================================

// --- Enums ---

export type Stage = 'preparation' | 'chargement' | 'pointage';

export type LineStatus = 'active' | 'cancelled' | 'not_found' | 'out_of_stock' | 'removed_by_revision';

export type PointageOutcome = 'accepted' | 'damaged_accepted' | 'damaged_refused' | 'refused';

export type SearchMode = 'smart' | 'no' | 'ref' | 'ean' | 'name';

export type ChangeReason = 'official_change' | 'bill_correction' | 'other';

export type WarehouseZone =
  | 'NORTH_WEST'
  | 'NORTH_EAST'
  | 'SOUTH_WEST'
  | 'SOUTH_EAST'
  | 'LITTLE_ROOM_ENTRANCE'
  | 'LITTLE_ROOM_DEEP'
  | 'UNKNOWN';

export type AuditEventType =
  | 'quantity_changed'
  | 'reference_corrected'
  | 'ean_corrected'
  | 'designation_corrected'
  | 'no_corrected'
  | 'page_corrected'
  | 'line_added'
  | 'line_cancelled'
  | 'line_not_found'
  | 'line_out_of_stock'
  | 'line_reactivated'
  | 'identifier_override_added'
  | 'bill_reimported'
  | 'count_event_undone'
  | 'line_removed_by_revision'
  | 'status_changed';

export type SessionStatus = 'active' | 'completed';
export type BillStatus = 'active' | 'completed';

// --- Entities ---

export interface WorkSession {
  id?: number;
  name: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Bill {
  id?: number;
  sessionId: number;
  billNumber: string;
  client: string;
  date?: string;
  status: BillStatus;
  createdAt: string;
  updatedAt: string;
}

export interface OrderLine {
  id?: number;
  billId: number;
  // Original (immutable after import)
  originalNo: string;
  originalPage: number | null;
  originalReference: string | null;
  originalEan: string | null;
  originalDesignation: string;
  originalOrderedQty: number;
  // Current (mutable)
  no: string;
  page: number | null;
  reference: string | null;
  ean: string | null;
  designation: string;
  orderedQty: number;
  // Status
  status: LineStatus;
  // Packaging (worker-set, optional)
  outerPackSize: number | null;
  innerPackSize: number | null;
  // Zone
  warehouseZone: WarehouseZone | null;
  // Packages raw from import
  packagesRaw: string | null;
  // Compound reference aliases for search
  referenceAliases: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CountEvent {
  id?: number;
  billId: number;
  orderLineId: number;
  stage: Stage;
  quantity: number;
  containerId: number | null; // transport container id
  outcome: PointageOutcome | null; // only for pointage
  note?: string | null; // Reason for refusal or incident details
  undone: boolean;
  createdAt: string;
}


export interface TransportContainer {
  id?: number;
  billId: number;
  label: string; // "CARTON A", "CARTON B", "LOOSE / ON TOP", etc.
  type: 'carton' | 'loose' | 'large';
  createdAt: string;
}

export interface ExtraProduct {
  id?: number;
  billId: number | null;
  sessionId: number;
  scannedEan: string | null;
  reference: string | null;
  designation: string | null;
  quantity: number;
  stage: Stage;
  createdAt: string;
}

export interface BillIdentifierOverride {
  id?: number;
  billId: number;
  orderLineId: number;
  scannedValue: string;
  fieldType: 'ean' | 'reference';
  createdAt: string;
}

export interface IdentifierSuggestion {
  id?: number;
  scannedValue: string;
  fieldType: 'ean' | 'reference';
  targetReference: string | null;
  targetEan: string | null;
  targetDesignation: string | null;
  createdAt: string;
}

export interface ProductProfile {
  id?: number;
  reference: string;
  outerPackSize: number | null;
  innerPackSize: number | null;
  warehouseZone: WarehouseZone | null;
  updatedAt: string;
}

export interface AuditEvent {
  id?: number;
  billId: number;
  orderLineId: number | null;
  stage: Stage | null;
  type: AuditEventType;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
  timestamp: string;
}

// --- Import JSON shape ---

export interface ImportLineJSON {
  no?: string;
  page?: number | null;
  reference?: string | null;
  ean?: string | null;
  designation?: string;
  quantity?: number;
  packagesRaw?: string | null;
}

export interface ImportBillJSON {
  billNumber?: string;
  client?: string;
  date?: string | null;
  lines?: ImportLineJSON[];
}

export interface ImportPayload {
  bills?: ImportBillJSON[];
}

// --- Computed helpers ---

export interface StageTotals {
  total: number;
  byOutcome: Record<PointageOutcome, number>;
}

export interface LineDiscrepancy {
  expected: number;
  counted: number;
  remaining: number;
  over: number;
  isExact: boolean;
  isShort: boolean;
  isOver: boolean;
  isModified: boolean;
}
