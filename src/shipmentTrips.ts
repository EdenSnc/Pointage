// ============================================================
// POINTAGE — Multi-Trip Shipment Engine (Rotations Chauffeur)
// ============================================================

import * as XLSX from 'xlsx';
import { db } from './db';
import type {
  Bill,
  OrderLine,
  TransportContainer,
  CountEvent,
  ShipmentTrip,
  AuditEvent,
} from './types';
import { sumStageEvents } from './logic';

export interface DockLineStatus {
  line: OrderLine;
  preparedQty: number;
  dispatchedQty: number;
  remainingQty: number;
}

export interface DockStockStatus {
  trips: ShipmentTrip[];
  activeTrips: ShipmentTrip[];
  totalPreparedUnits: number;
  totalDispatchedUnits: number;
  remainingUnits: number;
  totalContainers: TransportContainer[];
  dispatchedContainerIds: number[];
  remainingContainers: TransportContainer[];
  dockLines: DockLineStatus[];
  isFullyShipped: boolean;
  nextTripNumber: number;
}

/**
 * Retrieves all trips recorded for a bill, sorted by tripNumber ascending.
 */
export async function getBillTrips(billId: number): Promise<ShipmentTrip[]> {
  const trips = await db.shipmentTrips.where('billId').equals(billId).toArray();
  return trips.sort((a, b) => a.tripNumber - b.tripNumber);
}

/**
 * Calculates current dock state:
 * - What has been prepared
 * - What has left in previous trips
 * - What remains physically on dock waiting for the next trip
 */
export async function calculateDockStock(
  billId: number,
  lines: OrderLine[],
  containers: TransportContainer[],
  events: CountEvent[]
): Promise<DockStockStatus> {
  const trips = await getBillTrips(billId);
  const activeDispatchedTrips = trips.filter(
    (t) => t.status === 'dispatched' || t.status === 'completed'
  );

  // Collect all container IDs that have already been dispatched
  const dispatchedContainerIds = new Set<number>();
  const lineDispatchedMap = new Map<number, number>();

  for (const trip of activeDispatchedTrips) {
    for (const cid of trip.containerIds) {
      dispatchedContainerIds.add(cid);
    }
    for (const lq of trip.lineQuantities) {
      const cur = lineDispatchedMap.get(lq.orderLineId) || 0;
      lineDispatchedMap.set(lq.orderLineId, cur + lq.quantity);
    }
  }

  // Calculate prepared units per line
  let totalPreparedUnits = 0;
  let totalDispatchedUnits = 0;
  const dockLines: DockLineStatus[] = [];

  for (const line of lines) {
    if (line.status === 'cancelled') continue;
    const lineEvents = events.filter((e) => e.orderLineId === line.id && !e.undone);
    const prepUnits = sumStageEvents(lineEvents, 'preparation');
    const loadUnits = sumStageEvents(lineEvents, 'chargement');
    // If preparation was not counted, fallback to chargement or ordered
    const preparedQty = prepUnits > 0 ? prepUnits : loadUnits > 0 ? loadUnits : line.orderedQty;

    const dispatchedQty = lineDispatchedMap.get(line.id!) || 0;
    const remainingQty = Math.max(0, preparedQty - dispatchedQty);

    totalPreparedUnits += preparedQty;
    totalDispatchedUnits += dispatchedQty;

    dockLines.push({
      line,
      preparedQty,
      dispatchedQty,
      remainingQty,
    });
  }

  const remainingUnits = Math.max(0, totalPreparedUnits - totalDispatchedUnits);
  const remainingContainers = containers.filter((c) => !dispatchedContainerIds.has(c.id!));
  const isFullyShipped =
    activeDispatchedTrips.length > 0 &&
    (remainingUnits === 0 || activeDispatchedTrips.some((t) => t.isLastTrip));

  const maxTripNum = trips.reduce((max, t) => Math.max(max, t.tripNumber), 0);
  const nextTripNumber = maxTripNum + 1;

  return {
    trips,
    activeTrips: activeDispatchedTrips,
    totalPreparedUnits,
    totalDispatchedUnits,
    remainingUnits,
    totalContainers: containers,
    dispatchedContainerIds: Array.from(dispatchedContainerIds),
    remainingContainers,
    dockLines,
    isFullyShipped,
    nextTripNumber,
  };
}

/**
 * Creates and immediately dispatches a shipment trip (Voyage).
 */
export async function createAndDispatchTrip(params: {
  billId: number;
  client: string;
  tripNumber?: number;
  driverName?: string | null;
  truckPlate?: string | null;
  operatorName?: string | null;
  containerIds: number[];
  lineQuantities?: { orderLineId: number; quantity: number }[];
  isLastTrip?: boolean;
  notes?: string | null;
}): Promise<ShipmentTrip> {
  const existing = await getBillTrips(params.billId);
  const maxTripNum = existing.reduce((max, t) => Math.max(max, t.tripNumber), 0);
  const tripNumber = params.tripNumber || maxTripNum + 1;

  let resolvedLineQuantities = params.lineQuantities || [];
  if (resolvedLineQuantities.length === 0 && params.containerIds.length > 0) {
    const containerSet = new Set(params.containerIds);
    const events = await db.countEvents.where('billId').equals(params.billId).toArray();
    const lqMap = new Map<number, number>();
    for (const e of events) {
      if (!e.undone && e.containerId && containerSet.has(e.containerId) && e.quantity > 0) {
        lqMap.set(e.orderLineId, (lqMap.get(e.orderLineId) || 0) + e.quantity);
      }
    }
    resolvedLineQuantities = Array.from(lqMap.entries()).map(([orderLineId, quantity]) => ({
      orderLineId,
      quantity,
    }));
  }

  const totalContainers = params.containerIds.length;
  const totalUnits = resolvedLineQuantities.reduce((sum, item) => sum + item.quantity, 0);

  const now = new Date().toISOString();

  const trip: ShipmentTrip = {
    billId: params.billId,
    client: params.client,
    tripNumber,
    status: 'dispatched',
    driverName: params.driverName?.trim() || null,
    truckPlate: params.truckPlate?.trim() || null,
    operatorName: params.operatorName?.trim() || null,
    containerIds: params.containerIds,
    lineQuantities: resolvedLineQuantities,
    totalUnits,
    totalContainers,
    isLastTrip: !!params.isLastTrip,
    notes: params.notes?.trim() || null,
    dispatchedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  let tripId: number = 0;

  await db.transaction('rw', [db.shipmentTrips, db.bills, db.auditEvents], async () => {
    tripId = await db.shipmentTrips.add(trip);

    // Update bill shipping status
    await db.bills.update(params.billId, {
      shippingStatus: params.isLastTrip ? 'fully_shipped' : 'partially_shipped',
      tripCount: tripNumber,
      updatedAt: now,
    });

    // Log audit event
    const audit: AuditEvent = {
      billId: params.billId,
      orderLineId: null,
      stage: 'chargement',
      type: 'trip_dispatched',
      oldValue: null,
      newValue: `Voyage N°${tripNumber} expédié (${totalUnits} pcs, ${totalContainers} colis)`,
      reason: params.driverName
        ? `Chauffeur: ${params.driverName} (${params.truckPlate || 'Véhicule n/c'})`
        : 'Départ camion validé',
      timestamp: now,
    };
    await db.auditEvents.add(audit);
  });

  return { ...trip, id: tripId };
}

/**
 * Cancels a trip in case of operator mistake.
 */
export async function cancelShipmentTrip(tripId: number, reason?: string): Promise<void> {
  const trip = await db.shipmentTrips.get(tripId);
  if (!trip) return;

  const now = new Date().toISOString();

  await db.transaction('rw', [db.shipmentTrips, db.bills, db.auditEvents], async () => {
    await db.shipmentTrips.update(tripId, {
      status: 'cancelled',
      updatedAt: now,
    });

    const otherActive = (await db.shipmentTrips.where('billId').equals(trip.billId).toArray()).filter(
      (t) => t.id !== tripId && (t.status === 'dispatched' || t.status === 'completed')
    );

    const newShippingStatus = otherActive.length === 0 ? 'not_shipped' : 'partially_shipped';

    await db.bills.update(trip.billId, {
      shippingStatus: newShippingStatus,
      tripCount: otherActive.length,
      updatedAt: now,
    });

    await db.auditEvents.add({
      billId: trip.billId,
      orderLineId: null,
      stage: 'chargement',
      type: 'trip_cancelled',
      oldValue: `Voyage N°${trip.tripNumber}`,
      newValue: 'Annulé',
      reason: reason || 'Annulation du voyage par l’opérateur',
      timestamp: now,
    });
  });
}

/**
 * Formats a WhatsApp dispatch message for a specific trip.
 */
export function formatTripWhatsAppMessage(
  trip: ShipmentTrip,
  bill: Bill,
  lines: OrderLine[],
  containers: TransportContainer[],
  remainingDockUnits: number = 0
): string {
  const containerMap = new Map(containers.map((c) => [c.id!, c]));

  const dispatchDate = trip.dispatchedAt ? new Date(trip.dispatchedAt) : new Date();
  const timeStr = dispatchDate.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const dateStr = dispatchDate.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  let msg = `🚚 *AVIS DE DÉPART — VOYAGE N° ${trip.tripNumber}${trip.isLastTrip ? ' (SOLDE)' : ''}*\n`;
  msg += `Client : *${bill.client}*\n`;
  msg += `N° Bon : *${bill.billNumber}*\n`;
  msg += `Date & Heure : ${dateStr} à ${timeStr}\n`;
  msg += `------------------------------------\n`;
  if (trip.driverName) msg += `👤 Chauffeur : *${trip.driverName}*\n`;
  if (trip.truckPlate) msg += `🚛 Véhicule : *${trip.truckPlate}*\n`;
  if (trip.operatorName) msg += `🏗️ Responsable Quai : *${trip.operatorName}*\n`;
  msg += `------------------------------------\n\n`;

  // List containers
  if (trip.containerIds.length > 0) {
    msg += `📦 *COLIS EMBARQUÉS (${trip.totalContainers}) :*\n`;
    trip.containerIds.forEach((cid) => {
      const c = containerMap.get(cid);
      if (c) {
        msg += `• ${c.label || c.name || 'Colis'}\n`;
      }
    });
    msg += `\n`;
  }

  // Summary
  msg += `📊 *Total chargé dans ce voyage :* ${trip.totalUnits} pièces\n`;
  if (trip.isLastTrip || remainingDockUnits === 0) {
    msg += `🏁 *EXPÉDITION SOLDÉE & COMPLÈTE* (Tous les colis ont quitté l'entrepôt)\n`;
  } else {
    msg += `⏳ *Reste à quai pour Voyage N° ${trip.tripNumber + 1} :* ${remainingDockUnits} pièces\n`;
  }

  if (trip.notes) {
    msg += `\n📝 Note : _${trip.notes}_\n`;
  }

  return msg;
}

/**
 * Creates the official Excel workbook:
 * "BORDEREAU DE CHARGEMENT & SORTIE DE QUAI — VOYAGE N° X"
 */
export function createTripExitWorkbook(
  trip: ShipmentTrip,
  bill: Bill,
  lines: OrderLine[],
  containers: TransportContainer[],
  remainingDockUnits: number = 0
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const lineMap = new Map(lines.map((l) => [l.id!, l]));
  const containerMap = new Map(containers.map((c) => [c.id!, c]));

  const dispatchDate = trip.dispatchedAt ? new Date(trip.dispatchedAt) : new Date();
  const dateFormatted = dispatchDate.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const timeFormatted = dispatchDate.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const wsData: (string | number | null | object)[][] = [
    [`BON DE SORTIE DE QUAI — VOYAGE N° ${trip.tripNumber}`, '', '', '', '', `Date : ${dateFormatted} ${timeFormatted}`],
    [`N° BL : ${bill.billNumber}`, '', '', `Client : ${bill.client}`],
    [
      `Chauffeur : ${trip.driverName || 'Chauffeur Client'}`,
      '',
      '',
      `Véhicule : ${trip.truckPlate || 'Standard'}`,
    ],
    [
      `Responsable Quai : ${trip.operatorName || 'Non assigné'}`,
      '',
      '',
      trip.isLastTrip ? 'STATUT : DERNIER VOYAGE (SOLDE)' : `STATUT : VOYAGE PARTIEL N° ${trip.tripNumber}`,
    ],
    [],
  ];

  // List of containers if any
  if (trip.containerIds.length > 0) {
    const loadedContainerLabels = trip.containerIds
      .map((cid) => containerMap.get(cid)?.label || `Carton #${cid}`)
      .join(', ');
    wsData.push([`COLIS CHARGÉS DANS CE CAMION (${trip.totalContainers}) : ${loadedContainerLabels}`]);
    wsData.push([]);
  }

  // Header row for loaded items
  wsData.push(['N°', 'Référence', 'Désignation', 'Colisage', 'QTÉ CHARGÉE DANS CE VOYAGE']);
  const firstDataRowIdx = wsData.length + 1;

  for (let i = 0; i < trip.lineQuantities.length; i++) {
    const item = trip.lineQuantities[i];
    const l = lineMap.get(item.orderLineId);
    wsData.push([
      l?.no || String(i + 1),
      l?.reference || '-',
      l?.designation || 'Article',
      l?.colisage || '1,00',
      item.quantity,
    ]);
  }

  const lastDataRowIdx = wsData.length;

  if (trip.lineQuantities.length === 0) {
    wsData.push(['-', '-', 'Aucun article répertorié dans ce voyage', '', 0]);
  }

  wsData.push([]);
  wsData.push([
    '',
    '',
    '',
    'TOTAL PIÈCES VOYAGE :',
    { f: `SUM(E${firstDataRowIdx}:E${lastDataRowIdx})`, v: trip.totalUnits },
  ]);

  wsData.push([
    '',
    '',
    '',
    'RESTE À QUAI (PROCHAIN VOYAGE) :',
    remainingDockUnits,
  ]);

  wsData.push([]);
  wsData.push(['ÉMARGEMENTS & SIGNATURES OBLIGATOIRES']);
  wsData.push(['Visa Responsable Sortie Quai', '', '', 'Émargement Chauffeur (Reçu Conforme)']);
  wsData.push([
    trip.operatorName ? `Opérateur : ${trip.operatorName}` : 'Magasinier :',
    '',
    '',
    trip.driverName ? `Chauffeur : ${trip.driverName}` : 'Chauffeur :',
  ]);

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  ws['!cols'] = [
    { wch: 8 },  // N°
    { wch: 18 }, // Référence
    { wch: 45 }, // Désignation
    { wch: 14 }, // Colisage
    { wch: 30 }, // Qté chargée
  ];

  XLSX.utils.book_append_sheet(wb, ws, `Voyage_${trip.tripNumber}`);
  return wb;
}

/**
 * Triggers browser download of the trip exit workbook.
 */
export function downloadTripExitWorkbook(
  trip: ShipmentTrip,
  bill: Bill,
  lines: OrderLine[],
  containers: TransportContainer[],
  remainingDockUnits: number = 0
): void {
  const wb = createTripExitWorkbook(trip, bill, lines, containers, remainingDockUnits);
  const cleanNum = (bill.billNumber || 'BL').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `Bon_Sortie_Voyage_${trip.tripNumber}_${cleanNum}.xlsx`;
  XLSX.writeFile(wb, filename);
}
