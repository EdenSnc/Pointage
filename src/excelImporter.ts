// ============================================================
// POINTAGE — 100% Offline Excel & CSV Importer
// Parses .xlsx, .xls, .csv directly in the browser with XLSX
// Zero network requests, 0 bytes of mobile data needed.
// ============================================================

import * as XLSX from 'xlsx';
import type { ImportPayload, ImportBillJSON, ImportLineJSON } from './types';

export interface ParseExcelResult {
  payload: ImportPayload | null;
  parseError: string | null;
}

/**
 * Normalized string helper: lowercase, trim, remove accents & special chars.
 */
function normalizeHeader(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Maps arbitrary column headers to standardized property keys.
 */
function identifyColumnRole(rawHeader: string): string | null {
  const norm = normalizeHeader(rawHeader);

  if (['n', 'no', 'num', 'numero', 'item', 'ligne', 'pos', 'index'].includes(norm)) {
    return 'no';
  }

  // EAN / Barcode
  if (
    norm.includes('ean') ||
    norm.includes('barcode') ||
    norm.includes('codebarre') ||
    norm.includes('gencode')
  ) {
    return 'ean';
  }

  // Reference / SKU / Code Article (takes precedence if code/ref/sku is present)
  if (
    norm.includes('ref') ||
    norm.includes('sku') ||
    norm.startsWith('code') ||
    norm.includes('codeart') ||
    norm.includes('codeprod')
  ) {
    return 'reference';
  }

  // Designation / Product Name / Description
  if (
    norm.includes('designation') ||
    norm.includes('description') ||
    norm.includes('libelle') ||
    norm.includes('produit') ||
    norm.includes('article') ||
    norm.includes('nom')
  ) {
    return 'designation';
  }

  if (
    norm.includes('qte') ||
    norm.includes('quantite') ||
    norm.includes('qty') ||
    norm.includes('qtecdee') ||
    norm.includes('qteliv') ||
    norm.includes('nombre') ||
    norm === 'q'
  ) {
    return 'quantity';
  }

  if (
    norm.includes('prix') ||
    norm.includes('pu') ||
    norm.includes('tarif') ||
    norm.includes('montantunit')
  ) {
    return 'unitPrice';
  }

  if (
    norm.includes('colis') ||
    norm.includes('cond') ||
    norm.includes('pack') ||
    norm.includes('pcb')
  ) {
    return 'colisage';
  }

  if (norm.includes('remise') || norm.includes('disc') || norm.includes('rabais')) {
    return 'discountPercent';
  }

  return null;
}

/**
 * Extracts metadata (Client, N° BL, Date) from text rows or headers.
 */
function extractMetadataFromText(text: string): {
  billNumber?: string;
  client?: string;
  date?: string;
} {
  const result: { billNumber?: string; client?: string; date?: string } = {};

  const billMatch = text.match(
    /(?:(?:bl|bon\s*de\s*livraison|facture|bc|bon(?:\s*de)?\s*commande)\s*(?:n°?|num(?:ero)?|#)?|(?:n°|num(?:ero)?|#)\s*(?:bl|bon|facture|bc)?)\s*[:#\-]\s*([a-z0-9\/\-_]+)/i
  );
  if (billMatch && billMatch[1] && billMatch[1].length >= 2) {
    result.billNumber = billMatch[1].trim();
  }

  // Explicit Client label
  const explicitClientMatch = text.match(/(?:client(?:\s*\/\s*doit)?|doit|destinataire)\s*[:#\-]\s*([a-z0-9\s\.\-_]{3,50})/i);
  if (explicitClientMatch && explicitClientMatch[1]) {
    result.client = explicitClientMatch[1].trim();
  } else {
    // Secondary fallback without colon
    const looseClientMatch = text.match(/(?:client|doit|destinataire)\s+([a-z0-9\s\.\-_]{3,40})/i);
    if (looseClientMatch && looseClientMatch[1]) {
      result.client = looseClientMatch[1].trim();
    }
  }

  const dateMatch = text.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/);
  if (dateMatch) {
    result.date = dateMatch[1];
  }

  return result;
}

function cleanFileName(filename: string): string {
  return filename
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9_\- ]/g, ' ')
    .trim();
}

export function parseExcelImport(
  buffer: ArrayBuffer | Uint8Array,
  fileName: string = 'document.xlsx'
): ParseExcelResult {
  try {
    const workbook = XLSX.read(buffer, {
      type: 'array',
      cellDates: true,
      raw: false,
    });

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return { payload: null, parseError: 'Le fichier Excel ne contient aucune feuille lisible.' };
    }

    const bills: ImportBillJSON[] = [];
    const baseName = cleanFileName(fileName);

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;

      const rawRows = XLSX.utils.sheet_to_json<any[]>(sheet, {
        header: 1,
        defval: '',
        blankrows: false,
      });

      if (!rawRows || rawRows.length === 0) continue;

      let headerRowIndex = -1;
      let columnMap: Record<string, number> = {};
      let metaClient: string | undefined;
      let metaBillNumber: string | undefined;
      let metaDate: string | undefined;

      const scanLimit = Math.min(25, rawRows.length);
      for (let r = 0; r < scanLimit; r++) {
        const row = rawRows[r];
        if (!Array.isArray(row)) continue;

        const rowText = row.map((c) => String(c || '').trim()).filter(Boolean).join(' ');
        const rowMeta = extractMetadataFromText(rowText);
        if (rowMeta.client && !metaClient) metaClient = rowMeta.client;
        if (rowMeta.billNumber && !metaBillNumber) metaBillNumber = rowMeta.billNumber;
        if (rowMeta.date && !metaDate) metaDate = rowMeta.date;

        const currentMap: Record<string, number> = {};
        for (let c = 0; c < row.length; c++) {
          const val = String(row[c] || '').trim();
          if (!val) continue;
          const role = identifyColumnRole(val);
          if (role && currentMap[role] === undefined) {
            currentMap[role] = c;
          }
        }

        const hasDesigOrRef = currentMap.designation !== undefined || currentMap.reference !== undefined;
        const hasQty = currentMap.quantity !== undefined;

        if (hasDesigOrRef && (hasQty || Object.keys(currentMap).length >= 3)) {
          headerRowIndex = r;
          columnMap = currentMap;
          break;
        }
      }

      if (headerRowIndex === -1) {
        let bestScore = 0;
        let bestIndex = -1;
        let bestMap: Record<string, number> = {};

        for (let r = 0; r < scanLimit; r++) {
          const row = rawRows[r];
          if (!Array.isArray(row)) continue;
          const currentMap: Record<string, number> = {};
          for (let c = 0; c < row.length; c++) {
            const role = identifyColumnRole(String(row[c] || '').trim());
            if (role && currentMap[role] === undefined) {
              currentMap[role] = c;
            }
          }
          const score = Object.keys(currentMap).length;
          if (score > bestScore) {
            bestScore = score;
            bestIndex = r;
            bestMap = currentMap;
          }
        }

        if (bestScore >= 2) {
          headerRowIndex = bestIndex;
          columnMap = bestMap;
        }
      }

      if (headerRowIndex === -1) {
        headerRowIndex = 0;
        columnMap = {
          no: 0,
          designation: 1,
          quantity: 2,
          unitPrice: 3,
        };
      }

      const lines: ImportLineJSON[] = [];
      let autoNo = 1;

      for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
        const row = rawRows[r];
        if (!Array.isArray(row)) continue;

        const rawNo = columnMap.no !== undefined ? String(row[columnMap.no] || '').trim() : '';
        const rawDesig = columnMap.designation !== undefined ? String(row[columnMap.designation] || '').trim() : '';
        const rawRef = columnMap.reference !== undefined ? String(row[columnMap.reference] || '').trim() : '';
        const rawEan = columnMap.ean !== undefined ? String(row[columnMap.ean] || '').trim() : '';
        const rawQty = columnMap.quantity !== undefined ? row[columnMap.quantity] : '';
        const rawPrice = columnMap.unitPrice !== undefined ? row[columnMap.unitPrice] : '';
        const rawColisage = columnMap.colisage !== undefined ? String(row[columnMap.colisage] || '').trim() : '';
        const rawDiscount = columnMap.discountPercent !== undefined ? row[columnMap.discountPercent] : '';

        let designation = rawDesig;
        if (!designation && rawRef) {
          designation = rawRef;
        }

        if (!designation) continue;
        const normDesig = designation
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .trim();

        const isFooterKeyword = [
          'total',
          'sous-total',
          'soustotal',
          'net a payer',
          'net commercial',
          'arrondi',
          'montant h.t',
          'montant ttc',
          'total ht',
          'total ttc',
          'tva',
          'timbre',
          'acompte',
          'solde',
          'banque',
          'rib',
          'iban',
          'swift',
          'mode de reglement',
          'mode de paiement',
          'reglement',
          'virement',
          'cheque',
          'especes',
          'arrete le present',
          'arretee la presente',
          'arrete la presente',
          'la somme de',
          'signature',
          'cachet',
          'nom du chauffeur',
          'visa',
          'bon pour accord',
          'observation',
          'observations',
          'conditions de',
          'registre de commerce',
          'capital social',
          'page 1',
          'page 2',
        ].some((k) => normDesig.startsWith(k) || normDesig.includes(` ${k} `) || normDesig.includes(`${k}:`));

        if (isFooterKeyword) {
          continue;
        }

        let quantity = 0;
        if (typeof rawQty === 'number') {
          quantity = rawQty;
        } else if (rawQty) {
          const cleanQty = String(rawQty).replace(/\s/g, '').replace(',', '.');
          const parsedQty = parseFloat(cleanQty);
          if (!isNaN(parsedQty)) quantity = parsedQty;
        }

        if (quantity <= 0) {
          for (let c = 0; c < row.length; c++) {
            if (c === columnMap.no || c === columnMap.designation || c === columnMap.reference) continue;
            const val = row[c];
            if (typeof val === 'number' && val > 0 && val < 100000) {
              quantity = val;
              break;
            }
          }
        }

        // If no quantity found and no reference/EAN, this is almost certainly a text remark/footer row
        if (quantity <= 0 && !rawRef && !rawEan) {
          continue;
        }

        if (quantity <= 0) quantity = 1;

        let unitPrice: number | null = null;
        if (typeof rawPrice === 'number') {
          unitPrice = rawPrice;
        } else if (rawPrice) {
          const cleanPrice = String(rawPrice).replace(/\s/g, '').replace(',', '.');
          const parsedPrice = parseFloat(cleanPrice);
          if (!isNaN(parsedPrice)) unitPrice = parsedPrice;
        }

        let discountPercent: number | null = null;
        if (typeof rawDiscount === 'number') {
          discountPercent = rawDiscount;
        } else if (rawDiscount) {
          const cleanDisc = String(rawDiscount).replace('%', '').replace(',', '.').trim();
          const parsedDisc = parseFloat(cleanDisc);
          if (!isNaN(parsedDisc)) discountPercent = parsedDisc;
        }

        const lineNo = rawNo ? rawNo.replace(/^N°?\s*/i, '') : String(autoNo);
        autoNo++;

        lines.push({
          no: lineNo,
          designation,
          quantity,
          reference: rawRef || null,
          ean: rawEan || null,
          unitPrice: unitPrice != null ? unitPrice : undefined,
          colisage: rawColisage || null,
          discountPercent: discountPercent != null ? discountPercent : undefined,
        });
      }

      if (lines.length > 0) {
        const finalBillNumber =
          metaBillNumber ||
          (workbook.SheetNames.length > 1 ? `${baseName} - ${sheetName}` : baseName);

        const finalClient =
          metaClient ||
          (workbook.SheetNames.length > 1 ? sheetName : baseName);

        bills.push({
          billNumber: finalBillNumber,
          client: finalClient,
          date: metaDate || new Date().toISOString().split('T')[0],
          lines,
        });
      }
    }

    if (bills.length === 0) {
      return {
        payload: null,
        parseError: 'Aucun article valide trouvé dans le fichier Excel. Vérifiez que le tableau contient au moins des colonnes Désignation/Article et Quantité.',
      };
    }

    return {
      payload: { bills },
      parseError: null,
    };
  } catch (err) {
    return {
      payload: null,
      parseError: `Erreur lors de la lecture du fichier Excel: ${(err as Error).message}`,
    };
  }
}
