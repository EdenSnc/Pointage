// ============================================================
// POINTAGE — Stage Sign-Off Modal (1-Tap Operator Stamp)
// Assigns responsible operator to a bill phase (or batch of bills)
// with zero typing, instant tactile selection, and batch support.
// ============================================================

import { useState } from 'react';
import { IconUser, IconCheck, IconX, IconLayers } from './icons';

import type { Bill, Stage } from './types';
import { assignBillStageOperator, assignBatchBillsStageOperator } from './operators';

interface StageSignOffModalProps {
  isOpen: boolean;
  onClose: () => void;
  bill: Bill;
  stage: Stage;
  operators: string[];
  activeOperator: string;
  relatedBills?: Bill[]; // Other bills belonging to the same client/day if batch
  onSigned: (operatorName: string, batchApplied: boolean) => void;
}

export function StageSignOffModal({
  isOpen,
  onClose,
  bill,
  stage,
  operators,
  activeOperator,
  relatedBills = [],
  onSigned,
}: StageSignOffModalProps) {
  const [selectedOp, setSelectedOp] = useState<string>(activeOperator || operators[0] || 'Opérateur');
  const [applyToBatch, setApplyToBatch] = useState<boolean>(stage !== 'preparation');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (!isOpen) return null;

  const stageLabel =
    stage === 'preparation'
      ? 'Préparation'
      : stage === 'chargement'
      ? 'Chargement'
      : 'Pointage / Contrôle';

  const otherBillsCount = relatedBills.filter((b) => b.id !== bill.id).length;

  const handleConfirm = async () => {
    if (!bill.id || !selectedOp) return;
    setIsSubmitting(true);

    try {
      if (applyToBatch && otherBillsCount > 0) {
        const allIds = [bill.id, ...relatedBills.filter((b) => b.id !== bill.id).map((b) => b.id!)];
        await assignBatchBillsStageOperator(allIds, stage, selectedOp);
        onSigned(selectedOp, true);
      } else {
        await assignBillStageOperator(bill.id, stage, selectedOp);
        onSigned(selectedOp, false);
      }
      onClose();
    } catch (err) {
      console.error('Error assigning stage operator:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 400, width: '92%', borderRadius: '24px', padding: '22px 20px', boxShadow: 'var(--glass-shadow-lg)' }}
      >
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2 font-bold text-base" style={{ color: 'var(--accent-light)' }}>
            <IconUser size={20} />
            <span>Responsable : {stageLabel}</span>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-icon btn-xs"
            onClick={onClose}
            aria-label="Fermer"
          >
            <IconX size={16} />
          </button>
        </div>

        <p className="text-xs text-muted mb-3" style={{ lineHeight: 1.4 }}>
          Qui a effectué cette phase sur le bon <strong>{bill.billNumber}</strong> ({bill.client}) ?
        </p>

        {/* Tactile operator selection grid (Balanced 2-Column Apple Glass) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', width: '100%', marginBottom: '16px' }}>
          {operators.map((op) => {
            const isSelected = op.toLowerCase() === selectedOp.toLowerCase();
            return (
              <button
                key={op}
                type="button"
                className="btn text-left flex items-center justify-between p-3 cursor-pointer"
                style={{
                  width: '100%',
                  borderRadius: '16px',
                  background: isSelected ? 'var(--accent-glow)' : 'var(--bg-surface)',
                  border: isSelected ? '1.5px solid var(--accent)' : '1px solid var(--glass-border-subtle)',
                  color: isSelected ? 'var(--accent-light)' : 'var(--text-primary)',
                  minHeight: 52,
                }}
                onClick={() => setSelectedOp(op)}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: isSelected ? 'var(--accent)' : 'var(--bg-card-active)',
                      color: isSelected ? '#fff' : 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      flexShrink: 0,
                    }}
                  >
                    {op.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-bold text-sm truncate">{op}</span>
                </div>
                {isSelected && <IconCheck size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>

        {/* Batch toggle if multiple bills exist for this client */}
        {otherBillsCount > 0 && (
          <div
            className="p-3 mb-4 flex items-center justify-between cursor-pointer"
            style={{
              borderRadius: '16px',
              background: applyToBatch ? 'rgba(56, 189, 248, 0.1)' : 'var(--bg-surface)',
              border: applyToBatch ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid var(--glass-border-subtle)',
            }}
            onClick={() => setApplyToBatch(!applyToBatch)}
          >
            <div className="flex items-center gap-2">
              <IconLayers size={18} style={{ color: applyToBatch ? 'var(--accent-light)' : 'var(--text-muted)' }} />
              <div className="text-xs">
                <div className="font-bold">Appliquer à toute la commande</div>
                <div className="text-muted text-[11px]">+ {otherBillsCount} autre(s) bon(s) de ce client</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={applyToBatch}
              onChange={(e) => setApplyToBatch(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}

        {/* Confirm button */}
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
            className="btn btn-primary flex-1 flex items-center justify-center gap-1"
            onClick={handleConfirm}
            disabled={isSubmitting || !selectedOp}
          >
            <IconCheck size={16} />
            <span>{isSubmitting ? 'Attribution...' : `Signer : ${selectedOp}`}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
