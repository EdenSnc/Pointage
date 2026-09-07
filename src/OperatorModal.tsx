// ============================================================
// POINTAGE — Operator Selection & Management Modal
// 100% Offline, Large tactile touch targets for warehouse floor
// ============================================================

import React, { useState, useEffect } from 'react';
import {
  IconUser,
  IconCheck,
  IconPlus,
  IconX,
  IconTrash,
  IconPencil,
  IconAlertTriangle,
} from './icons';
import {
  getOperators,
  addOperator,
  removeOperator,
  renameOperator,
  setActiveOperator as persistActiveOperator,
} from './operators';
import { hapticTap, playSuccessChime } from './audio';

interface OperatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeOperator: string;
  onSelectOperator: (name: string) => void;
  operators?: string[];
  onAddOperator?: (name: string) => void;
  onRemoveOperator?: (name: string) => void;
  onModifyOperator?: (oldName: string, newName: string) => void;
  onRosterChange?: (operators: string[], newActive: string) => void;
}

export function OperatorModal({
  isOpen,
  onClose,
  activeOperator,
  onSelectOperator,
  operators: propOperators,
  onAddOperator,
  onRemoveOperator,
  onModifyOperator,
  onRosterChange,
}: OperatorModalProps) {
  const [localOperators, setLocalOperators] = useState<string[]>(() =>
    propOperators && propOperators.length > 0 ? propOperators : getOperators()
  );
  const [newOpName, setNewOpName] = useState('');
  const [editingOp, setEditingOp] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [deletingOp, setDeletingOp] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (propOperators && propOperators.length > 0) {
      setLocalOperators(propOperators);
    } else {
      setLocalOperators(getOperators());
    }
  }, [propOperators, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setEditingOp(null);
      setDeletingOp(null);
      setErrorMsg(null);
      setNewOpName('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const notifyChange = (updatedList: string[], currentActive: string) => {
    setLocalOperators(updatedList);
    if (onRosterChange) {
      onRosterChange(updatedList, currentActive);
    }
  };

  // --- Add Operator ---
  const handleAdd = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = newOpName.trim();
    if (!clean) return;

    const exists = localOperators.some((o) => o.toLowerCase() === clean.toLowerCase());
    if (exists) {
      setErrorMsg(`Le prénom "${clean}" existe déjà.`);
      return;
    }

    hapticTap('medium');
    playSuccessChime();

    const updated = addOperator(clean);
    persistActiveOperator(clean);
    onSelectOperator(clean);
    if (onAddOperator) onAddOperator(clean);
    notifyChange(updated, clean);
    setNewOpName('');
    setErrorMsg(null);
  };

  // --- Rename Operator ---
  const handleStartEdit = (op: string) => {
    hapticTap('light');
    setDeletingOp(null);
    setEditingOp(op);
    setEditingValue(op);
    setErrorMsg(null);
  };

  const handleSaveEdit = (oldName: string) => {
    const clean = editingValue.trim();
    if (!clean) {
      setErrorMsg('Le prénom ne peut pas être vide.');
      return;
    }

    const res = renameOperator(oldName, clean);
    if (!res.success) {
      setErrorMsg(res.error || 'Erreur lors du renommage.');
      return;
    }

    hapticTap('medium');
    playSuccessChime();

    const wasActive = activeOperator.toLowerCase() === oldName.toLowerCase();
    const newActive = wasActive ? clean : activeOperator;

    if (wasActive) {
      onSelectOperator(clean);
    }
    if (onModifyOperator) {
      onModifyOperator(oldName, clean);
    }
    notifyChange(res.list, newActive);
    setEditingOp(null);
    setEditingValue('');
    setErrorMsg(null);
  };

  // --- Delete Operator ---
  const handleStartDelete = (op: string) => {
    hapticTap('light');
    setEditingOp(null);
    setDeletingOp(op);
    setErrorMsg(null);
  };

  const handleConfirmDelete = (op: string) => {
    if (localOperators.length <= 1) {
      setErrorMsg('Au moins un opérateur doit rester dans la liste.');
      return;
    }

    hapticTap('medium');

    const updated = removeOperator(op);
    const wasActive = activeOperator.toLowerCase() === op.toLowerCase();
    const newActive = wasActive ? updated[0] : activeOperator;

    if (wasActive) {
      onSelectOperator(newActive);
    }
    if (onRemoveOperator) {
      onRemoveOperator(op);
    }
    notifyChange(updated, newActive);
    setDeletingOp(null);
    setErrorMsg(null);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 410,
          width: '92%',
          padding: '26px 22px 20px',
          borderRadius: '28px',
          boxShadow: 'var(--glass-shadow-lg)',
        }}
      >
        {/* Header with Title and Close Button */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3 font-bold text-base" style={{ color: 'var(--text-primary)' }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                background: 'var(--accent-glow)',
                border: '1.5px solid var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent)',
                flexShrink: 0,
              }}
            >
              <IconUser size={20} />
            </div>
            <div>
              <div style={{ lineHeight: 1.1, fontSize: '1.05rem', fontWeight: 800 }}>Équipe & Opérateur</div>
              <div className="text-xs text-muted" style={{ fontWeight: 500, marginTop: 2 }}>
                Qui tient ce terminal actuellement ?
              </div>
            </div>
          </div>
          <button
            type="button"
            className="header-icon-btn"
            style={{ width: 36, height: 36 }}
            onClick={onClose}
            aria-label="Fermer"
          >
            <IconX size={17} />
          </button>
        </div>

        {/* Error Alert Banner */}
        {errorMsg && (
          <div
            className="flex items-center gap-2 p-2.5 mb-3 rounded-lg text-xs"
            style={{
              background: 'var(--danger-bg)',
              border: '1px solid var(--danger-border)',
              color: 'var(--danger)',
              borderRadius: '16px',
            }}
          >
            <IconAlertTriangle size={15} style={{ flexShrink: 0 }} />
            <span className="flex-1 font-semibold">{errorMsg}</span>
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-xs"
              onClick={() => setErrorMsg(null)}
            >
              <IconX size={13} />
            </button>
          </div>
        )}

        {/* Operator Cards List — Distinct Floating Islands with 12px gap and 24px bottom space */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            marginBottom: 24,
            maxHeight: 330,
            overflowY: 'auto',
            padding: '2px 4px 6px',
          }}
        >
          {localOperators.map((op) => {
            const isActive = op.toLowerCase() === activeOperator.toLowerCase();
            const isEditing = editingOp === op;
            const isDeleting = deletingOp === op;

            // In-line Delete Confirmation State
            if (isDeleting) {
              return (
                <div
                  key={op}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: '20px',
                    background: 'var(--danger-bg)',
                    border: '1px solid var(--danger-border)',
                    minHeight: 52,
                  }}
                >
                  <div className="text-xs font-bold" style={{ color: 'var(--danger)' }}>
                    Supprimer « {op} » ?
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-danger btn-xs"
                      style={{ padding: '6px 12px', fontWeight: 700, borderRadius: '12px' }}
                      onClick={() => handleConfirmDelete(op)}
                    >
                      Oui, supprimer
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs"
                      style={{ padding: '6px 10px', borderRadius: '12px' }}
                      onClick={() => setDeletingOp(null)}
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              );
            }

            // In-line Edit / Rename State
            if (isEditing) {
              return (
                <div
                  key={op}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 10px',
                    borderRadius: '20px',
                    background: 'var(--bg-surface-elevated)',
                    border: '1.5px solid var(--accent)',
                    minHeight: 52,
                  }}
                >
                  <input
                    type="text"
                    className="input flex-1"
                    style={{
                      height: 40,
                      fontSize: '0.92rem',
                      fontWeight: 700,
                      padding: '0 12px',
                      borderRadius: '14px',
                    }}
                    value={editingValue}
                    autoFocus
                    onChange={(e) => setEditingValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveEdit(op);
                      if (e.key === 'Escape') setEditingOp(null);
                    }}
                    placeholder="Prénom..."
                  />
                  <button
                    type="button"
                    className="btn btn-primary btn-sm flex items-center justify-center"
                    style={{ width: 40, height: 40, padding: 0, borderRadius: '14px' }}
                    onClick={() => handleSaveEdit(op)}
                    title="Enregistrer"
                  >
                    <IconCheck size={18} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm flex items-center justify-center"
                    style={{ width: 40, height: 40, padding: 0, borderRadius: '14px' }}
                    onClick={() => setEditingOp(null)}
                    title="Annuler"
                  >
                    <IconX size={18} />
                  </button>
                </div>
              );
            }

            // Standard Operator Row (Rounded Card with Soft Shadow)
            return (
              <div
                key={op}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  borderRadius: '20px',
                  background: isActive ? 'var(--accent-glow)' : 'var(--bg-surface)',
                  border: isActive ? '1.5px solid var(--accent)' : '1px solid var(--glass-border-subtle)',
                  transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                  minHeight: 52,
                  boxShadow: isActive ? '0 4px 14px -2px rgba(16, 185, 129, 0.25)' : '0 2px 6px rgba(0, 0, 0, 0.03)',
                  cursor: 'pointer',
                }}
                onClick={() => {
                  hapticTap('medium');
                  playSuccessChime();
                  onSelectOperator(op);
                  persistActiveOperator(op);
                  onClose();
                }}
              >
                {/* Avatar + Name */}
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: isActive ? 'var(--accent)' : 'rgba(255, 255, 255, 0.1)',
                      color: isActive ? '#ffffff' : 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.9rem',
                      fontWeight: 800,
                      flexShrink: 0,
                    }}
                  >
                    {op.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <span
                      className="font-bold text-sm truncate block"
                      style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                    >
                      {op}
                    </span>
                  </div>
                </div>

                {/* Right Action Icons: Active Badge + Rename + Delete */}
                <div
                  className="flex items-center gap-1.5 flex-shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  {isActive && (
                    <span
                      className="badge badge-exact flex items-center gap-1 mr-1"
                      style={{ padding: '3px 9px', fontSize: '0.72rem', fontWeight: 800, borderRadius: '9999px' }}
                    >
                      <IconCheck size={11} /> Actif
                    </span>
                  )}

                  {/* Rename / Modify Button */}
                  <button
                    type="button"
                    className="header-icon-btn"
                    style={{ width: 34, height: 34 }}
                    onClick={() => handleStartEdit(op)}
                    title={`Modifier / Renommer ${op}`}
                    aria-label={`Modifier ${op}`}
                  >
                    <IconPencil size={15} />
                  </button>

                  {/* Delete Button */}
                  {localOperators.length > 1 && (
                    <button
                      type="button"
                      className="header-icon-btn"
                      style={{ width: 34, height: 34, color: 'var(--danger)' }}
                      onClick={() => handleStartDelete(op)}
                      title={`Supprimer ${op}`}
                      aria-label={`Supprimer ${op}`}
                    >
                      <IconTrash size={15} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Add New Operator Form — Separated by generous whitespace */}
        <form
          onSubmit={handleAdd}
          style={{
            display: 'flex',
            gap: 10,
            marginBottom: 22,
          }}
        >
          <input
            type="text"
            className="input"
            placeholder="Nouveau prénom (ex: Yacine)..."
            value={newOpName}
            onChange={(e) => setNewOpName(e.target.value)}
            style={{
              fontSize: '0.88rem',
              height: 46,
              borderRadius: '18px',
              padding: '0 16px',
              flex: 1,
            }}
          />
          <button
            type="submit"
            className="btn btn-secondary"
            style={{
              height: 46,
              padding: '0 18px',
              fontWeight: 700,
              borderRadius: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              flexShrink: 0,
            }}
            disabled={!newOpName.trim()}
          >
            <IconPlus size={16} /> Ajouter
          </button>
        </form>

        {/* Footer */}
        <div className="flex justify-between items-center text-xs text-muted pt-3 border-t border-glass">
          <span className="flex items-center gap-1.5 font-medium">
            <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)' }} />
            100% Hors-Ligne
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-xs text-secondary font-semibold"
            style={{ borderRadius: '12px', padding: '6px 12px' }}
            onClick={onClose}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
