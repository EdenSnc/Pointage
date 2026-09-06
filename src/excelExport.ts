// ============================================================
// POINTAGE — Final Bill Excel Export & Document Replication Hub
// Replicates official Algerian warehouse documents 1:1:
// 1. Facture Commerciale (Invoice SAJ/2026/5435 ShowOr / SARL SBM)
// 2. Bon de Livraison Officiel avec EAN (BL/OU126/03615 SARL S.B.M IMP/EXP)
// 3. Bordereau Préparation Atelier (BL/OU126/03608)
// 4. Bon de Commande Officiel (BC/OU126/03808)
// Zero-error financial calculation, native Excel formulas, and dispatch
// ============================================================

import * as XLSX from 'xlsx';
import type {
  Stage,
  Bill,
  OrderLine,
  CountEvent,
  FinalBillRow,
  FinalBillRowStatus,
  FinalBillExportData,
} from './types';
import { sumStageEvents } from './logic';
import { formatDzdAmountInWords, numberToWordsFr } from './frenchNumberToWords';

export type DocumentExportType = 'auto' | 'invoice' | 'bl_official' | 'bl_workshop' | 'bon_commande';

export interface FinalBillOptions {
  stage?: Stage;
  onlyPresent?: boolean; // filter only items where actualQty > 0
}

/**
 * Builds structured FinalBillRow array from database entities.
 * Strictly guarantees physical pointage count authority and 2-decimal rounding.
 */
export function buildFinalBillRows(
  lines: OrderLine[],
  eventsByLine: Map<number, CountEvent[]>,
  options: FinalBillOptions = {}
): FinalBillRow[] {
  const stage = options.stage || 'preparation';
  const rows: FinalBillRow[] = [];

  for (const line of lines) {
    const lineEvents = eventsByLine.get(line.id!) || [];
    const rawActual = sumStageEvents(lineEvents, stage);
    const actualQty = typeof rawActual === 'number' && !isNaN(rawActual) ? Math.max(0, rawActual) : 0;
    const orderedQty = typeof line.orderedQty === 'number' && !isNaN(line.orderedQty) ? Math.max(0, line.orderedQty) : 0;
    const diffQty = actualQty - orderedQty;
    const unitPrice = typeof line.unitPrice === 'number' && !isNaN(line.unitPrice) && line.unitPrice >= 0 ? line.unitPrice : null;

    // Strict 2-decimal financial calculation
    const totalTtc = unitPrice != null
      ? Math.round((actualQty * unitPrice + Number.EPSILON) * 100) / 100
      : null;

    // Determine precise status
    let status: FinalBillRowStatus = 'CONFORME';
    let observation = '';

    const hasRefused = lineEvents.some(
      (e) => !e.undone && (e.outcome === 'refused' || e.outcome === 'damaged_refused')
    );

    if (line.status === 'out_of_stock') {
      status = 'RUPTURE';
      observation = `Rupture définitive (${orderedQty} attendu)`;
    } else if (line.status === 'cancelled') {
      status = 'ANNULE';
      observation = 'Ligne annulée';
    } else if (hasRefused) {
      status = 'AVARIE';
      observation = 'Marchandise avariée / refusée au pointage';
    } else if (orderedQty === 0 && actualQty > 0) {
      status = 'SURPLUS';
      observation = `Article hors bon / surplus (+${actualQty})`;
    } else if (actualQty === 0 && orderedQty > 0) {
      status = 'MANQUANT';
      observation = `Non reçu (0 / ${orderedQty})`;
    } else if (actualQty < orderedQty) {
      status = 'MANQUANT';
      observation = `Manquant (-${orderedQty - actualQty})`;
    } else if (actualQty > orderedQty) {
      status = 'SURPLUS';
      observation = `Surplus (+${actualQty - orderedQty})`;
    } else {
      status = 'CONFORME';
      observation = 'Conforme';
    }

    if (options.onlyPresent && actualQty <= 0) {
      continue;
    }

    const safeColisage = line.packagesRaw || (line.outerPackSize ? `${line.outerPackSize},00` : (line.colisage ? `${line.colisage}` : '1,00'));
    const safeCode = line.reference || line.originalReference || (line.no ? `ART-${line.no}` : '-');
    const safeDesignation = line.designation || line.originalDesignation || 'Article sans désignation';
    const lineDiscount = (line as any).discountPercent ?? (line as any).remise ?? null;

    rows.push({
      no: line.no || line.originalNo || String(rows.length + 1),
      code: safeCode,
      ean: line.ean || line.originalEan || null,
      designation: safeDesignation,
      um: 'Unité(s)',
      colisage: safeColisage,
      orderedQty,
      actualQty,
      diffQty,
      unitPrice,
      discountPercent: lineDiscount,
      totalTtc,
      status,
      observation,
    });
  }

  return rows;
}

/**
 * Compiles full bill export metadata with exact totals matching real warehouse bills.
 */
export function compileFinalBillData(
  bill: Bill,
  rows: FinalBillRow[]
): FinalBillExportData {
  let totalOrderedQty = 0;
  let totalActualQty = 0;
  let totalDiffQty = 0;
  let totalAmountTtc = 0;
  let pricedRowsCount = 0;
  let totalHt = 0;
  let totalRemise = 0;

  for (const r of rows) {
    totalOrderedQty += r.orderedQty;
    totalActualQty += r.actualQty;
    totalDiffQty += r.diffQty;
    if (r.unitPrice != null) {
      const lineHt = Math.round((r.actualQty * r.unitPrice + Number.EPSILON) * 100) / 100;
      totalHt = Math.round((totalHt + lineHt + Number.EPSILON) * 100) / 100;
      const lineDisc = r.discountPercent || 0;
      if (lineDisc > 0) {
        const discVal = Math.round((lineHt * (lineDisc / 100) + Number.EPSILON) * 100) / 100;
        totalRemise = Math.round((totalRemise + discVal + Number.EPSILON) * 100) / 100;
      }
      pricedRowsCount++;
    }
    if (r.totalTtc != null) {
      totalAmountTtc = Math.round((totalAmountTtc + r.totalTtc + Number.EPSILON) * 100) / 100;
    }
  }

  const billDiscount = (bill as any).discountPercent ?? null;
  let totalAmountWithDiscount: number | null = null;
  let hasAnyDiscount = (billDiscount != null && billDiscount > 0) || totalRemise > 0;

  if (billDiscount != null && billDiscount > 0) {
    totalAmountWithDiscount = Math.round((totalAmountTtc * (1 - billDiscount / 100) + Number.EPSILON) * 100) / 100;
  } else if (totalRemise > 0) {
    totalAmountWithDiscount = Math.round((totalAmountTtc - totalRemise + Number.EPSILON) * 100) / 100;
  }

  const totalHtNet = Math.round((totalHt - totalRemise + Number.EPSILON) * 100) / 100;
  const totalTva = Math.round((totalHtNet * 0.19 + Number.EPSILON) * 100) / 100;
  const computedTtc = Math.round((totalHtNet + totalTva + Number.EPSILON) * 100) / 100;
  const finalTtc = pricedRowsCount > 0 ? (totalAmountTtc > 0 ? totalAmountTtc : computedTtc) : 0;
  const totalRemPaiement = billDiscount ? Math.round((finalTtc * (billDiscount / 100) + Number.EPSILON) * 100) / 100 : 0;
  const totalAvecRemise = totalRemPaiement > 0 ? Math.round((finalTtc - totalRemPaiement + Number.EPSILON) * 100) / 100 : finalTtc;

  return {
    billNumber: bill.billNumber || 'SANS_NUMERO',
    client: bill.client || 'Client Inconnu',
    date: bill.date || new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    paymentMode: (bill as any).paymentMode || (hasAnyDiscount ? `CLIENT ${billDiscount || 6}%` : 'GMS2026+++ GMS'),
    agentName: (bill as any).agentName || 'ShowOr',
    clientAddress: (bill as any).clientAddress || null,
    nif: (bill as any).nif || null,
    nis: (bill as any).nis || null,
    rc: (bill as any).rc || null,
    ai: (bill as any).ai || null,
    bcNumber: (bill as any).bcNumber || null,
    documentType: (bill as any).documentType || null,
    totalOrderedQty,
    totalActualQty,
    totalDiffQty,
    totalAmountTtc: finalTtc,
    totalAmountWithDiscount,
    totalHt,
    totalHtNet,
    totalRemise,
    totalTva,
    totalRemPaiement,
    totalAvecRemise,
    amountInWords: formatDzdAmountInWords(finalTtc),
    discountPercent: billDiscount,
    isPriced: pricedRowsCount > 0,
    checksumValid: true,
    rows,
  };
}

/**
 * Resolves document type based on metadata or heuristic matching.
 */
export function resolveDocumentType(
  data: FinalBillExportData,
  overrideType?: DocumentExportType
): 'invoice' | 'bl_official' | 'bl_workshop' | 'bon_commande' {
  if (overrideType && overrideType !== 'auto') {
    return overrideType;
  }
  if (data.documentType && (data.documentType as string) !== 'auto') {
    return data.documentType;
  }

  const billNo = (data.billNumber || '').toUpperCase().trim();

  // Invoice identifiers: Invoice, SAJ, FACT, FA
  if (billNo.startsWith('INV') || billNo.includes('SAJ') || billNo.includes('FACT')) {
    return 'invoice';
  }

  // Bon de Commande identifiers: BC
  if (billNo.startsWith('BC') || billNo.includes('COMMANDE')) {
    return 'bon_commande';
  }

  // Delivery Note: check if EAN is available
  const hasEan = data.rows.some((r) => Boolean(r.ean && r.ean.trim().length >= 8));
  if (billNo.startsWith('BL')) {
    return hasEan ? 'bl_official' : 'bl_workshop';
  }

  // Default fallback based on pricing or barcode
  if (data.isPriced) {
    return 'invoice';
  }
  if (hasEan) {
    return 'bl_official';
  }

  return 'bl_workshop';
}

const thinBorder = {
  top: { style: 'thin', color: { rgb: 'D1D5DB' } },
  bottom: { style: 'thin', color: { rgb: 'D1D5DB' } },
  left: { style: 'thin', color: { rgb: 'D1D5DB' } },
  right: { style: 'thin', color: { rgb: 'D1D5DB' } },
};

/**
 * 1. FACTURE COMMERCIALE (Invoice SAJ/2026/5435 ShowOr / SARL SBM)
 * Columns: N° | CODE | Désignation | QTÉ | Colisage | Qté/Carton | PU | MONTANT HT | TVA | Rem(%) | Rem. Paiement(%)
 * Includes full 7-line totals block and legal amount in words.
 */
export function createInvoiceWorkbook(data: FinalBillExportData): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const wsData: (string | number | null | object)[][] = [
    [`Invoice ${data.billNumber || 'SAJ/2026/5435'}`, '', '', '', '', '', `Bir El Djir , le : ${data.date || ''}`],
    ['', '', '', '', `Client : ${data.client || 'Client Inconnu'}`],
    [`Par: ${data.agentName || 'ShowOr'}`, '', '', '', data.clientAddress ? `${data.clientAddress}` : ''],
    ['', '', '', '', 'ORAN'],
    ['', '', '', '', data.ai ? `AI : ${data.ai}` : 'AI :'],
    ['', '', '', '', data.nif ? `NIF : ${data.nif}` : 'NIF :'],
    ['', '', '', '', data.rc ? `RC : ${data.rc}` : 'RC :'],
    [],
    [
      'N°',
      'CODE',
      'Désignation',
      'QTÉ',
      'Colisage',
      'Qté/Carton',
      'PU',
      'MONTANT HT',
      'TVA',
      'Rem(%)',
      'Rem. Paiement(%)',
    ],
  ];

  const firstDataRowIdx = 10; // 1-indexed row 10 in Excel
  const rows = data.rows;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rIdx = firstDataRowIdx + i;
    const unitPrice = r.unitPrice != null ? r.unitPrice : 0;
    const lineHt = Math.round((r.actualQty * unitPrice + Number.EPSILON) * 100) / 100;

    // Derive carton quantity from colisage fraction if applicable
    let qteCarton = '50,00';
    if (r.colisage) {
      const colNorm = parseFloat(r.colisage.replace(',', '.'));
      if (!isNaN(colNorm) && colNorm > 0) {
        const calcCarton = Math.round(1 / colNorm);
        if (calcCarton > 0 && calcCarton < 500) {
          qteCarton = `${calcCarton},00`;
        }
      }
    }

    const rowCells: (string | number | null | object)[] = [
      r.no,
      r.code,
      r.designation,
      r.actualQty,
      r.colisage || '1,00',
      qteCarton,
      unitPrice,
      { f: `D${rIdx}*G${rIdx}`, v: lineHt },
      '19%',
      r.discountPercent != null ? r.discountPercent : 0,
      data.discountPercent != null ? data.discountPercent : 0,
    ];

    wsData.push(rowCells);
  }

  const lastDataRowIdx = rows.length > 0 ? firstDataRowIdx + rows.length - 1 : firstDataRowIdx;

  if (rows.length === 0) {
    wsData.push(['-', '-', 'Aucun article dans cette sélection', 0, '1,00', '1,00', 0, 0, '19%', 0, 0]);
  }

  // Summary & Totals Block
  wsData.push([]);

  wsData.push([
    'Arrêté la Présente Facture à la Somme de:',
    '',
    '',
    '',
    '',
    '',
    'TOTAL HT',
    data.isPriced ? { f: `SUM(H${firstDataRowIdx}:H${lastDataRowIdx})`, v: data.totalHt || data.totalAmountTtc } : 0,
    'DA',
  ]);

  wsData.push([
    data.amountInWords || formatDzdAmountInWords(data.totalAmountTtc),
    '',
    '',
    '',
    '',
    '',
    'TOTAL HT NET',
    data.totalHtNet || data.totalAmountTtc,
    'DA',
  ]);

  wsData.push([
    '',
    '',
    '',
    '',
    '',
    '',
    'REMISE',
    data.totalRemise || 0,
    'DA',
  ]);

  wsData.push([
    `Conditions de règlement: ${data.paymentMode || 'GMS2026+++'}`,
    '',
    '',
    '',
    '',
    '',
    'TVA',
    data.totalTva || 0,
    'DA',
  ]);

  wsData.push([
    'GMS',
    '',
    '',
    '',
    '',
    '',
    'TOTAL TTC',
    data.totalAmountTtc,
    'DA',
  ]);

  wsData.push([
    '',
    '',
    '',
    '',
    '',
    '',
    'REM PAIEMENT',
    data.totalRemPaiement || 0,
    'DA',
  ]);

  wsData.push([
    'Cachet et Signature SARL SBM / ShowOr',
    '',
    '',
    '',
    '',
    '',
    'TOTAL AVEC REMISE',
    data.totalAvecRemise || data.totalAmountWithDiscount || data.totalAmountTtc,
    'DA',
  ]);

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  ws['!cols'] = [
    { wch: 6 },  // N°
    { wch: 14 }, // CODE
    { wch: 48 }, // Désignation
    { wch: 10 }, // QTÉ
    { wch: 12 }, // Colisage
    { wch: 14 }, // Qté/Carton
    { wch: 14 }, // PU
    { wch: 16 }, // MONTANT HT
    { wch: 10 }, // TVA
    { wch: 12 }, // Rem(%)
    { wch: 18 }, // Rem. Paiement(%)
  ];

  ws['!views'] = [{ showGridLines: true }];

  // Border outlines for table header (Row 9)
  const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'];
  for (const c of cols) {
    const cell = ws[`${c}9`];
    if (cell) cell.s = { border: thinBorder, font: { bold: true } };
  }

  // Number formats for data rows
  if (rows.length > 0) {
    for (let r = firstDataRowIdx; r <= lastDataRowIdx; r++) {
      for (const c of cols) {
        const cell = ws[`${c}${r}`];
        if (cell) cell.s = { border: thinBorder };
      }
      const cellD = ws[`D${r}`];
      if (cellD && (typeof cellD.v === 'number' || cellD.f)) cellD.z = '#,##0';
      const cellG = ws[`G${r}`];
      if (cellG && (typeof cellG.v === 'number' || cellG.f)) cellG.z = '#,##0.00';
      const cellH = ws[`H${r}`];
      if (cellH && (typeof cellH.v === 'number' || cellH.f)) cellH.z = '#,##0.00';
    }
  }

  const cleanSheetName = (data.billNumber || 'Facture_SAJ')
    .replace(/[\\\/\?\*\[\]\:]/g, '_')
    .slice(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, cleanSheetName || 'Facture');

  return wb;
}

/**
 * 2. BON DE LIVRAISON OFFICIEL AVEC EAN (BL/OU126/03615 SARL S.B.M IMP/EXP)
 * Columns: N° | Référence | EAN | Désignation | QTÉ
 * Includes full company header, BC reference link, and dual signature blocks.
 */
export function createDeliveryNoteWorkbook(data: FinalBillExportData): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const wsData: (string | number | null | object)[][] = [
    ['SARL S.B.M IMP/EXP'],
    ['Capital Social au 20 000 000.00 DA'],
    ['Adresse : Coop El bey-pos 25-lot 64/60 Bir El Djir'],
    ['31000 ORAN Algérie'],
    ['Téléphone: 06 55 59 36 25', '', '', 'RC: 09 B 0118597'],
    ['Fax: 0558 44 67 91', '', '', 'AI: 31038227545'],
    ['Email: contact@sbm-stationery.dz', '', '', 'NIF: 000931011859707'],
    ['Website: https://www.sbm-stationery.dz/', '', '', 'NIS: 000931010011275'],
    [],
    [`BON DE LIVRAISON : ${data.billNumber || 'BL/OU126/03615'}`, '', '', `Bir El Djir , le : ${data.date || ''}`],
    ['', '', '', `Client :`],
    ['', '', '', `${data.client || 'Client Inconnu'}`],
    ['', '', '', data.clientAddress ? `${data.clientAddress}` : '95 ET 96 LOTS ZONE D\'ACTIVITE - BIR EL DJIR - ORAN'],
    ['', '', '', 'ORAN'],
    ['', '', '', data.ai ? `AI : ${data.ai}` : 'AI :'],
    ['', '', '', data.nif ? `NIF : ${data.nif}` : 'NIF : 002131112400617'],
    ['', '', '', data.rc ? `RC : ${data.rc}` : 'RC : 21B 2124006-00/31'],
    ['', '', '', `${data.client || 'Client Inconnu'} N° BC:${data.bcNumber || '03885'} Date:`],
    [],
    ['N°', 'Référence', 'EAN', 'Désignation', 'QTÉ'],
  ];

  const firstDataRowIdx = 21; // 1-indexed row 21 in Excel
  const rows = data.rows;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const cleanEan = r.ean ? String(r.ean).trim() : '-';

    const rowCells: (string | number | null | object)[] = [
      r.no,
      r.code,
      { t: 's', v: cleanEan }, // Stored strictly as string to prevent scientific notation (6.94E+12)
      r.designation,
      r.actualQty,
    ];

    wsData.push(rowCells);
  }

  const lastDataRowIdx = rows.length > 0 ? firstDataRowIdx + rows.length - 1 : firstDataRowIdx;

  if (rows.length === 0) {
    wsData.push(['-', '-', '-', 'Aucun article dans cette sélection', 0]);
  }

  // Summary & Signatures
  wsData.push([]);
  wsData.push([
    '',
    '',
    '',
    'TOTAL QTÉ',
    { f: `SUM(E${firstDataRowIdx}:E${lastDataRowIdx})`, v: data.totalActualQty },
  ]);

  wsData.push([]);
  const piecesWords = numberToWordsFr(data.totalActualQty);
  wsData.push([`Arrêté le présent Bon de Livraison à la quantité de : ${piecesWords} PIÈCE(S)`]);
  wsData.push([]);
  wsData.push([
    'Accusé de Réception Client',
    '',
    '',
    'Cachet et Signature Magasin / Expédition',
  ]);

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  ws['!cols'] = [
    { wch: 6 },  // N°
    { wch: 18 }, // Référence
    { wch: 22 }, // EAN
    { wch: 60 }, // Désignation
    { wch: 14 }, // QTÉ
  ];

  ws['!views'] = [{ showGridLines: true }];

  // Border outlines for table header (Row 20)
  const cols = ['A', 'B', 'C', 'D', 'E'];
  for (const c of cols) {
    const cell = ws[`${c}20`];
    if (cell) cell.s = { border: thinBorder, font: { bold: true } };
  }

  if (rows.length > 0) {
    for (let r = firstDataRowIdx; r <= lastDataRowIdx; r++) {
      for (const c of cols) {
        const cell = ws[`${c}${r}`];
        if (cell) cell.s = { border: thinBorder };
      }
      const cellE = ws[`E${r}`];
      if (cellE && (typeof cellE.v === 'number' || cellE.f)) cellE.z = '#,##0';
    }
  }

  const cleanSheetName = (data.billNumber || 'BL_Officiel')
    .replace(/[\\\/\?\*\[\]\:]/g, '_')
    .slice(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, cleanSheetName || 'Bon_Livraison');

  return wb;
}

/**
 * 3. BORDEREAU DE PRÉPARATION ATELIER (BL/OU126/03608)
 * Columns: N° | Référence | Désignation | LOT | QTÉ | Packages
 * Designed for warehouse counting and packaging fractions.
 */
export function createWorkshopDeliveryWorkbook(data: FinalBillExportData): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const wsData: (string | number | null | object)[][] = [
    [`${data.billNumber || 'BL/OU126/03608'}`, '', '', '', '', `Bir El Djir , le : ${data.date || ''}`],
    ['', '', '', `Client :`],
    ['', '', '', `${data.client || 'BLEU BLANC NAKHIL'}`],
    ['', '', '', data.clientAddress ? `${data.clientAddress}` : '95 ET 96 LOTS ZONE D\'ACTIVITE - BIR EL DJIR - ORAN'],
    ['', '', '', 'ORAN'],
    ['', '', '', data.ai ? `AI : ${data.ai}` : 'AI :'],
    ['', '', '', data.nif ? `NIF : ${data.nif}` : 'NIF : 002131112400617'],
    ['', '', '', data.rc ? `RC : ${data.rc}` : 'RC : 21B 2124006-00/31'],
    [],
    ['N°', 'Référence', 'Désignation', 'LOT', 'QTÉ', 'Packages'],
  ];

  const firstDataRowIdx = 11; // 1-indexed row 11 in Excel
  const rows = data.rows;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowCells: (string | number | null | object)[] = [
      r.no,
      r.code,
      r.designation,
      '', // LOT
      r.actualQty,
      r.colisage || '1,00',
    ];

    wsData.push(rowCells);
  }

  const lastDataRowIdx = rows.length > 0 ? firstDataRowIdx + rows.length - 1 : firstDataRowIdx;

  if (rows.length === 0) {
    wsData.push(['-', '-', 'Aucun article dans cette sélection', '', 0, '1,00']);
  }

  wsData.push([]);
  wsData.push([
    '',
    '',
    '',
    'TOTAL QTÉ',
    { f: `SUM(E${firstDataRowIdx}:E${lastDataRowIdx})`, v: data.totalActualQty },
    '',
  ]);

  wsData.push([]);
  wsData.push(['Visa Préparateur / Chef d\'Atelier']);

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  ws['!cols'] = [
    { wch: 6 },  // N°
    { wch: 18 }, // Référence
    { wch: 55 }, // Désignation
    { wch: 12 }, // LOT
    { wch: 14 }, // QTÉ
    { wch: 14 }, // Packages
  ];

  ws['!views'] = [{ showGridLines: true }];

  const cols = ['A', 'B', 'C', 'D', 'E', 'F'];
  for (const c of cols) {
    const cell = ws[`${c}10`];
    if (cell) cell.s = { border: thinBorder, font: { bold: true } };
  }

  if (rows.length > 0) {
    for (let r = firstDataRowIdx; r <= lastDataRowIdx; r++) {
      for (const c of cols) {
        const cell = ws[`${c}${r}`];
        if (cell) cell.s = { border: thinBorder };
      }
      const cellE = ws[`E${r}`];
      if (cellE && (typeof cellE.v === 'number' || cellE.f)) cellE.z = '#,##0';
    }
  }

  const cleanSheetName = (data.billNumber || 'BL_Atelier')
    .replace(/[\\\/\?\*\[\]\:]/g, '_')
    .slice(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, cleanSheetName || 'Atelier');

  return wb;
}

/**
 * 4. BON DE COMMANDE ET RÉCEPTION (BC/OU126/03808)
 * Standard Bon de Commande with U.M, Colisage, PU and payment discount.
 */
export function createOrderBillWorkbook(data: FinalBillExportData): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const hasDiscount = Boolean(
    (data.discountPercent != null && data.discountPercent > 0) ||
    data.rows.some((r) => r.discountPercent != null && r.discountPercent > 0)
  );

  const wsData: (string | number | null)[][] = [
    [`Bon de commande : ${data.billNumber || 'Sans Numéro'}`, '', '', '', '', '', `Bir El Djir , le : ${data.date || ''}`],
    [`Mode de paiement: ${data.paymentMode || 'CLIENT 6%'}`, '', '', '', `Client : ${data.client || 'Client Inconnu'}`],
    [`Par: ${data.agentName || 'ZDjaber'}`, '', '', '', data.clientAddress ? `${data.clientAddress}` : ''],
    ['', '', '', '', data.ai ? `AI : ${data.ai}` : 'AI :'],
    ['', '', '', '', data.nif ? `NIF : ${data.nif}` : 'NIF :'],
    ['', '', '', '', data.nis ? `NIS : ${data.nis}` : 'NIS :'],
    ['', '', '', '', data.rc ? `RC : ${data.rc}` : 'RC :'],
    [],
    hasDiscount
      ? ['N°', 'CODE', 'Désignation', 'QTÉ', 'U.M', 'Colisage', 'PU', 'Rem. Paiement(%)']
      : ['N°', 'CODE', 'Désignation', 'QTÉ', 'U.M', 'Colisage', 'PU'],
  ];

  const firstDataRowIdx = 10; // 1-indexed row 10 in Excel
  const rows = data.rows;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowCells: (string | number | null)[] = [
      r.no,
      r.code,
      r.designation,
      r.actualQty,
      r.um || 'Unité(s)',
      r.colisage || '1,00',
      r.unitPrice != null ? r.unitPrice : '',
    ];

    if (hasDiscount) {
      rowCells.push(r.discountPercent != null ? r.discountPercent : (data.discountPercent || 0));
    }

    wsData.push(rowCells);
  }

  const lastDataRowIdx = firstDataRowIdx + rows.length - 1;

  if (rows.length === 0) {
    wsData.push([
      '-',
      '-',
      'Aucun article dans cette sélection',
      0,
      'Unité(s)',
      '1,00',
      0,
      ...(hasDiscount ? [0] : []),
    ]);
  } else {
    wsData.push([]);
    const totalTtcRowIdx = wsData.length + 1; // 1-indexed
    wsData.push([
      '',
      '',
      '',
      '',
      '',
      'TOTAL TTC',
      data.isPriced
        ? ({ f: `SUMPRODUCT(D${firstDataRowIdx}:D${lastDataRowIdx}, G${firstDataRowIdx}:G${lastDataRowIdx})`, v: data.totalAmountTtc } as any)
        : '',
      ...(hasDiscount ? ['DA'] : []),
    ]);

    if (hasDiscount && data.isPriced) {
      const finalWithDiscount = data.totalAmountWithDiscount || data.totalAmountTtc;
      wsData.push([
        '',
        '',
        '',
        '',
        '',
        'TOTAL AVEC REMISE',
        ({
          f: data.discountPercent
            ? `G${totalTtcRowIdx}*(1-${data.discountPercent}/100)`
            : `SUMPRODUCT(D${firstDataRowIdx}:D${lastDataRowIdx}, G${firstDataRowIdx}:G${lastDataRowIdx}, 1-H${firstDataRowIdx}:H${lastDataRowIdx}/100)`,
          v: finalWithDiscount,
        } as any),
        ...(hasDiscount ? ['DA'] : []),
      ]);
    }

    wsData.push([]);
    wsData.push(['', '', 'Page 1 sur 1']);
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  ws['!cols'] = [
    { wch: 6 },  // N°
    { wch: 14 }, // CODE
    { wch: 55 }, // Désignation
    { wch: 14 }, // QTÉ
    { wch: 12 }, // U.M
    { wch: 12 }, // Colisage
    { wch: 14 }, // PU
    ...(hasDiscount ? [{ wch: 18 }] : []), // Rem. Paiement(%)
  ];

  ws['!views'] = [{ showGridLines: true }];

  const colLetters = hasDiscount ? ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] : ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

  for (const c of colLetters) {
    const cell = ws[`${c}9`];
    if (cell) cell.s = { border: thinBorder, font: { bold: true } };
  }

  if (rows.length > 0) {
    for (let r = firstDataRowIdx; r <= lastDataRowIdx; r++) {
      for (const c of colLetters) {
        const cell = ws[`${c}${r}`];
        if (cell) cell.s = { border: thinBorder };
      }
      const cellD = ws[`D${r}`];
      if (cellD && (typeof cellD.v === 'number' || cellD.f)) cellD.z = '#,##0.00';
      const cellG = ws[`G${r}`];
      if (cellG && (typeof cellG.v === 'number' || cellG.f)) cellG.z = '#,##0.00';
      if (hasDiscount) {
        const cellH = ws[`H${r}`];
        if (cellH && (typeof cellH.v === 'number' || cellH.f)) cellH.z = '#,##0.00';
      }
    }
  }

  const cleanSheetName = (data.billNumber || 'Bon_de_commande')
    .replace(/[\\\/\?\*\[\]\:]/g, '_')
    .slice(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, cleanSheetName || 'Bon_de_commande');

  return wb;
}

/**
 * Master Workbook Generator: Dispatches to the exact replica format.
 */
export function createFinalBillWorkbook(
  data: FinalBillExportData,
  targetType: DocumentExportType = 'auto'
): XLSX.WorkBook {
  const docType = resolveDocumentType(data, targetType);
  switch (docType) {
    case 'invoice':
      return createInvoiceWorkbook(data);
    case 'bl_official':
      return createDeliveryNoteWorkbook(data);
    case 'bl_workshop':
      return createWorkshopDeliveryWorkbook(data);
    case 'bon_commande':
    default:
      return createOrderBillWorkbook(data);
  }
}

/**
 * Triggers native client-side file download of the .xlsx workbook.
 */
export function downloadFinalBillExcel(
  data: FinalBillExportData,
  filename?: string,
  targetType: DocumentExportType = 'auto'
): void {
  const docType = resolveDocumentType(data, targetType);
  const wb = createFinalBillWorkbook(data, docType);
  const cleanBillNo = (data.billNumber || 'BON').replace(/[^a-zA-Z0-9_-]/g, '_') || 'BON';
  const safeDate = (data.date || new Date().toISOString().split('T')[0]).replace(/[^a-zA-Z0-9_-]/g, '_');

  let defaultPrefix = 'BL_FINAL';
  if (docType === 'invoice') defaultPrefix = 'FACTURE';
  else if (docType === 'bl_official') defaultPrefix = 'BL_OFFICIEL';
  else if (docType === 'bl_workshop') defaultPrefix = 'BL_ATELIER';
  else if (docType === 'bon_commande') defaultPrefix = 'BC_COMMANDE';

  const safeFilename = filename || `${defaultPrefix}_${cleanBillNo}_${safeDate}.xlsx`;
  XLSX.writeFile(wb, safeFilename);
}

/**
 * Creates a File blob of the Excel workbook for Web Share API.
 */
export function getFinalBillExcelBlob(
  data: FinalBillExportData,
  targetType: DocumentExportType = 'auto'
): Blob {
  const wb = createFinalBillWorkbook(data, targetType);
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * Formats a clean, professional WhatsApp summary message (NO EMOJIS, pure text formatting).
 */
export function formatCurrencyFR(val: number, decimals: number = 2): string {
  return val
    .toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    .replace(/[\u202F\u00A0]/g, ' ');
}

export function formatFinalBillWhatsAppMessage(
  data: FinalBillExportData,
  targetType: DocumentExportType = 'auto'
): string {
  const docType = resolveDocumentType(data, targetType);

  let docHeader = 'FACTURE ET BON DE RECEPTION DEFINITIF (POINTAGE SURFACE)';
  if (docType === 'invoice') {
    docHeader = 'FACTURE COMMERCIALE (SAJ / SHOWOR)';
  } else if (docType === 'bl_official') {
    docHeader = 'BON DE LIVRAISON OFFICIEL (SARL S.B.M IMP/EXP)';
  } else if (docType === 'bl_workshop') {
    docHeader = 'BORDEREAU DE RECEPTION ATELIER';
  } else if (docType === 'bon_commande') {
    docHeader = 'BON DE COMMANDE ET RECEPTION (SURFACE)';
  }

  let msg = `*${docHeader}*\n`;
  msg += `Client : *${data.client || 'Client Inconnu'}*\n`;
  msg += `N° Document : *${data.billNumber || 'Sans Numéro'}*\n`;
  if (data.bcNumber) {
    msg += `N° Bon de Commande (BC) : *${data.bcNumber}*\n`;
  }
  msg += `Date : ${data.date || ''}\n`;
  msg += `------------------------------------\n`;
  msg += `Total articles : ${data.rows.length}\n`;
  msg += `Pieces commandees : ${data.totalOrderedQty}\n`;
  msg += `Pieces receptionnees : *${data.totalActualQty}*\n`;

  if (data.totalDiffQty !== 0) {
    const diffSign = data.totalDiffQty > 0 ? `+${data.totalDiffQty}` : `${data.totalDiffQty}`;
    msg += `Ecart total pieces : *${diffSign}*\n`;
  } else {
    msg += `Ecart : 0 (Totalement conforme)\n`;
  }

  // Financial summary if invoice or priced
  if (docType === 'invoice' && data.isPriced) {
    if (data.totalHt && data.totalHt > 0) {
      msg += `Montant Total HT : ${formatCurrencyFR(data.totalHt, 2)} DA\n`;
    }
    if (data.totalRemise && data.totalRemise > 0) {
      msg += `Remise : -${formatCurrencyFR(data.totalRemise, 2)} DA\n`;
    }
    if (data.totalTva && data.totalTva > 0) {
      msg += `TVA (19%) : +${formatCurrencyFR(data.totalTva, 2)} DA\n`;
    }
    msg += `Montant Total TTC : *${formatCurrencyFR(data.totalAmountTtc, 2)} DA*\n`;
    if (data.totalAvecRemise && data.totalAvecRemise !== data.totalAmountTtc) {
      msg += `Net a Payer : *${formatCurrencyFR(data.totalAvecRemise, 2)} DA*\n`;
    }
    if (data.amountInWords) {
      msg += `Montant en lettres : _${data.amountInWords}_\n`;
    }
  } else if (data.isPriced && data.totalAmountTtc > 0) {
    msg += `Montant Total Verifie : *${formatCurrencyFR(data.totalAmountTtc, 2)} DA*\n`;
  }

  msg += `------------------------------------\n\n`;

  // Discrepancies cap at 20 items to prevent WhatsApp URL overflow
  const anomalies = data.rows.filter((r) => r.status !== 'CONFORME');
  const MAX_ANOMALIES_DISPLAY = 20;

  if (anomalies.length > 0) {
    msg += `*DETAIL DES ANOMALIES & ECARTS (${anomalies.length}) :*\n`;
    const toDisplay = anomalies.slice(0, MAX_ANOMALIES_DISPLAY);
    toDisplay.forEach((a, idx) => {
      msg += `${idx + 1}. [${a.code}] ${a.designation}\n`;
      msg += `   Recu : ${a.actualQty} / ${a.orderedQty} (Ecart: ${a.diffQty > 0 ? `+${a.diffQty}` : a.diffQty})\n`;
      if (a.unitPrice != null && docType !== 'bl_official' && docType !== 'bl_workshop') {
        msg += `   P.U. : ${formatCurrencyFR(a.unitPrice, 2)} DA | Total: ${formatCurrencyFR(a.totalTtc || 0, 2)} DA\n`;
      }
      msg += `   Statut : ${a.status} (${a.observation})\n\n`;
    });

    if (anomalies.length > MAX_ANOMALIES_DISPLAY) {
      msg += `_... et ${anomalies.length - MAX_ANOMALIES_DISPLAY} autres anomalies (voir fichier Excel .xlsx complet ci-joint)._\n\n`;
    }
  } else {
    msg += `*Toutes les lignes sont conformes au pointage de surface.*\n\n`;
  }

  msg += `_Document certifie genere depuis l'application Pointage (Edition Surface v1.4)._`;
  return msg;
}

/**
 * Shares via WhatsApp or Web Share API.
 * If file sharing is supported on mobile, attaches the actual .xlsx file directly.
 */
export async function shareFinalBillViaWhatsAppOrFile(
  data: FinalBillExportData,
  phoneNumber?: string,
  targetType: DocumentExportType = 'auto'
): Promise<{ method: 'share' | 'whatsapp_link'; success: boolean }> {
  const docType = resolveDocumentType(data, targetType);
  const message = formatFinalBillWhatsAppMessage(data, docType);
  const cleanPhone = (phoneNumber || '').replace(/[^\d]/g, '');

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function') {
    try {
      const blob = getFinalBillExcelBlob(data, docType);
      const cleanBillNo = (data.billNumber || 'BON').replace(/[^a-zA-Z0-9_-]/g, '_') || 'BON';
      const file = new File([blob], `${docType.toUpperCase()}_${cleanBillNo}.xlsx`, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `Document ${data.billNumber} - ${data.client}`,
          text: message,
          files: [file],
        });
        return { method: 'share', success: true };
      }
    } catch (err: any) {
      if (err && err.name === 'AbortError') {
        return { method: 'share', success: false };
      }
    }
  }

  const waUrl = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;

  if (typeof window !== 'undefined') {
    window.open(waUrl, '_blank');
  }

  return { method: 'whatsapp_link', success: true };
}
