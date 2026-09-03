// ============================================================
// POINTAGE — Pure quantity arithmetic (no dependencies)
// ============================================================

import { CountEvent, PointageOutcome, Stage, LineStatus, OrderLine, LineDiscrepancy, StageTotals } from './types';

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
      const hasDamageOrRefusal = totals.byOutcome.damaged_accepted > 0 ||
        totals.byOutcome.damaged_refused > 0 ||
        totals.byOutcome.refused > 0;
      return totals.total !== loadTotal || hasDamageOrRefusal;
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

