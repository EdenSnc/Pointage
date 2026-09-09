import React, { useState } from 'react';
import type { Stage } from './types';
import { IconWarning, IconX, IconUndo, IconBox, IconTruck, IconClipboard } from './icons';
import { hapticTap } from './audio';

interface ResetPhaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  stage: Stage;
  stageUnitsCount: number;
  stageLinesCount: number;
  clientName?: string;
  billNumber?: string;
}

export function ResetPhaseModal({
  isOpen,
  onClose,
  onConfirm,
  stage,
  stageUnitsCount,
  stageLinesCount,
  clientName,
  billNumber,
}: ResetPhaseModalProps) {
  const [isResetting, setIsResetting] = useState(false);

  if (!isOpen) return null;

  const stageLabel =
    stage === 'preparation' ? 'Préparation' : stage === 'chargement' ? 'Chargement' : 'Pointage';

  const StageIcon =
    stage === 'preparation' ? IconBox : stage === 'chargement' ? IconTruck : IconClipboard;

  const handleConfirm = async () => {
    hapticTap('heavy');
    setIsResetting(true);
    try {
      await onConfirm();
    } finally {
      setIsResetting(false);
      onClose();
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 460,
          borderRadius: '28px 28px 0 0',
        }}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(239, 68, 68, 0.15)',
                color: 'var(--danger)',
                flexShrink: 0,
              }}
            >
              <IconWarning size={18} />
            </div>
            <div className="modal-title" style={{ margin: 0, fontSize: '0.95rem', color: 'var(--danger)' }}>
              RÉINITIALISER L'ÉTAPE
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-icon"
            onClick={onClose}
            aria-label="Fermer"
            disabled={isResetting}
            style={{ padding: 4 }}
          >
            <IconX size={18} />
          </button>
        </div>

        {/* Phase Badge & Target Context */}
        <div
          className="p-3 mb-3 flex items-center justify-between"
          style={{
            background: 'var(--bg-surface)',
            borderRadius: '18px',
            border: '1px solid var(--glass-border-subtle)',
          }}
        >
          <div className="flex items-center gap-2.5">
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(16, 185, 129, 0.12)',
                color: 'var(--accent)',
              }}
            >
              <StageIcon size={20} />
            </div>
            <div>
              <div className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                Phase : {stageLabel}
              </div>
              {(clientName || billNumber) && (
                <div className="text-xs text-muted">
                  {clientName} {billNumber ? `• N° ${billNumber}` : ''}
                </div>
              )}
            </div>
          </div>
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: 800,
              padding: '3px 9px',
              borderRadius: 9999,
              background: 'rgba(239, 68, 68, 0.16)',
              color: 'var(--danger)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
            }}
          >
            Remise à zéro
          </span>
        </div>

        {/* Impact Cards Grid */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div
            className="p-3"
            style={{
              background: 'rgba(239, 68, 68, 0.08)',
              borderRadius: '16px',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              textAlign: 'center',
            }}
          >
            <div className="text-xs text-muted mb-0.5">Unités pointées</div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '1.25rem',
                fontWeight: 800,
                color: 'var(--danger)',
              }}
            >
              {stageUnitsCount}
            </div>
            <div className="text-[11px] text-muted">pièces à effacer</div>
          </div>

          <div
            className="p-3"
            style={{
              background: 'var(--bg-surface)',
              borderRadius: '16px',
              border: '1px solid var(--glass-border-subtle)',
              textAlign: 'center',
            }}
          >
            <div className="text-xs text-muted mb-0.5">Articles traités</div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '1.25rem',
                fontWeight: 800,
                color: 'var(--text-primary)',
              }}
            >
              {stageLinesCount}
            </div>
            <div className="text-[11px] text-muted">remis en attente</div>
          </div>
        </div>

        {/* Informative Safety Notice */}
        <div
          className="p-3 mb-4 text-xs"
          style={{
            background: 'rgba(245, 158, 11, 0.1)',
            borderRadius: '16px',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            color: 'var(--text-secondary)',
            lineHeight: 1.45,
          }}
        >
          <div className="font-bold text-warning mb-1 flex items-center gap-1.5">
            <IconWarning size={14} /> Attention
          </div>
          Cette action annulera l'intégralité des comptages de l'étape <strong>{stageLabel}</strong> pour ce bon. Les articles du bon et les comptages des autres étapes restent intacts.
        </div>

        {/* Modal Action Buttons */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="btn btn-full flex items-center justify-center gap-2"
            style={{
              background: 'var(--danger)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 9999,
              padding: '12px 16px',
              fontWeight: 800,
              fontSize: '0.88rem',
              boxShadow: '0 4px 18px rgba(239, 68, 68, 0.4)',
              cursor: isResetting ? 'not-allowed' : 'pointer',
              opacity: isResetting ? 0.7 : 1,
            }}
            onClick={handleConfirm}
            disabled={isResetting}
          >
            <IconUndo size={16} />
            <span>{isResetting ? 'Réinitialisation en cours...' : `Confirmer la réinitialisation (0 pièce)`}</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-full flex items-center justify-center gap-2"
            style={{
              borderRadius: 9999,
              padding: '11px 16px',
              fontWeight: 700,
              fontSize: '0.85rem',
            }}
            onClick={onClose}
            disabled={isResetting}
          >
            <span>Conserver les comptages (Annuler)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
