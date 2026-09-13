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

  it('clusters numbers into decades and series', () => {
    const numbers = [620, 621, 625, 652, 658, 680, 695];
    const clusters = clusterNumericReferences(numbers);

    expect(clusters.length).toBe(4);
    expect(clusters[0].label).toBe('Série 620-629');
    expect(clusters[0].count).toBe(3);
    expect(clusters[1].label).toBe('Série 650-659');
    expect(clusters[1].count).toBe(2);
    expect(clusters[2].label).toBe('Série 680-689');
    expect(clusters[2].count).toBe(1);
    expect(clusters[3].label).toBe('Série 690-699');
    expect(clusters[3].count).toBe(1);
  });

  it('detects product families from French stationery keywords', () => {
    expect(detectProductFamily('Trousse ronde garnie 2 zips').id).toBe('trousses');
    expect(detectProductFamily('Stylo à bille bleu effaçable').id).toBe('stylos');
    expect(detectProductFamily('Cahier spirale 100p quadrillé').id).toBe('cahiers');
    expect(detectProductFamily('Sac à dos scolaire primaire').id).toBe('sacs');
    expect(detectProductFamily('Article Divers Inconnu').id).toBe('divers');
  });

  it('analyzes bill range structure and groups by families and series', () => {
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
    expect(structure.families[0].numericRanges.length).toBe(3);
    expect(structure.families[0].numericRanges.map((r) => r.label)).toEqual([
      'Série 620-629',
      'Série 650-659',
      'Série 680-689',
    ]);
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
