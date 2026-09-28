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

export {
  normalizeBillNumber,
  normalizeClientName,
  isClientCompatible,
  isSameBill,
  isDuplicateLine,
} from './deduplication';
import {
  isSameBill,
  isDuplicateLine,
} from './deduplication';

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

  // Retrieve all existing bills in the database to detect multi-page additions or re-imports
  const existingBills = await db.bills.toArray();

  for (const billData of bills) {
    // Check if this bill matches an existing bill OR a bill previously processed in this import
    const candidateBills = [...existingBills, ...importedBills];
    const matchingBill = candidateBills.find((cb) =>
      isSameBill(
        cb.billNumber,
        cb.client,
        billData.billNumber,
        billData.client,
        cb.bcNumber || undefined,
        billData.bcNumber || undefined
      )
    );

    const lines = billData.lines || [];

    if (matchingBill && matchingBill.id) {
      // MERGE LINES INTO ORIGINAL BILL
      const existingLines = await db.orderLines
        .where('billId')
        .equals(matchingBill.id)
        .toArray();

      const existingEvents = await db.countEvents
        .where('billId')
        .equals(matchingBill.id)
        .toArray();

      const hasActiveWork =
        existingEvents.some((e) => !e.undone && e.quantity > 0) ||
        matchingBill.preparedBy != null;

      let addedForThisBill = 0;
      const addedLinesForRevision: { reference?: string | null; designation: string; quantity: number; warehouseZone?: string | null }[] = [];
      const changedQuantitiesForRevision: { reference?: string | null; designation: string; oldQty: number; newQty: number; delta: number }[] = [];

      for (let i = 0; i < lines.length; i++) {
        const lineData = lines[i];
        const rawQty = lineData.quantity !== undefined ? lineData.quantity : (lineData as any).orderedQty;
        const qty = typeof rawQty === 'number' && !isNaN(rawQty) ? Math.max(0, rawQty) : 1;
        const ref = lineData.reference != null ? String(lineData.reference).trim() : null;
        const ean = lineData.ean != null ? String(lineData.ean).trim() : null;
        const cleanNo = lineData.no ? String(lineData.no).trim() : '';
        const rawPrice = lineData.unitPrice;
        const unitPrice = typeof rawPrice === 'number' && !isNaN(rawPrice) && rawPrice >= 0 ? rawPrice : null;

        // Duplicate prevention using dedicated deduplication engine
        const duplicateMatch = existingLines.find((el) =>
          isDuplicateLine(
            {
              no: cleanNo,
              page: lineData.page,
              reference: ref,
              ean,
              designation: lineData.designation,
              orderedQty: qty,
            },
            el
          )
        );

        if (duplicateMatch) {
          if (lineData.commercialNote && !duplicateMatch.commercialNote) {
            duplicateMatch.commercialNote = String(lineData.commercialNote).trim();
            await db.orderLines.update(duplicateMatch.id!, { commercialNote: duplicateMatch.commercialNote });
          }

          // HQ quantity change detection
          if (duplicateMatch.orderedQty !== qty) {
            changedQuantitiesForRevision.push({
              reference: duplicateMatch.reference,
              designation: duplicateMatch.designation,
              oldQty: duplicateMatch.orderedQty,
              newQty: qty,
              delta: qty - duplicateMatch.orderedQty,
            });
            await db.orderLines.update(duplicateMatch.id!, {
              orderedQty: qty,
              updatedAt: now,
            });
            duplicateMatch.orderedQty = qty;
          }
        } else {
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
            commercialNote: lineData.commercialNote ? String(lineData.commercialNote).trim() : null,
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

          addedLinesForRevision.push({
            reference: ref,
            designation,
            quantity: qty,
            warehouseZone: matchedProfile?.warehouseZone ?? null,
          });
        }
      }

      // Detect removed lines: existing active lines not present in the new incoming lines
      const removedLinesForRevision: OrderLine[] = existingLines.filter(
        (el) =>
          el.status !== 'cancelled' &&
          !lines.some((newLine) => {
            const rawQty = newLine.quantity !== undefined ? newLine.quantity : (newLine as any).orderedQty;
            const qty = typeof rawQty === 'number' && !isNaN(rawQty) ? Math.max(0, rawQty) : 1;
            const ref = newLine.reference != null ? String(newLine.reference).trim() : null;
            const ean = newLine.ean != null ? String(newLine.ean).trim() : null;
            const cleanNo = newLine.no ? String(newLine.no).trim() : '';
            return isDuplicateLine(
              {
                no: cleanNo,
                page: newLine.page,
                reference: ref,
                ean,
                designation: newLine.designation,
                orderedQty: qty,
              },
              el
            );
          })
      );

      let updatedBillMeta = false;
      if (billData.bcNumber && !matchingBill.bcNumber) {
        matchingBill.bcNumber = billData.bcNumber;
        updatedBillMeta = true;
      }
      if (billData.documentType && !matchingBill.documentType) {
        matchingBill.documentType = billData.documentType;
        updatedBillMeta = true;
      }
      if (billData.commercialNote && !matchingBill.commercialNote) {
        matchingBill.commercialNote = billData.commercialNote;
        updatedBillMeta = true;
      }

      // If active work was done on this bill and HQ introduced changes, flag HQ revision
      if (
        hasActiveWork &&
        (addedLinesForRevision.length > 0 ||
          changedQuantitiesForRevision.length > 0 ||
          removedLinesForRevision.length > 0)
      ) {
        const hqChanges = [
          ...addedLinesForRevision.map((a) => ({
            type: 'added' as const,
            reference: a.reference,
            designation: a.designation,
            newQty: a.quantity,
            delta: a.quantity,
            warehouseZone: a.warehouseZone,
            resolved: false,
          })),
          ...removedLinesForRevision.map((r) => ({
            type: 'removed' as const,
            reference: r.reference,
            designation: r.designation,
            oldQty: r.orderedQty,
            delta: -r.orderedQty,
            warehouseZone: r.warehouseZone,
            resolved: false,
          })),
          ...changedQuantitiesForRevision.map((c) => ({
            type: 'quantity_changed' as const,
            reference: c.reference,
            designation: c.designation,
            oldQty: c.oldQty,
            newQty: c.newQty,
            delta: c.delta,
            resolved: false,
          })),
        ];

        for (const rem of removedLinesForRevision) {
          await db.orderLines.update(rem.id!, {
            status: 'cancelled',
            updatedAt: now,
          });
        }

        const summaryParts: string[] = [];
        if (addedLinesForRevision.length > 0) summaryParts.push(`${addedLinesForRevision.length} ajout(s)`);
        if (removedLinesForRevision.length > 0) summaryParts.push(`${removedLinesForRevision.length} suppression(s)`);
        if (changedQuantitiesForRevision.length > 0)
          summaryParts.push(`${changedQuantitiesForRevision.length} qté(s) modifiée(s)`);

        matchingBill.hqRevision = {
          revisedAt: now,
          acknowledged: false,
          changes: hqChanges,
          summaryMessage: `Siège: ${hqChanges.length} modification(s) détectée(s) après préparation (${summaryParts.join(', ')}).`,
        };
        updatedBillMeta = true;

        await db.auditEvents.add({
          billId: matchingBill.id,
          orderLineId: null,
          stage: null,
          type: 'status_changed',
          oldValue: 'standard',
          newValue: 'hq_revision_detected',
          reason: matchingBill.hqRevision.summaryMessage,
          timestamp: now,
        });
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

      const upperNo = defaultBillNumber.toUpperCase();
      const detectedDocType =
        billData.documentType ||
        (upperNo.startsWith('TR') || upperNo.startsWith('BT') || upperNo.includes('TRANSFERT')
          ? 'bon_transfert'
          : null);

      // Check for operational client alias (ex: "SARL BLEU BLANC NAKHIL" -> "Kral Markt Béchar")
      const matchedAlias = await db.clientAliases
        .filter((a) => a.legalName.toUpperCase() === defaultClient.trim().toUpperCase())
        .first();
      const operationalClient = matchedAlias ? matchedAlias.operationalName : null;

      const bill: Bill = {
        sessionId,
        billNumber: defaultBillNumber,
        client: defaultClient,
        operationalClient: operationalClient || null,
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
        driverName: billData.driverName || null,
        clientAddress: billData.clientAddress || null,
        nif: billData.nif || null,
        nis: billData.nis || null,
        rc: billData.rc || null,
        ai: billData.ai || null,
        discountPercent: billData.discountPercent != null ? billData.discountPercent : null,
        bcNumber: billData.bcNumber || null,
        documentType: detectedDocType,
        commercialNote: billData.commercialNote || null,
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
          locationNote: matchedProfile?.locationNote ?? null,
          imageUrl: matchedProfile?.imageUrl ?? null,
          packagesRaw: lineData.packagesRaw != null ? String(lineData.packagesRaw) : null,
          commercialNote: lineData.commercialNote ? String(lineData.commercialNote).trim() : null,
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
