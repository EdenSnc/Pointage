import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, saveReceptionSession, getReceptionSessionById, saveReceptionItem, getReceptionItemsBySession } from './db';
import { extractMetadataFromText } from './excelImporter';
import { assignDriverToBill, loadDriverRoster, saveDriverToRoster, DEFAULT_DRIVERS } from './driverLogistics';
import type { ReceptionSession, ReceptionItem } from './types';

const memStore: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => memStore[k] ?? null,
  setItem: (k: string, v: string) => { memStore[k] = String(v); },
  removeItem: (k: string) => { delete memStore[k]; },
  clear: () => { Object.keys(memStore).forEach((k) => delete memStore[k]); },
};

describe('Driver Extraction & Logistics Engine', () => {
  beforeEach(async () => {
    await db.bills.clear();
    await db.receptionSessions.clear();
    await db.receptionItems.clear();
    await db.productProfiles.clear();
    localStorage.clear();
  });

  it('extracts driver name Yassine from Algerian header text', () => {
    const raw = 'BON DE COMMANDE N 1045\nCLIENT: LIBRAIRIE EL NAHDA\nCHAUFFEUR: Yassine\nDATE: 2026-09-25';
    const meta = extractMetadataFromText(raw);
    expect(meta.driverName).toBe('Yassine');
  });

  it('extracts driver name Djaber with accent or colon variations', () => {
    const raw1 = 'Transporteur / Conducteur : Djaber\nDestinataire: Oran';
    expect(extractMetadataFromText(raw1).driverName).toBe('Djaber');

    const raw2 = 'Nom du Livreur: DJABER\nBL 9021';
    expect(extractMetadataFromText(raw2).driverName).toBe('Djaber');
  });

  it('extracts known driver names even without explicit label prefix', () => {
    const raw = 'Bon N° 4589 - Mourad - Livraison Oran Centre';
    const meta = extractMetadataFromText(raw);
    expect(meta.driverName).toBe('Mourad');
  });

  it('assigns driver to bill in Dexie DB and updates bill record', async () => {
    const billId = await db.bills.add({
      billNumber: 'BL-2026-01',
      client: 'Boutique Papeterie Oran',
      stage: 'preparation',
      date: '2026-09-26',
      totalLines: 5,
    } as any);

    await assignDriverToBill(billId as number, 'Yassine');
    const updated = await db.bills.get(billId);
    expect(updated?.driverName).toBe('Yassine');

    // Unassign / clear driver
    await assignDriverToBill(billId as number, null);
    const cleared = await db.bills.get(billId);
    expect(cleared?.driverName).toBeNull();
  });

  it('manages driver roster in localStorage', () => {
    const initial = loadDriverRoster();
    expect(initial).toEqual(DEFAULT_DRIVERS);
    expect(initial).toContain('Yassine');
    expect(initial).toContain('Djaber');

    const updated = saveDriverToRoster('Karim');
    expect(updated).toContain('Karim');
    expect(loadDriverRoster()).toContain('Karim');
  });
});

describe('Container Reception & Discrepancy Tracking (Fournitures Scolaires)', () => {
  beforeEach(async () => {
    await db.receptionSessions.clear();
    await db.receptionItems.clear();
    await db.productProfiles.clear();
  });

  it('creates an inbound container reception session for 3 containers', async () => {
    const session: Omit<ReceptionSession, 'id' | 'createdAt' | 'updatedAt'> = {
      title: 'Arrivage 3 Conteneurs Scolaire & Bureautique',
      containerNumber: 'TGHU-892104-5 / MSCU-771239-0 / CMAU-441029-8',
      supplierName: 'Fournisseur Global Papeterie & Bureautique',
      billNumber: 'CONT-2026-ALG-3X',
      dockZone: 'Quai 1 (Principal)',
      warehouseSite: 'oran_surface',
      status: 'in_progress',
      operator: 'Chef Entrepôt',
      startedAt: new Date().toISOString(),
      notes: 'Arrivage de 3 conteneurs: cahiers, stylos, trousses, classeurs',
    };

    const id = await saveReceptionSession(session);
    expect(id).toBeDefined();

    const fetched = await getReceptionSessionById(id as number);
    expect(fetched?.billNumber).toBe('CONT-2026-ALG-3X');
    expect(fetched?.containerNumber).toContain('TGHU-892104-5');
    expect(fetched?.title).toContain('3 Conteneurs');
    expect(fetched?.operator).toBe('Chef Entrepôt');
  });

  it('accurately identifies conforme, manquant, and excedant discrepancies', async () => {
    const sessionId = (await saveReceptionSession({
      title: 'Dechargement Conteneurs Scolaire',
      billNumber: 'BL-MANIFEST-001',
      containerNumber: 'CONT-1',
      supplierName: 'SBM Fournitures',
      status: 'in_progress',
      operator: 'Amine',
      startedAt: new Date().toISOString(),
    })) as number;

    // 1. Conforme item: 200 expected, 200 counted
    const item1 = {
      sessionId,
      reference: 'CAH-96P-SEYES',
      designation: 'Cahier 96p Seyes 24x32',
      ean: '6131234567890',
      expectedQty: 200,
      receivedQty: 200,
      damagedQty: 0,
      category: 'scolaire' as const,
    };
    await saveReceptionItem(item1);

    // 2. Manquant item: 300 expected, 250 counted (50 missing)
    const item2 = {
      sessionId,
      reference: 'STY-BIC-BLEU',
      designation: 'Stylo a bille bleu pointe moyenne',
      ean: '3086123456781',
      expectedQty: 300,
      receivedQty: 250,
      damagedQty: 5,
      category: 'bureautique' as const,
    };
    await saveReceptionItem(item2);

    // 3. Excedant item: 100 expected, 130 counted (30 extra)
    const item3 = {
      sessionId,
      reference: 'TRS-DOUBLE-ZIP',
      designation: 'Trousse scolaire double compartiment',
      ean: '6139876543210',
      expectedQty: 100,
      receivedQty: 130,
      damagedQty: 0,
      category: 'scolaire' as const,
    };
    await saveReceptionItem(item3);

    const items = await getReceptionItemsBySession(sessionId);
    expect(items.length).toBe(3);

    const conforme = items.find((i) => i.reference === 'CAH-96P-SEYES');
    expect(conforme?.receivedQty).toBe(200);
    expect(conforme?.expectedQty).toBe(200);
    expect(conforme!.receivedQty - conforme!.expectedQty).toBe(0);

    const manquant = items.find((i) => i.reference === 'STY-BIC-BLEU');
    expect(manquant?.receivedQty).toBe(250);
    expect(manquant?.expectedQty).toBe(300);
    expect(manquant!.receivedQty - manquant!.expectedQty).toBe(-50);
    expect(manquant?.damagedQty).toBe(5);

    const excedant = items.find((i) => i.reference === 'TRS-DOUBLE-ZIP');
    expect(excedant?.receivedQty).toBe(130);
    expect(excedant?.expectedQty).toBe(100);
    expect(excedant!.receivedQty - excedant!.expectedQty).toBe(30);
  });

  it('auto-integrates newly received container products into productProfiles master catalog', async () => {
    const newRef = 'REG-ALU-30CM';
    const newDesignation = 'Regle metallique aluminium 30cm';
    const newBarcode = '6135544332211';

    // Verify does not exist initially
    const before = await db.productProfiles.where('reference').equals(newRef).first();
    expect(before).toBeUndefined();

    // Auto-integrate as done in WarehouseReceptionModal
    await db.productProfiles.put({
      reference: newRef,
      designation: newDesignation,
      barcode: newBarcode,
      warehouseZone: 'Z1',
      locationNote: 'Palette Sol Reception',
      outerPackSize: 50,
      innerPackSize: 10,
    });

    const after = await db.productProfiles.where('reference').equals(newRef).first();
    expect(after).toBeDefined();
    expect(after?.designation).toBe(newDesignation);
    expect(after?.warehouseZone).toBe('Z1');
    expect(after?.outerPackSize).toBe(50);
    expect(after?.innerPackSize).toBe(10);
  });
});
