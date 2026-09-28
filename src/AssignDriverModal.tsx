// ============================================================
// POINTAGE — Assigned Driver Modal (Chauffeur Livreur)
// 1-Tap Quick Assign for Yassine, Djaber, and Custom Drivers
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import { loadDriverRoster, assignDriverToBill, saveDriverToRoster } from './driverLogistics';
import { IconTruck, IconCheck, IconX, IconPlus, IconTrash } from './icons';
import { playSuccessChime, hapticTap } from './audio';

interface AssignDriverModalProps {
  isOpen: boolean;
  onClose: () => void;
  billId: number;
  billNumber: string;
  client: string;
  currentDriver?: string | null;
  onAssigned?: (driverName: string | null) => void;
}

export const AssignDriverModal: React.FC<AssignDriverModalProps> = ({
  isOpen,
  onClose,
  billId,
  billNumber,
  client,
  currentDriver,
  onAssigned,
}) => {
  const [drivers, setDrivers] = useState<string[]>(() => loadDriverRoster());
  const [selectedDriver, setSelectedDriver] = useState<string | null>(currentDriver || null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newDriverName, setNewDriverName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setDrivers(loadDriverRoster());
      setSelectedDriver(currentDriver || null);
      setIsAddingNew(false);
      setNewDriverName('');
    }
  }, [isOpen, currentDriver]);

  useEffect(() => {
    if (isAddingNew) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [isAddingNew]);

  if (!isOpen) return null;

  const handleSelectDriver = async (name: string | null) => {
    hapticTap('medium');
    playSuccessChime();
    setSelectedDriver(name);
    await assignDriverToBill(billId, name);
    if (onAssigned) onAssigned(name);
    onClose();
  };

  const handleAddNewDriver = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = newDriverName.trim();
    if (!clean) return;
    const formatted = clean.charAt(0).toUpperCase() + clean.slice(1);
    const updated = saveDriverToRoster(formatted);
    setDrivers(updated);
    await handleSelectDriver(formatted);
  };

  return (
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(8px)',
        zIndex: 980,
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
          maxWidth: 420,
          borderRadius: 24,
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-xl)',
          padding: 20,
        }}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-2.5">
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 14,
                background: 'rgba(59, 130, 246, 0.16)',
                border: '1px solid rgba(59, 130, 246, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#60a5fa',
                flexShrink: 0,
              }}
            >
              <IconTruck size={20} />
            </div>
            <div>
              <div className="font-bold text-xs uppercase tracking-wider text-blue-400">
                Logistique Livraison
              </div>
              <div className="font-extrabold text-sm" style={{ color: 'var(--text-primary)' }}>
                Chauffeur Assigné
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

        {/* Bill Context */}
        <div
          className="p-3 mb-3.5"
          style={{
            borderRadius: 16,
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid var(--border)',
          }}
        >
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold font-mono text-accent">{billNumber}</span>
            <span className="text-muted truncate max-w-[200px]">{client}</span>
          </div>
          {currentDriver && (
            <div className="mt-1.5 text-[11px] text-muted flex items-center gap-1.5">
              <span>Chauffeur actuel :</span>
              <span className="font-bold text-blue-400">{currentDriver}</span>
            </div>
          )}
        </div>

        {/* Quick Driver Roster (Fitts's Law 1-Tap Buttons) */}
        <div className="text-xs font-bold text-muted uppercase tracking-wider mb-2">
          Sélectionner le chauffeur :
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {drivers.map((drv) => {
            const isSelected = selectedDriver?.toLowerCase() === drv.toLowerCase();
            return (
              <button
                key={drv}
                type="button"
                className="btn flex items-center justify-between px-3.5"
                style={{
                  minHeight: 48,
                  borderRadius: 14,
                  background: isSelected ? 'rgba(59, 130, 246, 0.22)' : 'var(--bg-card)',
                  border: isSelected ? '2px solid #3b82f6' : '1px solid var(--border)',
                  color: isSelected ? '#93c5fd' : 'var(--text-primary)',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onClick={() => handleSelectDriver(drv)}
              >
                <div className="flex items-center gap-2">
                  <IconTruck size={15} style={{ opacity: isSelected ? 1 : 0.6 }} />
                  <span>{drv}</span>
                </div>
                {isSelected && <IconCheck size={16} className="text-blue-400" />}
              </button>
            );
          })}
        </div>

        {/* Add Custom Driver Inline Form */}
        {isAddingNew ? (
          <form onSubmit={handleAddNewDriver} className="flex gap-2 mb-3">
            <input
              ref={inputRef}
              type="text"
              className="input flex-1"
              placeholder="Nom du nouveau chauffeur..."
              value={newDriverName}
              onChange={(e) => setNewDriverName(e.target.value)}
              style={{
                height: 44,
                borderRadius: 12,
                fontSize: '0.85rem',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border)',
              }}
            />
            <button
              type="submit"
              className="btn btn-primary"
              style={{ minHeight: 44, padding: '0 16px', borderRadius: 12, fontWeight: 700 }}
              disabled={!newDriverName.trim()}
            >
              Ajouter
            </button>
          </form>
        ) : (
          <button
            type="button"
            className="btn btn-ghost w-full flex items-center justify-center gap-1.5 mb-3"
            style={{
              minHeight: 42,
              borderRadius: 12,
              border: '1px dashed var(--border)',
              fontSize: '0.78rem',
              color: 'var(--text-muted)',
            }}
            onClick={() => setIsAddingNew(true)}
          >
            <IconPlus size={14} />
            <span>Nouveau chauffeur</span>
          </button>
        )}

        {/* Unassign / Clear Option */}
        {currentDriver && (
          <button
            type="button"
            className="btn btn-ghost w-full flex items-center justify-center gap-1.5 text-danger"
            style={{
              minHeight: 42,
              borderRadius: 12,
              fontSize: '0.78rem',
              opacity: 0.85,
            }}
            onClick={() => handleSelectDriver(null)}
          >
            <IconTrash size={14} />
            <span>Retirer le chauffeur assigné</span>
          </button>
        )}
      </div>
    </div>
  );
};
