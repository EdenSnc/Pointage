import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseExcelImport } from './excelImporter';
import { validateImport } from './importer';

describe('100% Offline Excel & CSV Importer', () => {
  it('parses a standard single-sheet Excel workbook with typical warehouse columns', () => {
    const wb = XLSX.utils.book_new();
    const wsData = [
      ['N°', 'Référence', 'Désignation', 'Code-barres', 'Qté', 'P.U HT', 'Colisage'],
      ['1', 'REF-A1', 'CLASSEUR CHROME 4 ANNEAUX', '613000000001', 50, 450, '10 PCS/CTN'],
      ['2', 'REF-B2', 'STYLO A BILLE BLEU 0.7', '613000000002', 200, 25, '50 PCS/BTE'],
      ['3', 'REF-C3', 'CAHIER PIQUE 96P 17X22', '613000000003', 120, 65, '20 PCS/PAQ'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'Articles');

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const result = parseExcelImport(wbout, 'BL_OU126_03615.xlsx');

    expect(result.parseError).toBeNull();
    expect(result.payload).not.toBeNull();
    expect(result.payload?.bills?.length).toBe(1);

    const bill = result.payload!.bills![0];
    expect(bill.lines?.length).toBe(3);
    expect(bill.lines![0].no).toBe('1');
    expect(bill.lines![0].reference).toBe('REF-A1');
    expect(bill.lines![0].designation).toBe('CLASSEUR CHROME 4 ANNEAUX');
    expect(bill.lines![0].ean).toBe('613000000001');
    expect(bill.lines![0].quantity).toBe(50);
    expect(bill.lines![0].unitPrice).toBe(450);
    expect(bill.lines![0].colisage).toBe('10 PCS/CTN');

    // Validation pass
    const issues = validateImport(result.payload!);
    expect(issues.filter((i) => i.severity === 'error').length).toBe(0);
  });

  it('detects metadata (Client, N° BL, Date) in the pre-header rows and skips summary rows', () => {
    const wb = XLSX.utils.book_new();
    const wsData = [
      ['SARL S.B.M DISTRIBUTION'],
      ['Client : ETS MOHAMED BENALI'],
      ['BL N° : BL/OU126/03615', '', 'Date : 07/09/2026'],
      [''], // empty row
      ['Item', 'Code Article', 'Libellé Produit', 'EAN13', 'Quantité', 'Tarif'],
      ['10', 'SKU-99', 'AGRAFEUSE METAL 24/6', '613999999999', 40, 320],
      ['20', 'SKU-88', 'BOITE DE 1000 AGRAFES', '613888888888', 100, 45],
      ['Total HT', '', '', '', '', 17300],
      ['Net à payer', '', '', '', '', 20587],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'Feuille1');

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const result = parseExcelImport(wbout, 'import.xlsx');

    expect(result.parseError).toBeNull();
    const bill = result.payload!.bills![0];
    expect(bill.client).toContain('MOHAMED BENALI');
    expect(bill.billNumber).toBe('BL/OU126/03615');
    expect(bill.date).toBe('07/09/2026');

    // Should only have 2 real lines, skipping Total and Net à payer
    expect(bill.lines?.length).toBe(2);
    expect(bill.lines![0].designation).toBe('AGRAFEUSE METAL 24/6');
    expect(bill.lines![1].designation).toBe('BOITE DE 1000 AGRAFES');
  });

  it('parses a multi-sheet Excel file into multiple bills', () => {
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet([
      ['Désignation', 'Qte'],
      ['PRODUIT ALFA', 10],
    ]);
    const ws2 = XLSX.utils.aoa_to_sheet([
      ['Article', 'Quantite'],
      ['PRODUIT BETA', 25],
    ]);
    XLSX.utils.book_append_sheet(wb, ws1, 'CLIENT_ALFA');
    XLSX.utils.book_append_sheet(wb, ws2, 'CLIENT_BETA');

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const result = parseExcelImport(wbout, 'multi_commandes.xlsx');

    expect(result.parseError).toBeNull();
    expect(result.payload?.bills?.length).toBe(2);
    expect(result.payload!.bills![0].client).toBe('CLIENT_ALFA');
    expect(result.payload!.bills![0].lines![0].designation).toBe('PRODUIT ALFA');
    expect(result.payload!.bills![1].client).toBe('CLIENT_BETA');
    expect(result.payload!.bills![1].lines![0].designation).toBe('PRODUIT BETA');
  });

  it('parses raw CSV text encoded in a Uint8Array', () => {
    const csvContent = `Designation;Qte;Ref;Prix
"SCOTCH TRANSPARENT 48MM";60;"SCT-48";150
"CUTTER METALLIQUE 18MM";30;"CTR-18";220`;

    const encoder = new TextEncoder();
    const buffer = encoder.encode(csvContent);

    const result = parseExcelImport(buffer, 'export_fournisseur.csv');
    expect(result.parseError).toBeNull();
    expect(result.payload?.bills?.length).toBe(1);
    expect(result.payload!.bills![0].lines?.length).toBe(2);
    expect(result.payload!.bills![0].lines![0].designation).toBe('SCOTCH TRANSPARENT 48MM');
    expect(result.payload!.bills![0].lines![0].quantity).toBe(60);
    expect(result.payload!.bills![0].lines![1].reference).toBe('CTR-18');
  });

  it('returns clean error when file has no content or invalid structure', () => {
    const emptyBuffer = new Uint8Array(0);
    const result = parseExcelImport(emptyBuffer, 'vide.xlsx');
    expect(result.payload).toBeNull();
    expect(result.parseError).toBeDefined();
  });
});
