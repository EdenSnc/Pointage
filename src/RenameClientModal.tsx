import React, { useState, useEffect, useRef } from 'react';
import { db, saveClientAlias, getClientAlias } from './db';
import { isSameClientEntity } from './logic';
import { IconPencil, IconCheck, IconX, IconBuilding, IconInfo } from './icons';
import { playSuccessChime, hapticTap } from './audio';

interface RenameClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  legalName: string;
  currentOperationalName?: string | null;
  onRenamed?: (newOperationalName: string) => void;
  setToast?: (m: string) => void;
}

export const RenameClientModal: React.FC<RenameClientModalProps> = ({
  isOpen,
  onClose,
  legalName,
  currentOperationalName,
  onRenamed,
  setToast,
}) => {
  const [operationalName, setOperationalName] = useState('');
  const [rememberAlias, setRememberAlias] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setOperationalName(currentOperationalName || '');
      setRememberAlias(true);
      if (!currentOperationalName && legalName) {
        getClientAlias(legalName).then((alias) => {
          if (alias) setOperationalName(alias);
        }).catch(() => {});
      }
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 100);
    }
  }, [isOpen, legalName, currentOperationalName]);

  if (!isOpen) return null;

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSubmitting) return;

    const cleanOp = operationalName.trim();
    setIsSubmitting(true);

    try {
      playSuccessChime();
      hapticTap('medium');

      // 1. Update all bills for this client entity in Dexie
      const allBills = await db.bills.toArray();
      const matchingBills = allBills.filter(
        (b) => isSameClientEntity(b.client, legalName) || (b.operationalClient && isSameClientEntity(b.operationalClient, legalName))
      );

      for (const b of matchingBills) {
        if (b.id) {
          await db.bills.update(b.id, {
            operationalClient: cleanOp || null,
            updatedAt: new Date().toISOString(),
          });
        }
      }

      // 2. Persist to automatic clientAliases table if requested
      if (rememberAlias && cleanOp) {
        await saveClientAlias(legalName, cleanOp);
      } else if (!cleanOp) {
        // If erased, remove from aliases table
        const existing = await db.clientAliases
          .filter((a) => a.legalName.toUpperCase() === legalName.trim().toUpperCase())
          .first();
        if (existing?.id) {
          await db.clientAliases.delete(existing.id);
        }
      }

      if (onRenamed) {
        onRenamed(cleanOp);
      }

      if (setToast) {
        setToast(cleanOp ? `Nom usuel enregistré : ${cleanOp}` : 'Nom usuel réinitialisé');
      }

      onClose();
    } catch (err) {
      console.error('Failed to update operational client name:', err);
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
        backgroundColor: 'rgba(0, 0, 0, 0.76)',
        backdropFilter: 'blur(8px)',
        zIndex: 970,
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
          maxWidth: 440,
          borderRadius: 24,
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-xl)',
          padding: 20,
        }}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-3.5">
          <div className="flex items-center gap-2.5">
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 14,
                background: 'rgba(59, 130, 246, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#60a5fa',
                flexShrink: 0,
              }}
            >
              <IconPencil size={20} />
            </div>
            <div>
              <div className="font-bold text-xs uppercase tracking-wider text-blue-400">
                Alias Opérationnel d'Entrepôt
              </div>
              <div className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                Renommer pour l'Équipe
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-icon"
            style={{ borderRadius: 9999 }}
            onClick={onClose}
            aria-label="Fermer"
          >
            <IconX size={18} />
          </button>
        </div>

        {/* Legal Fiscal Notice (Immutability guarantee) */}
        <div
          className="p-3 mb-3.5"
          style={{
            borderRadius: 16,
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid var(--border)',
          }}
        >
          <div className="text-[11px] text-muted uppercase font-bold tracking-wider mb-1 flex items-center gap-1">
            <IconBuilding size={12} />
            <span>Raison Sociale Officielle (Intouchable) :</span>
          </div>
          <div
            className="font-mono text-xs font-bold truncate"
            style={{ color: 'var(--text-primary)' }}
            title={legalName}
          >
            {legalName}
          </div>
          <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
            <IconInfo size={11} style={{ flexShrink: 0 }} />
            <span>Conservée intacte pour la validité du transport et contrôles routiers.</span>
          </div>
        </div>

        <form onSubmit={handleSave}>
          <div className="mb-3.5">
            <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--text-primary)' }}>
              Nom usuel de livraison (Quai & Préparateurs) :
            </label>
            <input
              ref={inputRef}
              type="text"
              className="input w-full"
              style={{
                borderRadius: 14,
                fontSize: '0.9rem',
                padding: '10px 14px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
              placeholder="Ex: Kral Markt Béchar, Magasin Arthur..."
              value={operationalName}
              onChange={(e) => setOperationalName(e.target.value)}
            />
          </div>

          {/* Auto-remember checkbox */}
          <label
            className="flex items-center gap-2 mb-4 p-2.5 cursor-pointer select-none"
            style={{
              borderRadius: 14,
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.2)',
            }}
          >
            <input
              type="checkbox"
              checked={rememberAlias}
              onChange={(e) => setRememberAlias(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
            />
            <span className="text-xs" style={{ color: 'var(--text-primary)' }}>
              Mémoriser cet alias pour les <strong>futurs imports Excel</strong>
            </span>
          </label>

          {/* Buttons */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border)]">
            <button
              type="button"
              className="btn btn-ghost btn-sm text-muted"
              style={{ borderRadius: 9999 }}
              onClick={onClose}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="btn btn-sm btn-primary flex items-center gap-1.5 font-bold"
              style={{ borderRadius: 9999, padding: '8px 20px' }}
              disabled={isSubmitting}
            >
              <IconCheck size={16} />
              <span>Enregistrer</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
