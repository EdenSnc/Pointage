// ============================================================
// POINTAGE — Pure quantity arithmetic (no dependencies)
// ============================================================

import { CountEvent, PointageOutcome, Stage, OrderLine, LineDiscrepancy, StageTotals } from './types';

/**
 * Calculate batch quantity from packaging counts.
 */
export function calcBatchQty(
  outerCount: number,
  innerCount: number,
  loose: number,
  outerPackSize: number | null,
  innerPackSize: number | null
): number {
  const outer = outerPackSize ? outerCount * outerPackSize : 0;
  const inner = innerPackSize ? innerCount * innerPackSize : 0;
  return outer + inner + loose;
}

/**
 * Sum active count events for a specific stage.
 */
export function sumStageEvents(events: CountEvent[], stage: Stage): number {
  return events
    .filter(e => e.stage === stage && !e.undone)
    .reduce((sum, e) => sum + e.quantity, 0);
}

/**
 * Sum count events by outcome for pointage stage.
 */
export function sumByOutcome(events: CountEvent[]): Record<PointageOutcome, number> {
  const result: Record<PointageOutcome, number> = {
    accepted: 0,
    damaged_accepted: 0,
    damaged_refused: 0,
    refused: 0,
  };
  for (const e of events) {
    if (e.stage === 'pointage' && !e.undone && e.outcome) {
      result[e.outcome] += e.quantity;
    }
  }
  return result;
}

/**
 * Get stage totals including breakdown by outcome.
 */
export function getStageTotals(events: CountEvent[], stage: Stage): StageTotals {
  const stageEvents = events.filter(e => e.stage === stage && !e.undone);
  const total = stageEvents.reduce((s, e) => s + e.quantity, 0);
  const byOutcome = sumByOutcome(stageEvents);
  return { total, byOutcome };
}

/**
 * Calculate discrepancy for a line at a given stage.
 */
export function calcDiscrepancy(
  line: OrderLine,
  stageTotal: number
): LineDiscrepancy {
  const expected = line.orderedQty;
  const counted = stageTotal;
  const diff = expected - counted;
  const isModified = line.orderedQty !== line.originalOrderedQty;

  return {
    expected,
    counted,
    remaining: diff > 0 ? diff : 0,
    over: diff < 0 ? Math.abs(diff) : 0,
    isExact: diff === 0,
    isShort: diff > 0,
    isOver: diff < 0,
    isModified,
  };
}

/**
 * Calculate how many full packs and loose from a total.
 * Safe against NaN, null, and negative values.
 */
export function calcPackBreakdown(
  total: number,
  packSize: number | null
): { fullPacks: number; loose: number } {
  if (!packSize || isNaN(packSize) || packSize <= 1 || isNaN(total) || total < 0) {
    return { fullPacks: 0, loose: isNaN(total) ? 0 : Math.max(0, total) };
  }
  return {
    fullPacks: Math.floor(total / packSize),
    loose: total % packSize,
  };
}

/**
 * Round down quantity to nearest complete pack size.
 * e.g. ordered 32, pack size 5 -> { servedQty: 30, missingQty: 2 }
 * e.g. ordered 32, pack size 12 -> { servedQty: 24, missingQty: 8 }
 */
export function roundDownToPack(
  orderedQty: number,
  packSize: number | null
): { servedQty: number; missingQty: number } {
  if (!packSize || isNaN(packSize) || packSize <= 1 || isNaN(orderedQty) || orderedQty <= 0) {
    return { servedQty: Math.max(0, orderedQty || 0), missingQty: 0 };
  }
  const fullPacks = Math.floor(orderedQty / packSize);
  const servedQty = fullPacks * packSize;
  const missingQty = orderedQty - servedQty;
  return { servedQty, missingQty };
}

export interface PackRecommendation {
  packSize: number;
  targetQty: number;
  isExactMultiple: boolean;
  lowerPacks: number;
  lowerQty: number;
  lowerDiff: number; // e.g. -6
  upperPacks: number;
  upperQty: number;
  upperDiff: number; // e.g. +24 or +5
  closestPacks: number;
  closestQty: number;
  closestDiff: number;
  closestAction: 'round_down' | 'round_up' | 'exact';
  recommendationLabel: string;
}

/**
 * Wholesale Packaging Nearest-Pack Optimizer ("Au plus proche")
 * Rule: Wholesalers avoid opening sealed packages. When an order quantity does not match
 * an exact multiple of the pack size:
 * - If remaining loose units are closer to lower full pack: round DOWN (e.g. 96 with pack of 30 -> 90, -6 loose removed).
 * - If remaining loose units are closer to upper full pack: round UP (e.g. 115 with pack of 30 -> 120, +5 added to complete pack).
 */
export function calcClosestPackRecommendation(
  targetQty: number,
  packSize: number | null | undefined
): PackRecommendation | null {
  if (!packSize || isNaN(packSize) || packSize <= 1 || isNaN(targetQty) || targetQty <= 0) {
    return null;
  }

  const remainder = targetQty % packSize;
  const lowerPacks = Math.floor(targetQty / packSize);
  const lowerQty = lowerPacks * packSize;
  const lowerDiff = lowerQty - targetQty; // <= 0

  if (remainder === 0) {
    return {
      packSize,
      targetQty,
      isExactMultiple: true,
      lowerPacks,
      lowerQty,
      lowerDiff: 0,
      upperPacks: lowerPacks,
      upperQty: targetQty,
      upperDiff: 0,
      closestPacks: lowerPacks,
      closestQty: targetQty,
      closestDiff: 0,
      closestAction: 'exact',
      recommendationLabel: `${lowerPacks} Colis (${packSize} pcs) = ${targetQty} pcs (Multiple exact)`,
    };
  }

  const upperPacks = lowerPacks + 1;
  const upperQty = upperPacks * packSize;
  const upperDiff = upperQty - targetQty; // > 0

  const distDown = remainder; // distance to lower multiple
  const distUp = upperDiff;   // distance to upper multiple

  // Rule: go for the closest one. In case of exact tie (distDown === distUp), round down.
  const isDownClosest = distDown <= distUp;

  const closestPacks = isDownClosest ? lowerPacks : upperPacks;
  const closestQty = isDownClosest ? lowerQty : upperQty;
  const closestDiff = isDownClosest ? lowerDiff : upperDiff;
  const closestAction: 'round_down' | 'round_up' = isDownClosest ? 'round_down' : 'round_up';

  const label = isDownClosest
    ? `${lowerPacks} Colis (${lowerQty} pcs) recommandés (${lowerDiff} pcs)`
    : `${upperPacks} Colis (${upperQty} pcs) recommandés (+${upperDiff} pcs)`;

  return {
    packSize,
    targetQty,
    isExactMultiple: false,
    lowerPacks,
    lowerQty,
    lowerDiff,
    upperPacks,
    upperQty,
    upperDiff,
    closestPacks,
    closestQty,
    closestDiff,
    closestAction,
    recommendationLabel: label,
  };
}

/**
 * Check if a line should block stage completion.
 */
export function lineBlocksCompletion(line: OrderLine): boolean {
  return line.status === 'active' || line.status === 'not_found';
}

/**
 * Evaluate problematic lines decoupled by stage.
 * In Préparation: only check preparation issues (unprepared, short, over, out_of_stock, not_found).
 * In Chargement: only check chargement vs preparation.
 * In Pointage: only check pointage vs chargement / damaged / refused.
 */
export function getStageProblemLines(
  lines: OrderLine[],
  eventsByLine: Map<number, CountEvent[]>,
  currentStage: Stage | 'auto' = 'auto'
): OrderLine[] {
  let targetStage: Stage = 'preparation';
  if (currentStage === 'auto') {
    let hasPointage = false;
    let hasChargement = false;
    for (const [_, evts] of eventsByLine) {
      if (evts.some(e => e.stage === 'pointage' && !e.undone)) hasPointage = true;
      if (evts.some(e => e.stage === 'chargement' && !e.undone)) hasChargement = true;
    }
    if (hasPointage) targetStage = 'pointage';
    else if (hasChargement) targetStage = 'chargement';
    else targetStage = 'preparation';
  } else {
    targetStage = currentStage;
  }

  const billHasLoadEvents = Array.from(eventsByLine.values()).some((arr) =>
    arr.some((e) => e.stage === 'chargement' && !e.undone)
  );
  const billHasPrepEvents = Array.from(eventsByLine.values()).some((arr) =>
    arr.some((e) => e.stage === 'preparation' && !e.undone)
  );

  return lines.filter((line) => {
    if (line.status === 'out_of_stock' || line.status === 'not_found' || line.status === 'cancelled') {
      return true;
    }
    const evts = eventsByLine.get(line.id!) || [];
    const prepTotal = sumStageEvents(evts, 'preparation');
    const loadTotal = sumStageEvents(evts, 'chargement');

    if (targetStage === 'preparation') {
      const disc = calcDiscrepancy(line, prepTotal);
      return !disc.isExact || line.orderedQty !== line.originalOrderedQty;
    }

    if (targetStage === 'chargement') {
      return loadTotal !== prepTotal;
    }

    if (targetStage === 'pointage') {
      const totals = getStageTotals(evts, 'pointage');
      const hasDamageOrRefusal =
        totals.byOutcome.damaged_accepted > 0 ||
        totals.byOutcome.damaged_refused > 0 ||
        totals.byOutcome.refused > 0;

      // Determine the legitimate logistical baseline:
      // If chargement occurred on the bill, pointage verifies what was loaded.
      // If only preparation occurred, pointage verifies what was prepared.
      // If neither occurred (direct reception at store surface), pointage verifies against orderedQty.
      const referenceQty = billHasLoadEvents
        ? loadTotal
        : billHasPrepEvents
        ? prepTotal
        : line.orderedQty;

      return totals.total !== referenceQty || hasDamageOrRefusal;
    }

    return false;
  });
}

/**
 * Compute bill stage progress as fraction.
 */
export function calcBillProgress(
  lines: OrderLine[],
  eventsByLine: Map<number, CountEvent[]>,
  stage: Stage
): { done: number; total: number; percent: number } {
  const activeLines = lines.filter(l => l.status === 'active');
  let done = 0;
  for (const line of activeLines) {
    const events = eventsByLine.get(line.id!) || [];
    const stageTotal = sumStageEvents(events, stage);
    if (stageTotal >= line.orderedQty && line.orderedQty > 0) {
      done++;
    }
  }
  const total = activeLines.length;
  return {
    done,
    total,
    percent: total > 0 ? Math.round((done / total) * 100) : 0,
  };
}

/**
 * Generate compound reference aliases.
 * For "70380/84" -> ["70380", "70381", "70382", "70383", "70384"]
 * Conservative: only for simple numeric/suffix patterns.
 */
export function generateReferenceAliases(reference: string | null): string[] {
  if (!reference) return [];
  const aliases: string[] = [];
  const seen = new Set<string>();

  const add = (alias: string) => {
    const a = alias.trim();
    if (a && a !== reference && !seen.has(a.toLowerCase())) {
      seen.add(a.toLowerCase());
      aliases.push(a);
    }
  };

  // Pattern: Optional prefix + "NNNNN/NN" where suffix is a small range end (e.g. 70380/84 or ST-900/94)
  const rangeMatch = reference.match(/^([A-Za-z0-9_-]*?)(\d+)\/(\d{1,3})$/);
  if (rangeMatch) {
    const prefix = rangeMatch[1];
    const baseStr = rangeMatch[2];
    const suffixStr = rangeMatch[3];
    const base = parseInt(baseStr, 10);
    const suffix = parseInt(suffixStr, 10);

    const suffixLen = suffixStr.length;
    const baseSuffix = base % Math.pow(10, suffixLen);

    if (suffix > baseSuffix && (suffix - baseSuffix) <= 20) {
      for (let i = base; i <= base + (suffix - baseSuffix); i++) {
        if (prefix) {
          add(prefix + i.toString());
        }
        add(i.toString());
      }
    }
    return aliases;
  }

  // Space-separated tokens: index numeric tokens
  if (reference.includes(' ')) {
    const tokens = reference.split(/\s+/);
    for (const token of tokens) {
      if (/^\d+$/.test(token)) {
        add(token);
      }
    }
  }

  // If reference has hyphen, index without hyphen (e.g. "CL-500" -> "CL500", "500")
  if (reference.includes('-')) {
    const cleaned = reference.replace(/-/g, '');
    if (cleaned) add(cleaned);
    const numTokens = reference.match(/\d+/g);
    if (numTokens) {
      for (const t of numTokens) {
        if (t.length >= 2) add(t);
      }
    }
  }

  return aliases;
}

/**
 * Check if search query matches a line (for SMART mode).
 * Returns a priority score (lower = better match). -1 = no match.
 */
export function smartSearchScore(
  line: OrderLine,
  query: string,
  billId?: number
): number {
  const q = query.trim().toLowerCase();
  if (!q) return -1;

  // Normalized alphanumeric query (handles spaces, slashes, hyphens)
  const cleanQ = q.replace(/[^a-z0-9]/gi, '');

  // 1. exact current reference
  if (line.reference?.toLowerCase() === q) return 1;
  // 2. exact original reference
  if (line.originalReference?.toLowerCase() === q) return 2;
  // 3. exact N° in selected bill (or global)
  if (line.no === q) {
    return (billId !== undefined && line.billId === billId) ? 3 : 3.1;
  }
  // 4. exact current EAN
  if (line.ean?.toLowerCase() === q) return 4;
  // 5. exact original EAN
  if (line.originalEan?.toLowerCase() === q) return 5;
  // 6. reference aliases
  if (line.referenceAliases.some(a => a.toLowerCase() === q)) return 6;
  // 7. partial reference match (contains query or clean alphanumeric substring)
  if (
    line.reference?.toLowerCase().includes(q) ||
    line.originalReference?.toLowerCase().includes(q) ||
    (cleanQ.length >= 2 && (
      (line.reference && line.reference.toLowerCase().replace(/[^a-z0-9]/gi, '').includes(cleanQ)) ||
      (line.originalReference && line.originalReference.toLowerCase().replace(/[^a-z0-9]/gi, '').includes(cleanQ))
    ))
  ) return 7;
  // 7.5. partial barcode / EAN match (contains query or clean numeric substring, e.g. last 4 digits)
  if (
    (q.length >= 3 && (line.ean?.toLowerCase().includes(q) || line.originalEan?.toLowerCase().includes(q))) ||
    (cleanQ.length >= 3 && (
      (line.ean && line.ean.replace(/[^a-z0-9]/gi, '').includes(cleanQ)) ||
      (line.originalEan && line.originalEan.replace(/[^a-z0-9]/gi, '').includes(cleanQ))
    ))
  ) return 7.5;

  // 7.8. ITF-14 Carton barcode match (14-digit carton barcode matching 13-digit child EAN)
  if (cleanQ.length === 14) {
    const core12 = cleanQ.slice(1, 13);
    const lineEan12 = (line.ean || line.originalEan || '').replace(/[^0-9]/g, '').slice(0, 12);
    if (lineEan12 && lineEan12 === core12) {
      return 4.2;
    }
  }

  // 8. partial designation match
  if (line.designation.toLowerCase().includes(q)) return 8;

  return -1;
}

// Common units of measurement and non-packaging dimensions in product descriptions:
// e.g. "30 CM", "15 MM", "50 M", "80 G", "240 GR", "1 KG", "50 ML", "75 CL", "1 L", "96 PAGES", "100 F", "80 MICRONS", "12 V", "5000 MAH"
export const MEASUREMENT_UNIT_PATTERN = /^(?:cm|mm|m\b|km|gr?|grammes?|kg|kilos?|mg|oz|lbs?|ml|cl|dl|litres?|l\b|pages?|feuilles?|p\b|f\b|microns?|µm|µ|gsm|g\/m2|volts?|v\b|watts?|w\b|mah|ah|hz|khz|mhz|pouces?|inch(?:es)?|"|'|°|deg|degres?|ans?|mois|jours?|heures?|h\b|min\b|sec\b)/i;

/**
 * Returns true if a number in a designation is followed by a unit of measurement.
 */
export function isDimensionInDesignation(num: number, designation?: string | null): boolean {
  if (!designation || typeof designation !== 'string') return false;
  const regex = new RegExp(`\\b${num}\\s*(?:cm|mm|m\\b|km|gr?|grammes?|kg|ml|cl|dl|litres?|l\\b|pages?|feuilles?|microns?|µm|volts?|v\\b|watts?|w\\b|mah|ah|hz|pouces?|"|'|°|deg)`, 'i');
  return regex.test(designation);
}

/**
 * Automatically parse packaging sizes from raw document strings or designations.
 * e.g. "18 (3x6)" -> { outerPackSize: 18, innerPackSize: 6 }
 * e.g. "3*6" or "3x6" -> { outerPackSize: 18, innerPackSize: 6 }
 * e.g. "2CT/10" -> { outerPackSize: 10, innerPackSize: null }
 * e.g. "1CT/50" -> { outerPackSize: 50, innerPackSize: null }
 * e.g. "CT 24" or "Carton 24" -> { outerPackSize: 24, innerPackSize: null }
 * e.g. "PEINTURE PANDA DE 12" -> { outerPackSize: null, innerPackSize: 12 }
 * e.g. "PRESENTOIR 36 PCS" -> { outerPackSize: null, innerPackSize: 36 }
 */
export function parsePackagingString(
  raw: string | null | undefined,
  designation?: string | null
): { outerPackSize: number | null; innerPackSize: number | null } {
  let outer: number | null = null;
  let inner: number | null = null;

  if (raw && typeof raw === 'string') {
    const s = raw.trim();

    // 1. Pattern: "18 (3x6)" or "18(3*6)" or "18 (3 x 6)"
    const totalWithBreakdown = s.match(/^(\d+)\s*\(\s*(\d+)\s*[x*×]\s*(\d+)\s*\)$/i);
    if (totalWithBreakdown) {
      outer = parseInt(totalWithBreakdown[1], 10);
      inner = parseInt(totalWithBreakdown[3], 10);
      return { outerPackSize: outer > 0 ? outer : null, innerPackSize: inner > 0 ? inner : null };
    }

    // 2. Pattern: "3x6" or "3*6" or "3 x 6"
    const multMatch = s.match(/^(\d+)\s*[x*×]\s*(\d+)$/i);
    if (multMatch) {
      const a = parseInt(multMatch[1], 10);
      const b = parseInt(multMatch[2], 10);
      outer = a * b;
      inner = b;
      return { outerPackSize: outer > 0 ? outer : null, innerPackSize: inner > 0 ? inner : null };
    }

    // 3. Pattern: "2CT/10" or "1CT/50" or "3CT/24" (CT = carton)
    const ctMatch = s.match(/\d*\s*CT\s*[\/:x*]\s*(\d+)/i);
    if (ctMatch) {
      outer = parseInt(ctMatch[1], 10);
      return { outerPackSize: outer > 0 ? outer : null, innerPackSize: null };
    }

    // 4. Pattern: "CT 24" or "CT24" or "Carton 24" or "Carton de 24"
    const cartonMatch = s.match(/(?:carton|colis|ct)\s*(?:de)?\s*(\d+)/i);
    if (cartonMatch) {
      outer = parseInt(cartonMatch[1], 10);
      return { outerPackSize: outer > 0 ? outer : null, innerPackSize: null };
    }

    // 5. Pattern: "/ 24" or "/24"
    const slashMatch = s.match(/^\/\s*(\d+)$/);
    if (slashMatch) {
      outer = parseInt(slashMatch[1], 10);
      return { outerPackSize: outer > 0 ? outer : null, innerPackSize: null };
    }

    // 6. Simple single number "24" or "50"
    const numOnly = s.match(/^(\d+)$/);
    if (numOnly) {
      const n = parseInt(numOnly[1], 10);
      if (n > 1) {
        outer = n;
        return { outerPackSize: outer, innerPackSize: null };
      }
    }
  }

  // Check designation (e.g. "PEINTURE PANDA DE 12 34140" or "PRESENTOIR 36 PCS 81216")
  if (designation && typeof designation === 'string') {
    const d = designation.trim();

    // 1. Explicit pieces / units suffix: "36 PCS", "24 PIÈCES", "100 UNITÉS"
    const pcsMatch = d.match(/\b(\d+)\s*(?:pcs|pièces|pieces|unités|unites)\b/i);
    if (pcsMatch) {
      const n = parseInt(pcsMatch[1], 10);
      if (n > 1 && n <= 1000) {
        inner = n;
      }
    }

    // 2. Packaging container keywords: "PACK DE 12", "BOITE DE 24", "LOT DE 6", "PRESENTOIR DE 36", "SACHET DE 50", etc.
    if (!inner) {
      const packKeywordMatch = d.match(
        /\b(?:pack|boite|bte|bt|présentoir|presentoir|carton|ct|sachet|sac|paquet|pqt|blister|blist|lot|set)\s*(?:de)?\s*(\d+)\b/i
      );
      if (packKeywordMatch) {
        const afterNum = d.slice(packKeywordMatch.index! + packKeywordMatch[0].length).trim();
        // Disqualify if followed by measurement unit (e.g. "boite de 30 cm")
        if (!MEASUREMENT_UNIT_PATTERN.test(afterNum)) {
          const n = parseInt(packKeywordMatch[1], 10);
          if (n > 1 && n <= 1000) {
            inner = n;
          }
        }
      }
    }

    // 3. Fallback generic "DE (\d+)" (e.g. "PEINTURE PANDA DE 12 34140")
    // STRICT REQUIREMENT: MUST NOT be followed by a unit of measurement (e.g. "REGLE DE 30 CM")!
    if (!inner) {
      const deMatch = d.match(/\bde\s*(\d+)\b/i);
      if (deMatch) {
        const afterNum = d.slice(deMatch.index! + deMatch[0].length).trim();
        if (!MEASUREMENT_UNIT_PATTERN.test(afterNum)) {
          const n = parseInt(deMatch[1], 10);
          if (n > 1 && n <= 1000) {
            inner = n;
          }
        }
      }
    }
  }

  return {
    outerPackSize: outer && outer > 1 ? outer : null,
    innerPackSize: inner && inner > 1 ? inner : null,
  };
}

// ============================================================
// OFFLINE QR CODE MULTI-PHONE MERGE PAYLOAD
// ============================================================

export interface QRSyncCountItem {
  no: string;
  ref?: string | null;
  stage: Stage;
  qty: number;
  container?: string | null;
  outcome?: PointageOutcome | null;
  note?: string | null;
}

export interface QRSyncPayload {
  ptg: 1; // Magic header for Pointage
  billNumber?: string;
  client?: string;
  ts: number;
  counts: QRSyncCountItem[];
}

/**
 * Serialize bill count events into a compact JSON string for QR Code display.
 */
export function serializeCountsForQR(
  billNumber: string,
  client: string,
  lines: OrderLine[],
  events: CountEvent[],
  containerMap: Map<number, string>
): string {
  const lineMap = new Map<number, OrderLine>();
  for (const l of lines) {
    if (l.id) lineMap.set(l.id, l);
  }

  const counts: QRSyncCountItem[] = [];

  // Group non-undone count events
  for (const e of events) {
    if (e.undone || e.quantity <= 0) continue;
    const line = lineMap.get(e.orderLineId);
    if (!line) continue;

    counts.push({
      no: line.no,
      ref: line.reference || undefined,
      stage: e.stage,
      qty: e.quantity,
      container: e.containerId ? containerMap.get(e.containerId) || undefined : undefined,
      outcome: e.outcome || undefined,
      note: e.refusalNote || undefined,
    });
  }

  // Deterministic timestamp: use the latest count event's timestamp so the QR code
  // remains completely static and identical unless an actual count is modified.
  const latestEventTs = events
    .filter(e => !e.undone && e.createdAt)
    .reduce((max, e) => {
      const t = new Date(e.createdAt).getTime();
      return Math.max(max, isNaN(t) ? 0 : t);
    }, 0);

  const payload: QRSyncPayload = {
    ptg: 1,
    billNumber,
    client,
    ts: latestEventTs,
    counts,
  };

  return JSON.stringify(payload);
}

/**
 * Validate and parse a QR Code string into a QRSyncPayload.
 */
export function parseQRSyncPayload(str: string): QRSyncPayload | null {
  try {
    const data = JSON.parse(str);
    if (data && data.ptg === 1 && Array.isArray(data.counts)) {
      return data as QRSyncPayload;
    }
  } catch {}
  return null;
}

export interface QRMergeItemPreview {
  lineId: number;
  lineNo: string;
  designation: string;
  reference?: string | null;
  stage: Stage;
  incomingQty: number;
  currentStageQty: number;
  newStageQty: number;
  containerName?: string | null;
  outcome?: PointageOutcome | null;
  note?: string | null;
}

export interface QRMergePlan {
  totalItems: number;
  totalQtyAdded: number;
  matchedLinesCount: number;
  unmatchedItemsCount: number;
  items: QRMergeItemPreview[];
  unmatched: QRSyncCountItem[];
}

/**
 * Pure calculation to plan and preview a merge of offline QR counts into an existing bill.
 */
export function planQRMerge(
  billLines: OrderLine[],
  existingEvents: CountEvent[],
  payload: QRSyncPayload,
  mode: 'add' | 'replace' = 'add'
): QRMergePlan {
  const linesByNo = new Map<string, OrderLine>();
  const linesByRef = new Map<string, OrderLine>();

  for (const line of billLines) {
    if (line.no) linesByNo.set(String(line.no).trim().toLowerCase(), line);
    if (line.reference) linesByRef.set(line.reference.trim().toLowerCase(), line);
  }

  const currentStageTotals = new Map<string, number>();
  for (const e of existingEvents) {
    if (e.undone) continue;
    const key = `${e.orderLineId}_${e.stage}`;
    currentStageTotals.set(key, (currentStageTotals.get(key) || 0) + e.quantity);
  }

  const items: QRMergeItemPreview[] = [];
  const unmatched: QRSyncCountItem[] = [];
  let totalQtyAdded = 0;

  for (const countItem of payload.counts) {
    if (!countItem || countItem.qty <= 0) continue;

    const noKey = String(countItem.no || '').trim().toLowerCase();
    const refKey = (countItem.ref || '').trim().toLowerCase();

    const line = linesByNo.get(noKey) || (refKey ? linesByRef.get(refKey) : undefined);

    if (!line || !line.id) {
      unmatched.push(countItem);
      continue;
    }

    const key = `${line.id}_${countItem.stage}`;
    const currentQty = currentStageTotals.get(key) || 0;

    let incomingQty = countItem.qty;
    let newQty = currentQty + incomingQty;

    if (mode === 'replace') {
      const delta = countItem.qty - currentQty;
      incomingQty = delta;
      newQty = countItem.qty;
    }

    if (incomingQty !== 0 || mode === 'replace') {
      items.push({
        lineId: line.id,
        lineNo: line.no,
        designation: line.designation,
        reference: line.reference,
        stage: countItem.stage,
        incomingQty,
        currentStageQty: currentQty,
        newStageQty: newQty,
        containerName: countItem.container,
        outcome: countItem.outcome,
        note: countItem.note,
      });

      if (incomingQty > 0) {
        totalQtyAdded += incomingQty;
      }
      currentStageTotals.set(key, newQty);
    }
  }

  return {
    totalItems: payload.counts.length,
    totalQtyAdded,
    matchedLinesCount: items.length,
    unmatchedItemsCount: unmatched.length,
    items,
    unmatched,
  };
}

/**
 * Automatically select the standard/normal (1x) rear camera,
 * discarding any 0.5x Ultra-Wide, wide-angle, macro, or front-facing cameras.
 */
export interface BackCameraInfo {
  deviceId: string;
  label: string;
  isLikely1x: boolean;
  cleanName: string;
}

/**
 * Automatically select the standard/normal (1x) rear camera.
 * STRICT RULE: Capteur 2 (index 1 of rear cameras) is the physical 1x main camera.
 * Capteur 1 (index 0 of rear cameras) is the 0.5x ultra-wide lens and must NEVER be used!
 */
export function findNormalBackCamera(
  devices: Array<{ deviceId: string; label: string; kind?: string }>
): string | null {
  const videoDevs = devices.filter(d => !d.kind || d.kind === 'videoinput');
  if (videoDevs.length === 0) return null;

  // 1. Filter out front/selfie cameras
  const backDevs = videoDevs.filter(d => {
    const lbl = (d.label || '').toLowerCase();
    return (
      !lbl.includes('front') &&
      !lbl.includes('avant') &&
      !lbl.includes('selfie') &&
      !lbl.includes('user')
    );
  });

  const candidates = backDevs.length > 0 ? backDevs : videoDevs;
  if (candidates.length === 1) return candidates[0].deviceId;

  // 2. When 2 or more rear cameras are present:
  // Capteur 1 (candidates[0]) is the 0.5x ultra-wide sensor and must NEVER be used.
  // Capteur 2 (candidates[1]) is the physical 1x main camera.
  const nonCapteur1Pool = candidates.slice(1);

  // Look first for explicit camera2 2 or main or standard
  const explicitMain = nonCapteur1Pool.find(d => {
    const lbl = (d.label || '').toLowerCase();
    return (
      lbl.includes('camera2 2') ||
      lbl.includes('camera 2') ||
      lbl.includes('main') ||
      lbl.includes('standard') ||
      lbl.includes('primary') ||
      lbl.includes('1x') ||
      lbl.includes('principal')
    );
  });
  if (explicitMain) return explicitMain.deviceId;

  // Discard macro/depth/virtual if other non-Capteur-1 candidates exist
  const usablePool = nonCapteur1Pool.filter(d => {
    const lbl = (d.label || '').toLowerCase();
    return !lbl.includes('macro') && !lbl.includes('depth') && !lbl.includes('bokeh');
  });

  if (usablePool.length > 0) {
    return usablePool[0].deviceId;
  }

  // Capteur 2 is candidates[1]
  return candidates[1].deviceId;
}

/**
 * Returns available rear cameras for the camera switch controller.
 * Excludes Capteur 1 when multiple rear cameras exist, ensuring Capteur 2 is used exclusively.
 */
export function getAvailableBackCameras(
  devices: Array<{ deviceId: string; label: string; kind?: string }>
): BackCameraInfo[] {
  const videoDevs = devices.filter(d => !d.kind || d.kind === 'videoinput');
  const backDevs = videoDevs.filter(d => {
    const lbl = (d.label || '').toLowerCase();
    return (
      !lbl.includes('front') &&
      !lbl.includes('avant') &&
      !lbl.includes('selfie') &&
      !lbl.includes('user')
    );
  });

  if (backDevs.length === 0) return [];

  const normalId = findNormalBackCamera(devices);

  // If 2 or more rear cameras exist, Capteur 1 (index 0) is the 0.5x ultra-wide lens.
  // We strictly exclude Capteur 1 so the scanner NEVER lands on it or cycles to it!
  if (backDevs.length >= 2) {
    return backDevs.slice(1).map((d, sliceIndex) => {
      const originalIndex = sliceIndex + 1; // 1-indexed: Capteur 2, Capteur 3...
      const isMain = d.deviceId === normalId || sliceIndex === 0;
      let cleanName = `Capteur ${originalIndex + 1}`;
      const l = (d.label || '').toLowerCase();
      if (isMain) {
        cleanName = `Capteur ${originalIndex + 1} (Principal 1×)`;
      } else if (l.includes('macro')) {
        cleanName = `Capteur ${originalIndex + 1} (Macro)`;
      } else if (l.includes('tele') || l.includes('zoom')) {
        cleanName = `Capteur ${originalIndex + 1} (Téléobjectif)`;
      }
      return {
        deviceId: d.deviceId,
        label: d.label || `Caméra ${originalIndex + 1}`,
        isLikely1x: isMain,
        cleanName,
      };
    });
  }

  // Sole rear camera on budget/single-lens device
  return [{
    deviceId: backDevs[0].deviceId,
    label: backDevs[0].label || 'Caméra 1',
    isLikely1x: true,
    cleanName: 'Capteur 1 (Principal)',
  }];
}




