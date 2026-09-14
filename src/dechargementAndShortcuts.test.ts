import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from './db';
import {
  extractNumericReference,
  clusterNumericReferences,
  detectProductFamily,
  analyzeBillRangeStructure,
  checkReferenceInBill,
} from './rangeShortcuts';
import { findSimilarProductLocations } from './warehouseZones';
import type { OrderLine, DechargementSession } from './types';

describe('Mental Shortcuts & Range Engine', () => {
  it('extracts numeric references correctly', () => {
    expect(extractNumericReference('625')).toBe(625);
    expect(extractNumericReference('TR-625')).toBe(625);
    expect(extractNumericReference('REF-00430-B')).toBe(430);
    expect(extractNumericReference('STYLO-BILLE')).toBeNull();
    expect(extractNumericReference(null)).toBeNull();
  });

  it('clusters numbers into decades and series without illogical or 1-item ranges', () => {
    // All in 600s: 620, 621, 625, 652, 658, 680, 695 form Série 600 (7 items)
    const allSixHundreds = [620, 621, 625, 652, 658, 680, 695];
    const clustersHundred = clusterNumericReferences(allSixHundreds);

    expect(clustersHundred.length).toBe(1);
    expect(clustersHundred[0].label).toBe('Série 600');
    expect(clustersHundred[0].count).toBe(7);

    // Multiple distinct decades across hundreds
    const multiDecades = [520, 521, 525, 652, 658, 780, 781];
    const clustersDecades = clusterNumericReferences(multiDecades);

    expect(clustersDecades.length).toBe(3);
    expect(clustersDecades[0].label).toBe('Série 520');
    expect(clustersDecades[0].count).toBe(3);
    expect(clustersDecades[1].label).toBe('Série 650');
    expect(clustersDecades[1].count).toBe(2);
    expect(clustersDecades[2].label).toBe('Série 780');
    expect(clustersDecades[2].count).toBe(2);
  });

  it('handles user requested mental shortcuts: all in 600, all in 730s, 71600 series and scattered items', () => {
    // 1. User screenshot: 71600, 71636, 71651 -> clean single Série 71600
    const backpacks = clusterNumericReferences([71600, 71636, 71651]);
    expect(backpacks.length).toBe(1);
    expect(backpacks[0].label).toBe('Série 71600');
    expect(backpacks[0].count).toBe(3);

    // 2. All in 600
    const sixHundreds = clusterNumericReferences([610, 625, 680]);
    expect(sixHundreds.length).toBe(1);
    expect(sixHundreds[0].label).toBe('Série 600');
    expect(sixHundreds[0].count).toBe(3);

    // 3. All in 730s
    const sevenThirties = clusterNumericReferences([731, 734, 739]);
    expect(sevenThirties.length).toBe(1);
    expect(sevenThirties[0].label).toBe('Série 730');
    expect(sevenThirties[0].count).toBe(3);

    // 4. All in X50s (e.g. 653, 658)
    const fiftyDecade = clusterNumericReferences([653, 658]);
    expect(fiftyDecade.length).toBe(1);
    expect(fiftyDecade[0].label).toBe('Série 650');
    expect(fiftyDecade[0].count).toBe(2);

    // 5. Scattered references with no pattern -> no weird illogical ranges!
    const scattered = clusterNumericReferences([102, 540, 891]);
    expect(scattered).toEqual([]);

    // 6. Single item -> no 1-item range!
    const single = clusterNumericReferences([620]);
    expect(single).toEqual([]);
  });

  it('detects product families from French stationery keywords', () => {
    expect(detectProductFamily('Trousse ronde garnie 2 zips').id).toBe('trousses');
    expect(detectProductFamily('Stylo à bille bleu effaçable').id).toBe('stylos');
    expect(detectProductFamily('Cahier spirale 100p quadrillé').id).toBe('cahiers');
    expect(detectProductFamily('Sac à dos scolaire primaire').id).toBe('sacs');
    expect(detectProductFamily('Article Divers Inconnu').id).toBe('divers');
  });

  it('analyzes bill range structure and groups by families and clean series', () => {
    const testLines: OrderLine[] = [
      {
        id: 1,
        billId: 10,
        no: '1',
        reference: '621',
        designation: 'Trousse simple zip',
        orderedQty: 50,
        status: 'active',
      },
      {
        id: 2,
        billId: 10,
        no: '2',
        reference: '625',
        designation: 'Trousse double compartiment',
        orderedQty: 100,
        status: 'active',
      },
      {
        id: 3,
        billId: 10,
        no: '3',
        reference: '652',
        designation: 'Trousse ronde licorne',
        orderedQty: 25,
        status: 'active',
      },
      {
        id: 4,
        billId: 10,
        no: '4',
        reference: '685',
        designation: 'Trousse 3D football',
        orderedQty: 40,
        status: 'active',
      },
    ];

    const structure = analyzeBillRangeStructure(testLines);
    expect(structure.families.length).toBe(1);
    expect(structure.families[0].id).toBe('trousses');
    // All 4 trousses are in the 600s
    expect(structure.families[0].numericRanges.length).toBe(1);
    expect(structure.families[0].numericRanges[0].label).toBe('Série 600');
    expect(structure.families[0].numericRanges[0].count).toBe(4);
    expect(structure.families[0].totalOrderedUnits).toBe(215);
  });

  it('provides instant Skip-Guide feedback: instructs picker to skip numbers not in the bill', () => {
    const testLines: OrderLine[] = [
      {
        id: 1,
        billId: 10,
        no: '1',
        reference: '621',
        designation: 'Trousse simple zip',
        orderedQty: 50,
        status: 'active',
      },
      {
        id: 2,
        billId: 10,
        no: '2',
        reference: '625',
        designation: 'Trousse double',
        orderedQty: 100,
        status: 'active',
      },
      {
        id: 3,
        billId: 10,
        no: '3',
        reference: '652',
        designation: 'Trousse licorne',
        orderedQty: 25,
        status: 'active',
      },
    ];

    const structure = analyzeBillRangeStructure(testLines);

    // Exact match in bill
    const match = checkReferenceInBill('625', testLines, structure);
    expect(match?.matchType).toBe('exact_present');
    expect(match?.shouldSkip).toBe(false);

    // Number 430: Not in bill at all! User should skip directly without searching
    const absentResult = checkReferenceInBill('430', testLines, structure);
    expect(absentResult?.matchType).toBe('absent_skip_advice');
    expect(absentResult?.shouldSkip).toBe(true);
    expect(absentResult?.message).toContain('Zapper directement');
    expect(absentResult?.message).toContain('430');

    // Number 629: in the same decade 620-629, but specific model 629 is not on this bon
    const absentInDecade = checkReferenceInBill('629', testLines, structure);
    expect(absentInDecade?.shouldSkip).toBe(true);
    expect(absentInDecade?.message).toContain('absent de cette commande');
  });
});

describe('Smart Product Locating (Proximity & Category Fallback)', () => {
  it('locates unassigned product via numeric reference proximity (e.g. 71661 near 71662)', () => {
    const knownLine: OrderLine = {
      id: 101,
      billId: 5,
      no: '1',
      reference: '71661',
      designation: 'Cahier TP 64p',
      orderedQty: 100,
      warehouseZone: 'CH_NORD',
      status: 'active',
    };

    const targetLine: OrderLine = {
      id: 102,
      billId: 5,
      no: '2',
      reference: '71662',
      designation: 'Cahier TP 96p',
      orderedQty: 100,
      warehouseZone: null,
      status: 'active',
    };

    const suggestion = findSimilarProductLocations(targetLine, [knownLine, targetLine]);
    expect(suggestion).not.toBeNull();
    expect(suggestion?.suggestedZone).toBe('CH_NORD');
    expect(suggestion?.matchType).toBe('close_reference');
    expect(suggestion?.confidence).toBeGreaterThanOrEqual(0.9);
    expect(suggestion?.reason).toContain('Réf très proche');
  });

  it('locates unassigned product via product family category when reference is different', () => {
    const knownLine: OrderLine = {
      id: 201,
      billId: 5,
      no: '1',
      reference: 'TR-100',
      designation: 'Trousse Cuir Noire',
      orderedQty: 30,
      warehouseZone: 'CH_CENTRE',
      status: 'active',
    };

    const targetLine: OrderLine = {
      id: 202,
      billId: 5,
      no: '2',
      reference: 'TR-999',
      designation: 'Trousse Écolier Bleu Ciel',
      orderedQty: 40,
      warehouseZone: null,
      status: 'active',
    };

    const suggestion = findSimilarProductLocations(targetLine, [knownLine, targetLine]);
    expect(suggestion).not.toBeNull();
    expect(suggestion?.suggestedZone).toBe('CH_CENTRE');
    expect(suggestion?.matchType).toBe('same_category');
    expect(suggestion?.reason).toContain('Trousses');
  });
});

describe('Inbound Reception / Déchargement Quai Storage', () => {
  beforeEach(async () => {
    await db.dechargementSessions.clear();
  });

  it('creates and updates a dechargement session with damage tracking and worker call', async () => {
    const session: DechargementSession = {
      carrierName: 'Transport Express Oran',
      truckPlate: '00145-124-31',
      supplierName: 'Fournisseur Import Chine',
      containerNumber: 'MSKU-883921-0',
      dockNumber: 'Quai 1 (Principal)',
      estimatedCartons: 120,
      estimatedPallets: 4,
      unloadedCartons: 120,
      unloadedPallets: 4,
      damagedCartons: 2,
      damagePhotos: ['data:image/jpeg;base64,samplephoto1'],
      damageNotes: '2 cartons mouillés et écrasés en fond de benne',
      assignedWorkers: ['Mourad', 'Karim', 'Yacine'],
      status: 'completed',
      startTime: new Date(Date.now() - 3600000).toISOString(),
      endTime: new Date().toISOString(),
      lastWorkerCall: {
        calledAt: new Date(Date.now() - 3500000).toISOString(),
        callerName: 'Chef de Quai',
        urgency: 'high',
        targetWorkers: 'all',
        message: 'Déchargement conteneur 40ft urgent Quai 1',
      },
    };

    const id = await db.dechargementSessions.add(session);
    expect(id).toBeDefined();

    const retrieved = await db.dechargementSessions.get(id);
    expect(retrieved?.truckPlate).toBe('00145-124-31');
    expect(retrieved?.damagedCartons).toBe(2);
    expect(retrieved?.damagePhotos?.length).toBe(1);
    expect(retrieved?.assignedWorkers).toContain('Mourad');
    expect(retrieved?.lastWorkerCall?.targetWorkers).toBe('all');
  });
});
