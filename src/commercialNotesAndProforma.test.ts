import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';
import {
  compileFinalBillData,
  resolveDocumentType,
  formatFinalBillWhatsAppMessage,
  createFinalBillWorkbook,
} from './excelExport';
import { createAndDispatchTrip } from './shipmentTrips';
import type { Bill, OrderLine, FinalBillRow, StoreDemand } from './types';

describe('Commercial Notes, Proforma & Algerian Driver Logistics', () => {
  beforeEach(async () => {
    await db.bills.clear();
    await db.orderLines.clear();
    await db.countEvents.clear();
    await db.shipmentTrips.clear();
    await db.storeDemands.clear();
  });

  it('correctly resolves and exports Proforma document type', () => {
    const mockBill: Bill = {
      sessionId: 1,
      billNumber: 'PROFORMA-2026-088',
      client: 'SUPERETTE EL BAHIA',
      documentType: 'proforma',
      commercialNote: 'Paiement à la livraison après vérification',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const rows: FinalBillRow[] = [
      {
        no: '1',
        code: '71662',
        ean: '6941782115565',
        designation: 'SAC A DOS 22L',
        colisage: '50,00',
        orderedQty: 10,
        actualQty: 10,
        diffQty: 0,
        unitPrice: 2500,
        totalTtc: 25000,
        status: 'CONFORME',
        observation: 'Conforme',
        commercialNote: 'Coloris noir uniquement',
      },
    ];

    const compiled = compileFinalBillData(mockBill, rows);
    expect(compiled.documentType).toBe('proforma');
    expect(compiled.commercialNote).toBe('Paiement à la livraison après vérification');

    const resolved = resolveDocumentType(compiled);
    expect(resolved).toBe('proforma');

    const wb = createFinalBillWorkbook(compiled, 'proforma');
    expect(wb.SheetNames.length).toBeGreaterThan(0);

    const waMsg = formatFinalBillWhatsAppMessage(compiled);
    expect(waMsg).toContain('FACTURE PROFORMA / DEVIS ESTIMATIF');
    expect(waMsg).toContain('SUPERETTE EL BAHIA');
    expect(waMsg).toContain('Note commerciale : *Paiement à la livraison après vérification*');
  });

  it('creates and filters StoreDemand signals (Remontées Magasin)', async () => {
    const now = new Date().toISOString();
    const demand1: StoreDemand = {
      client: 'BLEU BLANC NAKHIL',
      designation: 'SAC A DOS MOYEN 22L',
      productReference: '71662',
      signalType: 'out_of_stock',
      requestedQty: 40,
      note: 'Rupture imminente en rayon papeterie',
      reportedBy: 'Vendeur Rayon',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    const demand2: StoreDemand = {
      client: 'ARTHUR ORAN',
      designation: 'TROUSSE DOUBLE COMPARTIMENT',
      productReference: '29129',
      signalType: 'high_demand',
      requestedQty: 100,
      note: 'Très forte demande rentrée scolaire',
      reportedBy: 'Chauffeur Mourad',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    const id1 = await db.storeDemands.add(demand1);
    const id2 = await db.storeDemands.add(demand2);

    expect(id1).toBeDefined();
    expect(id2).toBeDefined();

    const stored = await db.storeDemands.toArray();
    expect(stored.length).toBe(2);

    const stockouts = await db.storeDemands.where('signalType').equals('out_of_stock').toArray();
    expect(stockouts.length).toBe(1);
    expect(stockouts[0].client).toBe('BLEU BLANC NAKHIL');
    expect(stockouts[0].requestedQty).toBe(40);

    // Update status to treated
    await db.storeDemands.update(id1, { status: 'treated' });
    const updated = await db.storeDemands.get(id1);
    expect(updated?.status).toBe('treated');
  });

  it('records driver commute & rideshare routes (Navette Chauffeurs)', async () => {
    const billId = await db.bills.add({
      sessionId: 1,
      billNumber: 'BL-TEST-NAVETTE',
      client: 'MAGASIN MEDIONI',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const trip = await createAndDispatchTrip({
      billId,
      client: 'MAGASIN MEDIONI',
      tripNumber: 1,
      driverName: 'Mohamed',
      truckPlate: 'Master Blanc',
      driverPhone: '0550123456',
      destinationRoute: 'Bir El Djir -> Maraval -> Saint-Hubert',
      availableSeats: 2,
      containerIds: [],
      lineQuantities: [{ orderLineId: 1, quantity: 50 }],
      isLastTrip: true,
    });

    expect(trip.id).toBeDefined();
    expect(trip.driverName).toBe('Mohamed');
    expect(trip.driverPhone).toBe('0550123456');
    expect(trip.destinationRoute).toBe('Bir El Djir -> Maraval -> Saint-Hubert');
    expect(trip.availableSeats).toBe(2);

    const fromDb = await db.shipmentTrips.get(trip.id!);
    expect(fromDb?.destinationRoute).toBe('Bir El Djir -> Maraval -> Saint-Hubert');
    expect(fromDb?.availableSeats).toBe(2);
  });
});
