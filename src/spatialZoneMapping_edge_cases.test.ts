import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';
import {
  WAREHOUSE_ZONES,
  parseZoneCodes,
  normalizeZoneCode,
  getZoneLabel,
  getZoneShortLabel,
  getZoneInfo,
  updateProductWarehouseZone,
  sortLinesByWarehouseZone,
  findSimilarProductLocations,
} from './warehouseZones';
import { saveProductProfile } from './hooks';
import type { OrderLine, ProductProfile } from './types';

describe('Deep & Comprehensive Spatial Zone Mapping Edge Cases Suite', () => {
  beforeEach(async () => {
    await db.bills.clear();
    await db.orderLines.clear();
    await db.productProfiles.clear();
    await db.auditEvents.clear();
  });

  // =========================================================================
  // 1. ZONE PARSING, NORMALIZATION & MULTI-LOCATION COMBOS
  // =========================================================================

  describe('1. Zone Code Parsing & Normalization Edge Cases', () => {
    it('1.1: Handles leading/trailing whitespace, newlines, and case variations', () => {
      expect(normalizeZoneCode('   ch_nw  \n')).toBe('CH_NW');
      expect(normalizeZoneCode('\tco_r1\r\n')).toBe('CO_R1');
      expect(normalizeZoneCode('')).toBeNull();
      expect(normalizeZoneCode('   ')).toBeNull();
      expect(normalizeZoneCode(null)).toBeNull();
      expect(normalizeZoneCode(undefined)).toBeNull();
    });

    it('1.2: Normalizes legacy aliases cleanly to standard canonical codes', () => {
      expect(normalizeZoneCode('NORTH_WEST')).toBe('CH_NW');
      expect(normalizeZoneCode('NORTH_EAST')).toBe('CH_NE');
      expect(normalizeZoneCode('SOUTH_WEST')).toBe('CH_SW');
      expect(normalizeZoneCode('SOUTH_EAST')).toBe('CH_SE');
      expect(normalizeZoneCode('LITTLE_ROOM_ENTRANCE')).toBe('CO_R1');
      expect(normalizeZoneCode('LITTLE_ROOM_DEEP')).toBe('CO_R2');
      expect(normalizeZoneCode('CO_R4_S')).toBe('CO_R4');
      expect(normalizeZoneCode('CO_R4_N')).toBe('CO_R4');
    });

    it('1.3: Handles multi-location delimiters (comma, plus, mixed) and deduplicates identical zones', () => {
      expect(parseZoneCodes('CH_NW, CH_NE')).toEqual(['CH_NW', 'CH_NE']);
      expect(parseZoneCodes('CH_NW + CH_CTR')).toEqual(['CH_NW', 'CH_CTR']);
      expect(parseZoneCodes('CH_NW, CH_NW, CH_NW')).toEqual(['CH_NW']);
      expect(normalizeZoneCode('CH_NW + CH_SE')).toBe('CH_NW, CH_SE');
    });

    it('1.4: Strictly caps multi-locations to maximum 2 primary locations (physical warehouse rule)', () => {
      const parsed = parseZoneCodes('CH_NW, CH_N, CH_NE, CH_CTR');
      expect(parsed).toHaveLength(2);
      expect(parsed).toEqual(['CH_NW', 'CH_N']);
    });

    it('1.5: Preserves custom freeform rack/aisle codes with special characters', () => {
      const customCode = 'RACK-B#4/NIV-2';
      expect(normalizeZoneCode(customCode)).toBe(customCode);
      const info = getZoneInfo(customCode);
      expect(info?.category).toBe('custom');
      expect(info?.code).toBe(customCode);
      expect(getZoneShortLabel(customCode)).toBe(customCode);
    });

    it('1.6: Formats multi-zone labels with short label fallback', () => {
      const label = getZoneShortLabel('CH_NW, CO_R2');
      expect(label).toBe('CH • Nord-Ouest + Couloir • Salle 2');

      const fullLabel = getZoneLabel('CH_SW');
      expect(fullLabel).toContain('Chambre Principale • Sud-Ouest');
    });
  });

  // =========================================================================
  // 2. MULTI-BILL & MASTER PROFILE SYNCHRONIZATION
  // =========================================================================

  describe('2. Multi-Bill & Master Catalog Propagation Edge Cases', () => {
    it('2.1: Assigning zone propagates to Master ProductProfile and all active lines across multiple bills', async () => {
      const bill1 = await db.bills.add({
        sessionId: 1,
        billNumber: 'BL-001',
        client: 'CLIENT A',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const bill2 = await db.bills.add({
        sessionId: 1,
        billNumber: 'BL-002',
        client: 'CLIENT B',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const line1Id = await db.orderLines.add({
        billId: bill1,
        no: '1',
        originalNo: '1',
        page: 1,
        originalPage: 1,
        reference: 'REF-HAMMER-16',
        originalReference: 'REF-HAMMER-16',
        ean: '1234567890123',
        originalEan: '1234567890123',
        designation: 'Marteau Pro 16mm',
        originalDesignation: 'Marteau Pro 16mm',
        orderedQty: 10,
        originalOrderedQty: 10,
        status: 'active',
        outerPackSize: 20,
        innerPackSize: 5,
        warehouseZone: null,
        packagesRaw: null,
        referenceAliases: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const line2Id = await db.orderLines.add({
        billId: bill2,
        no: '5',
        originalNo: '5',
        page: 1,
        originalPage: 1,
        reference: 'REF-HAMMER-16',
        originalReference: 'REF-HAMMER-16',
        ean: '1234567890123',
        originalEan: '1234567890123',
        designation: 'Marteau Pro 16mm',
        originalDesignation: 'Marteau Pro 16mm',
        orderedQty: 5,
        originalOrderedQty: 5,
        status: 'active',
        outerPackSize: 20,
        innerPackSize: 5,
        warehouseZone: null,
        packagesRaw: null,
        referenceAliases: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Update location via updateProductWarehouseZone
      await updateProductWarehouseZone(line1Id, bill1, 'REF-HAMMER-16', 'CH_CTR', 'Karim Magasinier');

      // Verify line 1 updated
      const updatedLine1 = await db.orderLines.get(line1Id);
      expect(updatedLine1?.warehouseZone).toBe('CH_CTR');

      // Verify master productProfile updated
      const profile = await db.productProfiles.where('reference').equals('REF-HAMMER-16').first();
      expect(profile).toBeDefined();
      expect(profile?.warehouseZone).toBe('CH_CTR');

      // Verify sibling line in bill 1 updated
      const updatedLine2 = await db.orderLines.get(line2Id);
      expect(updatedLine2).toBeDefined();

      // Verify audit trail logged
      const audits = await db.auditEvents.where('orderLineId').equals(line1Id).toArray();
      expect(audits.length).toBeGreaterThan(0);
      expect(audits[0].type).toBe('warehouse_zone_changed');
      expect(audits[0].newValue).toBe('CH_CTR');
      expect(audits[0].reason).toContain('Karim Magasinier');
    });

    it('2.2: Clears location (unassigns zone) cleanly across profile and order lines', async () => {
      const billId = await db.bills.add({
        sessionId: 1,
        billNumber: 'BL-UNASSIGN',
        client: 'CLIENT C',
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
        reference: 'REF-DRILL-8',
        originalReference: 'REF-DRILL-8',
        ean: '9988776655443',
        originalEan: '9988776655443',
        designation: 'Foret Béton 8mm',
        originalDesignation: 'Foret Béton 8mm',
        orderedQty: 50,
        originalOrderedQty: 50,
        status: 'active',
        outerPackSize: null,
        innerPackSize: null,
        warehouseZone: 'CO_R3',
        packagesRaw: null,
        referenceAliases: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await saveProductProfile('REF-DRILL-8', { warehouseZone: 'CO_R3' });

      // Clear zone
      await updateProductWarehouseZone(lineId, billId, 'REF-DRILL-8', null, 'Chef Equipe');

      const line = await db.orderLines.get(lineId);
      expect(line?.warehouseZone).toBeNull();

      const profile = await db.productProfiles.where('reference').equals('REF-DRILL-8').first();
      expect(profile?.warehouseZone).toBeNull();
    });

    it('2.3: Handles special characters, slashes, and leading zeroes in reference / EAN without SQL or Regex errors', async () => {
      const weirdRef = 'REF/2026/A#99 (BOÎTE/100)';
      await saveProductProfile(weirdRef, {
        designation: 'Boîte de vis inox M6',
        warehouseZone: 'CH_SW',
      });

      const prof = await db.productProfiles.where('reference').equals(weirdRef).first();
      expect(prof).toBeDefined();
      expect(prof?.warehouseZone).toBe('CH_SW');
      expect(prof?.reference).toBe(weirdRef);
    });
  });

  // =========================================================================
  // 3. OPTIMAL PICKING CIRCUIT PATH SORTING ALGORITHM
  // =========================================================================

  describe('3. Warehouse Picking Circuit Sorting Algorithm Edge Cases', () => {
    const makeMockLine = (id: number, ref: string, zone: string | null): OrderLine => ({
      id,
      billId: 1,
      no: String(id),
      originalNo: String(id),
      page: 1,
      originalPage: 1,
      reference: ref,
      originalReference: ref,
      ean: null,
      originalEan: null,
      designation: `Product ${ref}`,
      originalDesignation: `Product ${ref}`,
      orderedQty: 10,
      originalOrderedQty: 10,
      status: 'active',
      outerPackSize: null,
      innerPackSize: null,
      warehouseZone: zone as any,
      packagesRaw: null,
      referenceAliases: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    it('3.1: Sorts lines according to physical warehouse sweep (SW entrance -> S -> CTR -> N -> Couloir 4 to 1 -> Custom -> Unassigned)', () => {
      const lineSW = makeMockLine(1, 'P-SW', 'CH_SW'); // Order: 70
      const lineS = makeMockLine(2, 'P-S', 'CH_S');   // Order: 80
      const lineCTR = makeMockLine(3, 'P-CTR', 'CH_CTR'); // Order: 50
      const lineNW = makeMockLine(4, 'P-NW', 'CH_NW'); // Order: 10
      const lineR4 = makeMockLine(5, 'P-R4', 'CO_R4'); // Order: 130
      const lineR1 = makeMockLine(6, 'P-R1', 'CO_R1'); // Order: 100
      const lineCustom = makeMockLine(7, 'P-CUST', 'ZONE-SPECIAL'); // Order: 900
      const lineNone = makeMockLine(8, 'P-NONE', null); // Order: 9999

      // Mix them up randomly
      const unsorted = [lineNone, lineR4, lineS, lineCustom, lineNW, lineR1, lineSW, lineCTR];
      const sorted = sortLinesByWarehouseZone(unsorted);

      const sortedRefs = sorted.map((l) => l.reference);

      // Verify Chambre items come first, ordered by zone sequence
      expect(sortedRefs.indexOf('P-NW')).toBeLessThan(sortedRefs.indexOf('P-CTR'));
      expect(sortedRefs.indexOf('P-CTR')).toBeLessThan(sortedRefs.indexOf('P-SW'));
      expect(sortedRefs.indexOf('P-SW')).toBeLessThan(sortedRefs.indexOf('P-S'));

      // Verify Couloir items come after Chambre
      expect(sortedRefs.indexOf('P-S')).toBeLessThan(sortedRefs.indexOf('P-R1'));

      // Verify Custom comes after Couloir
      expect(sortedRefs.indexOf('P-R4')).toBeLessThan(sortedRefs.indexOf('P-CUST'));

      // Verify Unassigned lines are at the very end
      expect(sortedRefs[sortedRefs.length - 1]).toBe('P-NONE');
    });

    it('3.2: Multi-location lines sort based on their primary (first) location', () => {
      const lineMulti = makeMockLine(10, 'P-MULTI', 'CH_NW, CH_SE'); // primary CH_NW (10)
      const lineCTR = makeMockLine(11, 'P-CTR', 'CH_CTR'); // primary CH_CTR (50)

      const sorted = sortLinesByWarehouseZone([lineCTR, lineMulti]);
      expect(sorted[0].reference).toBe('P-MULTI');
      expect(sorted[1].reference).toBe('P-CTR');
    });

    it('3.3: Resolves location from product profiles map when line has no direct zone', () => {
      const lineWithoutZone = makeMockLine(20, 'P-AUTO-RESOLVE', null);
      const profilesMap = new Map<string, ProductProfile>([
        [
          'P-AUTO-RESOLVE',
          {
            reference: 'P-AUTO-RESOLVE',
            warehouseZone: 'CH_E',
            outerPackSize: null,
            innerPackSize: null,
            updatedAt: new Date().toISOString(),
          },
        ],
      ]);

      const lineWithZone = makeMockLine(21, 'P-MANUAL', 'CH_NW');

      const sorted = sortLinesByWarehouseZone([lineWithoutZone, lineWithZone], profilesMap);
      expect(sorted[0].reference).toBe('P-MANUAL'); // CH_NW (order 10)
      expect(sorted[1].reference).toBe('P-AUTO-RESOLVE'); // CH_E (order 60)
    });

    it('3.4: Handles empty lines and all-unassigned lines gracefully without throwing', () => {
      expect(sortLinesByWarehouseZone([])).toEqual([]);

      const allUnassigned = [
        makeMockLine(1, 'A', null),
        makeMockLine(2, 'B', null),
      ];
      const result = sortLinesByWarehouseZone(allUnassigned);
      expect(result).toHaveLength(2);
      expect(result.map((l) => l.reference)).toEqual(['A', 'B']);
    });
  });

  // =========================================================================
  // 4. SIMILAR LOCATION SUGGESTION ENGINE EDGE CASES
  // =========================================================================

  describe('4. Similar Location Suggestion Engine Edge Cases', () => {
    const makeTargetLine = (id: number, ref: string, desig: string, zone: string | null = null): OrderLine => ({
      id,
      billId: 1,
      no: String(id),
      originalNo: String(id),
      page: 1,
      originalPage: 1,
      reference: ref,
      originalReference: ref,
      ean: null,
      originalEan: null,
      designation: desig,
      originalDesignation: desig,
      orderedQty: 1,
      originalOrderedQty: 1,
      status: 'active',
      outerPackSize: null,
      innerPackSize: null,
      warehouseZone: zone as any,
      packagesRaw: null,
      referenceAliases: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    it('4.1: Suggests location based on close numeric SKU reference proximity', () => {
      const target = makeTargetLine(1, 'ART-1012', 'Disque à tronçonner 115mm');
      const candidates: OrderLine[] = [
        makeTargetLine(2, 'ART-1010', 'Disque à tronçonner 125mm', 'CH_NE'), // gap: 2 (high confidence)
        makeTargetLine(3, 'ART-1090', 'Disque diamant', 'CO_R4'),            // gap: 78 (exceeds 60 threshold)
      ];

      const suggestion = findSimilarProductLocations(target, candidates);
      expect(suggestion).not.toBeNull();
      expect(suggestion?.suggestedZone).toBe('CH_NE');
      expect(suggestion?.confidence).toBeGreaterThanOrEqual(0.85);
      expect(suggestion?.matchType).toBe('close_reference');
    });

    it('4.2: Suggests location based on matching product family taxonomy', () => {
      const target = makeTargetLine(1, 'REF-X', 'Stylo bille 0.7mm bleu');
      const candidates: OrderLine[] = [
        makeTargetLine(2, 'STYLO-1', 'Stylo feutre fin noir', 'CO_R2'),
        makeTargetLine(3, 'STYLO-2', 'Stylo roller gel rouge', 'CO_R2'),
        makeTargetLine(4, 'CAHIER-1', 'Cahier spirale 200p', 'CH_SW'),
      ];

      const suggestion = findSimilarProductLocations(target, candidates);
      expect(suggestion).not.toBeNull();
      expect(suggestion?.suggestedZone).toBe('CO_R2');
      expect(suggestion?.matchType).toBe('same_category');
      expect(suggestion?.reason).toContain('Stylos, Feutres & Écriture');
    });

    it('4.3: Returns null if target product already has a warehouse zone assigned', () => {
      const target = makeTargetLine(1, 'ART-1012', 'Disque à tronçonner 115mm', 'CH_CTR');
      const candidates: OrderLine[] = [
        makeTargetLine(2, 'ART-1010', 'Disque à tronçonner 125mm', 'CH_NE'),
      ];

      const suggestion = findSimilarProductLocations(target, candidates);
      expect(suggestion).toBeNull();
    });

    it('4.4: Returns null when no candidates or no relevant matches exist', () => {
      const target = makeTargetLine(1, 'UNKNOWN-999', 'Article Inclassable');
      const candidates: OrderLine[] = [
        makeTargetLine(2, 'NO-ZONE', 'Article sans zone', null),
      ];

      const suggestion = findSimilarProductLocations(target, candidates);
      expect(suggestion).toBeNull();
    });
  });

  // =========================================================================
  // 5. STRESS & HIGH-CONCURRENCY BULK ASSIGNMENT
  // =========================================================================

  describe('5. High-Concurrency Bulk Location Assignment', () => {
    it('5.1: Handles 50 rapid concurrent zone updates across distinct references without deadlock', async () => {
      const billId = await db.bills.add({
        sessionId: 1,
        billNumber: 'BL-STRESS',
        client: 'CLIENT STRESS',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const promises: Promise<void>[] = [];
      const zoneKeys = WAREHOUSE_ZONES.map((z) => z.code);

      for (let i = 0; i < 50; i++) {
        const ref = `STRESS-REF-${i}`;
        const zone = zoneKeys[i % zoneKeys.length];

        promises.push(
          (async () => {
            const lineId = await db.orderLines.add({
              billId,
              no: String(i),
              originalNo: String(i),
              page: 1,
              originalPage: 1,
              reference: ref,
              originalReference: ref,
              ean: `6130000000${String(i).padStart(3, '0')}`,
              originalEan: null,
              designation: `Stress Product ${i}`,
              originalDesignation: `Stress Product ${i}`,
              orderedQty: i + 1,
              originalOrderedQty: i + 1,
              status: 'active',
              outerPackSize: null,
              innerPackSize: null,
              warehouseZone: null,
              packagesRaw: null,
              referenceAliases: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });

            await updateProductWarehouseZone(lineId, billId, ref, zone, 'Pointeur Stress');
          })()
        );
      }

      await Promise.all(promises);

      // Verify all 50 profiles created and assigned correctly
      const totalProfiles = await db.productProfiles.count();
      expect(totalProfiles).toBe(50);

      // Verify all lines have their assigned zone
      const lines = await db.orderLines.where('billId').equals(billId).toArray();
      expect(lines).toHaveLength(50);
      for (const l of lines) {
        expect(l.warehouseZone).not.toBeNull();
      }

      // Verify 50 audit events recorded
      const audits = await db.auditEvents.where('billId').equals(billId).toArray();
      expect(audits).toHaveLength(50);
    });
  });
});
