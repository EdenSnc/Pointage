// ============================================================
// POINTAGE — FastScanQuantityCard
// Ergonomic Thumb-Zone Quantity & Container Card (Fitts's Law)
// Direct Tap-to-Type Keypad + Velocity Acceleration + Audio/Haptics
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import type { OrderLine, Bill, Stage, PointageOutcome } from './types';
import { useLineEvents, useBillContainers, addCountEvent, undoLastCount } from './hooks';
import { sumStageEvents } from './logic';
import { playSuccessChime, playWarningBeep } from './audio';
import {
  IconScan,
  IconBox,
  IconUndo,
  IconArrowRight,
  IconPlus,
  IconPencil,
  IconCheck,
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
  const [isEditingCustomQty, setIsEditingCustomQty] = useState(false);
  const [pointageOutcome, setPointageOutcome] = useState<PointageOutcome>('accepted');
  const [recentDelta, setRecentDelta] = useState<number | null>(null);
  const [isPulsing, setIsPulsing] = useState(false);

  // Stepper long-press acceleration refs
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStartTimestampRef = useRef<number>(0);

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

      // Multimodal sensory confirmation: Audio chime + 55ms haptic pulse
      playSuccessChime();

      // Trigger card visual green pulse animation
      setIsPulsing(true);
      setTimeout(() => setIsPulsing(false), 600);

      setRecentDelta(qty);
      setTimeout(() => setRecentDelta(null), 1600);
      setToast(`+${qty} validé pour N°${line.no}`);
    } catch (err) {
      console.error('Erreur lors de l’ajout de quantité:', err);
    }
  };

  const handleUndo = async () => {
    const ok = await undoLastCount(line.id!, stage);
    if (ok) {
      playWarningBeep();
      setToast(`Dernier comptage annulé pour N°${line.no}`);
    }
  };

  // Stepper velocity acceleration (Fitts's Law / KLM)
  const stepQuantity = (direction: 'up' | 'down') => {
    setCustomQty((prev) => {
      const elapsed = Date.now() - holdStartTimestampRef.current;
      // Accelerate step magnitude if held for more than 1.2s
      const delta = elapsed > 1200 ? 5 : 1;
      if (direction === 'up') return prev + delta;
      return Math.max(1, prev - delta);
    });
  };

  const startHold = (direction: 'up' | 'down') => {
    holdStartTimestampRef.current = Date.now();
    stepQuantity(direction);
    stopHold();

    holdTimeoutRef.current = setTimeout(() => {
      holdIntervalRef.current = setInterval(() => {
        stepQuantity(direction);
      }, 100);
    }, 280);
  };

  const stopHold = () => {
    if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current);
    if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
    holdTimeoutRef.current = null;
    holdIntervalRef.current = null;
  };

  return (
    <div
      className={`fast-scan-card card ${isPulsing ? 'scan-pulse-green' : ''}`}
      style={{
        padding: '16px 18px',
        margin: 0,
        background: 'var(--bg-card)',
        boxShadow: 'var(--glass-shadow-lg)',
        border: isPulsing ? '2px solid var(--accent)' : '1px solid var(--glass-border-bright)',
        transition: 'border 0.2s ease, box-shadow 0.2s ease',
      }}
    >
      {/* ============================================================ */}
      {/* TIER 1: ITEM IDENTIFIER CHUNK (Miller's Law - Working Memory) */}
      {/* ============================================================ */}
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          <span
            className="line-no font-bold"
            style={{
              fontSize: '1.25rem',
              color: 'var(--text-primary)',
              letterSpacing: '-0.3px',
            }}
          >
            N°{line.no}
          </span>
          {line.reference && (
            <span
              className="badge font-mono"
              style={{
                background: 'var(--bg-surface)',
                color: 'var(--text-secondary)',
                padding: '3px 8px',
                fontSize: '0.78rem',
              }}
            >
              RÉF: {line.reference}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isExact ? (
            <span className="badge badge-exact font-bold" style={{ fontSize: '0.75rem', padding: '4px 8px' }}>
              ✓ Ligne complète
            </span>
          ) : isOver ? (
            <span className="badge badge-over font-bold" style={{ fontSize: '0.75rem', padding: '4px 8px' }}>
              ⚠️ Surplus (+{totalCounted - line.orderedQty})
            </span>
          ) : (
            <span className="badge badge-active font-bold" style={{ fontSize: '0.75rem', padding: '4px 8px' }}>
              {totalCounted}/{line.orderedQty} ({percent}%)
            </span>
          )}

          {events.filter((e) => e.stage === stage && !e.undone).length > 0 && (
            <button
              className="btn btn-xs btn-ghost btn-icon"
              onClick={handleUndo}
              title="Annuler le dernier ajout"
              style={{ minWidth: 36, minHeight: 36, padding: 6 }}
              aria-label="Annuler dernier comptage"
            >
              <IconUndo size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Designation (Sentence-case, High Contrast) */}
      <div
        className="font-bold text-sm mb-1 line-clamp-2"
        style={{ lineHeight: 1.35, color: 'var(--text-primary)' }}
      >
        {line.designation}
      </div>

      {bill && (
        <div className="text-xs text-muted mb-2">
          Bon : <strong style={{ color: 'var(--text-secondary)' }}>{bill.billNumber}</strong> • Client :{' '}
          <strong style={{ color: 'var(--text-secondary)' }}>{bill.client}</strong>
        </div>
      )}

      {/* ============================================================ */}
      {/* TIER 2: LIVE COUNT & PROGRESS (High Contrast 7:1)             */}
      {/* ============================================================ */}
      <div
        className="mb-3 p-2 rounded"
        style={{
          background: 'var(--bg-surface)',
          borderRadius: 12,
          border: '1px solid var(--glass-border-subtle)',
        }}
      >
        <div className="flex justify-between items-baseline mb-1">
          <div className="text-xs text-muted">
            Compté :{' '}
            <span
              className="font-bold text-base"
              style={{
                color: isExact ? 'var(--accent)' : isOver ? 'var(--over)' : 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {totalCounted}
            </span>{' '}
            / {line.orderedQty}
          </div>
          <div
            className="text-xs font-bold"
            style={{
              color: remaining > 0 ? 'var(--warning)' : 'var(--accent)',
            }}
          >
            {remaining > 0 ? `Reste à servir : ${remaining}` : 'Complet ✓'}
          </div>
        </div>

        <div className="progress-bar" style={{ height: 10, borderRadius: 5 }}>
          <div
            className={`progress-fill ${isExact ? 'complete' : ''}`}
            style={{
              width: `${percent}%`,
              background: isOver ? 'var(--over-border)' : undefined,
            }}
          />
        </div>
      </div>

      {/* Container destination pills (48dp Touch Friendly) */}
      {(stage === 'preparation' || stage === 'chargement') && (
        <div className="mb-3">
          <div className="text-xs font-semibold text-muted mb-1 flex items-center gap-1">
            <IconBox size={13} /> Colis de destination :
          </div>
          <div
            className="flex gap-2 overflow-x-auto py-1 items-center"
            style={{ scrollbarWidth: 'none', minHeight: 48 }}
          >
            {containers.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`container-tag ${selectedContainerId === c.id ? 'selected' : ''}`}
                onClick={() => setSelectedContainerId(c.id!)}
                style={{
                  padding: '8px 14px',
                  minHeight: 42,
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  margin: 0,
                  cursor: 'pointer',
                  borderRadius: 12,
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
                padding: '8px 14px',
                minHeight: 42,
                fontSize: '0.82rem',
                fontWeight: 700,
                margin: 0,
                cursor: 'pointer',
                borderRadius: 12,
              }}
            >
              Hors Carton
            </button>
          </div>
        </div>
      )}

      {/* Pointage outcome selection (Verification stage) */}
      {stage === 'pointage' && (
        <div className="flex gap-2 mb-3">
          <button
            type="button"
            className={`btn btn-sm flex-1 ${
              pointageOutcome === 'accepted' ? 'btn-primary' : 'btn-secondary'
            }`}
            onClick={() => setPointageOutcome('accepted')}
            style={{ minHeight: 44, fontSize: '0.82rem', fontWeight: 700 }}
          >
            ✓ Conforme
          </button>
          <button
            type="button"
            className={`btn btn-sm flex-1 ${
              pointageOutcome === 'damaged_accepted' ? 'btn-warning' : 'btn-secondary'
            }`}
            onClick={() => setPointageOutcome('damaged_accepted')}
            style={{ minHeight: 44, fontSize: '0.82rem', fontWeight: 700 }}
          >
            Avarié Accepté
          </button>
          <button
            type="button"
            className={`btn btn-sm flex-1 ${
              pointageOutcome === 'damaged_refused' ? 'btn-danger' : 'btn-secondary'
            }`}
            onClick={() => setPointageOutcome('damaged_refused')}
            style={{ minHeight: 44, fontSize: '0.82rem', fontWeight: 700 }}
          >
            Refusé
          </button>
        </div>
      )}

      {/* ============================================================ */}
      {/* TIER 3: THUMB-ZONE QUICK ACTIONS (Fitts's Law: 48dp Bounds)   */}
      {/* ============================================================ */}
      <div className="flex flex-col gap-2 mb-3">
        <div className="text-xs font-semibold text-muted">Ajouter en 1 clic :</div>
        <div className="flex gap-2">
          {/* +1 Quick Action */}
          <button
            type="button"
            className="btn btn-secondary flex-1 flex items-center justify-center font-bold"
            onClick={() => handleAdd(1)}
            style={{
              minHeight: 48,
              fontSize: '1rem',
              borderRadius: 14,
            }}
          >
            + 1
          </button>

          {/* +Pack Quick Action (if pack size defined) */}
          {packSize > 1 && (
            <button
              type="button"
              className="btn btn-secondary flex-1 flex items-center justify-center font-bold"
              onClick={() => handleAdd(packSize)}
              style={{
                minHeight: 48,
                fontSize: '0.92rem',
                borderRadius: 14,
              }}
            >
              + {packSize} <span className="text-xs text-muted ml-1 font-normal">(Boîte)</span>
            </button>
          )}

          {/* Smart 1-Tap Complete Remaining Button */}
          {remaining > 0 && remaining !== 1 && remaining !== packSize && (
            <button
              type="button"
              className="btn btn-primary flex-1 flex items-center justify-center font-bold"
              onClick={() => handleAdd(remaining)}
              style={{
                minHeight: 48,
                fontSize: '0.90rem',
                borderRadius: 14,
              }}
            >
              ✓ Reste ({remaining})
            </button>
          )}
        </div>

        {/* Direct Tap-to-Type Stepper Area */}
        <div className="flex items-center gap-2 mt-1">
          <div
            className="stepper flex-1"
            style={{
              minHeight: 48,
              justifyContent: 'space-between',
              padding: '0 4px',
              borderRadius: 14,
            }}
          >
            {/* Accelerating Decrement Button */}
            <button
              type="button"
              className="stepper-btn"
              onPointerDown={() => startHold('down')}
              onPointerUp={stopHold}
              onPointerLeave={stopHold}
              aria-label="Diminuer (maintenir pour accélérer)"
              style={{ width: 44, height: 44, fontSize: '1.4rem' }}
            >
              -
            </button>

            {/* Direct Tap-to-Type Number Input Toggle */}
            {isEditingCustomQty ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setIsEditingCustomQty(false);
                }}
                className="flex items-center gap-1"
                style={{ maxWidth: 90 }}
              >
                <input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="input text-center font-bold font-mono"
                  style={{
                    height: 38,
                    fontSize: '1.15rem',
                    padding: '2px 4px',
                    color: 'var(--text-primary)',
                    background: 'var(--bg-card-active)',
                  }}
                  value={customQty}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setCustomQty(isNaN(val) ? 1 : Math.max(1, Math.min(9999, val)));
                  }}
                  onBlur={() => setIsEditingCustomQty(false)}
                  autoFocus
                />
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setIsEditingCustomQty(true)}
                className="stepper-value font-mono font-bold flex items-center gap-1"
                style={{
                  fontSize: '1.2rem',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px 10px',
                  borderRadius: 8,
                }}
                title="Cliquer pour taper la quantité directement au clavier"
              >
                <span>{customQty}</span>
                <IconPencil size={12} style={{ color: 'var(--text-muted)', opacity: 0.6 }} />
              </button>
            )}

            {/* Accelerating Increment Button */}
            <button
              type="button"
              className="stepper-btn"
              onPointerDown={() => startHold('up')}
              onPointerUp={stopHold}
              onPointerLeave={stopHold}
              aria-label="Augmenter (maintenir pour accélérer)"
              style={{ width: 44, height: 44, fontSize: '1.4rem' }}
            >
              +
            </button>
          </div>

          <button
            type="button"
            className="btn btn-secondary font-bold flex items-center justify-center gap-1"
            onClick={() => handleAdd(customQty)}
            style={{ minWidth: 104, minHeight: 48, borderRadius: 14 }}
          >
            <IconPlus size={15} /> Ajouter
          </button>
        </div>
      </div>

      {recentDelta !== null && (
        <div
          className="text-xs font-bold text-center py-2 mb-2 rounded"
          style={{
            background: 'rgba(16, 185, 129, 0.15)',
            color: 'var(--accent)',
            borderRadius: 10,
          }}
        >
          ✓ +{recentDelta} unités enregistrées avec succès !
        </div>
      )}

      {/* Navigation Footer (Bottom Thumb Zone) */}
      <div className="flex gap-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
        <button
          type="button"
          className="btn btn-primary flex-1 flex items-center justify-center gap-2"
          onClick={onNextScan}
          style={{ minHeight: 50, fontSize: '0.95rem', fontWeight: 800, borderRadius: 14 }}
        >
          <IconScan size={18} /> Scanner suivant
        </button>
        <button
          type="button"
          className="btn btn-secondary flex items-center justify-center gap-1"
          onClick={() => onOpenLine(line)}
          title="Ouvrir la fiche complète"
          style={{ minHeight: 50, minWidth: 80, borderRadius: 14 }}
        >
          Détail <IconArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
