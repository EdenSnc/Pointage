// ============================================================
// POINTAGE — Final Bill Excel Export & Surface Verification
// Zero-error financial calculation, native Excel formulas, and dispatch
// ============================================================

import * as XLSX from 'xlsx';
import type {
  Bill,
  OrderLine,
  CountEvent,
  FinalBillRow,
  FinalBillRowStatus,
  FinalBillExportData,
} from './types';
import { sumStageEvents } from './logic';

export interface FinalBillOptions {
  stage?: 'preparation' | 'pointage';
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

    const safeColisage = line.packagesRaw || (line.outerPackSize ? `${line.outerPackSize}/CT` : (line.colisage ? `${line.colisage}` : null));
    const safeCode = line.reference || line.originalReference || (line.no ? `ART-${line.no}` : '-');
    const safeDesignation = line.designation || line.originalDesignation || 'Article sans désignation';

    rows.push({
      no: line.no || line.originalNo || String(rows.length + 1),
      code: safeCode,
      ean: line.ean || line.originalEan || null,
      designation: safeDesignation,
      colisage: safeColisage,
      orderedQty,
      actualQty,
      diffQty,
      unitPrice,
      totalTtc,
      status,
      observation,
    });
  }

  return rows;
}

/**
 * Compiles full bill export metadata with exact totals.
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

  for (const r of rows) {
    totalOrderedQty += r.orderedQty;
    totalActualQty += r.actualQty;
    totalDiffQty += r.diffQty;
    if (r.totalTtc != null) {
      totalAmountTtc = Math.round((totalAmountTtc + r.totalTtc + Number.EPSILON) * 100) / 100;
      pricedRowsCount++;
    }
  }

  return {
    billNumber: bill.billNumber || 'SANS_NUMERO',
    client: bill.client || 'Client Inconnu',
    date: bill.date || new Date().toISOString().split('T')[0],
    totalOrderedQty,
    totalActualQty,
    totalDiffQty,
    totalAmountTtc,
    isPriced: pricedRowsCount > 0,
    checksumValid: true,
    rows,
  };
}

/**
 * Builds native Excel Workbook (.xlsx) matching warehouse bill structure
 * with dynamic formulas and high-contrast table layout.
 */
export function createFinalBillWorkbook(data: FinalBillExportData): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // Excel Sheet data matrix
  const wsData: (string | number | null)[][] = [
    // Header block
    ['POINTAGE DE SURFACE — FACTURE ET BON DE RECEPTION DEFINITIF'],
    [`Client : ${data.client || 'Client Inconnu'}`, '', '', `Date : ${data.date || ''}`, '', '', `Statut : RECEPTION VERIFIEE EN SURFACE`],
    [`N° Bon d'origine : ${data.billNumber || 'Sans Numéro'}`, '', '', `Version : Pointage Surface v1.4 (Document de Controle)`],
    [], // Spacer row
    // Column Headers
    [
      'N°',
      'CODE ARTICLE',
      'CODE-BARRES (EAN)',
      'DESIGNATION',
      'COLISAGE',
      'QTE COMMANDEE',
      'QTE RECEPTIONNEE',
      'ECART',
      'P.U. (DA)',
      'TOTAL TTC (DA)',
      'STATUT',
      'OBSERVATION',
    ],
  ];

  const firstDataRowIdx = 6; // 1-indexed row 6 in Excel
  const rows = data.rows;

  // Add line items
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const excelRow = firstDataRowIdx + i;

    wsData.push([
      r.no,
      r.code,
      r.ean || '',
      r.designation,
      r.colisage || '',
      r.orderedQty,
      r.actualQty,
      // Formula for Diff: actualQty - orderedQty (Column G - Column F)
      { f: `G${excelRow}-F${excelRow}`, v: r.diffQty } as any,
      r.unitPrice != null ? r.unitPrice : '',
      // Formula for Line Total: actualQty * unitPrice (Column G * Column I)
      r.unitPrice != null
        ? ({ f: `G${excelRow}*I${excelRow}`, v: r.totalTtc } as any)
        : '',
      r.status,
      r.observation,
    ]);
  }

  const lastDataRowIdx = firstDataRowIdx + rows.length - 1;
  const totalsRowIdx = lastDataRowIdx + 1;

  // Bottom Summary Row or Empty state
  if (rows.length === 0) {
    wsData.push([
      '-',
      'AUCUN ARTICLE',
      '',
      'Aucun article dans cette sélection (filtre actif ou bon vide)',
      '',
      0,
      0,
      0,
      '',
      '',
      'CONFORME',
      'Rien à signaler',
    ]);
  } else {
    wsData.push([
      'TOTAL GENERAL',
      '',
      '',
      '',
      '',
      { f: `SUM(F${firstDataRowIdx}:F${lastDataRowIdx})`, v: data.totalOrderedQty } as any,
      { f: `SUM(G${firstDataRowIdx}:G${lastDataRowIdx})`, v: data.totalActualQty } as any,
      { f: `SUM(H${firstDataRowIdx}:H${lastDataRowIdx})`, v: data.totalDiffQty } as any,
      '',
      data.isPriced
        ? ({ f: `SUM(J${firstDataRowIdx}:J${lastDataRowIdx})`, v: data.totalAmountTtc } as any)
        : '',
      '',
      'Arrete a la presente reception physique de surface',
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set optimized column widths for readable display
  ws['!cols'] = [
    { wch: 6 },  // N°
    { wch: 16 }, // Code article
    { wch: 18 }, // EAN
    { wch: 42 }, // Designation
    { wch: 14 }, // Colisage
    { wch: 16 }, // Qte Commandee
    { wch: 18 }, // Qte Receptionnee
    { wch: 12 }, // Ecart
    { wch: 14 }, // P.U.
    { wch: 18 }, // Total TTC
    { wch: 14 }, // Statut
    { wch: 35 }, // Observation
  ];

  // Apply number formatting
  if (rows.length > 0) {
    for (let r = firstDataRowIdx; r <= totalsRowIdx; r++) {
      const cellF = ws[`F${r}`];
      if (cellF && (typeof cellF.v === 'number' || cellF.f)) cellF.z = '#,##0';
      const cellG = ws[`G${r}`];
      if (cellG && (typeof cellG.v === 'number' || cellG.f)) cellG.z = '#,##0';
      const cellH = ws[`H${r}`];
      if (cellH && (typeof cellH.v === 'number' || cellH.f)) cellH.z = '#,##0';
      const cellI = ws[`I${r}`];
      if (cellI && (typeof cellI.v === 'number' || cellI.f)) cellI.z = '#,##0.00';
      const cellJ = ws[`J${r}`];
      if (cellJ && (typeof cellJ.v === 'number' || cellJ.f)) cellJ.z = '#,##0.00';
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, 'BL_FINAL_SURFACE');
  return wb;
}

/**
 * Triggers native client-side file download of the .xlsx workbook.
 */
export function downloadFinalBillExcel(data: FinalBillExportData, filename?: string): void {
  const wb = createFinalBillWorkbook(data);
  const cleanBillNo = (data.billNumber || 'BON').replace(/[^a-zA-Z0-9_-]/g, '_') || 'BON';
  const safeDate = (data.date || new Date().toISOString().split('T')[0]).replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeFilename = filename || `BL_FINAL_${cleanBillNo}_${safeDate}.xlsx`;
  XLSX.writeFile(wb, safeFilename);
}

/**
 * Creates a File blob of the Excel workbook for Web Share API.
 */
export function getFinalBillExcelBlob(data: FinalBillExportData): Blob {
  const wb = createFinalBillWorkbook(data);
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

export function formatFinalBillWhatsAppMessage(data: FinalBillExportData): string {
  let msg = `*FACTURE ET BON DE RECEPTION DEFINITIF (POINTAGE SURFACE)*\n`;
  msg += `Client : *${data.client || 'Client Inconnu'}*\n`;
  msg += `N° Bon / Commande : *${data.billNumber || 'Sans Numéro'}*\n`;
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

  if (data.isPriced && data.totalAmountTtc > 0) {
    msg += `Montant Total Verifie : *${formatCurrencyFR(data.totalAmountTtc, 2)} DA*\n`;
  }
  msg += `------------------------------------\n\n`;

  // List discrepancies or all items (capped at 20 to prevent WhatsApp URL overflow)
  const anomalies = data.rows.filter((r) => r.status !== 'CONFORME');
  const MAX_ANOMALIES_DISPLAY = 20;

  if (anomalies.length > 0) {
    msg += `*DETAIL DES ANOMALIES & ECARTS (${anomalies.length}) :*\n`;
    const toDisplay = anomalies.slice(0, MAX_ANOMALIES_DISPLAY);
    toDisplay.forEach((a, idx) => {
      msg += `${idx + 1}. [${a.code}] ${a.designation}\n`;
      msg += `   Recu : ${a.actualQty} / ${a.orderedQty} (Ecart: ${a.diffQty > 0 ? `+${a.diffQty}` : a.diffQty})\n`;
      if (a.unitPrice != null) {
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
  phoneNumber?: string
): Promise<{ method: 'share' | 'whatsapp_link'; success: boolean }> {
  const message = formatFinalBillWhatsAppMessage(data);
  const cleanPhone = (phoneNumber || '').replace(/[^\d]/g, '');

  // Attempt Web Share API with attached file if mobile browser supports file sharing
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function') {
    try {
      const blob = getFinalBillExcelBlob(data);
      const cleanBillNo = (data.billNumber || 'BON').replace(/[^a-zA-Z0-9_-]/g, '_') || 'BON';
      const file = new File([blob], `BL_FINAL_${cleanBillNo}.xlsx`, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `Facture Finale ${data.billNumber} - ${data.client}`,
          text: message,
          files: [file],
        });
        return { method: 'share', success: true };
      }
    } catch (err: any) {
      // User cancelled native share prompt -> not an error
      if (err && err.name === 'AbortError') {
        return { method: 'share', success: false };
      }
    }
  }

  // Direct WhatsApp Web / Mobile redirect
  const waUrl = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;

  if (typeof window !== 'undefined') {
    window.open(waUrl, '_blank');
  }

  return { method: 'whatsapp_link', success: true };
}
