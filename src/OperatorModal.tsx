// ============================================================
// POINTAGE — Operator Selection & Management Modal
// 100% Offline, Large tactile touch targets for warehouse floor
// ============================================================

import React, { useState } from 'react';
import { IconUser, IconCheck, IconPlus, IconX, IconTrash } from './icons';

interface OperatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeOperator: string;
  onSelectOperator: (name: string) => void;
  operators: string[];
  onAddOperator: (name: string) => void;
  onRemoveOperator?: (name: string) => void;
}

export function OperatorModal({
  isOpen,
  onClose,
  activeOperator,
  onSelectOperator,
  operators,
  onAddOperator,
  onRemoveOperator,
}: OperatorModalProps) {
  const [newOpName, setNewOpName] = useState('');
  const [isEditingList, setIsEditingList] = useState(false);

  if (!isOpen) return null;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newOpName.trim();
    if (clean) {
      onAddOperator(clean);
      onSelectOperator(clean);
      setNewOpName('');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 360, width: '92%' }}
      >
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2 font-bold text-base" style={{ color: 'var(--accent-light)' }}>
            <IconUser size={20} /> Opérateur du Terminal
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

        <p className="text-xs text-muted mb-4" style={{ lineHeight: 1.4 }}>
          Sélectionnez qui tient le terminal. Toutes les préparations, chargements et pointages lui seront attribués.
        </p>

        {/* Quick touch operator chips */}
        <div className="flex flex-col gap-2 mb-4">
          {operators.map((op) => {
            const isActive = op.toLowerCase() === activeOperator.toLowerCase();
            return (
              <div
                key={op}
                className="flex items-center justify-between p-2.5 rounded-lg cursor-pointer"
                style={{
                  background: isActive ? 'var(--accent-glow)' : 'var(--bg-surface)',
                  border: isActive ? '1.5px solid var(--accent)' : '1px solid var(--glass-border-subtle)',
                  transition: 'all 0.15s ease',
                }}
                onClick={() => {
                  if (!isEditingList) {
                    onSelectOperator(op);
                    onClose();
                  }
                }}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: isActive ? 'var(--accent)' : 'var(--bg-card-active)',
                      color: isActive ? '#fff' : 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.78rem',
                      fontWeight: 800,
                    }}
                  >
                    {op.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-bold text-sm" style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    {op}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {isActive && !isEditingList && (
                    <span className="badge badge-exact flex items-center gap-1">
                      <IconCheck size={12} /> Actif
                    </span>
                  )}
                  {isEditingList && onRemoveOperator && operators.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon btn-xs text-danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveOperator(op);
                      }}
                      title={`Supprimer ${op}`}
                    >
                      <IconTrash size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Add new operator form */}
        <form onSubmit={handleAdd} className="flex gap-2 mb-3">
          <input
            type="text"
            className="input"
            placeholder="Nouveau prénom (ex: Youssef)..."
            value={newOpName}
            onChange={(e) => setNewOpName(e.target.value)}
            style={{ fontSize: '0.84rem' }}
          />
          <button
            type="submit"
            className="btn btn-secondary btn-sm flex items-center gap-1"
            disabled={!newOpName.trim()}
          >
            <IconPlus size={14} /> Ajouter
          </button>
        </form>

        <div className="flex justify-between items-center text-xs text-muted pt-2 border-t border-glass">
          <button
            type="button"
            className="text-xs text-accent underline cursor-pointer"
            onClick={() => setIsEditingList(!isEditingList)}
          >
            {isEditingList ? 'Terminer modification' : 'Gérer la liste'}
          </button>
          <span>100% hors-ligne</span>
        </div>
      </div>
    </div>
  );
}
