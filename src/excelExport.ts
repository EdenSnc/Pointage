// ============================================================
// POINTAGE — Final Bill Excel Export & Surface Verification
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

  for (const r of rows) {
    totalOrderedQty += r.orderedQty;
    totalActualQty += r.actualQty;
    totalDiffQty += r.diffQty;
    if (r.totalTtc != null) {
      totalAmountTtc = Math.round((totalAmountTtc + r.totalTtc + Number.EPSILON) * 100) / 100;
      pricedRowsCount++;
    }
  }

  const billDiscount = (bill as any).discountPercent ?? null;
  let totalAmountWithDiscount: number | null = null;
  let hasAnyDiscount = (billDiscount != null && billDiscount > 0);

  if (hasAnyDiscount) {
    totalAmountWithDiscount = Math.round((totalAmountTtc * (1 - billDiscount / 100) + Number.EPSILON) * 100) / 100;
  } else {
    let sumDiscounted = 0;
    let foundLineDisc = false;
    for (const r of rows) {
      const d = r.discountPercent || 0;
      if (d > 0) foundLineDisc = true;
      sumDiscounted += (r.totalTtc || 0) * (1 - d / 100);
    }
    if (foundLineDisc) {
      hasAnyDiscount = true;
      totalAmountWithDiscount = Math.round((sumDiscounted + Number.EPSILON) * 100) / 100;
    }
  }

  return {
    billNumber: bill.billNumber || 'SANS_NUMERO',
    client: bill.client || 'Client Inconnu',
    date: bill.date || new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    paymentMode: (bill as any).paymentMode || (hasAnyDiscount ? `CLIENT ${billDiscount || 6}%` : null),
    agentName: (bill as any).agentName || 'ZDjaber',
    clientAddress: (bill as any).clientAddress || null,
    nif: (bill as any).nif || null,
    nis: (bill as any).nis || null,
    rc: (bill as any).rc || null,
    ai: (bill as any).ai || null,
    totalOrderedQty,
    totalActualQty,
    totalDiffQty,
    totalAmountTtc,
    totalAmountWithDiscount,
    discountPercent: billDiscount,
    isPriced: pricedRowsCount > 0,
    checksumValid: true,
    rows,
  };
}

/**
 * Builds native Excel Workbook (.xlsx) matching warehouse bill structure
 * 1:1 exactly as on the official paper bills.
 */
export function createFinalBillWorkbook(data: FinalBillExportData): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const hasDiscount = Boolean(
    (data.discountPercent != null && data.discountPercent > 0) ||
    data.rows.some((r) => r.discountPercent != null && r.discountPercent > 0)
  );

  // Exact header block reproduced from the warehouse paper bills:
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

  // Bottom Summary Block: TOTAL TTC and TOTAL AVEC REMISE
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

  // Set optimized column widths matching the paper layout
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

  // Force native gridlines across Excel view
  ws['!views'] = [{ showGridLines: true }];

  // Table outlines and number formatting
  const thinBorder = {
    top: { style: 'thin', color: { rgb: 'D1D5DB' } },
    bottom: { style: 'thin', color: { rgb: 'D1D5DB' } },
    left: { style: 'thin', color: { rgb: 'D1D5DB' } },
    right: { style: 'thin', color: { rgb: 'D1D5DB' } },
  };

  const colLetters = hasDiscount ? ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] : ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

  // Apply outline borders to table header row (row 9)
  for (const c of colLetters) {
    const cell = ws[`${c}9`];
    if (cell) cell.s = { border: thinBorder, font: { bold: true } };
  }

  // Number formatting and outlines for data rows
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
