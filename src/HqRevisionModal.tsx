import React, { useState } from 'react';
import { Bill, HqRevisionChange } from './types';
import { getZoneShortLabel } from './warehouseZones';
import {
  IconWarning,
  IconCheck,
  IconPlus,
  IconTrash,
  IconRotate,
  IconX,
  IconMapPin,
  IconBox,
} from './icons';
import { triggerHapticFeedback, playSuccessChime } from './audio';

interface HqRevisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  bill: Bill;
  onAcknowledge: () => Promise<void>;
  onToast: (msg: string) => void;
}

export const HqRevisionModal: React.FC<HqRevisionModalProps> = ({
  isOpen,
  onClose,
  bill,
  onAcknowledge,
  onToast,
}) => {
  const [checkedIndices, setCheckedIndices] = useState<Set<number>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !bill.hqRevision) return null;

  const changes: HqRevisionChange[] = bill.hqRevision.changes || [];
  const allChecked = changes.length > 0 && checkedIndices.size === changes.length;

  const toggleCheck = (idx: number) => {
    triggerHapticFeedback();
    setCheckedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  const toggleAll = () => {
    triggerHapticFeedback();
    if (allChecked) {
      setCheckedIndices(new Set());
    } else {
      setCheckedIndices(new Set(changes.map((_, i) => i)));
    }
  };

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onAcknowledge();
      playSuccessChime();
      triggerHapticFeedback();
      onToast('Commande marquée comme réajustée avec succès ✓');
      onClose();
    } catch (err) {
      console.error('Failed to acknowledge HQ revision:', err);
      onToast('Erreur lors de la validation du réajustement');
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
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        zIndex: 1050,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        className="hq-revision-modal"
        style={{
          background: 'var(--bg-card, #16171b)',
          border: '1.5px solid rgba(239, 68, 68, 0.45)',
          borderRadius: 24,
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.6), 0 0 32px rgba(239, 68, 68, 0.2)',
          width: '100%',
          maxWidth: 580,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'linear-gradient(180deg, rgba(239, 68, 68, 0.14) 0%, transparent 100%)',
          }}
        >
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  background: 'rgba(239, 68, 68, 0.2)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ef4444',
                  flexShrink: 0,
                }}
              >
                <IconWarning size={20} />
              </div>
              <div className="min-w-0">
                <h2
                  style={{
                    fontSize: '1.05rem',
                    fontWeight: 800,
                    color: '#ffffff',
                    margin: 0,
                    lineHeight: 1.2,
                  }}
                >
                  Révision Siège — Guide de Réajustement
                </h2>
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-secondary, #9ca3af)',
                    marginTop: 2,
                  }}
                >
                  {bill.client} • {bill.billNumber || bill.id}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-circle btn-sm"
              style={{ borderRadius: '50%', color: '#9ca3af', width: 34, height: 34 }}
              onClick={onClose}
            >
              <IconX size={18} />
            </button>
          </div>

          <p
            style={{
              fontSize: '0.78rem',
              color: 'var(--text-secondary, #cbd5e1)',
              margin: '6px 0 0 0',
              lineHeight: 1.45,
            }}
          >
            Le siège commercial a modifié cette commande après le début de la préparation.
            Suivez les actions ci-dessous pour aligner physiquement la marchandise :
          </p>

          <div
            style={{
              marginTop: 10,
              padding: '6px 12px',
              borderRadius: 12,
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px dashed rgba(239, 68, 68, 0.3)',
              fontSize: '0.72rem',
              color: '#f87171',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <span style={{ fontWeight: 600 }}>{bill.hqRevision.summaryMessage}</span>
            <span style={{ fontSize: '0.68rem', opacity: 0.8, flexShrink: 0 }}>
              {new Date(bill.hqRevision.revisedAt).toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        </div>

        {/* Toolbar Checklist Header */}
        <div
          className="flex items-center justify-between px-5 py-2.5"
          style={{
            background: 'rgba(255, 255, 255, 0.02)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            fontSize: '0.75rem',
          }}
        >
          <span style={{ color: 'var(--text-secondary, #9ca3af)', fontWeight: 600 }}>
            {checkedIndices.size} / {changes.length} tâche(s) cochée(s)
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              color: 'var(--accent, #3b82f6)',
              padding: '2px 8px',
              height: 26,
            }}
            onClick={toggleAll}
          >
            {allChecked ? 'Tout décocher' : 'Tout cocher'}
          </button>
        </div>

        {/* Scrollable list of changes */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {changes.map((change, idx) => {
            const isChecked = checkedIndices.has(idx);
            const isAdded = change.type === 'added';
            const isRemoved = change.type === 'removed';
            const isQtyChanged = change.type === 'quantity_changed';

            let themeColor = '#f59e0b'; // amber default
            let badgeText = 'Quantité modifiée';
            let instruction = '';

            if (isAdded) {
              themeColor = '#10b981';
              badgeText = `+ À AJOUTER (+${change.newQty || change.delta || 0} pcs)`;
              instruction = `Prendre ${change.newQty || change.delta || 0} pcs en rayon et les ajouter au colis.`;
            } else if (isRemoved) {
              themeColor = '#ef4444';
              badgeText = `- À RETIRER (-${change.oldQty || 0} pcs)`;
              instruction = `Retirer ces ${change.oldQty || 0} pcs du carton et les remettre en rayon.`;
            } else if (isQtyChanged) {
              const delta = change.delta ?? (change.newQty || 0) - (change.oldQty || 0);
              if (delta > 0) {
                themeColor = '#10b981';
                badgeText = `+ AJOUTER +${delta} pcs (passé de ${change.oldQty} à ${change.newQty})`;
                instruction = `Ajouter ${delta} pcs supplémentaires au carton.`;
              } else {
                themeColor = '#ef4444';
                badgeText = `- RETIRER ${Math.abs(delta)} pcs (passé de ${change.oldQty} à ${change.newQty})`;
                instruction = `Retirer ${Math.abs(delta)} pcs du carton et les remettre en rayon.`;
              }
            }

            const zoneLabel = change.warehouseZone ? getZoneShortLabel(change.warehouseZone) : null;

            return (
              <div
                key={idx}
                onClick={() => toggleCheck(idx)}
                style={{
                  padding: '12px 14px',
                  borderRadius: 16,
                  background: isChecked
                    ? 'rgba(255, 255, 255, 0.02)'
                    : `linear-gradient(135deg, ${themeColor}12 0%, rgba(255, 255, 255, 0.02) 100%)`,
                  border: `1.5px solid ${isChecked ? 'rgba(255, 255, 255, 0.1)' : `${themeColor}45`}`,
                  opacity: isChecked ? 0.6 : 1,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                }}
              >
                {/* Custom Checkbox */}
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 7,
                    border: `2px solid ${isChecked ? '#10b981' : 'rgba(255, 255, 255, 0.3)'}`,
                    background: isChecked ? '#10b981' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: 2,
                    color: '#ffffff',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {isChecked && <IconCheck size={14} />}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span
                      style={{
                        fontSize: '0.66rem',
                        fontWeight: 800,
                        padding: '2px 7px',
                        borderRadius: 9999,
                        background: `${themeColor}22`,
                        color: themeColor,
                        border: `1px solid ${themeColor}44`,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                      }}
                    >
                      {isAdded && <IconPlus size={10} />}
                      {isRemoved && <IconTrash size={10} />}
                      {isQtyChanged && <IconRotate size={10} />}
                      <span>{badgeText}</span>
                    </span>

                    {zoneLabel && (
                      <span
                        style={{
                          fontSize: '0.66rem',
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: 9999,
                          background: 'rgba(59, 130, 246, 0.16)',
                          color: '#60a5fa',
                          border: '1px solid rgba(59, 130, 246, 0.3)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                        }}
                      >
                        <IconMapPin size={10} />
                        <span>{zoneLabel}</span>
                      </span>
                    )}
                  </div>

                  {/* Ref & Designation */}
                  <div
                    style={{
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      color: isChecked ? 'var(--text-muted, #9ca3af)' : '#ffffff',
                      textDecoration: isChecked ? 'line-through' : 'none',
                      lineHeight: 1.3,
                    }}
                  >
                    {change.reference && (
                      <span
                        style={{
                          fontFamily: 'var(--font-mono, monospace)',
                          color: isChecked ? 'var(--text-muted, #9ca3af)' : '#60a5fa',
                          marginRight: 6,
                          fontWeight: 800,
                        }}
                      >
                        {change.reference}
                      </span>
                    )}
                    <span>{change.designation}</span>
                  </div>

                  {/* Operational Instruction */}
                  <div
                    style={{
                      fontSize: '0.74rem',
                      color: isChecked ? 'var(--text-muted, #6b7280)' : 'var(--text-secondary, #cbd5e1)',
                      marginTop: 4,
                      lineHeight: 1.4,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <IconBox size={12} style={{ opacity: 0.6, flexShrink: 0 }} />
                    <span>{instruction}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(0, 0, 0, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <button
            type="button"
            className="btn btn-ghost"
            style={{
              borderRadius: 9999,
              padding: '10px 18px',
              fontSize: '0.80rem',
              fontWeight: 700,
              minHeight: 44,
              color: 'var(--text-secondary, #9ca3af)',
            }}
            onClick={onClose}
          >
            Fermer (Plus tard)
          </button>

          <button
            type="button"
            className="btn btn-primary"
            style={{
              borderRadius: 9999,
              padding: '10px 22px',
              fontSize: '0.82rem',
              fontWeight: 800,
              minHeight: 48,
              background: '#10b981',
              borderColor: '#10b981',
              color: '#ffffff',
              boxShadow: '0 4px 18px rgba(16, 185, 129, 0.35)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
            disabled={isSubmitting}
            onClick={handleConfirm}
          >
            <IconCheck size={16} />
            <span>
              {allChecked
                ? 'Valider le réajustement ✓'
                : `Valider (${checkedIndices.size}/${changes.length}) ✓`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
