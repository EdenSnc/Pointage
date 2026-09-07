// ============================================================
// POINTAGE — Cross-Bill Stock Reallocation Modal
// Enables fast, safe borrowing of prepared stock from another customer
// with container warnings, atomic inventory transfer, and audit trail.
// ============================================================

import { useState, useEffect } from 'react';
import {
  IconArrowLeftRight,
  IconAlertTriangle,
  IconCheck,
  IconX,
  IconUser,
} from './icons';
import type { Bill, OrderLine, Stage } from './types';
import {
  executeCrossBillReallocation,
  type CrossBillPreparedStockOption,
} from './crossBillReallocation';

interface CrossBillReallocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceOption: CrossBillPreparedStockOption | null;
  currentBill: Bill;
  currentLine: OrderLine;
  currentCount: number;
  stage: Stage;
  activeOperator: string;
  onSuccess: (quantity: number) => void;
}

export function CrossBillReallocationModal({
  isOpen,
  onClose,
  sourceOption,
  currentBill,
  currentLine,
  currentCount,
  stage,
  activeOperator,
  onSuccess,
}: CrossBillReallocationModalProps) {
  if (!isOpen || !sourceOption) return null;

  const maxAvailable = sourceOption.preparedQty;
  const missingQty = Math.max(0, currentLine.orderedQty - currentCount);
  const defaultInitial = Math.min(Math.max(1, missingQty), maxAvailable);

  const [quantity, setQuantity] = useState<number>(defaultInitial);
  const [reason, setReason] = useState<string>('Camion au quai / Urgent');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setQuantity(Math.min(Math.max(1, missingQty), maxAvailable));
    setErrorMsg(null);
  }, [sourceOption, missingQty, maxAvailable]);

  const handleConfirm = async () => {
    if (quantity <= 0) {
      setErrorMsg('Veuillez sélectionner une quantité supérieure à 0.');
      return;
    }
    if (quantity > maxAvailable) {
      setErrorMsg(`Quantité maximale disponible : ${maxAvailable} pcs.`);
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await executeCrossBillReallocation({
        fromBill: sourceOption.bill,
        fromLine: sourceOption.line,
        toBill: currentBill,
        toLine: currentLine,
        quantity,
        stage,
        reason,
        operatorName: activeOperator,
      });

      if (res.success) {
        onSuccess(quantity);
        onClose();
      } else {
        setErrorMsg('Erreur lors du transfert de stock.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erreur inattendue.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasContainers = sourceOption.allocatedContainers && sourceOption.allocatedContainers.length > 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 440, width: '94%', maxHeight: '90vh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2 font-bold text-base" style={{ color: 'var(--accent-light)' }}>
            <IconArrowLeftRight size={20} />
            <span>Prélèvement Dépannage Inter-Bons</span>
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
          Transférer du stock déjà préparé depuis un autre bon pour compléter ce chargement urgent.
        </p>

        {/* Source & Target Cards */}
        <div
          className="p-3 rounded-lg mb-3 flex flex-col gap-2"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--glass-border-subtle)' }}
        >
          {/* Source bill */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted font-medium">Source (Prélevé sur) :</span>
            <span className="font-bold text-danger">
              {sourceOption.bill.client} ({sourceOption.bill.billNumber})
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">Stock préparé disponible :</span>
            <span className="badge badge-exact font-bold">
              {sourceOption.preparedQty} pièces
            </span>
          </div>

          <div style={{ height: 1, background: 'var(--glass-border-subtle)', margin: '4px 0' }} />

          {/* Destination bill */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted font-medium">Destination (Bénéficiaire) :</span>
            <span className="font-bold" style={{ color: 'var(--accent-light)' }}>
              {currentBill.client} ({currentBill.billNumber})
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">Manque sur ce bon :</span>
            <span className="font-bold text-warning">
              {missingQty} pièces
            </span>
          </div>
        </div>

        {/* Container Warning Alert */}
        {hasContainers && (
          <div
            className="p-3 rounded-lg mb-3 flex items-start gap-2 text-xs"
            style={{
              background: 'rgba(234, 179, 8, 0.12)',
              border: '1px solid rgba(234, 179, 8, 0.35)',
              color: 'var(--warning-light, #fde047)',
            }}
          >
            <IconAlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1, color: '#eab308' }} />
            <div>
              <div className="font-bold mb-0.5" style={{ color: '#fef08a' }}>
                Colis déjà scellé / conditionné
              </div>
              <div style={{ color: 'var(--text-secondary)' }}>
                Les articles de {sourceOption.bill.client} se trouvent dans :{' '}
                <strong className="text-warning">{sourceOption.allocatedContainers.join(', ')}</strong>.
                Rouvrez le colis pour extraire la marchandise.
              </div>
            </div>
          </div>
        )}

        {/* Quantity Selection */}
        <div className="mb-3">
          <label className="text-xs font-bold block mb-1">
            Quantité à prélever (Max dispo : {maxAvailable}) :
          </label>

          {/* Quick preset buttons */}
          <div className="flex gap-2 mb-2">
            {missingQty > 0 && missingQty <= maxAvailable && (
              <button
                type="button"
                className="btn btn-secondary btn-xs flex-1"
                onClick={() => setQuantity(missingQty)}
              >
                Combler le manque ({missingQty})
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary btn-xs flex-1"
              onClick={() => setQuantity(maxAvailable)}
            >
              Tout prélever ({maxAvailable})
            </button>
          </div>

          {/* Large tactile stepper */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: 44, height: 44, fontSize: '1.2rem', fontWeight: 800 }}
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              disabled={quantity <= 1}
            >
              -
            </button>
            <input
              type="number"
              className="input text-center font-bold"
              style={{ fontSize: '1.2rem', height: 44 }}
              min={1}
              max={maxAvailable}
              value={quantity}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val)) setQuantity(Math.min(Math.max(1, val), maxAvailable));
              }}
            />
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: 44, height: 44, fontSize: '1.2rem', fontWeight: 800 }}
              onClick={() => setQuantity(Math.min(maxAvailable, quantity + 1))}
              disabled={quantity >= maxAvailable}
            >
              +
            </button>
          </div>
        </div>

        {/* Reason / Quick chips */}
        <div className="mb-4">
          <label className="text-xs text-muted block mb-1">Motif du prélèvement :</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {['Camion au quai / Urgent', 'Client présent comptoir', 'Accord responsable'].map((chip) => (
              <button
                key={chip}
                type="button"
                className="btn btn-xs"
                style={{
                  background: reason === chip ? 'var(--accent-glow)' : 'var(--bg-surface)',
                  border: reason === chip ? '1px solid var(--accent)' : '1px solid var(--glass-border-subtle)',
                  color: reason === chip ? 'var(--accent-light)' : 'var(--text-secondary)',
                  fontSize: '0.72rem',
                }}
                onClick={() => setReason(chip)}
              >
                {chip}
              </button>
            ))}
          </div>
          <input
            type="text"
            className="input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={{ fontSize: '0.82rem' }}
          />
        </div>

        {/* Operator attribution info */}
        <div className="flex items-center gap-1.5 text-xs text-muted mb-3">
          <IconUser size={14} />
          <span>Opérateur enregistré : <strong>{activeOperator || 'Non spécifié'}</strong></span>
        </div>

        {errorMsg && (
          <div className="text-xs text-danger mb-3 font-medium">
            {errorMsg}
          </div>
        )}

        {/* Action buttons */}
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
            disabled={isSubmitting || quantity <= 0}
          >
            <IconCheck size={16} />
            {isSubmitting ? 'Transfert en cours...' : `Confirmer (+${quantity})`}
          </button>
        </div>
      </div>
    </div>
  );
}
