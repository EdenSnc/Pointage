// ============================================================
// POINTAGE — Deduplication & Document Harmonization Engine
// Expert Protection Against Duplicate BLs, BCs, and Products
// Handles multi-page delivery notes, client isolation, and line deduplication.
// ============================================================

import { db } from './db';
import { areDesignationsMatching } from './logic';
import { scheduleVaultMirror } from './offlineVault';
import type { Bill, OrderLine } from './types';

/**
 * Normalizes bill number to clean alphanumeric uppercase string.
 * Strips common prefixes like "BC/", "BL-", "FACTURE:", spaces, dashes,
 * and handles multi-word logistical headers (e.g. "BON DE LIVRAISON N° 00234" -> "234").
 */
export function normalizeBillNumber(raw: string | null | undefined): string {
  if (!raw) return '';
  let cleaned = raw.toUpperCase().trim();
  // Strip common logistical prefixes (French, English, Arabic transliterated ERP headers)
  cleaned = cleaned.replace(
    /^(BON\s+DE\s+LIVRAISON|BON\s+DE\s+COMMANDE|BON\s+DE\s+RECEPTION|BON\s+DE\s+SORTIE|FACTURE\s+PROFORMA|FACTURE|COMMANDE|BC|BL|FAC|NOTE|BON)[\s\/\-_:]*/i,
    ''
  );
  cleaned = cleaned.replace(/^(N°|NO|NUM|NUMERO)[\s\/\-_:.]*/i, '');
  // Keep only alphanumeric characters
  cleaned = cleaned.replace(/[^A-Z0-9]/g, '');
  // Strip leading zeros ONLY if the string consists entirely of digits (e.g. "000542" -> "542", but "0U126" keeps "0U126")
  if (/^0+[0-9]+$/.test(cleaned)) {
    cleaned = cleaned.replace(/^0+/, '');
  }
  return cleaned;
}

/**
 * Normalizes client name by stripping legal company forms (SARL, EURL, ETS...)
 * and removing accents and punctuation for high-precision comparison.
 */
export function normalizeClientName(raw: string | null | undefined): string {
  if (!raw) return '';
  let cleaned = raw.toLowerCase().trim();
  // Remove accents FIRST so that Société -> societe, etc.
  cleaned = cleaned.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Strip company legal forms
  cleaned = cleaned.replace(/^(SARL|EURL|SNC|SPA|ETS|ETABLISSEMENT|STE|SOCIETE|CLIENT)[\s\.\-_:]*/i, '');
  // Strip non-alphanumeric
  cleaned = cleaned.replace(/[^a-z0-9]/g, '');
  return cleaned;
}

/**
 * Checks whether two client names represent the same customer/entity.
 * Prevents false merges between different clients who happen to have the same numeric invoice number!
 */
export function isClientCompatible(c1: string | undefined, c2: string | undefined): boolean {
  const norm1 = normalizeClientName(c1);
  const norm2 = normalizeClientName(c2);

  const raw1 = (c1 || '').toLowerCase().trim();
  const raw2 = (c2 || '').toLowerCase().trim();

  const isGeneric = (norm: string, raw: string) =>
    !norm ||
    norm === 'divers' ||
    norm === 'inconnu' ||
    norm.includes('clientdivers') ||
    norm.includes('clientinconnu') ||
    norm.includes('noteinterne') ||
    raw.includes('divers') ||
    raw.includes('inconnu') ||
    raw.includes('comptoir') ||
    norm === 'client';

  const isGeneric1 = isGeneric(norm1, raw1);
  const isGeneric2 = isGeneric(norm2, raw2);

  // If either client name is generic or missing, they are deemed compatible
  if (isGeneric1 || isGeneric2) return true;

  if (norm1 === norm2) return true;

  // Substring containment if sufficiently specific (>= 4 chars)
  if (norm1.length >= 4 && norm2.length >= 4) {
    if (norm1.includes(norm2) || norm2.includes(norm1)) return true;
  }

  return false;
}

/**
 * Determines whether two bills represent the same delivery note / order.
 * Considers normalized bill number, client compatibility, and purchase order (BC) number.
 */
export function isSameBill(
  b1Number: string | undefined,
  b1Client: string | undefined,
  b2Number: string | undefined,
  b2Client: string | undefined,
  b1BC?: string | undefined,
  b2BC?: string | undefined
): boolean {
  const norm1 = normalizeBillNumber(b1Number);
  const norm2 = normalizeBillNumber(b2Number);

  const isGeneric = (n: string) =>
    !n ||
    n === 'AUTO' ||
    n.startsWith('AUTO') ||
    n.startsWith('BLAUTO') ||
    n === 'MANUSCRITE' ||
    n === 'NOTEMANUSCRITE' ||
    n === 'NOTE';

  const isGeneric1 = isGeneric(norm1);
  const isGeneric2 = isGeneric(norm2);

  const clientMatch = isClientCompatible(b1Client, b2Client);

  // 1. Primary rule: Explicit non-generic BL numbers match AND clients are compatible
  if (!isGeneric1 && !isGeneric2) {
    if (norm1 === norm2) {
      // Must have compatible client: two different clients with BL "001" are NOT the same bill!
      return clientMatch;
    }
  }

  // 2. Secondary rule: Bon de Commande (BC) matching
  const normBC1 = normalizeBillNumber(b1BC);
  const normBC2 = normalizeBillNumber(b2BC);
  const hasBC1 = Boolean(normBC1 && normBC1 !== 'AUTO');
  const hasBC2 = Boolean(normBC2 && normBC2 !== 'AUTO');

  if (clientMatch) {
    // Both share the same explicit BC number:
    if (hasBC1 && hasBC2 && normBC1 === normBC2) {
      if (isGeneric1 || isGeneric2 || norm1 === norm2) {
        return true;
      }
    }

    // One document's bill number equals the other's BC number (e.g. Page 2 picked up BC as header):
    if (hasBC1 && !isGeneric2 && normBC1 === norm2) return true;
    if (hasBC2 && !isGeneric1 && normBC2 === norm1) return true;
  }

  // 3. Handwritten notes / informal bills lacking explicit numbers:
  if (isGeneric1 && isGeneric2) {
    const c1 = (b1Client || '').trim().toLowerCase();
    const c2 = (b2Client || '').trim().toLowerCase();
    const isGenericClient1 =
      !c1 ||
      c1.includes('client divers') ||
      c1.includes('client inconnu') ||
      c1.includes('note interne') ||
      c1 === 'client' ||
      c1 === 'divers';
    const isGenericClient2 =
      !c2 ||
      c2.includes('client divers') ||
      c2.includes('client inconnu') ||
      c2.includes('note interne') ||
      c2 === 'client' ||
      c2 === 'divers';
    if (!isGenericClient1 && !isGenericClient2 && clientMatch) {
      return true;
    }
  }

  return false;
}

/**
 * Checks whether an imported line is a duplicate of an existing line on the same bill.
 * Eliminates false-positive duplicate drops when multi-page documents reset line numbers 1..N.
 */
export function isDuplicateLine(
  newLine: {
    no?: string | null;
    page?: number | null;
    reference?: string | null;
    ean?: string | null;
    designation?: string | null;
    orderedQty: number;
  },
  existingLine: OrderLine
): boolean {
  const normNewRef = (newLine.reference || '').trim().toLowerCase();
  const normExistRef = (existingLine.reference || '').trim().toLowerCase();
  const normNewEan = (newLine.ean || '').trim().toLowerCase();
  const normExistEan = (existingLine.ean || '').trim().toLowerCase();

  const normNewDesig = (newLine.designation || '').trim().toLowerCase();
  const normExistDesig = (existingLine.designation || '').trim().toLowerCase();

  const cleanNewNo = (newLine.no || '').trim();
  const cleanExistNo = (existingLine.no || '').trim();

  const sameQty = existingLine.orderedQty === newLine.orderedQty;

  // 1. Same Line Number (cleanNo)
  if (cleanNewNo && cleanExistNo && cleanNewNo === cleanExistNo) {
    // Both line numbers match. Check if content is compatible:
    if (normNewRef && normExistRef && normNewRef === normExistRef) {
      return true;
    }
    if (
      normNewDesig &&
      normExistDesig &&
      (normNewDesig === normExistDesig || areDesignationsMatching(normNewDesig, normExistDesig))
    ) {
      return true;
    }
    if (normNewEan && normExistEan && normNewEan === normExistEan) {
      return true;
    }
    // If BOTH lines lack ref and designation, but have same quantity:
    if (!normNewRef && !normExistRef && !normNewDesig && !normExistDesig && sameQty) {
      return true;
    }
    // Note: If cleanNewNo === cleanExistNo, but BOTH have DIFFERENT references or designations,
    // this is NOT a duplicate (it's page 2 resetting line numbers 1..N with distinct products).
  }

  // 2. Exact Reference Match
  if (normNewRef && normExistRef && normNewRef === normExistRef) {
    if (sameQty && (normNewDesig === normExistDesig || areDesignationsMatching(normNewDesig, normExistDesig))) {
      return true;
    }
    if (cleanNewNo && cleanExistNo && cleanNewNo === cleanExistNo) {
      return true;
    }
    if (newLine.page != null && existingLine.page != null && newLine.page === existingLine.page && sameQty) {
      return true;
    }
  }

  // 3. Exact EAN Match
  if (normNewEan && normExistEan && normNewEan === normExistEan) {
    if (sameQty && (normNewDesig === normExistDesig || areDesignationsMatching(normNewDesig, normExistDesig))) {
      return true;
    }
  }

  // 4. Exact Designation Match when unnumbered
  if (normNewDesig && normExistDesig && sameQty && (!cleanNewNo || !cleanExistNo)) {
    if (normNewDesig === normExistDesig || areDesignationsMatching(normNewDesig, normExistDesig)) {
      return true;
    }
  }

  return false;
}

/**
 * Groups lines within a bill that share the exact same reference or designation.
 * Useful for warehouse pickers to alert them when an article appears on multiple lines of the same order.
 */
export function findDuplicateLinesInBill(lines: OrderLine[]): Map<string, OrderLine[]> {
  const groups = new Map<string, OrderLine[]>();

  for (const line of lines) {
    const ref = (line.reference || '').trim().toLowerCase();
    const desig = (line.designation || '').trim().toLowerCase();
    const key = ref || desig;
    if (!key) continue;

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(line);
  }

  // Filter to only groups that have 2 or more lines
  const duplicates = new Map<string, OrderLine[]>();
  for (const [key, group] of groups.entries()) {
    if (group.length > 1) {
      duplicates.set(key, group);
    }
  }

  return duplicates;
}

/**
 * Merges duplicate lines of the same article within a single bill into a single unified line.
 * Automatically adds up ordered quantities and re-assigns counting events.
 */
export async function mergeDuplicateLinesInBill(billId: number): Promise<{ mergedCount: number }> {
  const lines = await db.orderLines.where('billId').equals(billId).toArray();
  const dupGroups = findDuplicateLinesInBill(lines);
  let mergedCount = 0;

  for (const [, group] of dupGroups.entries()) {
    // Keep first line as primary
    const primaryLine = group[0];
    const duplicates = group.slice(1);

    let additionalQty = 0;
    for (const dup of duplicates) {
      additionalQty += dup.orderedQty;

      // Transfer any countEvents from dup to primary
      if (dup.id && primaryLine.id) {
        const events = await db.countEvents.where('orderLineId').equals(dup.id).toArray();
        for (const ev of events) {
          await db.countEvents.update(ev.id!, {
            orderLineId: primaryLine.id,
          });
        }
        // Delete the duplicate line
        await db.orderLines.delete(dup.id);
        mergedCount++;
      }
    }

    if (additionalQty > 0 && primaryLine.id) {
      await db.orderLines.update(primaryLine.id, {
        orderedQty: primaryLine.orderedQty + additionalQty,
        originalOrderedQty: (primaryLine.originalOrderedQty || primaryLine.orderedQty) + additionalQty,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  if (mergedCount > 0) {
    scheduleVaultMirror(100);
  }
  return { mergedCount };
}

export interface DuplicateBillGroup {
  key: string;
  primary: Bill;
  duplicates: Bill[];
}

/**
 * Detects duplicate bills in the database that share the same normalized bill number / BC
 * and customer.
 */
export function findDuplicateBillGroups(bills: Bill[]): DuplicateBillGroup[] {
  const groups: DuplicateBillGroup[] = [];
  const visited = new Set<number>();

  for (let i = 0; i < bills.length; i++) {
    const b1 = bills[i];
    if (!b1.id || visited.has(b1.id)) continue;

    const duplicates: Bill[] = [];
    for (let j = i + 1; j < bills.length; j++) {
      const b2 = bills[j];
      if (!b2.id || visited.has(b2.id)) continue;

      if (
        isSameBill(
          b1.billNumber,
          b1.client,
          b2.billNumber,
          b2.client,
          b1.bcNumber || undefined,
          b2.bcNumber || undefined
        )
      ) {
        duplicates.push(b2);
        visited.add(b2.id);
      }
    }

    if (duplicates.length > 0) {
      visited.add(b1.id);
      groups.push({
        key: `dup-${b1.billNumber}-${b1.client}`,
        primary: b1,
        duplicates,
      });
    }
  }

  return groups;
}

/**
 * Merges duplicate bills together in a clean non-destructive operation:
 * Consolidates lines into the primary bill, migrates count events & containers,
 * and removes empty duplicate bill records.
 */
export async function mergeDuplicateBills(
  primaryBillId: number,
  duplicateBillIds: number[]
): Promise<{ mergedLinesCount: number; removedBillsCount: number }> {
  const primaryBill = await db.bills.get(primaryBillId);
  if (!primaryBill) throw new Error('Bon principal introuvable');

  const existingPrimaryLines = await db.orderLines.where('billId').equals(primaryBillId).toArray();
  let mergedLinesCount = 0;
  let removedBillsCount = 0;

  for (const dupId of duplicateBillIds) {
    if (dupId === primaryBillId) continue;
    const dupLines = await db.orderLines.where('billId').equals(dupId).toArray();

    for (const dLine of dupLines) {
      const isDup = existingPrimaryLines.some((pLine) => isDuplicateLine(dLine, pLine));
      if (!isDup) {
        // Move line to primary bill
        const newNo = String(existingPrimaryLines.length + mergedLinesCount + 1);
        await db.orderLines.add({
          ...dLine,
          id: undefined,
          billId: primaryBillId,
          no: dLine.no || newNo,
        });
        mergedLinesCount++;
      }
    }

    // Move countEvents to primary bill
    const dupEvents = await db.countEvents.where('billId').equals(dupId).toArray();
    for (const ev of dupEvents) {
      await db.countEvents.add({
        ...ev,
        id: undefined,
        billId: primaryBillId,
      });
    }

    // Move transport containers
    const dupContainers = await db.transportContainers.where('billId').equals(dupId).toArray();
    for (const c of dupContainers) {
      await db.transportContainers.add({
        ...c,
        id: undefined,
        billId: primaryBillId,
      });
    }

    // Delete duplicate bill records
    await db.orderLines.where('billId').equals(dupId).delete();
    await db.countEvents.where('billId').equals(dupId).delete();
    await db.transportContainers.where('billId').equals(dupId).delete();
    await db.bills.delete(dupId);
    removedBillsCount++;
  }

  // Update primary bill timestamp
  await db.bills.update(primaryBillId, {
    updatedAt: new Date().toISOString(),
  });

  scheduleVaultMirror(100);
  return { mergedLinesCount, removedBillsCount };
}
