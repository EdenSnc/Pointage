// ============================================================
// POINTAGE — JSON Multi-Bill Importer
// ============================================================

import { db, requestPersistence } from './db';
import { generateReferenceAliases } from './logic';
import { findProductProfileMatch, saveProductProfile } from './hooks';
import { scheduleVaultMirror } from './offlineVault';
import type {
  ImportPayload,
  ImportBillJSON,
  ImportLineJSON,
  Bill,
  OrderLine,
} from './types';
import { decomposeTimestamp, detectWilaya } from './wilayas';

export interface ImportIssue {
  billIndex: number;
  lineIndex?: number;
  field: string;
  message: string;
  severity: 'warning' | 'error';
}

export interface MergedBillInfo {
  bill: Bill;
  addedLinesCount: number;
}

export interface ImportResult {
  bills: Bill[];
  mergedBills: MergedBillInfo[];
  lineCount: number;
  issues: ImportIssue[];
}

/**
 * Normalizes bill number to clean alphanumeric uppercase string.
 * Strips common prefixes like "BC/", "BL-", "FACTURE:", spaces and dashes.
 * Example: "BC/0U126/03835" -> "0U12603835"
 */
export function normalizeBillNumber(raw: string | null | undefined): string {
  if (!raw) return '';
  let cleaned = raw.toUpperCase().trim();
  // Strip common logistical prefixes
  cleaned = cleaned.replace(/^(BC|BL|FACTURE|COMMANDE|BON)[\s\/\-_:]*/i, '');
  // Keep only alphanumeric characters
  cleaned = cleaned.replace(/[^A-Z0-9]/g, '');
  return cleaned;
}

/**
 * Determines whether two bills represent the same delivery note.
 */
export function isSameBill(
  b1Number: string | undefined,
  b1Client: string | undefined,
  b2Number: string | undefined,
  b2Client: string | undefined
): boolean {
  const norm1 = normalizeBillNumber(b1Number);
  const norm2 = normalizeBillNumber(b2Number);

  const isGeneric1 = !norm1 || norm1 === 'AUTO' || norm1 === 'BLAUTO' || norm1 === 'NOTEMANUSCRITE';
  const isGeneric2 = !norm2 || norm2 === 'AUTO' || norm2 === 'BLAUTO' || norm2 === 'NOTEMANUSCRITE';

  // Primary rule: Exact normalized bill number match (if non-generic)
  if (!isGeneric1 && !isGeneric2) {
    return norm1 === norm2;
  }

  // Fallback for informal handwritten notes or bills lacking explicit BL numbers:
  // If at least one bill number is generic, match on identical non-generic client name
  const c1 = (b1Client || '').trim().toLowerCase();
  const c2 = (b2Client || '').trim().toLowerCase();
  const isGenericClient1 = !c1 || c1.includes('client divers') || c1.includes('client inconnu') || c1.includes('note interne');
  const isGenericClient2 = !c2 || c2.includes('client divers') || c2.includes('client inconnu') || c2.includes('note interne');

  if (!isGenericClient1 && !isGenericClient2 && c1 === c2) {
    return true;
  }

  return false;
}

function validateLine(
  line: ImportLineJSON,
  billIndex: number,
  lineIndex: number
): ImportIssue[] {
  const issues: ImportIssue[] = [];

  // If no reference, no designation, and no EAN -> cannot identify article at all
  if (!line.designation && !line.reference && !line.ean) {
    issues.push({
      billIndex,
      lineIndex,
      field: 'identification',
      message: `Ligne ${lineIndex + 1}: aucune identification (pas de désignation, référence, ni EAN)`,
      severity: 'error',
    });
  }

  const qty = line.quantity !== undefined ? line.quantity : (line as any).orderedQty;
  if (qty === undefined || qty === null) {
    // For informal notes without quantity, we default to 1, but notify as warning
    issues.push({
      billIndex,
      lineIndex,
      field: 'quantity',
      message: `Ligne ${lineIndex + 1} (${line.designation || line.reference || '?'}): quantité non précisée (1 par défaut)`,
      severity: 'warning',
    });
  } else if (typeof qty !== 'number' || qty < 0) {
    issues.push({
      billIndex,
      lineIndex,
      field: 'quantity',
      message: `Ligne ${lineIndex + 1}: quantité invalide (${qty})`,
      severity: 'warning',
    });
  }

  // Only warn about identifiers if BOTH reference and EAN are missing
  if (!line.reference && !line.ean) {
    issues.push({
      billIndex,
      lineIndex,
      field: 'identifiers',
      message: `Ligne ${lineIndex + 1} (${line.designation || '?'}): ni référence ni EAN`,
      severity: 'warning',
    });
  }

  return issues;
}

function validateBill(bill: ImportBillJSON, billIndex: number): ImportIssue[] {
  const issues: ImportIssue[] = [];

  if (!bill.billNumber) {
    issues.push({
      billIndex,
      field: 'billNumber',
      message: `Facture ${billIndex + 1}: numéro de BL manquant (généré automatiquement)`,
      severity: 'warning',
    });
  }

  if (!bill.client) {
    issues.push({
      billIndex,
      field: 'client',
      message: `Facture ${billIndex + 1}: client non spécifié`,
      severity: 'warning',
    });
  }

  if (!bill.lines || bill.lines.length === 0) {
    issues.push({
      billIndex,
      field: 'lines',
      message: `Facture ${billIndex + 1}: aucune ligne`,
      severity: 'error',
    });
  }

  return issues;
}

export function parseImportJSON(raw: string): {
  payload: ImportPayload | null;
  parseError: string | null;
} {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { payload: null, parseError: 'JSON invalide: objet attendu' };
    }
    // Accept both { bills: [...] } and [ ... ] (array of bills)
    if (Array.isArray(parsed)) {
      return { payload: { bills: parsed }, parseError: null };
    }
    if (parsed.bills && Array.isArray(parsed.bills)) {
      return { payload: parsed as ImportPayload, parseError: null };
    }
    // Single bill object
    if (parsed.billNumber || parsed.lines) {
      return { payload: { bills: [parsed] }, parseError: null };
    }
    return { payload: null, parseError: 'Format JSON non reconnu. Attendu: { "bills": [...] }' };
  } catch (e) {
    return { payload: null, parseError: `Erreur de parsing JSON: ${(e as Error).message}` };
  }
}

export function validateImport(payload: ImportPayload): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const bills = payload.bills || [];

  if (bills.length === 0) {
    issues.push({
      billIndex: -1,
      field: 'bills',
      message: 'Aucune facture trouvée dans le JSON',
      severity: 'error',
    });
    return issues;
  }

  for (let bi = 0; bi < bills.length; bi++) {
    issues.push(...validateBill(bills[bi], bi));
    const lines = bills[bi].lines || [];
    const seenNos = new Set<string>();
    for (let li = 0; li < lines.length; li++) {
      const no = lines[li].no;
      if (no) {
        if (seenNos.has(no)) {
          issues.push({
            billIndex: bi,
            lineIndex: li,
            field: 'no',
            message: `Ligne ${li + 1}: N°${no} est dupliqué dans ce BL`,
            severity: 'warning',
          });
        }
        seenNos.add(no);
      }
      issues.push(...validateLine(lines[li], bi, li));
    }
  }

  return issues;
}

export async function importBills(
  payload: ImportPayload,
  sessionId: number
): Promise<ImportResult> {
  const bills = payload.bills || [];
  const now = new Date().toISOString();
  const importedBills: Bill[] = [];
  const mergedBills: MergedBillInfo[] = [];
  let totalImportedLines = 0;
  const issues = validateImport(payload);

  // Retrieve all existing active bills in the database to detect multi-page additions
  const existingActiveBills = await db.bills
    .filter((b) => b.status === 'active')
    .toArray();

  for (const billData of bills) {
    // Check if this bill matches an existing active bill OR a bill previously processed in this import
    const candidateBills = [...existingActiveBills, ...importedBills];
    const matchingBill = candidateBills.find((cb) =>
      isSameBill(cb.billNumber, cb.client, billData.billNumber, billData.client)
    );

    const lines = billData.lines || [];

    if (matchingBill && matchingBill.id) {
      // MERGE LINES INTO ORIGINAL BILL
      const existingLines = await db.orderLines
        .where('billId')
        .equals(matchingBill.id)
        .toArray();

      let addedForThisBill = 0;

      for (let i = 0; i < lines.length; i++) {
        const lineData = lines[i];
        const rawQty = lineData.quantity !== undefined ? lineData.quantity : (lineData as any).orderedQty;
        const qty = typeof rawQty === 'number' && !isNaN(rawQty) ? Math.max(0, rawQty) : 1;
        const ref = lineData.reference != null ? String(lineData.reference).trim() : null;
        const ean = lineData.ean != null ? String(lineData.ean).trim() : null;
        const cleanNo = lineData.no ? String(lineData.no).trim() : '';
        const rawPrice = lineData.unitPrice;
        const unitPrice = typeof rawPrice === 'number' && !isNaN(rawPrice) && rawPrice >= 0 ? rawPrice : null;

        // Duplicate prevention: check against existing lines in the target bill
        const isDuplicate = existingLines.some((el) => {
          // 1. Line number matches AND (same reference, same designation, or same quantity)
          if (cleanNo && el.no === cleanNo) {
            if (ref && el.reference && ref.toLowerCase() === el.reference.toLowerCase()) return true;
            if (lineData.designation && el.designation && lineData.designation.trim().toLowerCase() === el.designation.trim().toLowerCase()) return true;
            if (el.orderedQty === qty) return true;
          }
          // 2. Exact reference match AND quantity match
          if (ref && el.reference && ref.toLowerCase() === el.reference.toLowerCase() && el.orderedQty === qty) {
            return true;
          }
          // 3. Exact EAN match AND quantity match
          if (ean && el.ean && ean === el.ean && el.orderedQty === qty) {
            return true;
          }
          return false;
        });

        if (!isDuplicate) {
          const finalNo = cleanNo || String(existingLines.length + addedForThisBill + 1);
          const designation = lineData.designation?.trim() || (ref ? `Réf: ${ref}` : `Article ${finalNo}`);

          let historicalRef: string | null = null;
          let matchedProfile = null;

          if (!ref && designation) {
            matchedProfile = await findProductProfileMatch(null, designation);
            if (matchedProfile) {
              historicalRef = matchedProfile.reference;
            }
          } else if (ref) {
            matchedProfile = await findProductProfileMatch(ref, designation);
            saveProductProfile(ref, { designation }).catch(() => {});
          }

          const aliases = Array.from(
            new Set([
              ...generateReferenceAliases(ref),
              ...(historicalRef ? [historicalRef] : []),
              ...(matchedProfile?.legacyCodes || []),
            ])
          );

          const orderLine: OrderLine = {
            billId: matchingBill.id,
            originalNo: finalNo,
            originalPage: lineData.page ?? null,
            originalReference: ref,
            originalEan: ean,
            originalDesignation: designation,
            originalOrderedQty: qty,
            originalUnitPrice: unitPrice,
            no: finalNo,
            page: lineData.page ?? null,
            reference: ref,
            ean: ean,
            designation,
            orderedQty: qty,
            unitPrice,
            status: 'active',
            outerPackSize: matchedProfile?.outerPackSize ?? null,
            innerPackSize: matchedProfile?.innerPackSize ?? null,
            warehouseZone: matchedProfile?.warehouseZone ?? null,
            imageUrl: matchedProfile?.imageUrl ?? null,
            packagesRaw: lineData.packagesRaw != null ? String(lineData.packagesRaw) : null,
            referenceAliases: aliases,
            historicalReference: historicalRef,
            createdAt: now,
            updatedAt: now,
          };

          const newId = await db.orderLines.add(orderLine);
          orderLine.id = newId;
          existingLines.push(orderLine);
          addedForThisBill++;
          totalImportedLines++;
        }
      }

      let updatedBillMeta = false;
      if (billData.bcNumber && !matchingBill.bcNumber) {
        matchingBill.bcNumber = billData.bcNumber;
        updatedBillMeta = true;
      }
      if (billData.documentType && !matchingBill.documentType) {
        matchingBill.documentType = billData.documentType;
        updatedBillMeta = true;
      }

      if (addedForThisBill > 0 || updatedBillMeta) {
        matchingBill.updatedAt = now;
        await db.bills.put(matchingBill);

        await db.auditEvents.add({
          billId: matchingBill.id,
          orderLineId: null,
          stage: null,
          type: 'line_added',
          oldValue: null,
          newValue: `Fusion multi-pages: ${addedForThisBill} nouvelle(s) ligne(s) ajoutée(s)`,
          reason: 'Page additionnelle importée',
          timestamp: now,
        });
      }

      if (!importedBills.some((b) => b.id === matchingBill.id)) {
        importedBills.push(matchingBill);
      }
      mergedBills.push({ bill: matchingBill, addedLinesCount: addedForThisBill });

    } else {
      // CREATE BRAND NEW BILL
      const defaultBillNumber = billData.billNumber?.trim() || `BL-${Date.now().toString().slice(-6)}`;
      const defaultClient = billData.client?.trim() || 'Client inconnu';

      const decomposed = decomposeTimestamp(billData.date || now);
      const detectedWilaya = detectWilaya(billData.clientAddress || billData.client);

      const bill: Bill = {
        sessionId,
        billNumber: defaultBillNumber,
        client: defaultClient,
        date: billData.date || decomposed.dateStr,
        timestamp: decomposed.timestamp,
        year: decomposed.year,
        month: decomposed.month,
        day: decomposed.day,
        hour: decomposed.hour,
        minute: decomposed.minute,
        time: decomposed.timeStr,
        wilaya: detectedWilaya?.wilaya || null,
        wilayaCode: detectedWilaya?.wilayaCode || null,
        status: 'active',
        paymentMode: billData.paymentMode || null,
        agentName: billData.agentName || null,
        clientAddress: billData.clientAddress || null,
        nif: billData.nif || null,
        nis: billData.nis || null,
        rc: billData.rc || null,
        ai: billData.ai || null,
        discountPercent: billData.discountPercent != null ? billData.discountPercent : null,
        bcNumber: billData.bcNumber || null,
        documentType: billData.documentType || null,
        createdAt: now,
        updatedAt: now,
      };

      const billId = await db.bills.add(bill);
      bill.id = billId;

      for (let i = 0; i < lines.length; i++) {
        const lineData = lines[i];
        const rawQty = lineData.quantity !== undefined ? lineData.quantity : (lineData as any).orderedQty;
        const qty = typeof rawQty === 'number' && !isNaN(rawQty) ? Math.max(0, rawQty) : 1;
        const ref = lineData.reference != null ? String(lineData.reference).trim() : null;
        const ean = lineData.ean != null ? String(lineData.ean).trim() : null;
        const finalNo = lineData.no ? String(lineData.no).trim() : String(i + 1);
        const designation = lineData.designation?.trim() || (ref ? `Réf: ${ref}` : `Article ${finalNo}`);

        let historicalRef: string | null = null;
        let matchedProfile = null;

        if (!ref && designation) {
          matchedProfile = await findProductProfileMatch(null, designation);
          if (matchedProfile) {
            historicalRef = matchedProfile.reference;
          }
        } else if (ref) {
          matchedProfile = await findProductProfileMatch(ref, designation);
          saveProductProfile(ref, { designation }).catch(() => {});
        }

        const aliases = Array.from(
          new Set([
            ...generateReferenceAliases(ref),
            ...(historicalRef ? [historicalRef] : []),
            ...(matchedProfile?.legacyCodes || []),
          ])
        );

        const rawPrice = lineData.unitPrice;
        const unitPrice = typeof rawPrice === 'number' && !isNaN(rawPrice) && rawPrice >= 0 ? rawPrice : null;

        const orderLine: OrderLine = {
          billId,
          originalNo: finalNo,
          originalPage: lineData.page ?? null,
          originalReference: ref,
          originalEan: ean,
          originalDesignation: designation,
          originalOrderedQty: qty,
          originalUnitPrice: unitPrice,
          no: finalNo,
          page: lineData.page ?? null,
          reference: ref,
          ean: ean,
          designation,
          orderedQty: qty,
          unitPrice,
          status: 'active',
          outerPackSize: matchedProfile?.outerPackSize ?? null,
          innerPackSize: matchedProfile?.innerPackSize ?? null,
          warehouseZone: matchedProfile?.warehouseZone ?? null,
          imageUrl: matchedProfile?.imageUrl ?? null,
          packagesRaw: lineData.packagesRaw != null ? String(lineData.packagesRaw) : null,
          referenceAliases: aliases,
          historicalReference: historicalRef,
          createdAt: now,
          updatedAt: now,
        };

        await db.orderLines.add(orderLine);
        totalImportedLines++;
      }

      await db.auditEvents.add({
        billId: bill.id!,
        orderLineId: null,
        stage: null,
        type: 'line_added',
        oldValue: null,
        newValue: `Import: ${lines.length} lignes`,
        reason: 'Import initial',
        timestamp: now,
      });

      importedBills.push(bill);
    }
  }

  // Ensure persistent storage and mirror data to offline vault
  requestPersistence().catch(() => {});
  scheduleVaultMirror(100);

  return { bills: importedBills, mergedBills, lineCount: totalImportedLines, issues };
}

export async function getOrCreateSession(): Promise<number> {
  const active = await db.workSessions
    .where('status')
    .equals('active')
    .first();
  if (active) return active.id!;
  const now = new Date().toISOString();
  return db.workSessions.add({
    name: `Session ${new Date().toLocaleDateString('fr-FR')}`,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });
}
