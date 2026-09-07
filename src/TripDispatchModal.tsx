import React, { useState, useMemo } from 'react';
import type { Bill, OrderLine, TransportContainer, CountEvent, ShipmentTrip } from './types';
import { createAndDispatchTrip, calculateDockStock } from './shipmentTrips';
import { IconBox, IconCheck, IconTruck, IconUser, IconX } from './icons';
import { playSuccessChime, hapticTap } from './audio';

interface TripDispatchModalProps {
  bill: Bill;
  lines: OrderLine[];
  containers: TransportContainer[];
  events: CountEvent[];
  activeOperator?: string | null;
  onClose: () => void;
  onDispatched: (trip: ShipmentTrip) => void;
}

const COMMON_DRIVERS = ['Mourad', 'Nassim', 'Karim', 'Chauffeur Client'];
const COMMON_VEHICLES = ['Fourgon Blanc', 'Camionnette', 'Camion Plateau', 'DFSK'];

export const TripDispatchModal: React.FC<TripDispatchModalProps> = ({
  bill,
  lines,
  containers,
  events,
  activeOperator,
  onClose,
  onDispatched,
}) => {
  // Compute dock stock & existing trips
  const [dockStatus, setDockStatus] = useState(() => {
    // Initial synchronous estimate
    return {
      trips: [] as ShipmentTrip[],
      remainingUnits: 0,
      nextTripNumber: 1,
      dispatchedContainerIds: [] as number[],
    };
  });

  // Calculate container contents from events
  const containerItemMap = useMemo(() => {
    const map = new Map<number, { units: number; lineIds: Set<number> }>();
    for (const e of events) {
      if (e.undone || !e.containerId || e.quantity <= 0) continue;
      const cur = map.get(e.containerId) || { units: 0, lineIds: new Set<number>() };
      cur.units += e.quantity;
      cur.lineIds.add(e.orderLineId);
      map.set(e.containerId, cur);
    }
    return map;
  }, [events]);

  // Async load dock status
  React.useEffect(() => {
    let cancelled = false;
    calculateDockStock(bill.id!, lines, containers, events).then((res) => {
      if (!cancelled) {
        setDockStatus({
          trips: res.trips,
          remainingUnits: res.remainingUnits,
          nextTripNumber: res.nextTripNumber,
          dispatchedContainerIds: res.dispatchedContainerIds,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [bill.id, lines, containers, events]);

  // Filter available containers (not dispatched yet)
  const availableContainers = useMemo(() => {
    const dispatchedSet = new Set(dockStatus.dispatchedContainerIds);
    return containers.filter((c) => !dispatchedSet.has(c.id!));
  }, [containers, dockStatus.dispatchedContainerIds]);

  // Selected containers for this trip (default to all available containers)
  const [selectedContainerIds, setSelectedContainerIds] = useState<number[]>(() =>
    availableContainers.map((c) => c.id!)
  );

  // Loose items toggle
  const [includeLoose, setIncludeLoose] = useState<boolean>(true);

  // Form states
  const [driverName, setDriverName] = useState<string>('Mourad');
  const [customDriver, setCustomDriver] = useState<string>('');
  const [truckPlate, setTruckPlate] = useState<string>('Fourgon Blanc');
  const [customPlate, setCustomPlate] = useState<string>('');
  const [operatorName, setOperatorName] = useState<string>(activeOperator || 'Mohamed');
  const [notes, setNotes] = useState<string>('');
  const [isLastTrip, setIsLastTrip] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Toggle container selection
  const toggleContainer = (cid: number) => {
    setSelectedContainerIds((prev) =>
      prev.includes(cid) ? prev.filter((id) => id !== cid) : [...prev, cid]
    );
  };

  const selectAllContainers = () => {
    setSelectedContainerIds(availableContainers.map((c) => c.id!));
  };

  const deselectAllContainers = () => {
    setSelectedContainerIds([]);
  };

  // Compute cargo units for this trip
  const { tripUnits, tripLineQuantities, looseUnits } = useMemo(() => {
    let units = 0;
    const lqMap = new Map<number, number>();

    // Units from selected containers
    const selectedSet = new Set(selectedContainerIds);
    for (const e of events) {
      if (e.undone || e.quantity <= 0) continue;
      if (e.containerId && selectedSet.has(e.containerId)) {
        units += e.quantity;
        lqMap.set(e.orderLineId, (lqMap.get(e.orderLineId) || 0) + e.quantity);
      }
    }

    // Units from loose / vrac items (events without containerId or not in any container)
    let looseCount = 0;
    for (const e of events) {
      if (e.undone || e.quantity <= 0) continue;
      if (!e.containerId) {
        looseCount += e.quantity;
        if (includeLoose) {
          units += e.quantity;
          lqMap.set(e.orderLineId, (lqMap.get(e.orderLineId) || 0) + e.quantity);
        }
      }
    }

    // Fallback: If no packaging containers exist at all, allow partial or full shipment based on lines
    if (availableContainers.length === 0 && units === 0) {
      for (const line of lines) {
        if (line.status === 'cancelled') continue;
        lqMap.set(line.id!, line.orderedQty);
        units += line.orderedQty;
      }
    }

    const lqArray = Array.from(lqMap.entries()).map(([orderLineId, quantity]) => ({
      orderLineId,
      quantity,
    }));

    return { tripUnits: units, tripLineQuantities: lqArray, looseUnits: looseCount };
  }, [selectedContainerIds, events, includeLoose, availableContainers.length, lines]);

  // Projected remaining units on dock after this trip
  const projectedRemainingDock = Math.max(0, dockStatus.remainingUnits - tripUnits);

  // Auto-mark isLastTrip when projected remaining is 0
  React.useEffect(() => {
    if (projectedRemainingDock === 0 && tripUnits > 0) {
      setIsLastTrip(true);
    }
  }, [projectedRemainingDock, tripUnits]);

  // Submit departure
  const handleDispatch = async () => {
    if (tripUnits <= 0 && selectedContainerIds.length === 0) return;
    setIsSubmitting(true);
    try {
      const resolvedDriver = customDriver.trim() || driverName;
      const resolvedPlate = customPlate.trim() || truckPlate;

      const trip = await createAndDispatchTrip({
        billId: bill.id!,
        client: bill.client,
        tripNumber: dockStatus.nextTripNumber,
        driverName: resolvedDriver,
        truckPlate: resolvedPlate,
        operatorName,
        containerIds: selectedContainerIds,
        lineQuantities: tripLineQuantities,
        isLastTrip,
        notes,
      });

      playSuccessChime();
      hapticTap('heavy');
      onDispatched(trip);
    } catch (err) {
      console.error('Failed to dispatch trip:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(5px)',
        zIndex: 950,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: 520,
          maxHeight: '92vh',
          overflowY: 'auto',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--glass-border-subtle)',
          boxShadow: 'var(--shadow-xl)',
          borderRadius: 'var(--radius-lg)',
          padding: 20,
        }}
      >
        {/* Modal Header */}
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-2">
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 14,
                background: 'rgba(16, 185, 129, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent)',
              }}
            >
              <IconTruck size={22} />
            </div>
            <div>
              <div className="font-bold text-base flex items-center gap-2">
                <span>Expédition — Voyage N° {dockStatus.nextTripNumber}</span>
                {isLastTrip && (
                  <span
                    style={{
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '9999px',
                      background: 'rgba(16, 185, 129, 0.2)',
                      color: 'var(--accent)',
                    }}
                  >
                    Dernier voyage
                  </span>
                )}
              </div>
              <div className="text-xs text-muted">
                {bill.client} • {bill.billNumber}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-icon"
            onClick={onClose}
            aria-label="Fermer"
          >
            <IconX size={18} />
          </button>
        </div>

        {/* Cargo Summary Pill */}
        <div
          className="card p-2.5 mb-3 flex items-center justify-between"
          style={{
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
          }}
        >
          <div>
            <div className="text-xs font-bold" style={{ color: 'var(--accent)' }}>
              🚚 Dans ce camion (Voyage {dockStatus.nextTripNumber}) :
            </div>
            <div className="text-lg font-bold">
              {tripUnits} pièces{' '}
              <span className="text-xs font-normal text-muted">
                ({selectedContainerIds.length} colis)
              </span>
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs text-muted">Reste à quai ensuite :</div>
            <div
              className="text-sm font-bold"
              style={{
                color: projectedRemainingDock === 0 ? 'var(--accent)' : 'var(--warning)',
              }}
            >
              {projectedRemainingDock === 0 ? '0 pc (Soldé)' : `${projectedRemainingDock} pièces`}
            </div>
          </div>
        </div>

        {/* Container selection */}
        <div className="mb-3">
          <div className="flex justify-between items-center mb-1.5">
            <label className="text-xs font-bold text-muted uppercase tracking-wider">
              1. Colis embarqués dans ce voyage ({selectedContainerIds.length}/{availableContainers.length})
            </label>
            {availableContainers.length > 1 && (
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-ghost btn-xs text-xs"
                  onClick={selectAllContainers}
                  style={{ padding: '2px 6px', fontSize: '0.7rem' }}
                >
                  Tout cocher
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs text-xs"
                  onClick={deselectAllContainers}
                  style={{ padding: '2px 6px', fontSize: '0.7rem' }}
                >
                  Tout décocher
                </button>
              </div>
            )}
          </div>

          {availableContainers.length === 0 ? (
            <div
              className="p-2.5 rounded text-xs text-muted"
              style={{ background: 'var(--bg-input)', border: '1px dashed var(--border)' }}
            >
              Aucun colis spécifique scellé. L'ensemble des articles pointés est comptabilisé.
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1">
              {availableContainers.map((c) => {
                const isSelected = selectedContainerIds.includes(c.id!);
                const info = containerItemMap.get(c.id!);
                const countText = info ? `${info.units} pcs` : 'Non vide';
                return (
                  <button
                    key={c.id}
                    type="button"
                    className="flex items-center justify-between p-2 rounded transition-colors text-left"
                    style={{
                      border: isSelected
                        ? '1px solid var(--accent)'
                        : '1px solid var(--glass-border-subtle)',
                      background: isSelected ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-input)',
                      cursor: 'pointer',
                    }}
                    onClick={() => toggleContainer(c.id!)}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 6,
                          border: isSelected
                            ? '1px solid var(--accent)'
                            : '1px solid var(--border)',
                          background: isSelected ? 'var(--accent)' : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                        }}
                      >
                        {isSelected && <IconCheck size={12} />}
                      </div>
                      <IconBox size={16} style={{ color: isSelected ? 'var(--accent)' : 'var(--text-muted)' }} />
                      <span className="text-xs font-bold">{c.label || c.name || `Carton #${c.id}`}</span>
                    </div>
                    <span className="text-xs text-muted">{countText}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Loose items toggle */}
          {looseUnits > 0 && (
            <button
              type="button"
              className="flex items-center justify-between p-2 mt-1.5 rounded w-full transition-colors text-left"
              style={{
                border: includeLoose
                  ? '1px solid var(--accent)'
                  : '1px solid var(--glass-border-subtle)',
                background: includeLoose ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-input)',
                cursor: 'pointer',
              }}
              onClick={() => setIncludeLoose(!includeLoose)}
            >
              <div className="flex items-center gap-2">
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 6,
                    border: includeLoose ? '1px solid var(--accent)' : '1px solid var(--border)',
                    background: includeLoose ? 'var(--accent)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                  }}
                >
                  {includeLoose && <IconCheck size={12} />}
                </div>
                <span className="text-xs font-bold">Articles en Vrac / Hors Colis</span>
              </div>
              <span className="text-xs text-muted">{looseUnits} pièces</span>
            </button>
          )}
        </div>

        {/* Chauffeur selection */}
        <div className="mb-3">
          <label className="text-xs font-bold text-muted uppercase tracking-wider block mb-1">
            2. Chauffeur (1 Tap)
          </label>
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {COMMON_DRIVERS.map((d) => (
              <button
                key={d}
                type="button"
                className={`btn btn-xs ${
                  driverName === d && !customDriver ? 'btn-primary' : 'btn-secondary'
                }`}
                style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                onClick={() => {
                  setDriverName(d);
                  setCustomDriver('');
                }}
              >
                {d}
              </button>
            ))}
          </div>
          <input
            type="text"
            className="input input-sm w-full"
            placeholder="Autre chauffeur (ex: Yacine, Chauffeur Fournisseur)..."
            value={customDriver}
            onChange={(e) => setCustomDriver(e.target.value)}
            style={{ fontSize: '0.8rem' }}
          />
        </div>

        {/* Véhicule & Matricule */}
        <div className="mb-3">
          <label className="text-xs font-bold text-muted uppercase tracking-wider block mb-1">
            3. Véhicule / Camion
          </label>
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {COMMON_VEHICLES.map((v) => (
              <button
                key={v}
                type="button"
                className={`btn btn-xs ${
                  truckPlate === v && !customPlate ? 'btn-primary' : 'btn-secondary'
                }`}
                style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                onClick={() => {
                  setTruckPlate(v);
                  setCustomPlate('');
                }}
              >
                {v}
              </button>
            ))}
          </div>
          <input
            type="text"
            className="input input-sm w-full"
            placeholder="Immatriculation ou précision véhicule..."
            value={customPlate}
            onChange={(e) => setCustomPlate(e.target.value)}
            style={{ fontSize: '0.8rem' }}
          />
        </div>

        {/* Responsable & Note */}
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-bold text-muted uppercase tracking-wider block mb-1">
              Responsable Quai
            </label>
            <div className="flex items-center gap-1.5 p-1.5 rounded text-xs" style={{ background: 'var(--bg-input)' }}>
              <IconUser size={14} style={{ color: 'var(--accent)' }} />
              <input
                type="text"
                className="input input-xs w-full"
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
                style={{ border: 'none', background: 'transparent', padding: 0 }}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-muted uppercase tracking-wider block mb-1">
              Note (Optionnelle)
            </label>
            <input
              type="text"
              className="input input-sm w-full"
              placeholder="Ex: Livrer dépôt 2 d'abord..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ fontSize: '0.75rem' }}
            />
          </div>
        </div>

        {/* Is Last Trip Checkbox */}
        <label
          className="flex items-center gap-2 p-2 mb-4 rounded cursor-pointer transition-colors"
          style={{
            background: isLastTrip ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-input)',
            border: isLastTrip ? '1px solid var(--accent)' : '1px solid var(--glass-border-subtle)',
          }}
        >
          <input
            type="checkbox"
            checked={isLastTrip}
            onChange={(e) => setIsLastTrip(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
          />
          <span className="text-xs font-bold">
            Ce voyage solde l'expédition (Dernier voyage du bon)
          </span>
        </label>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-secondary flex-1"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Annuler
          </button>
          <button
            type="button"
            className="btn btn-primary flex-2 flex items-center justify-center gap-2"
            style={{ flex: 2, fontWeight: 700 }}
            disabled={isSubmitting || tripUnits <= 0}
            onClick={handleDispatch}
          >
            <IconTruck size={18} />
            <span>
              {isSubmitting
                ? 'Validation...'
                : `VALIDER DÉPART VOYAGE ${dockStatus.nextTripNumber}`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
