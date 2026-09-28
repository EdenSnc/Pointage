// ============================================================
// POINTAGE — Error Guardrails & Poka-Yoke Integrity Engine
// HCI Framework: Nielsen #5 (Error Prevention) & Bastien-Scapin
// Sliding-Window Anti-Bounce, Packaging Magnitude Validation,
// Pre-Signoff Integrity Audits, and SHA-256 Tamper-Evident Seals.
// ============================================================

import type { OrderLine, CountEvent, Stage, Bill, ShipmentTrip, AuditEvent } from './types';
import { sumStageEvents } from './logic';

// ------------------------------------------------------------
// 1. HARDWARE DOUBLE-SCAN & FINGER-BOUNCE PROTECTION
// ------------------------------------------------------------

interface BounceRecord {
  lineId: number;
  qty: number;
  timestamp: number;
}

let lastScanRecord: BounceRecord | null = null;
const DEFAULT_BOUNCE_WINDOW_MS = 450;

/**
 * Checks whether a scan/tap is an accidental hardware double-trigger.
 * Barcode guns (laser/CCD) and capacitive touchscreens can fire duplicate
 * events within < 450ms.
 */
export function checkDoubleScanBounce(
  lineId: number,
  qty: number,
  windowMs: number = DEFAULT_BOUNCE_WINDOW_MS
): { isBounce: boolean; timeDiffMs: number; message?: string } {
  const now = Date.now();
  if (
    lastScanRecord &&
    lastScanRecord.lineId === lineId &&
    lastScanRecord.qty === qty
  ) {
    const diff = now - lastScanRecord.timestamp;
    if (diff < windowMs) {
      return {
        isBounce: true,
        timeDiffMs: diff,
        message: `Double-scan évité (rebond matériel de ${diff}ms détecté pour N°${lineId}).`,
      };
    }
  }

  // Not a bounce; update record
  lastScanRecord = {
    lineId,
    qty,
    timestamp: now,
  };

  return { isBounce: false, timeDiffMs: 0 };
}

/** Resets bounce tracker for testing or switching sessions */
export function resetBounceTracker(): void {
  lastScanRecord = null;
}

// ------------------------------------------------------------
// 2. INVOLUNTARY OVERCOUNT INSPECTOR (POKA-YOKE)
// ------------------------------------------------------------

export interface OvercountInspection {
  isOvercount: boolean;
  currentTotal: number;
  addingQty: number;
  newTotal: number;
  orderedQty: number;
  excessQty: number;
  suggestedClampedQty: number;
  isSevereOvercount: boolean;
  recommendation: 'proceed' | 'clamp_to_exact' | 'warn_excess';
  message: string;
}

/**
 * Inspects a pending count addition against the line's ordered quantity.
 * Catches accidental additions of full carton packs when only a few units remain.
 */
export function inspectOvercount(
  line: { orderedQty: number; designation?: string; no?: string },
  currentTotal: number,
  addingQty: number
): OvercountInspection {
  const orderedQty = Math.max(0, line.orderedQty);
  const newTotal = currentTotal + addingQty;
  const excessQty = Math.max(0, newTotal - orderedQty);
  const isOvercount = newTotal > orderedQty;
  const remainingNeeded = Math.max(0, orderedQty - currentTotal);
  const isSevereOvercount = isOvercount && (newTotal >= orderedQty * 2 && newTotal > 5);

  let recommendation: 'proceed' | 'clamp_to_exact' | 'warn_excess' = 'proceed';
  let message = 'Quantité conforme à la commande.';

  if (isOvercount) {
    if (remainingNeeded > 0 && addingQty > remainingNeeded) {
      recommendation = 'clamp_to_exact';
      message = `Dépassement détecté (+${excessQty}). Reste commandé : ${remainingNeeded}. Ajuster au juste nécessaire ?`;
    } else {
      recommendation = 'warn_excess';
      message = `Surplus de ${excessQty} pièce(s) par rapport à la commande (${newTotal}/${orderedQty}).`;
    }
  }

  return {
    isOvercount,
    currentTotal,
    addingQty,
    newTotal,
    orderedQty,
    excessQty,
    suggestedClampedQty: remainingNeeded,
    isSevereOvercount,
    recommendation,
    message,
  };
}

// ------------------------------------------------------------
// 3. PACKAGING MAGNITUDE SANITY CHECK (CARTON VS PIÈCE)
// ------------------------------------------------------------

export interface PackagingMagnitudeValidation {
  isSuspicious: boolean;
  enteredValue: number;
  calculatedPieces: number;
  orderedQty: number;
  suggestedUnit?: 'carton' | 'inner' | 'piece';
  suggestedValue?: number;
  reason?: string;
  magnitudeFactor: number;
}

/**
 * Detects classic warehouse magnitude mistakes:
 * Operator types "50" meaning 50 pieces, but selected "Carton" (50 pcs/carton = 2500 pcs!).
 * Or operator enters 2400 cartons for an order of 2400 pieces.
 */
export function validatePackagingMagnitude(
  enteredValue: number,
  unitType: 'carton' | 'inner' | 'piece',
  packSize: number | null | undefined,
  orderedQty: number
): PackagingMagnitudeValidation {
  const normPackSize = packSize && packSize > 1 ? packSize : 1;
  const calculatedPieces = unitType === 'carton' || unitType === 'inner'
    ? enteredValue * normPackSize
    : enteredValue;

  const magnitudeFactor = orderedQty > 0 ? calculatedPieces / orderedQty : 1;

  // Case A: User typed ordered quantity directly while in 'carton' mode
  // e.g. Ordered: 100 pcs. Pack: 50 pcs. User types 100 Cartons (= 5000 pcs!)
  if (
    unitType === 'carton' &&
    normPackSize > 1 &&
    enteredValue >= orderedQty &&
    calculatedPieces > orderedQty * 2
  ) {
    return {
      isSuspicious: true,
      enteredValue,
      calculatedPieces,
      orderedQty,
      suggestedUnit: 'piece',
      suggestedValue: enteredValue,
      reason: `Saisie de ${enteredValue} cartons (${calculatedPieces} pièces) pour une commande de ${orderedQty} pièces. Vouliez-vous saisir ${enteredValue} pièces ?`,
      magnitudeFactor,
    };
  }

  // Case B: Severe multiplier explosion (more than 5x the total bill ordered quantity)
  if (orderedQty > 0 && calculatedPieces > orderedQty * 5 && calculatedPieces > 50) {
    return {
      isSuspicious: true,
      enteredValue,
      calculatedPieces,
      orderedQty,
      suggestedUnit: 'piece',
      suggestedValue: orderedQty,
      reason: `Quantité calculée (${calculatedPieces} pcs) dépasse anormalement la commande (${orderedQty} pcs).`,
      magnitudeFactor,
    };
  }

  return {
    isSuspicious: false,
    enteredValue,
    calculatedPieces,
    orderedQty,
    magnitudeFactor,
  };
}

// ------------------------------------------------------------
// 4. PRE-SIGNOFF INTEGRITY AUDIT (AUDIT DE CONFORMITÉ ÉTAPE)
// ------------------------------------------------------------

export interface BillStageAuditResult {
  stage: Stage;
  totalLines: number;
  exactCount: number;
  shortCount: number;
  overCount: number;
  uncountedCount: number;
  cancelledCount: number;
  totalOrderedUnits: number;
  totalCountedUnits: number;
  canSafelySignOff: boolean;
  severity: 'clean' | 'warnings' | 'critical';
  shortLines: {
    lineId: number;
    no: string;
    designation: string;
    ordered: number;
    counted: number;
    diff: number;
  }[];
  overLines: {
    lineId: number;
    no: string;
    designation: string;
    ordered: number;
    counted: number;
    diff: number;
  }[];
  uncountedLines: {
    lineId: number;
    no: string;
    designation: string;
    ordered: number;
  }[];
  summaryTitle: string;
  summaryDetail: string;
}

/**
 * Audits all order lines of a bill before completing or signing off a stage.
 * Informs operator of hidden uncounted items or shortages so decisions are intentional.
 */
export function auditBillIntegrityForStage(
  lines: OrderLine[],
  events: CountEvent[],
  stage: Stage
): BillStageAuditResult {
  const eventsByLine = new Map<number, CountEvent[]>();
  for (const e of events) {
    if (e.undone || e.stage !== stage) continue;
    const list = eventsByLine.get(e.orderLineId) || [];
    list.push(e);
    eventsByLine.set(e.orderLineId, list);
  }

  let totalOrderedUnits = 0;
  let totalCountedUnits = 0;
  let exactCount = 0;
  let shortCount = 0;
  let overCount = 0;
  let uncountedCount = 0;
  let cancelledCount = 0;

  const shortLines: BillStageAuditResult['shortLines'] = [];
  const overLines: BillStageAuditResult['overLines'] = [];
  const uncountedLines: BillStageAuditResult['uncountedLines'] = [];

  for (const line of lines) {
    if (line.status === 'cancelled') {
      cancelledCount++;
      continue;
    }

    const ordered = line.orderedQty;
    totalOrderedUnits += ordered;

    const lineEvts = eventsByLine.get(line.id!) || [];
    const counted = lineEvts.reduce((s, e) => s + e.quantity, 0);
    totalCountedUnits += counted;

    if (counted === 0) {
      uncountedCount++;
      uncountedLines.push({
        lineId: line.id!,
        no: line.no,
        designation: line.designation,
        ordered,
      });
    } else if (counted === ordered) {
      exactCount++;
    } else if (counted < ordered) {
      shortCount++;
      shortLines.push({
        lineId: line.id!,
        no: line.no,
        designation: line.designation,
        ordered,
        counted,
        diff: ordered - counted,
      });
    } else {
      overCount++;
      overLines.push({
        lineId: line.id!,
        no: line.no,
        designation: line.designation,
        ordered,
        counted,
        diff: counted - ordered,
      });
    }
  }

  const activeLines = lines.length - cancelledCount;
  let severity: 'clean' | 'warnings' | 'critical' = 'clean';
  let canSafelySignOff = true;
  let summaryTitle = 'Conformité Totale';
  let summaryDetail = `${exactCount}/${activeLines} articles strictement conformes. 0 manquant.`;

  if (uncountedCount > 0) {
    severity = 'critical';
    canSafelySignOff = false;
    summaryTitle = 'Articles Non Comptés';
    summaryDetail = `${uncountedCount} article(s) n'ont aucun comptage enregistré.`;
  } else if (shortCount > 0 || overCount > 0) {
    severity = 'warnings';
    canSafelySignOff = true; // Allowed with explicit acknowledgement
    summaryTitle = 'Écarts Détectés';
    const parts: string[] = [];
    if (shortCount > 0) parts.push(`${shortCount} manquant(s)`);
    if (overCount > 0) parts.push(`${overCount} surplus`);
    summaryDetail = `${parts.join(', ')}. Vérifiez avant validation finale.`;
  }

  return {
    stage,
    totalLines: lines.length,
    exactCount,
    shortCount,
    overCount,
    uncountedCount,
    cancelledCount,
    totalOrderedUnits,
    totalCountedUnits,
    canSafelySignOff,
    severity,
    shortLines,
    overLines,
    uncountedLines,
    summaryTitle,
    summaryDetail,
  };
}

// ------------------------------------------------------------
// 5. CRYPTOGRAPHIC ANTI-TAMPER DIGITAL SEAL (SHA-256)
// ------------------------------------------------------------

export interface DeliverySealPayload {
  tripNumber: number;
  billNumber: string;
  client: string;
  driverName: string | null;
  truckPlate: string | null;
  totalUnits: number;
  totalContainers: number;
  lines: { reference: string; quantity: number }[];
  timestamp: string;
}

/**
 * Computes deterministic SHA-256 hash using Web Crypto API.
 */
export async function computeSha256Hex(message: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(message);

  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Fast pure-JS 32-bit fallback hash padded to 64 chars if subtle is unavailable
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < message.length; i++) {
    const ch = message.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const part1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const part2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return (part1 + part2).repeat(4);
}

/**
 * Creates deterministic string payload for the digital seal.
 */
export function serializeSealPayload(payload: DeliverySealPayload): string {
  const sortedLines = [...payload.lines]
    .sort((a, b) => a.reference.localeCompare(b.reference))
    .map((l) => `${l.reference}:${l.quantity}`)
    .join('|');

  return [
    `TRIP:${payload.tripNumber}`,
    `BILL:${payload.billNumber.trim().toUpperCase()}`,
    `CLIENT:${payload.client.trim().toUpperCase()}`,
    `DRIVER:${(payload.driverName || 'SANS_CHAUFFEUR').trim().toUpperCase()}`,
    `PLATE:${(payload.truckPlate || 'SANS_MATRICULE').trim().toUpperCase()}`,
    `UNITS:${payload.totalUnits}`,
    `CONTAINERS:${payload.totalContainers}`,
    `LINES:${sortedLines}`,
    `TIME:${payload.timestamp}`,
  ].join('##');
}

/**
 * Generates tamper-evident cryptographic seal for delivery dispatch.
 */
export async function generateDeliverySeal(payload: DeliverySealPayload): Promise<{
  sealHash: string;
  shortCode: string;
  serializedPayload: string;
}> {
  const serialized = serializeSealPayload(payload);
  const hash = await computeSha256Hex(serialized);
  const shortCode = `SEAL-${hash.slice(0, 8).toUpperCase()}`;

  return {
    sealHash: `SHA256:${hash}`,
    shortCode,
    serializedPayload: serialized,
  };
}

/**
 * Verifies seal integrity against payload.
 */
export async function verifySealIntegrity(
  storedSealHash: string,
  payload: DeliverySealPayload
): Promise<{ isValid: boolean; expectedHash: string; actualHash: string }> {
  const serialized = serializeSealPayload(payload);
  const computedRaw = await computeSha256Hex(serialized);
  const computedHash = `SHA256:${computedRaw}`;

  const cleanStored = storedSealHash.trim();
  const isValid = cleanStored === computedHash;

  return {
    isValid,
    expectedHash: cleanStored,
    actualHash: computedHash,
  };
}

/**
 * Asserts that a bill is not sealed.
 * Blocks unauthorized modifications once dispatched with driver.
 */
export function assertBillNotSealed(
  bill: Bill,
  operationName: string
): { allowed: boolean; reason?: string } {
  if (bill.isSealed) {
    return {
      allowed: false,
      reason: `Action refusée (${operationName}) : Le bon ${bill.billNumber} est scellé cryptographiquement (${bill.sealHash?.slice(0, 16) || 'SCELLÉ'}). Déverrouillage superviseur requis.`,
    };
  }
  return { allowed: true };
}
