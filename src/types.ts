// ============================================================
// POINTAGE — Domain Types
// ============================================================

// --- Enums ---

export type Stage = 'preparation' | 'chargement' | 'pointage';

export type LineStatus = 'active' | 'cancelled' | 'not_found' | 'out_of_stock' | 'removed_by_revision';

export type PointageOutcome = 'accepted' | 'damaged_accepted' | 'damaged_refused' | 'refused';

export type SearchMode = 'smart' | 'no' | 'ref' | 'ean' | 'name';

export type ChangeReason =
  | 'official_change'
  | 'bill_correction'
  | 'other'
  | 'out_of_stock'
  | 'client_requested'
  | 'packing_adjustment';

export type WarehouseZone =
  | 'CH_NW'
  | 'CH_N'
  | 'CH_NE'
  | 'CH_W'
  | 'CH_CTR'
  | 'CH_E'
  | 'CH_SW'
  | 'CH_S'
  | 'CH_SE'
  | 'CO_R1'
  | 'CO_R2'
  | 'CO_R3'
  | 'CO_R4'
  | 'CO_R4_S'
  | 'CO_R4_A1'
  | 'CO_R4_A2'
  | 'CO_R4_A3'
  | 'CO_R4_A4'
  | 'CO_R4_N'
  | 'NORTH_WEST'
  | 'NORTH_EAST'
  | 'SOUTH_WEST'
  | 'SOUTH_EAST'
  | 'LITTLE_ROOM_ENTRANCE'
  | 'LITTLE_ROOM_DEEP'
  | 'UNKNOWN'
  | (string & {});

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
  | 'warehouse_zone_changed'
  | 'trip_created'
  | 'trip_dispatched'
  | 'trip_cancelled'
  | 'legacy_code_linked'
  | 'status_changed'
  | 'tamper_attempt_prevented'
  | 'delivery_sealed'
  | 'supervisor_unseal_override'
  | 'overcount_prevented'
  | 'packaging_confusion_corrected';

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
  driverPhone?: string | null;
  destinationRoute?: string | null;
  availableSeats?: number | null;
  // Cryptographic Seal (Anti-vol / Anti-tamper)
  isSealed?: boolean;
  sealHash?: string | null;
  sealedAt?: string | null;
  sealedBy?: string | null;
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
  documentType?: 'invoice' | 'bl_official' | 'bl_workshop' | 'bon_commande' | 'proforma' | 'bon_transfert' | null;
  commercialNote?: string | null;
  imageUrl?: string | null;
  billPhotos?: string[] | null;
  // HQ Revision Tracking & Readjustment Diff Engine
  hqRevision?: HqRevisionDiff | null;
  // Gate Check & Paperwork Reconciliation
  paperworkVerified?: boolean;
  paperworkVerifiedAt?: string | null;
  // Stage Operator Accountability
  preparedBy?: string | null;
  preparedAt?: string | null;
  loadedBy?: string | null;
  loadedAt?: string | null;
  checkedBy?: string | null;
  checkedAt?: string | null;
  // Temporal Decomposition for Central DB, Analytics & Granular Filtering
  timestamp?: number;
  year?: number;
  month?: number;
  day?: number;
  hour?: number;
  minute?: number;
  time?: string | null;
  closedAt?: string | null;
  // Algerian Territorial Logistics (58 Wilayas)
  wilaya?: string | null;
  wilayaCode?: string | null;
  destinationCity?: string | null;
  // Operational Surface Alias (Immutabilité fiscale vs Nom usuel d'entrepôt)
  operationalClient?: string | null;
  // Multi-Entrepôts / Multi-Wilayas
  warehouseSite?: string | null;
  // Assigned Driver (Chauffeur assigné au bon de commande / livraison)
  driverName?: string | null;
  // Cryptographic Seal (Anti-vol / Anti-tamper)
  isSealed?: boolean;
  sealHash?: string | null;
  sealedAt?: string | null;
  sealedBy?: string | null;
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
  // Location Note (Note de terrain: sous la bâche, au fond à droite...)
  locationNote?: string | null;
  // Packages raw from import
  packagesRaw: string | null;
  // Compound reference aliases for search
  referenceAliases: string[];
  // Historical legacy code (when product dropped its code on newer bills)
  historicalReference?: string | null;
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
  imageUrl?: string | null;
  commercialNote?: string | null;
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
  designation?: string | null;
  normalizedDesignation?: string | null;
  legacyCodes?: string[];
  outerPackSize: number | null;
  innerPackSize: number | null;
  warehouseZone: WarehouseZone | null;
  locationNote?: string | null;
  warehouseSite?: string | null;
  imageUrl?: string | null;
  // B2B Wholesale & B2C Pricing & Margin Data
  wholesalePrice?: number | null; // Prix de gros (B2B) en DA
  retailPrice?: number | null; // Prix de détail / public en DA
  purchasePrice?: number | null; // Coût d'achat / revient en DA (pour calcul de marge nette)
  stockQty?: number | null; // Stock physique disponible au dépôt
  category?: 'scolaire' | 'bureautique' | 'autre';
  isGoldenProduct?: boolean; // Article star à forte rotation ou marge élevée
  volumeDiscountThreshold?: number | null; // Seuil de cartons pour remise volume
  volumeDiscountPercent?: number | null; // % remise volume
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
  commercialNote?: string | null;
}

export interface ImportBillJSON {
  billNumber?: string;
  client?: string;
  date?: string | null;
  paymentMode?: string | null;
  agentName?: string | null;
  driverName?: string | null;
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
  documentType?: 'invoice' | 'bl_official' | 'bl_workshop' | 'bon_commande' | 'proforma' | 'bon_transfert' | null;
  commercialNote?: string | null;
  lines?: ImportLineJSON[];
}

export interface HqRevisionChange {
  type: 'added' | 'removed' | 'quantity_changed';
  reference?: string | null;
  designation: string;
  oldQty?: number;
  newQty?: number;
  delta?: number;
  warehouseZone?: string | null;
  resolved?: boolean;
}

export interface HqRevisionDiff {
  revisedAt: string;
  acknowledged: boolean;
  changes: HqRevisionChange[];
  summaryMessage: string;
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
  commercialNote?: string | null;
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
  documentType?: 'invoice' | 'bl_official' | 'bl_workshop' | 'bon_commande' | 'proforma' | 'bon_transfert' | null;
  commercialNote?: string | null;
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

export type StoreDemandSignalType = 'high_demand' | 'out_of_stock' | 'model_request' | 'replenish_urgent';

export interface StoreDemand {
  id?: number;
  client: string; // Surface / Store name (ex: "BLEU BLANC NAKHIL")
  wilaya?: string | null;
  productReference?: string | null;
  designation: string;
  signalType: StoreDemandSignalType;
  requestedQty?: number | null;
  note?: string | null; // ex: "Les clients réclament la variante à roulettes"
  reportedBy?: string | null; // Operator, chauffeur, or vendor
  status: 'pending' | 'treated' | 'ordered' | 'dismissed';
  imageUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type DechargementStatus = 'scheduled' | 'arrived' | 'in_progress' | 'completed' | 'inspected';

export interface DechargementSession {
  id?: number;
  title: string;
  truckPlate?: string | null;
  carrierName?: string | null;
  supplierName?: string | null;
  containerNumber?: string | null;
  dockZone: string;
  status: DechargementStatus;
  estimatedCartons: number;
  unloadedCartons: number;
  damagedCartons: number;
  palletsCount?: number | null;
  assignedWorkers: string[];
  broadcastToAll: boolean;
  lastBroadcastAt?: string | null;
  damagePhotos?: string[];
  notes?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DechargementWorkerCall {
  sessionId: number;
  dockZone: string;
  truckInfo: string;
  targetAudience: 'all' | string[];
  calledBy: string;
  message: string;
  timestamp: string;
}

// --- Client Operational Alias & Multi-Depot Sites ---

export interface ClientAlias {
  id?: number;
  legalName: string; // "SARL BLEU BLANC NAKHIL" (Intouchable pour DCP & barrages routiers)
  operationalName: string; // "Kral Markt Béchar" (Usage surface & quai)
  notes?: string | null;
  updatedAt: string;
}

export interface WarehouseSite {
  id: string; // "oran_surface", "oran_usine", "alger_hub", "constantine_hub"
  name: string;
  wilaya: string;
  wilayaCode?: string;
  isDefault?: boolean;
}

// --- Inbound Container Reception & Mismatch Reconciliation (Réception Conteneurs & Fournitures) ---

export type ReceptionStatus = 'in_progress' | 'completed' | 'cancelled';
export type ReceptionItemDiscrepancy = 'exact' | 'short' | 'over' | 'unexpected';

export interface ReceptionSession {
  id?: number;
  title: string; // e.g. "Arrivage 3 Conteneurs - Rentrée Scolaire & Bureautique"
  containerNumber?: string | null; // e.g. "MSKU983421, CMAU771239, TGHU119023"
  supplierName?: string | null; // Fournisseur / Usine
  billNumber?: string | null; // N° BL Fournisseur / Manifeste
  dockZone?: string | null; // e.g. "Quai 1 (Principal)"
  warehouseSite?: string | null; // "oran_surface", "oran_usine", etc.
  status: ReceptionStatus;
  operator: string;
  notes?: string | null;
  startedAt: string;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReceptionItem {
  id?: number;
  sessionId: number;
  reference: string;
  ean?: string | null;
  designation: string;
  expectedQty: number; // Quantité attendue (sur facture / bon de commande fournisseur)
  receivedQty: number; // Quantité physiquement déchargée et comptée
  damagedQty?: number; // Pièces avariées / abîmées
  innerPackSize?: number | null; // e.g. 6 pcs (sous-paquet)
  outerPackSize?: number | null; // e.g. 48 pcs (carton)
  receivedCartons?: number; // e.g. 10 cartons
  receivedLooseUnits?: number; // e.g. 4 pièces en vrac
  warehouseZone?: string | null; // Macro-zone (ex: CH_NW)
  locationNote?: string | null; // Note de terrain (ex: "Sous la bâche", "Au sol")
  isNewProduct?: boolean; // Nouvel article intégré au catalogue
  category?: 'scolaire' | 'bureautique' | 'autre';
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

// --- Agent à Tourner, Échantillonnage Arrivage & Tarification Librairie El Feth ---

export type SampleDestination = 'showroom' | 'el_feth' | 'agent_tourner';
export type TransportabilityGrade = 'easily_transportable' | 'bulky_refused' | 'pending_evaluation';
export type SampleStatus = 'allocated' | 'given_to_agent' | 'returned' | 'priced_by_el_feth';

export interface ProductSampleAllocation {
  id?: number;
  productId?: number;
  reference: string;
  ean?: string | null;
  designation: string;
  category?: 'scolaire' | 'bureautique' | 'autre';
  receptionSessionId?: number | null;
  destination: SampleDestination; // 'showroom' (1x), 'el_feth' (1x), 'agent_tourner' (1x per chauffeur)
  assignedAgentName?: string | null; // e.g. "Yassine", "Djaber", "Showroom Dépôt", "Librairie El Feth"
  quantity: number; // default 1

  // Transportability Co-Decision (Manager + Preparateur)
  transportability: TransportabilityGrade;
  managerApproved: boolean;
  managerName?: string | null; // e.g. "Amine (Chef Dépôt)"
  consultedWorkerName?: string | null; // e.g. "Walid (Préparateur)"
  workerEvaluationNote?: string | null; // e.g. "Format trousse compacte, rentre dans la sacoche"

  // Status & Field Progression
  status: SampleStatus;

  // El Feth Reference Pricing & Market Assessment (Librairie Pilote & Décideur Prix)
  elFethWholesalePrice?: number | null; // Prix de gros suggéré en DA
  elFethRetailPrice?: number | null; // Prix public / détail conseillé en DA
  elFethMarketNote?: string | null; // Avis marché (ex: "Forte demande scolaire, rentrée imminente")
  elFethReviewedBy?: string | null;
  elFethReviewedAt?: string | null;

  // Commercial Driver Feedback from Client Shops (Tournée des Librairies)
  agentVendorFeedback?: string | null;

  allocatedAt: string;
  updatedAt: string;
}

// ============================================================
// --- B2B Wholesale, Commercial Reps, B2C Retail & Decision Support ---
// ============================================================

export type ClientType = 'grossiste' | 'librairie' | 'papeterie' | 'particulier';

export interface ClientAccount {
  id?: number;
  name: string; // Nom légal / Nom d'usage (ex: "Benali Grossiste Maraval")
  legalName?: string | null;
  phone?: string | null;
  wilaya?: string | null;
  wilayaCode?: string | null;
  address?: string | null;
  clientType: ClientType;
  creditLimit: number; // Plafond crédit autorisé en DA (ex: 500,000 DA)
  currentBalance: number; // Encours dû / Créance en DA (ex: 280,000 DA)
  tierDiscountPercent: number; // Remise habituelle accordée (ex: 3%, 5%)
  assignedRep?: string | null; // Commercial attitré (ex: "Yassine")
  lastOrderDate?: string | null;
  lastPaymentDate?: string | null;
  notes?: string | null;
  updatedAt: string;
}

export type OrderChannel = 'gros' | 'commercial' | 'detail';
export type OrderDraftStatus = 'draft' | 'validated' | 'transmitted_to_warehouse' | 'delivered';
export type PaymentStatus = 'unpaid' | 'partial' | 'paid';

export interface OrderItem {
  reference: string;
  designation: string;
  unitPrice: number; // Prix unitaire appliqué en DA
  quantity: number; // Nombre d'unités ou cartons commandés
  packSize?: number; // Conditionnement carton
  totalPrice: number; // unitPrice * quantity
  costPrice?: number; // Coût d'achat (pour calcul de marge)
}

export interface OrderDraft {
  id?: number;
  orderNumber: string; // e.g. "BC-2026-041"
  channel: OrderChannel; // 'gros' (B2B), 'commercial' (Terrain), 'detail' (B2C)
  clientName: string;
  clientPhone?: string | null;
  clientWilaya?: string | null;
  repName?: string | null; // Commercial ayant saisi la commande
  items: OrderItem[];
  totalUnits: number;
  subtotalAmount: number; // Total brut en DA
  discountPercent: number; // Remise appliquée (%)
  discountAmount: number; // Montant de remise en DA
  finalAmount: number; // Net à payer en DA
  estimatedMarginDa?: number; // Marge brute en DA (finalAmount - totalCost)
  estimatedMarginPercent?: number; // Taux de marge (%)
  status: OrderDraftStatus;
  paymentStatus: PaymentStatus;
  paidAmount: number; // Montant déjà encaissé en DA
  paymentMethod?: 'especes' | 'cheque' | 'virement' | 'a_terme' | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommercialPaymentCollection {
  id?: number;
  clientName: string;
  repName: string;
  amount: number; // Montant encaissé en DA
  paymentMethod: 'especes' | 'cheque' | 'virement';
  checkNumber?: string | null;
  notes?: string | null;
  collectedAt: string;
}

export type DecisionInsightType =
  | 'high_margin_golden'
  | 'volume_discount_threshold'
  | 'overdue_credit_warning'
  | 'smart_reassort_recommendation'
  | 'dead_stock_liquidation'
  | 'cash_collection_priority';

export interface DecisionSupportInsight {
  id: string;
  type: DecisionInsightType;
  title: string;
  description: string;
  potentialMoneyImpactDa?: number; // Gain financier direct ou économie en DA
  actionLabel?: string;
  urgency: 'high' | 'medium' | 'info';
  metadata?: Record<string, any>;
}




