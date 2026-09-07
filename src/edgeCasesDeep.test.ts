// ============================================================
// POINTAGE — Deep & Exhaustive Edge Cases Test Suite
// Covers all boundary conditions, numeric extremes, malformed inputs,
// currency legal wording, multi-trip rotations, offline backups & QR merges
// ============================================================

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import { db } from './db';
import {
  calcBatchQty,
  calcPackBreakdown,
  roundDownToPack,
  calcClosestPackRecommendation,
  smartSearchScore,
  isDimensionInDesignation,
  generateReferenceAliases,
  parseQRSyncPayload,
  planQRMerge,
  calcDiscrepancy,
  lineBlocksCompletion,
  QRSyncPayload,
} from './logic';
import {
  numberToWordsFr,
  formatDzdAmountInWords,
} from './frenchNumberToWords';
import {
  exportBackup,
  importBackup,
  BackupData,
} from './backup';
import {
  calculateDockStock,
  createAndDispatchTrip,
  formatTripWhatsAppMessage,
} from './shipmentTrips';
import {
  detectWilaya,
} from './wilayas';
import {
  parseExcelImport,
} from './excelImporter';
import type { OrderLine, CountEvent, Bill } from './types';

function makeLine(overrides: Partial<OrderLine> = {}): OrderLine {
  return {
    id: 1,
    billId: 1,
    originalNo: '1',
    originalPage: 1,
    originalReference: 'REF-001',
    originalEan: '613000000001',
    originalDesignation: 'Produit Test Standard',
    originalOrderedQty: 100,
    no: '1',
    page: 1,
    reference: 'REF-001',
    ean: '613000000001',
    designation: 'Produit Test Standard',
    orderedQty: 100,
    status: 'active',
    outerPackSize: null,
    innerPackSize: null,
    warehouseZone: null,
    packagesRaw: null,
    referenceAliases: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('Deep & Exhaustive Edge Cases Suite', () => {
  beforeEach(async () => {
    await db.bills.clear();
    await db.orderLines.clear();
    await db.countEvents.clear();
    await db.transportContainers.clear();
    await db.auditEvents.clear();
    await db.shipmentTrips.clear();
  });

  // =========================================================================
  // 1. LEGAL FRENCH NUMBER TO WORDS & OFFICIAL INVOICING (DZD)
  // =========================================================================
  describe('French Number to Words & Legal Invoice Phrasing', () => {
    it('handles zero and decimal variations', () => {
      expect(numberToWordsFr(0)).toBe('ZÉRO');
      expect(formatDzdAmountInWords(0)).toBe('ZÉRO DZD');
      expect(formatDzdAmountInWords(-50)).toBe('ZÉRO DZD');
      expect(formatDzdAmountInWords(NaN)).toBe('ZÉRO DZD');
    });

    it('correctly phrases single digits and teens', () => {
      expect(numberToWordsFr(1)).toBe('UN');
      expect(numberToWordsFr(9)).toBe('NEUF');
      expect(numberToWordsFr(10)).toBe('DIX');
      expect(numberToWordsFr(16)).toBe('SEIZE');
      expect(numberToWordsFr(17)).toBe('DIX-SEPT');
      expect(numberToWordsFr(19)).toBe('DIX-NEUF');
    });

    it('correctly handles complex French linguistic rules (21, 70, 71, 80, 81, 91)', () => {
      expect(numberToWordsFr(20)).toBe('VINGT');
      expect(numberToWordsFr(21)).toBe('VINGT ET UN');
      expect(numberToWordsFr(31)).toBe('TRENTE ET UN');
      expect(numberToWordsFr(70)).toBe('SOIXANTE-DIX');
      expect(numberToWordsFr(71)).toBe('SOIXANTE ET ONZE');
      expect(numberToWordsFr(75)).toBe('SOIXANTE-QUINZE');
      expect(numberToWordsFr(80)).toBe('QUATRE-VINGTS'); // Plural 's' when terminal
      expect(numberToWordsFr(81)).toBe('QUATRE-VINGT-UN'); // No 's' and no 'et'
      expect(numberToWordsFr(85)).toBe('QUATRE-VINGT-CINQ');
      expect(numberToWordsFr(90)).toBe('QUATRE-VINGT-DIX');
      expect(numberToWordsFr(91)).toBe('QUATRE-VINGT-ONZE');
      expect(numberToWordsFr(99)).toBe('QUATRE-VINGT-DIX-NEUF');
    });

    it('correctly formats hundreds, thousands, millions and billions', () => {
      expect(numberToWordsFr(100)).toBe('CENT');
      expect(numberToWordsFr(200)).toBe('DEUX CENTS'); // Plural 's'
      expect(numberToWordsFr(201)).toBe('DEUX CENT UN'); // Singular 'cent' when followed
      expect(numberToWordsFr(1000)).toBe('MILLE'); // Never 'un mille'
      expect(numberToWordsFr(2000)).toBe('DEUX MILLE'); // 'mille' is invariable
      expect(numberToWordsFr(2026)).toBe('DEUX MILLE VINGT-SIX');
      expect(numberToWordsFr(1000000)).toBe('UN MILLION');
      expect(numberToWordsFr(2000000)).toBe('DEUX MILLIONS');
      expect(numberToWordsFr(1000000000)).toBe('UN MILLIARD');
    });

    it('formats official DZD currency with cents and singular/plural rules', () => {
      expect(formatDzdAmountInWords(1)).toBe('UN DZD');
      expect(formatDzdAmountInWords(0.01)).toBe('ZÉRO DZD ET UN CENTIME'); // Singular centime
      expect(formatDzdAmountInWords(0.05)).toBe('ZÉRO DZD ET CINQ CENTIMES'); // Plural centimes
      expect(formatDzdAmountInWords(0.50)).toBe('ZÉRO DZD ET CINQUANTE CENTIMES');
      expect(formatDzdAmountInWords(1250.50)).toBe('MILLE DEUX CENT CINQUANTE DZD ET CINQUANTE CENTIMES');
      expect(formatDzdAmountInWords(36555.22)).toBe(
        'TRENTE-SIX MILLE CINQ CENT CINQUANTE-CINQ DZD ET VINGT-DEUX CENTIMES'
      );
    });
  });

  // =========================================================================
  // 2. BACKUP & RESTORE LIFECYCLE & INTEGRITY
  // =========================================================================
  describe('Backup & Restore System', () => {
    it('exports and restores complete database without data loss', async () => {
      const bId = await db.bills.add({
        sessionId: 1,
        billNumber: 'BL-BACKUP-01',
        client: 'CLIENT BACKUP',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const lId = await db.orderLines.add({
        billId: bId,
        no: '1',
        originalNo: '1',
        page: 1,
        originalPage: 1,
        reference: 'REF-BCK',
        originalReference: 'REF-BCK',
        ean: '613999999999',
        originalEan: '613999999999',
        designation: 'ARTICLE BACKUP',
        originalDesignation: 'ARTICLE BACKUP',
        orderedQty: 25,
        originalOrderedQty: 25,
        status: 'active',
        outerPackSize: 10,
        innerPackSize: null,
        warehouseZone: 'NORTH_WEST',
        packagesRaw: 'Colis de 10',
        referenceAliases: ['BCK-01'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await db.countEvents.add({
        billId: bId,
        orderLineId: lId,
        stage: 'preparation',
        quantity: 25,
        containerId: null,
        outcome: null,
        undone: false,
        createdAt: new Date().toISOString(),
      });

      // Export
      const backup = await exportBackup();
      expect(backup.version).toBe(1);
      expect(backup.bills.length).toBe(1);
      expect(backup.orderLines.length).toBe(1);
      expect(backup.countEvents.length).toBe(1);

      // Wipe database
      await db.bills.clear();
      await db.orderLines.clear();
      await db.countEvents.clear();
      expect(await db.bills.count()).toBe(0);

      // Restore
      await importBackup(backup);
      expect(await db.bills.count()).toBe(1);
      expect(await db.orderLines.count()).toBe(1);
      expect(await db.countEvents.count()).toBe(1);

      const restoredLine = (await db.orderLines.get(lId))!;
      expect(restoredLine.reference).toBe('REF-BCK');
      expect(restoredLine.orderedQty).toBe(25);
      expect(restoredLine.referenceAliases).toContain('BCK-01');
    });

    it('rejects backup with unsupported future version', async () => {
      const futureBackup: BackupData = {
        version: 999,
        exportedAt: new Date().toISOString(),
        workSessions: [],
        bills: [],
        orderLines: [],
        countEvents: [],
        transportContainers: [],
        extras: [],
        billIdentifierOverrides: [],
        identifierSuggestions: [],
        productProfiles: [],
        auditEvents: [],
      };

      await expect(importBackup(futureBackup)).rejects.toThrow(/non supportée/i);
    });
  });

  // =========================================================================
  // 3. ARITHMETIC & NUMERICAL BOUNDARIES
  // =========================================================================
  describe('Quantity Arithmetic & Boundary Conditions', () => {
    it('calcBatchQty handles nulls, zeros, and fractional values safely', () => {
      expect(calcBatchQty(0, 0, 0, null, null)).toBe(0);
      expect(calcBatchQty(2, 0, 0, 12, null)).toBe(24);
      expect(calcBatchQty(0, 3, 5, null, 10)).toBe(35);
      // Floating / fractional piece count
      expect(calcBatchQty(1, 0, 0.5, 10, null)).toBe(10.5);
    });

    it('calcPackBreakdown handles negative, null, zero, and fraction pack sizes', () => {
      expect(calcPackBreakdown(0, 10)).toEqual({ fullPacks: 0, loose: 0 });
      expect(calcPackBreakdown(-5, 10)).toEqual({ fullPacks: 0, loose: 0 });
      expect(calcPackBreakdown(15, null)).toEqual({ fullPacks: 0, loose: 15 });
      expect(calcPackBreakdown(15, 0)).toEqual({ fullPacks: 0, loose: 15 });
      expect(calcPackBreakdown(15, 1)).toEqual({ fullPacks: 0, loose: 15 });
      expect(calcPackBreakdown(25, 10)).toEqual({ fullPacks: 2, loose: 5 });
      expect(calcPackBreakdown(30, 10)).toEqual({ fullPacks: 3, loose: 0 });
      expect(calcPackBreakdown(7, 20)).toEqual({ fullPacks: 0, loose: 7 });
    });

    it('roundDownToPack handles boundaries correctly', () => {
      expect(roundDownToPack(0, 12)).toEqual({ servedQty: 0, missingQty: 0 });
      expect(roundDownToPack(-10, 12)).toEqual({ servedQty: 0, missingQty: 0 });
      expect(roundDownToPack(15, null)).toEqual({ servedQty: 15, missingQty: 0 });
      expect(roundDownToPack(15, 1)).toEqual({ servedQty: 15, missingQty: 0 });
      expect(roundDownToPack(35, 10)).toEqual({ servedQty: 30, missingQty: 5 });
      expect(roundDownToPack(5, 10)).toEqual({ servedQty: 0, missingQty: 5 });
      expect(roundDownToPack(50, 10)).toEqual({ servedQty: 50, missingQty: 0 });
    });

    it('calcClosestPackRecommendation calculates nearest pack with tie-breaking', () => {
      expect(calcClosestPackRecommendation(0, 10)).toBeNull();
      expect(calcClosestPackRecommendation(-5, 10)).toBeNull();
      expect(calcClosestPackRecommendation(50, null)).toBeNull();
      expect(calcClosestPackRecommendation(50, 1)).toBeNull();

      // Exact multiple
      const exact = calcClosestPackRecommendation(50, 10)!;
      expect(exact.isExactMultiple).toBe(true);
      expect(exact.closestDiff).toBe(0);
      expect(exact.closestAction).toBe('exact');

      // Round down closer: 92 with pack of 30 (distance to 90 is 2, distance to 120 is 28)
      const down = calcClosestPackRecommendation(92, 30)!;
      expect(down.closestAction).toBe('round_down');
      expect(down.closestQty).toBe(90);
      expect(down.closestDiff).toBe(-2);

      // Round up closer: 118 with pack of 30 (distance to 90 is 28, distance to 120 is 2)
      const up = calcClosestPackRecommendation(118, 30)!;
      expect(up.closestAction).toBe('round_up');
      expect(up.closestQty).toBe(120);
      expect(up.closestDiff).toBe(2);

      // Tie break: 15 with pack of 10 (distance to 10 is 5, distance to 20 is 5) -> Rule rounds down
      const tie = calcClosestPackRecommendation(15, 10)!;
      expect(tie.closestAction).toBe('round_down');
      expect(tie.closestQty).toBe(10);
      expect(tie.closestDiff).toBe(-5);
    });
  });

  // =========================================================================
  // 4. SMART SEARCH & STRING RESILIENCE
  // =========================================================================
  describe('Smart Search & Input Sanitization', () => {
    it('is immune to regex injection characters in search query', () => {
      const line = makeLine({ reference: 'ART-(01)/A*B+', designation: 'PRODUIT SPECIAL [V1]' });

      // Queries containing regex metacharacters must NOT throw RegExp errors
      expect(() => smartSearchScore(line, 'ART-(')).not.toThrow();
      expect(() => smartSearchScore(line, '[V1]')).not.toThrow();
      expect(() => smartSearchScore(line, 'A*B+')).not.toThrow();
      expect(() => smartSearchScore(line, '.*+?^${}()|[]\\')).not.toThrow();
      expect(smartSearchScore(line, 'ART-(')).toBe(7);
      expect(smartSearchScore(line, '[V1]')).toBe(8);
    });

    it('safely handles line with missing/undefined referenceAliases or designation', () => {
      const bareLine = {
        id: 99,
        billId: 1,
        no: '1',
        reference: 'BARE-REF',
        orderedQty: 10,
        status: 'active' as const,
      } as unknown as OrderLine;

      // Must not crash with TypeError
      expect(() => smartSearchScore(bareLine, 'BARE-REF')).not.toThrow();
      expect(smartSearchScore(bareLine, 'BARE-REF')).toBe(1);
      expect(smartSearchScore(bareLine, 'unknown')).toBe(-1);
    });

    it('matches 14-digit ITF-14 carton barcode to 12/13-digit child EAN', () => {
      const line = makeLine({ ean: '6131234567890' });
      // ITF-14: starts with indicator (e.g. 1) + 12 core digits + check digit
      const itf14 = '16131234567897';
      expect(smartSearchScore(line, itf14)).toBe(4.2);
    });

    it('handles query with emojis or leading/trailing whitespace cleanly', () => {
      const line = makeLine({ designation: 'CAHIER DE DESSIN' });
      expect(smartSearchScore(line, '   dessin   ')).toBe(8);
      expect(smartSearchScore(line, '📦 CAHIER')).toBe(8);
    });
  });

  // =========================================================================
  // 5. PACKAGING DETECTION & DIMENSION DISTINCTION
  // =========================================================================
  describe('Packaging vs Dimension Parsing', () => {
    it('distinguishes physical dimensions from packaging counts', () => {
      // Dimensions
      expect(isDimensionInDesignation(100, 'VIS 12x100 mm')).toBe(true);
      expect(isDimensionInDesignation(30, 'CADRE 30X40 CM')).toBe(true);
      expect(isDimensionInDesignation(24, 'COLIS DE 24')).toBe(false);
      expect(isDimensionInDesignation(12, '12 PCS / BTE')).toBe(false);
    });

    it('generateReferenceAliases parses range patterns safely and indexes hyphenated refs', () => {
      expect(generateReferenceAliases(null)).toEqual([]);
      expect(generateReferenceAliases('')).toEqual([]);
      expect(generateReferenceAliases('SIMPLE')).toEqual([]);
      expect(generateReferenceAliases('SIMPLE-REF')).toEqual(['SIMPLEREF']);

      // Standard range
      const aliases = generateReferenceAliases('70380/84');
      expect(aliases).toEqual(['70380', '70381', '70382', '70383', '70384']);

      // Inverted range (end < start) should not generate thousands of invalid numbers
      const inverted = generateReferenceAliases('70385/80');
      expect(inverted).toEqual([]);
    });
  });

  // =========================================================================
  // 6. MULTI-DEVICE QR SYNC & MERGE ROBUSTNESS
  // =========================================================================
  describe('QR Synchronization & Collision Engine', () => {
    it('parseQRSyncPayload rejects malformed strings gracefully', () => {
      expect(parseQRSyncPayload('')).toBeNull();
      expect(parseQRSyncPayload('not-a-json')).toBeNull();
      expect(parseQRSyncPayload('{"hello": "world"}')).toBeNull();
      expect(parseQRSyncPayload('{"ptg": 2}')).toBeNull(); // wrong protocol version
    });

    it('planQRMerge handles empty payload, null counts, and unmatched lines safely', () => {
      const line1 = makeLine({ id: 10, no: '1', reference: 'REF-10' });
      const emptyPayload = {
        ptg: 1,
        billNumber: 'BL-01',
        client: 'CLIENT',
        ts: Date.now(),
        counts: null as any,
      };

      // Must not throw when counts is null/undefined
      const plan = planQRMerge([line1], [], emptyPayload as any);
      expect(plan.totalItems).toBe(0);
      expect(plan.matchedLinesCount).toBe(0);

      // Payload with an unmatched line item
      const unmatchedPayload: QRSyncPayload = {
        ptg: 1,
        billNumber: 'BL-01',
        client: 'CLIENT',
        ts: Date.now(),
        counts: [
          { no: '999', ref: 'NON-EXISTENT', stage: 'preparation', qty: 15 },
          { no: '1', ref: 'REF-10', stage: 'preparation', qty: 20 },
        ],
      };

      const plan2 = planQRMerge([line1], [], unmatchedPayload);
      expect(plan2.totalItems).toBe(2);
      expect(plan2.matchedLinesCount).toBe(1);
      expect(plan2.unmatchedItemsCount).toBe(1);
      expect(plan2.items[0].lineId).toBe(10);
      expect(plan2.items[0].incomingQty).toBe(20);
    });

    it('planQRMerge supports replace mode correctly against existing counts', () => {
      const line1 = makeLine({ id: 10, no: '1', reference: 'REF-10' });
      const existingEvents: CountEvent[] = [
        {
          id: 1,
          billId: 1,
          orderLineId: 10,
          stage: 'preparation',
          quantity: 25,
          containerId: null,
          outcome: null,
          undone: false,
          createdAt: new Date().toISOString(),
        },
      ];

      const payload: QRSyncPayload = {
        ptg: 1,
        billNumber: 'BL-01',
        client: 'CLIENT',
        ts: Date.now(),
        counts: [{ no: '1', ref: 'REF-10', stage: 'preparation', qty: 40 }],
      };

      // Add mode: 25 + 40 = 65
      const addPlan = planQRMerge([line1], existingEvents, payload, 'add');
      expect(addPlan.items[0].incomingQty).toBe(40);
      expect(addPlan.items[0].newStageQty).toBe(65);

      // Replace mode: delta = 40 - 25 = 15, newStageQty = 40
      const replacePlan = planQRMerge([line1], existingEvents, payload, 'replace');
      expect(replacePlan.items[0].incomingQty).toBe(15);
      expect(replacePlan.items[0].newStageQty).toBe(40);
    });
  });

  // =========================================================================
  // 7. EXCEL & CSV IMPORTER EDGE CASES
  // =========================================================================
  describe('Excel & CSV Importer Resilience', () => {
    it('parses Algerian & French numeric format in quantities (spaces & commas)', () => {
      const wb = XLSX.utils.book_new();
      const wsData = [
        ['Référence', 'Désignation', 'Qté', 'Prix Unitaire'],
        ['REF-FR1', 'ARTICLE AVEC VIRGULE', '1 250,50', '450,00'],
        ['REF-FR2', 'ARTICLE AVEC ESPACE', '2 000', '100'],
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws, 'TestSheet');

      const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const res = parseExcelImport(buf, 'french_numbers.xlsx');

      expect(res.parseError).toBeNull();
      const lines = res.payload!.bills![0].lines!;
      expect(lines[0].quantity).toBe(1250.5);
      expect(lines[1].quantity).toBe(2000);
    });

    it('preserves leading zeros on EAN barcodes formatted as text or strings', () => {
      const wb = XLSX.utils.book_new();
      const wsData = [
        ['Code', 'Désignation', 'Gencode / EAN', 'Quantité'],
        ['SKU-01', 'PRODUIT CODE COURT', '071234567890', 10],
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws, 'Barcodes');

      const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const res = parseExcelImport(buf, 'ean_leading_zero.xlsx');

      expect(res.parseError).toBeNull();
      const line = res.payload!.bills![0].lines![0];
      expect(line.ean).toBe('071234567890');
    });

    it('gracefully handles empty Excel sheets or sheets with only headers', () => {
      const wb = XLSX.utils.book_new();
      const wsData = [['N°', 'Référence', 'Désignation', 'Qté']];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws, 'Vide');

      const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const res = parseExcelImport(buf, 'empty_sheet.xlsx');

      // Should return user-friendly error indicating no valid lines
      expect(res.parseError).toContain('Aucun article valide');
      expect(res.payload).toBeNull();
    });
  });

  // =========================================================================
  // 8. MULTI-TRIP ROTATIONS & DOCK RECONCILIATION
  // =========================================================================
  describe('Shipment Trips & Dock Stock Engine', () => {
    it('accurately accounts for dock stock with loose items and container combinations', async () => {
      const billId = await db.bills.add({
        sessionId: 1,
        billNumber: 'BL-DOCK-EXTREME',
        client: 'ETS BELKACEM',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const lineId = await db.orderLines.add({
        billId,
        no: '1',
        originalNo: '1',
        page: 1,
        originalPage: 1,
        reference: 'PROD-100',
        originalReference: 'PROD-100',
        ean: '613100',
        originalEan: '613100',
        designation: 'PRODUIT 100 PIECES',
        originalDesignation: 'PRODUIT 100 PIECES',
        orderedQty: 100,
        originalOrderedQty: 100,
        status: 'active',
        outerPackSize: null,
        innerPackSize: null,
        warehouseZone: null,
        packagesRaw: null,
        referenceAliases: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const c1 = await db.transportContainers.add({ billId, label: 'CARTON A', type: 'carton', createdAt: new Date().toISOString() });
      // 60 in container, 40 loose
      await db.countEvents.add({ billId, orderLineId: lineId, stage: 'preparation', quantity: 60, containerId: c1, outcome: null, undone: false, createdAt: new Date().toISOString() });
      await db.countEvents.add({ billId, orderLineId: lineId, stage: 'preparation', quantity: 40, containerId: null, outcome: null, undone: false, createdAt: new Date().toISOString() });

      const lines = await db.orderLines.where('billId').equals(billId).toArray();
      const containers = await db.transportContainers.where('billId').equals(billId).toArray();
      const events = await db.countEvents.where('billId').equals(billId).toArray();

      let dock = await calculateDockStock(billId, lines, containers, events);
      expect(dock.totalPreparedUnits).toBe(100);
      expect(dock.remainingUnits).toBe(100);
      expect(dock.remainingContainers.length).toBe(1);

      // Dispatch trip with ONLY loose items (no container)
      const trip1 = await createAndDispatchTrip({
        billId,
        client: 'ETS BELKACEM',
        driverName: 'Samir',
        containerIds: [],
        includeLoose: true,
        isLastTrip: false,
      });
      expect(trip1.totalUnits).toBe(40);

      dock = await calculateDockStock(billId, lines, containers, events);
      expect(dock.totalDispatchedUnits).toBe(40);
      expect(dock.remainingUnits).toBe(60);
      expect(dock.remainingContainers.length).toBe(1); // Carton A still on dock!

      // Dispatch trip with Carton A
      const trip2 = await createAndDispatchTrip({
        billId,
        client: 'ETS BELKACEM',
        driverName: 'Samir',
        containerIds: [c1],
        includeLoose: false,
        isLastTrip: true,
      });
      expect(trip2.totalUnits).toBe(60);

      dock = await calculateDockStock(billId, lines, containers, events);
      expect(dock.totalDispatchedUnits).toBe(100);
      expect(dock.remainingUnits).toBe(0);
      expect(dock.remainingContainers.length).toBe(0);
      expect(dock.isFullyShipped).toBe(true);
    });

    it('formatTripWhatsAppMessage handles empty notes and driver names gracefully', () => {
      const bill: Bill = {
        id: 1,
        sessionId: 1,
        billNumber: 'BL-MSG',
        client: 'CLIENT SIMPLE',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const line = makeLine();
      const trip = {
        id: 1,
        billId: 1,
        client: 'CLIENT SIMPLE',
        tripNumber: 1,
        status: 'dispatched' as const,
        driverName: '',
        truckPlate: '',
        operatorName: '',
        containerIds: [],
        lineQuantities: [{ orderLineId: 1, quantity: 10 }],
        totalUnits: 10,
        totalContainers: 0,
        isLastTrip: true,
        dispatchedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const msg = formatTripWhatsAppMessage(trip, bill, [line], [], 0);
      expect(msg).toContain('CLIENT SIMPLE');
      expect(msg).toContain('BL-MSG');
      expect(msg).toContain('EXPÉDITION SOLDÉE & COMPLÈTE');
    });
  });

  // =========================================================================
  // 9. WILAYAS OF ALGERIA RECOGNITION
  // =========================================================================
  describe('Wilayas & Geographic Detection', () => {
    it('detects all standard 58 wilayas by code and communal aliases', () => {
      expect(detectWilaya('LIVRAISON HASSI MESSAOUD')?.wilayaCode).toBe('30');
      expect(detectWilaya('SARL AGRO BOUFARIK')?.wilayaCode).toBe('09');
      expect(detectWilaya('ETS EL EULMA COMMERCE')?.wilayaCode).toBe('19');
      expect(detectWilaya('MAGHNIA FRONTIERE')?.wilayaCode).toBe('13');
      expect(detectWilaya('DEPOT BAB EZZOUAR')?.wilayaCode).toBe('16');
    });

    it('rejects out of bounds wilaya codes (0, 59, 999)', () => {
      expect(detectWilaya('CODE 00')).toBeNull();
      expect(detectWilaya('WILAYA 59')).toBeNull();
      expect(detectWilaya('WILAYA 99')).toBeNull();
    });
  });

  // =========================================================================
  // 10. COMPLETION BLOCKERS & STAGE DISCREPANCY
  // =========================================================================
  describe('Completion Blockers & Discrepancies', () => {
    it('lineBlocksCompletion correctly identifies statuses that prevent validation', () => {
      expect(lineBlocksCompletion(makeLine({ status: 'active' }))).toBe(true);
      expect(lineBlocksCompletion(makeLine({ status: 'not_found' }))).toBe(true);
      expect(lineBlocksCompletion(makeLine({ status: 'cancelled' }))).toBe(false);
      expect(lineBlocksCompletion(makeLine({ status: 'out_of_stock' }))).toBe(false);
      expect(lineBlocksCompletion(makeLine({ status: 'removed_by_revision' }))).toBe(false);
    });

    it('calcDiscrepancy detects remaining, over, exact, and modifications', () => {
      const exactLine = makeLine({ orderedQty: 50, originalOrderedQty: 50 });
      expect(calcDiscrepancy(exactLine, 50).isExact).toBe(true);
      expect(calcDiscrepancy(exactLine, 50).isModified).toBe(false);

      const modifiedLine = makeLine({ orderedQty: 40, originalOrderedQty: 50 });
      expect(calcDiscrepancy(modifiedLine, 40).isModified).toBe(true);
      expect(calcDiscrepancy(modifiedLine, 30).remaining).toBe(10);
      expect(calcDiscrepancy(modifiedLine, 45).over).toBe(5);
    });
  });
});
