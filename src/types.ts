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
  | 'product_substituted'
  | 'cross_bill_reallocation'
  | 'shortage_partial_delivery'
  | 'stage_operator_assigned'
  | 'trip_created'
  | 'trip_dispatched'
  | 'trip_cancelled'
  | 'status_changed';

export type SessionStatus = 'active' | 'completed';
export type BillStatus = 'active' | 'completed';
export type ShippingStatus = 'not_shipped' | 'partially_shipped' | 'fully_shipped';
export type TripStatus = 'loading' | 'dispatched' | 'completed' | 'cancelled';

// --- Entities ---

export interface WorkSession {
  id?: number;
  name: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ShipmentTrip {
  id?: number;
  billId: number;
  billIds?: number[];
  client: string;
  tripNumber: number;
  status: TripStatus;
  driverName?: string | null;
  truckPlate?: string | null;
  operatorName?: string | null;
  containerIds: number[];
  lineQuantities: {
    orderLineId: number;
    quantity: number;
  }[];
  totalUnits: number;
  totalContainers: number;
  isLastTrip?: boolean;
  notes?: string | null;
  dispatchedAt?: string | null;
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
  shippingStatus?: ShippingStatus | null;
  tripCount?: number | null;
  paymentMode?: string | null;
  agentName?: string | null;
  clientAddress?: string | null;
  nif?: string | null;
  nis?: string | null;
  rc?: string | null;
  ai?: string | null;
  discountPercent?: number | null;
  bcNumber?: string | null;
  documentType?: 'invoice' | 'bl_official' | 'bl_workshop' | 'bon_commande' | null;
  // Stage Operator Accountability
  preparedBy?: string | null;
  preparedAt?: string | null;
  loadedBy?: string | null;
  loadedAt?: string | null;
  checkedBy?: string | null;
  checkedAt?: string | null;
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
  originalUnitPrice?: number | null;
  // Current (mutable)
  no: string;
  page: number | null;
  reference: string | null;
  ean: string | null;
  designation: string;
  orderedQty: number;
  unitPrice?: number | null;
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
  colisage?: string | null;
  substituteForId?: number | null;
  substitutedById?: number | null;
  substitutionNote?: string | null;
  sampleTaken?: number | null;
  // Cross-Bill Reallocation & Shortage Tracking
  reallocatedQty?: number | null;
  reallocatedFromBillId?: number | null;
  reallocatedToBillId?: number | null;
  reallocationNote?: string | null;
  shortageResolvedAsPartial?: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface CountEvent {
  id?: number;
  billId: number;
  orderLineId: number;
  stage: Stage;
  quantity: number;
  containerId?: number | null; // transport container id
  outcome: PointageOutcome | null; // only for pointage
  note?: string | null; // Reason for refusal or incident details
  refusalNote?: string | null; // Backwards-compatible alias
  packType?: string | null; // Colisage metadata
  undone: boolean;
  createdAt: string;
}


export interface TransportContainer {
  id?: number;
  billId: number;
  client?: string; // seller/client entity name for shared multi-bill packaging
  label: string; // "CARTON A", "CHOUALA A", etc.
  name?: string; // Backwards-compatible alias for label
  type: 'carton' | 'chouala' | 'loose' | 'large';
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
  unitPrice?: number | null;
  um?: string | null;
  colisage?: string | null;
  discountPercent?: number | null;
  packagesRaw?: string | null;
}

export interface ImportBillJSON {
  billNumber?: string;
  client?: string;
  date?: string | null;
  paymentMode?: string | null;
  agentName?: string | null;
  clientAddress?: string | null;
  nif?: string | null;
  nis?: string | null;
  rc?: string | null;
  ai?: string | null;
  totalTtc?: number | null;
  totalHt?: number | null;
  totalHtNet?: number | null;
  totalRemise?: number | null;
  totalTva?: number | null;
  totalRemPaiement?: number | null;
  totalAvecRemise?: number | null;
  discountPercent?: number | null;
  bcNumber?: string | null;
  documentType?: 'invoice' | 'bl_official' | 'bl_workshop' | 'bon_commande' | null;
  lines?: ImportLineJSON[];
}

export interface ImportPayload {
  bills?: ImportBillJSON[];
}

// --- Final Bill Export Shape (Surface Edition) ---

export type FinalBillRowStatus = 'CONFORME' | 'MANQUANT' | 'SURPLUS' | 'RUPTURE' | 'AVARIE' | 'ANNULE';

export interface FinalBillRow {
  no: string;
  code: string; // Product reference / Code article
  ean: string | null;
  designation: string;
  um?: string; // U.M (Unité(s))
  colisage: string | null;
  orderedQty: number;
  actualQty: number; // Quantité physiquement pointée en surface
  diffQty: number; // actualQty - orderedQty
  unitPrice: number | null; // P.U. HT en DA
  discountPercent?: number | null; // Remise Paiement (%)
  totalTtc: number | null; // actualQty * (unitPrice || 0)
  status: FinalBillRowStatus;
  observation: string;
}

export interface FinalBillExportData {
  billNumber: string;
  client: string;
  date: string;
  paymentMode?: string | null;
  agentName?: string | null;
  clientAddress?: string | null;
  nif?: string | null;
  nis?: string | null;
  rc?: string | null;
  ai?: string | null;
  bcNumber?: string | null;
  documentType?: 'invoice' | 'bl_official' | 'bl_workshop' | 'bon_commande' | null;
  preparedBy?: string | null;
  loadedBy?: string | null;
  checkedBy?: string | null;
  totalOrderedQty: number;
  totalActualQty: number;
  totalDiffQty: number;
  totalAmountTtc: number;
  totalAmountWithDiscount?: number | null;
  totalHt?: number | null;
  totalHtNet?: number | null;
  totalRemise?: number | null;
  totalTva?: number | null;
  totalRemPaiement?: number | null;
  totalAvecRemise?: number | null;
  amountInWords?: string | null;
  discountPercent?: number | null;
  isPriced: boolean;
  checksumValid: boolean;
  rows: FinalBillRow[];
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
