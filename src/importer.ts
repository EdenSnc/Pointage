// ============================================================
// POINTAGE — JSON Multi-Bill Importer
// ============================================================

import { db } from './db';
import { generateReferenceAliases } from './logic';
import type {
  ImportPayload,
  ImportBillJSON,
  ImportLineJSON,
  Bill,
} from './types';

export interface ImportIssue {
  billIndex: number;
  lineIndex?: number;
  field: string;
  message: string;
  severity: 'warning' | 'error';
}

export interface ImportResult {
  bills: Bill[];
  lineCount: number;
  issues: ImportIssue[];
}

function validateLine(
  line: ImportLineJSON,
  billIndex: number,
  lineIndex: number
): ImportIssue[] {
  const issues: ImportIssue[] = [];

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
    issues.push({
      billIndex,
      lineIndex,
      field: 'quantity',
      message: `Ligne ${lineIndex + 1} (${line.designation || line.reference || '?'}): quantité manquante`,
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

  if (!line.reference && !line.ean) {
    issues.push({
      billIndex,
      lineIndex,
      field: 'identifiers',
      message: `Ligne ${lineIndex + 1} (${line.designation || '?'}): ni référence ni EAN`,
      severity: 'warning',
    });
  }

  if (!line.no) {
    issues.push({
      billIndex,
      lineIndex,
      field: 'no',
      message: `Ligne ${lineIndex + 1}: N° manquant`,
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
      message: `Facture ${billIndex + 1}: numéro de BL manquant`,
      severity: 'warning',
    });
  }

  if (!bill.client) {
    issues.push({
      billIndex,
      field: 'client',
      message: `Facture ${billIndex + 1}: client manquant`,
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
  let lineCount = 0;
  const issues = validateImport(payload);

  for (const billData of bills) {
    const bill: Bill = {
      sessionId,
      billNumber: billData.billNumber || `BL-${Date.now()}`,
      client: billData.client || 'Client inconnu',
      date: billData.date || undefined,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    const billId = await db.bills.add(bill);
    bill.id = billId;

    const lines = billData.lines || [];
    for (const lineData of lines) {
      const rawQty = lineData.quantity !== undefined ? lineData.quantity : (lineData as any).orderedQty;
      const qty = typeof rawQty === 'number' ? Math.max(0, rawQty) : 0;
      const ref = lineData.reference != null ? String(lineData.reference) : null;
      const ean = lineData.ean != null ? String(lineData.ean) : null;
      const aliases = generateReferenceAliases(ref);

      const orderLine: OrderLine = {
        billId,
        originalNo: String(lineData.no || ''),
        originalPage: lineData.page ?? null,
        originalReference: ref,
        originalEan: ean,
        originalDesignation: lineData.designation || '',
        originalOrderedQty: qty,
        no: String(lineData.no || ''),
        page: lineData.page ?? null,
        reference: ref,
        ean: ean,
        designation: lineData.designation || '',
        orderedQty: qty,
        status: 'active',
        outerPackSize: null,
        innerPackSize: null,
        warehouseZone: null,
        packagesRaw: lineData.packagesRaw != null ? String(lineData.packagesRaw) : null,
        referenceAliases: aliases,
        createdAt: now,
        updatedAt: now,
      };

      await db.orderLines.add(orderLine);
      lineCount++;
    }

    importedBills.push(bill);
  }

  // Audit event
  for (const bill of importedBills) {
    const audit: AuditEvent = {
      billId: bill.id!,
      orderLineId: null,
      stage: null,
      type: 'line_added',
      oldValue: null,
      newValue: `Import: ${lineCount} lignes`,
      reason: 'Import initial',
      timestamp: now,
    };
    await db.auditEvents.add(audit);
  }

  return { bills: importedBills, lineCount, issues };
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
