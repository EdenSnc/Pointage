import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';
import {
  calculateDockStock,
  createAndDispatchTrip,
  cancelShipmentTrip,
  getBillTrips,
  formatTripWhatsAppMessage,
  createTripExitWorkbook,
} from './shipmentTrips';
import type { OrderLine, TransportContainer, Bill } from './types';

describe('Multi-Trip Shipment Engine (Rotations Chauffeur)', () => {
  beforeEach(async () => {
    await db.bills.clear();
    await db.orderLines.clear();
    await db.countEvents.clear();
    await db.transportContainers.clear();
    await db.auditEvents.clear();
    await db.shipmentTrips.clear();
  });

  it('correctly tracks stock progression over multiple trips and closes shipment', async () => {
    // Setup Bill
    const billId = await db.bills.add({
      sessionId: 1,
      billNumber: 'BL-2026-0901',
      client: 'ETS TAHAR & FILS',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Create 2 Order Lines (Total 50 units)
    const line1Id = await db.orderLines.add({
      billId,
      no: '1',
      originalNo: '1',
      page: 1,
      originalPage: 1,
      reference: 'REF-A',
      originalReference: 'REF-A',
      ean: '613111',
      originalEan: '613111',
      designation: 'VIS A BOIS 4X40',
      originalDesignation: 'VIS A BOIS 4X40',
      orderedQty: 30,
      originalOrderedQty: 30,
      status: 'active',
      outerPackSize: null,
      innerPackSize: null,
      warehouseZone: null,
      packagesRaw: null,
      referenceAliases: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const line2Id = await db.orderLines.add({
      billId,
      no: '2',
      originalNo: '2',
      page: 1,
      originalPage: 1,
      reference: 'REF-B',
      originalReference: 'REF-B',
      ean: '613222',
      originalEan: '613222',
      designation: 'CHEVILLE NYLON D8',
      originalDesignation: 'CHEVILLE NYLON D8',
      orderedQty: 20,
      originalOrderedQty: 20,
      status: 'active',
      outerPackSize: null,
      innerPackSize: null,
      warehouseZone: null,
      packagesRaw: null,
      referenceAliases: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Create 3 Containers
    const container1Id = await db.transportContainers.add({
      billId,
      label: 'CARTON A',
      type: 'carton',
      createdAt: new Date().toISOString(),
    });
    const container2Id = await db.transportContainers.add({
      billId,
      label: 'CARTON B',
      type: 'carton',
      createdAt: new Date().toISOString(),
    });
    const container3Id = await db.transportContainers.add({
      billId,
      label: 'CHOUALA A',
      type: 'chouala',
      createdAt: new Date().toISOString(),
    });

    // Preparation count events (30 units for line 1, 20 units for line 2)
    await db.countEvents.add({
      billId,
      orderLineId: line1Id,
      stage: 'preparation',
      quantity: 30,
      containerId: container1Id,
      outcome: null,
      undone: false,
      createdAt: new Date().toISOString(),
    });
    await db.countEvents.add({
      billId,
      orderLineId: line2Id,
      stage: 'preparation',
      quantity: 10,
      containerId: container2Id,
      outcome: null,
      undone: false,
      createdAt: new Date().toISOString(),
    });
    await db.countEvents.add({
      billId,
      orderLineId: line2Id,
      stage: 'preparation',
      quantity: 10,
      containerId: container3Id,
      outcome: null,
      undone: false,
      createdAt: new Date().toISOString(),
    });

    const lines = await db.orderLines.where('billId').equals(billId).toArray();
    const containers = await db.transportContainers.where('billId').equals(billId).toArray();
    const events = await db.countEvents.where('billId').equals(billId).toArray();

    // 1. Initial State: All 50 units are on dock waiting for Voyage 1
    const initialDock = await calculateDockStock(billId, lines, containers, events);
    expect(initialDock.totalPreparedUnits).toBe(50);
    expect(initialDock.totalDispatchedUnits).toBe(0);
    expect(initialDock.remainingUnits).toBe(50);
    expect(initialDock.remainingContainers.length).toBe(3);
    expect(initialDock.isFullyShipped).toBe(false);
    expect(initialDock.nextTripNumber).toBe(1);

    // 2. Dispatch Voyage 1: Driver Mourad takes Carton A (30 pcs) and Carton B (10 pcs) = 40 pcs
    const trip1 = await createAndDispatchTrip({
      billId,
      client: 'ETS TAHAR & FILS',
      driverName: 'Mourad',
      truckPlate: 'Fourgon Hyundai (16-12345)',
      operatorName: 'Amine',
      containerIds: [container1Id, container2Id],
      lineQuantities: [
        { orderLineId: line1Id, quantity: 30 },
        { orderLineId: line2Id, quantity: 10 },
      ],
      isLastTrip: false,
      notes: 'Premier voyage du matin',
    });

    expect(trip1.tripNumber).toBe(1);
    expect(trip1.totalUnits).toBe(40);
    expect(trip1.totalContainers).toBe(2);
    expect(trip1.status).toBe('dispatched');

    // Verify Bill was marked partially shipped
    const updatedBill1 = await db.bills.get(billId);
    expect(updatedBill1?.shippingStatus).toBe('partially_shipped');
    expect(updatedBill1?.tripCount).toBe(1);

    // 3. Inspect Dock State after Voyage 1
    const dockAfterTrip1 = await calculateDockStock(billId, lines, containers, events);
    expect(dockAfterTrip1.totalPreparedUnits).toBe(50);
    expect(dockAfterTrip1.totalDispatchedUnits).toBe(40);
    expect(dockAfterTrip1.remainingUnits).toBe(10);
    expect(dockAfterTrip1.remainingContainers.length).toBe(1);
    expect(dockAfterTrip1.remainingContainers[0].id).toBe(container3Id);
    expect(dockAfterTrip1.isFullyShipped).toBe(false);
    expect(dockAfterTrip1.nextTripNumber).toBe(2);

    // 4. Driver Mourad returns for Voyage 2: Takes Chouala A (10 pcs) and completes shipment
    const trip2 = await createAndDispatchTrip({
      billId,
      client: 'ETS TAHAR & FILS',
      driverName: 'Mourad',
      truckPlate: 'Fourgon Hyundai (16-12345)',
      operatorName: 'Mohamed',
      containerIds: [container3Id],
      lineQuantities: [{ orderLineId: line2Id, quantity: 10 }],
      isLastTrip: true,
      notes: 'Deuxième et dernier voyage',
    });

    expect(trip2.tripNumber).toBe(2);
    expect(trip2.totalUnits).toBe(10);
    expect(trip2.totalContainers).toBe(1);

    // Verify Bill is now fully shipped
    const updatedBill2 = await db.bills.get(billId);
    expect(updatedBill2?.shippingStatus).toBe('fully_shipped');
    expect(updatedBill2?.tripCount).toBe(2);

    // 5. Inspect Final Dock State
    const finalDock = await calculateDockStock(billId, lines, containers, events);
    expect(finalDock.totalPreparedUnits).toBe(50);
    expect(finalDock.totalDispatchedUnits).toBe(50);
    expect(finalDock.remainingUnits).toBe(0);
    expect(finalDock.remainingContainers.length).toBe(0);
    expect(finalDock.isFullyShipped).toBe(true);
    expect(finalDock.trips.length).toBe(2);

    // 6. Audit Trail check
    const auditLogs = await db.auditEvents.where('billId').equals(billId).toArray();
    const tripAudits = auditLogs.filter((a) => a.type === 'trip_dispatched');
    expect(tripAudits.length).toBe(2);
  });

  it('allows canceling a trip if an operator made a mistake', async () => {
    const billId = await db.bills.add({
      sessionId: 1,
      billNumber: 'BL-CANCEL-TEST',
      client: 'CLIENT ERREUR',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const trip = await createAndDispatchTrip({
      billId,
      client: 'CLIENT ERREUR',
      driverName: 'Test Driver',
      containerIds: [],
      lineQuantities: [],
      isLastTrip: false,
    });

    expect(trip.status).toBe('dispatched');
    let bill = await db.bills.get(billId);
    expect(bill?.shippingStatus).toBe('partially_shipped');

    // Cancel trip
    await cancelShipmentTrip(trip.id!, 'Mauvais camion sélectionné');

    const trips = await getBillTrips(billId);
    expect(trips[0].status).toBe('cancelled');

    bill = await db.bills.get(billId);
    expect(bill?.shippingStatus).toBe('not_shipped');
  });

  it('generates an official Excel exit workbook with sums, parcels and signatures', async () => {
    const bill: Bill = {
      id: 10,
      sessionId: 1,
      billNumber: 'BL-EXPORT-TEST',
      client: 'ETS BOUZID FRERES',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const lines: OrderLine[] = [
      {
        id: 1,
        billId: 10,
        no: '1',
        originalNo: '1',
        page: 1,
        originalPage: 1,
        reference: 'ROULEAU-RUBAN',
        originalReference: 'ROULEAU-RUBAN',
        ean: '6139999',
        originalEan: '6139999',
        designation: 'RUBAN ADHESIF MARRON 50M',
        originalDesignation: 'RUBAN ADHESIF MARRON 50M',
        orderedQty: 24,
        originalOrderedQty: 24,
        status: 'active',
        outerPackSize: null,
        innerPackSize: null,
        warehouseZone: null,
        packagesRaw: null,
        referenceAliases: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const containers: TransportContainer[] = [
      {
        id: 101,
        billId: 10,
        label: 'CARTON A',
        type: 'carton',
        createdAt: new Date().toISOString(),
      },
    ];

    const trip = {
      id: 1,
      billId: 10,
      client: 'ETS BOUZID FRERES',
      tripNumber: 1,
      status: 'dispatched' as const,
      driverName: 'Nassim',
      truckPlate: 'Camionnette Isuzu 02550-116-16',
      operatorName: 'Walid',
      containerIds: [101],
      lineQuantities: [{ orderLineId: 1, quantity: 24 }],
      totalUnits: 24,
      totalContainers: 1,
      isLastTrip: false,
      dispatchedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const wb = createTripExitWorkbook(trip, bill, lines, containers, 12);
    expect(wb.SheetNames.length).toBe(1);
    expect(wb.SheetNames[0]).toBe('Voyage_1');

    const sheet = wb.Sheets['Voyage_1'];
    expect(sheet).toBeDefined();

    // Check WhatsApp message formatter
    const msg = formatTripWhatsAppMessage(trip, bill, lines, containers, 12);
    expect(msg).toContain('AVIS DE DÉPART — VOYAGE N° 1');
    expect(msg).toContain('ETS BOUZID FRERES');
    expect(msg).toContain('Nassim');
    expect(msg).toContain('CARTON A');
    expect(msg).toContain('*Total chargé dans ce voyage :* 24 pièces');
    expect(msg).toContain('*Reste à quai pour Voyage N° 2 :* 12 pièces');
  });
});
