import React, { useState, useEffect } from 'react';
import type { OrderLine, Bill, Stage, PointageOutcome } from './types';
import { useLineEvents, useBillContainers, addCountEvent, undoLastCount } from './hooks';
import { sumStageEvents } from './logic';
import {
  IconScan,
  IconBox,
  IconCheck,
  IconUndo,
  IconArrowRight,
  IconPlus,
} from './icons';

interface FastScanQuantityCardProps {
  line: OrderLine;
  bill?: Bill;
  stage: Stage;
  onNextScan: () => void;
  onOpenLine: (line: OrderLine) => void;
  setToast: (m: string) => void;
}

export function FastScanQuantityCard({
  line,
  bill,
  stage,
  onNextScan,
  onOpenLine,
  setToast,
}: FastScanQuantityCardProps) {
  const events = useLineEvents(line.id);
  const containers = useBillContainers(line.billId);

  const [selectedContainerId, setSelectedContainerId] = useState<number | null>(null);
  const [customQty, setCustomQty] = useState(1);
  const [pointageOutcome, setPointageOutcome] = useState<PointageOutcome>('accepted');
  const [recentDelta, setRecentDelta] = useState<number | null>(null);

  // Set default container
  useEffect(() => {
    if (containers && containers.length > 0 && selectedContainerId === null) {
      const lastEvent = events.filter((e) => e.containerId !== null).pop();
      if (lastEvent?.containerId) {
        setSelectedContainerId(lastEvent.containerId);
      } else {
        setSelectedContainerId(containers[0].id!);
      }
    }
  }, [containers, events, selectedContainerId]);

  const totalCounted = sumStageEvents(events, stage);
  const remaining = Math.max(0, line.orderedQty - totalCounted);
  const percent =
    line.orderedQty > 0
      ? Math.min(100, Math.round((totalCounted / line.orderedQty) * 100))
      : 100;
  const isExact = totalCounted === line.orderedQty;
  const isOver = totalCounted > line.orderedQty;
  const packSize = line.outerPackSize || line.innerPackSize || 0;


  const handleAdd = async (qty: number) => {
    if (qty <= 0) return;
    try {
      await addCountEvent(
        line.billId,
        line.id!,
        stage,
        qty,
        selectedContainerId,
        stage === 'pointage' ? pointageOutcome : null
      );
      if (navigator.vibrate) navigator.vibrate(40);
      setRecentDelta(qty);
      setTimeout(() => setRecentDelta(null), 1400);
      setToast(`+${qty} validé pour N°${line.no}`);
    } catch (err) {
      console.error('Erreur lors de l’ajout rapide de quantité:', err);
    }
  };

  const handleUndo = async () => {
    const ok = await undoLastCount(line.id!, stage);
    if (ok) {
      setToast(`Dernier comptage annulé pour N°${line.no}`);
    }
  };

  return (
    <div className="fast-scan-card card" style={{ padding: '16px 18px', margin: 0, background: 'var(--bg-card)' }}>
      {/* Header: Line reference & status */}
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          <span className="line-no font-bold" style={{ fontSize: '1.2rem' }}>
            N°{line.no}
          </span>
          {line.reference && (
            <span className="badge" style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)' }}>
              RÉF: {line.reference}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isExact ? (
            <span className="badge badge-exact" style={{ fontSize: '0.72rem' }}>
              ✓ LIGNE COMPLÈTE
            </span>
          ) : isOver ? (
            <span className="badge badge-over" style={{ fontSize: '0.72rem' }}>
              ⚠️ SURPLUS (+{totalCounted - line.orderedQty})
            </span>
          ) : (
            <span className="badge badge-active" style={{ fontSize: '0.72rem' }}>
              {totalCounted}/{line.orderedQty} ({percent}%)
            </span>
          )}

          {events.filter((e) => e.stage === stage && !e.undone).length > 0 && (
            <button
              className="btn btn-xs btn-ghost btn-icon"
              onClick={handleUndo}
              title="Annuler le dernier ajout"
              style={{ padding: 4 }}
            >
              <IconUndo size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Designation */}
      <div className="font-bold text-sm mb-1 line-clamp-2" style={{ lineHeight: 1.35 }}>
        {line.designation}
      </div>

      {bill && (
        <div className="text-xs text-muted mb-2">
          Bon : <strong>{bill.billNumber}</strong> • Client : <strong>{bill.client}</strong>
        </div>
      )}

      {/* Progress Bar & Numerical count */}
      <div className="mb-3">
        <div className="flex justify-between items-center text-xs mb-1">
          <span className="text-muted">
            Déjà compté : <strong className="text-primary">{totalCounted}</strong> / {line.orderedQty}
          </span>
          <span className="font-semibold" style={{ color: remaining > 0 ? 'var(--warning)' : 'var(--accent)' }}>
            {remaining > 0 ? `Reste à servir : ${remaining}` : 'Complet'}
          </span>
        </div>
        <div className="progress-bar" style={{ height: 8 }}>
          <div
            className={`progress-fill ${isExact ? 'complete' : ''}`}

            style={{
              width: `${percent}%`,
              background: isOver ? 'var(--over-border)' : undefined,
            }}
          />
        </div>
      </div>

      {/* Container selection (Preparation & Chargement) */}
      {(stage === 'preparation' || stage === 'chargement') && (
        <div className="mb-3">
          <div className="text-xs font-semibold text-muted mb-1 flex items-center gap-1">
            <IconBox size={13} /> Colis de destination :
          </div>
          <div className="flex gap-1 overflow-x-auto py-1 items-center" style={{ scrollbarWidth: 'none' }}>
            {containers.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`container-tag ${selectedContainerId === c.id ? 'selected' : ''}`}
                onClick={() => setSelectedContainerId(c.id!)}
                style={{
                  padding: '4px 10px',
                  fontSize: '0.74rem',
                  margin: 0,
                  cursor: 'pointer',
                }}
              >
                {c.label}
              </button>
            ))}
            <button
              type="button"
              className={`container-tag ${selectedContainerId === null ? 'selected' : ''}`}
              onClick={() => setSelectedContainerId(null)}
              style={{
                padding: '4px 10px',
                fontSize: '0.74rem',
                margin: 0,
                cursor: 'pointer',
              }}
            >
              Hors Carton
            </button>
          </div>
        </div>
      )}

      {/* Pointage outcome selection */}
      {stage === 'pointage' && (
        <div className="flex gap-1 mb-3">
          <button
            type="button"
            className={`btn btn-xs flex-1 ${pointageOutcome === 'accepted' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setPointageOutcome('accepted')}
          >
            ✓ Conforme
          </button>

          <button
            type="button"
            className={`btn btn-xs flex-1 ${pointageOutcome === 'damaged_accepted' ? 'btn-warning' : 'btn-secondary'}`}
            onClick={() => setPointageOutcome('damaged_accepted')}
          >
            Avarié Accepté
          </button>
          <button
            type="button"
            className={`btn btn-xs flex-1 ${pointageOutcome === 'damaged_refused' ? 'btn-danger' : 'btn-secondary'}`}
            onClick={() => setPointageOutcome('damaged_refused')}
          >
            Refusé
          </button>
        </div>
      )}

      {/* QUICK QUANTITY BUTTONS */}
      <div className="flex flex-col gap-2 mb-3">
        <div className="text-xs font-semibold text-muted">Ajouter directement :</div>
        <div className="flex gap-2">
          {/* +1 Button */}
          <button
            type="button"
            className="btn btn-sm btn-secondary flex-1 flex items-center justify-center font-bold"
            onClick={() => handleAdd(1)}
            style={{ fontSize: '0.92rem' }}
          >
            + 1
          </button>

          {/* +Pack Button (if packaging is defined) */}
          {packSize > 1 && (
            <button
              type="button"
              className="btn btn-sm btn-secondary flex-1 flex items-center justify-center font-bold"
              onClick={() => handleAdd(packSize)}
              style={{ fontSize: '0.92rem' }}
            >
              + {packSize} <span className="text-xs text-muted ml-1 font-normal">(Boîte)</span>
            </button>
          )}

          {/* Fill remaining button */}
          {remaining > 0 && remaining !== 1 && remaining !== packSize && (
            <button
              type="button"
              className="btn btn-sm btn-primary flex-1 flex items-center justify-center font-bold"
              onClick={() => handleAdd(remaining)}
              style={{ fontSize: '0.85rem' }}
            >
              ✓ Reste ({remaining})
            </button>
          )}
        </div>

        {/* Stepper for custom arbitrary quantity */}
        <div className="flex items-center gap-2 mt-1">
          <div className="stepper flex-1" style={{ justifyContent: 'space-between' }}>
            <button
              type="button"
              className="stepper-btn"
              onClick={() => setCustomQty((q) => Math.max(1, q - 1))}
              aria-label="Diminuer"
            >
              -
            </button>
            <span className="stepper-value" style={{ fontSize: '1.1rem' }}>
              {customQty}
            </span>
            <button
              type="button"
              className="stepper-btn"
              onClick={() => setCustomQty((q) => q + 1)}
              aria-label="Augmenter"
            >
              +
            </button>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-secondary font-bold"
            onClick={() => handleAdd(customQty)}
            style={{ minWidth: 100 }}
          >
            <IconPlus size={14} /> Ajouter
          </button>
        </div>
      </div>

      {recentDelta !== null && (
        <div
          className="text-xs font-bold text-center py-1 mb-2 rounded"
          style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent)' }}
        >
          ✓ +{recentDelta} unités ajoutées avec succès !
        </div>
      )}

      {/* Navigation Footer */}
      <div className="flex gap-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
        <button
          type="button"
          className="btn btn-primary flex-1 flex items-center justify-center gap-2"
          onClick={onNextScan}
        >
          <IconScan size={16} /> Scanner suivant
        </button>
        <button
          type="button"
          className="btn btn-secondary flex items-center justify-center gap-1"
          onClick={() => onOpenLine(line)}
          title="Ouvrir la fiche complète"
        >
          Détail <IconArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
