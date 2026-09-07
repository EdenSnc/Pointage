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
    setEditingOp(null);
    setDeletingOp(op);
    setErrorMsg(null);
  };

  const handleConfirmDelete = (op: string) => {
    if (localOperators.length <= 1) {
      setErrorMsg('Au moins un opérateur doit rester dans la liste.');
      return;
    }

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
          maxWidth: 400,
          width: '92%',
          padding: '24px',
          borderRadius: 'var(--radius-card)',
          boxShadow: 'var(--glass-shadow-lg)',
        }}
      >
        {/* Header with Title and Close Button */}
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2.5 font-bold text-base" style={{ color: 'var(--text-primary)' }}>
            <div
              style={{
                width: 34,
                height: 34,
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
              <IconUser size={18} />
            </div>
            <div>
              <div style={{ lineHeight: 1.1, fontSize: '1rem', fontWeight: 800 }}>Équipe & Opérateur</div>
              <div className="text-xs text-muted" style={{ fontWeight: 500, marginTop: 2 }}>
                Qui tient ce terminal actuellement ?
              </div>
            </div>
          </div>
          <button
            type="button"
            className="header-icon-btn"
            style={{ width: 34, height: 34 }}
            onClick={onClose}
            aria-label="Fermer"
          >
            <IconX size={16} />
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

        {/* Operator Cards List */}
        <div
          className="flex flex-col gap-2.5 mb-4"
          style={{ maxHeight: '320px', overflowY: 'auto', paddingRight: 2 }}
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
                  className="flex items-center justify-between p-3 rounded-xl"
                  style={{
                    background: 'var(--danger-bg)',
                    border: '1px solid var(--danger-border)',
                  }}
                >
                  <div className="text-xs font-bold" style={{ color: 'var(--danger)' }}>
                    Supprimer « {op} » ?
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-danger btn-xs"
                      style={{ padding: '6px 12px', fontWeight: 700 }}
                      onClick={() => handleConfirmDelete(op)}
                    >
                      Oui, supprimer
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs"
                      style={{ padding: '6px 10px' }}
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
                  className="flex items-center gap-2 p-2 rounded-xl"
                  style={{
                    background: 'var(--bg-surface-elevated)',
                    border: '1.5px solid var(--accent)',
                  }}
                >
                  <input
                    type="text"
                    className="input flex-1"
                    style={{
                      height: 38,
                      fontSize: '0.9rem',
                      fontWeight: 700,
                      padding: '0 12px',
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
                    style={{ width: 38, height: 38, padding: 0 }}
                    onClick={() => handleSaveEdit(op)}
                    title="Enregistrer"
                  >
                    <IconCheck size={18} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm flex items-center justify-center"
                    style={{ width: 38, height: 38, padding: 0 }}
                    onClick={() => setEditingOp(null)}
                    title="Annuler"
                  >
                    <IconX size={18} />
                  </button>
                </div>
              );
            }

            // Standard Operator Row
            return (
              <div
                key={op}
                className="flex items-center justify-between p-2.5 rounded-xl cursor-pointer"
                style={{
                  background: isActive ? 'var(--accent-glow)' : 'var(--bg-surface)',
                  border: isActive ? '1.5px solid var(--accent)' : '1px solid var(--glass-border-subtle)',
                  transition: 'all 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
                  minHeight: 48,
                }}
                onClick={() => {
                  onSelectOperator(op);
                  persistActiveOperator(op);
                  onClose();
                }}
              >
                {/* Avatar + Name */}
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: isActive ? 'var(--accent)' : 'rgba(255, 255, 255, 0.08)',
                      color: isActive ? '#ffffff' : 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.85rem',
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
                      style={{ padding: '2px 8px', fontSize: '0.72rem', fontWeight: 800 }}
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

        {/* Add New Operator Form */}
        <form onSubmit={handleAdd} className="flex gap-2 mb-4">
          <input
            type="text"
            className="input"
            placeholder="Nouveau prénom (ex: Yacine)..."
            value={newOpName}
            onChange={(e) => setNewOpName(e.target.value)}
            style={{ fontSize: '0.86rem', height: 42 }}
          />
          <button
            type="submit"
            className="btn btn-secondary flex items-center justify-center gap-1"
            style={{ height: 42, padding: '0 16px', fontWeight: 700, flexShrink: 0 }}
            disabled={!newOpName.trim()}
          >
            <IconPlus size={16} /> Ajouter
          </button>
        </form>

        {/* Footer */}
        <div className="flex justify-between items-center text-xs text-muted pt-3 border-t border-glass">
          <span className="flex items-center gap-1 font-medium">
            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
            100% Hors-Ligne
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-xs text-secondary font-semibold"
            onClick={onClose}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
