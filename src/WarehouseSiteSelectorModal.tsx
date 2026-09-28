import React, { useState, useEffect } from 'react';
import type { WarehouseSite } from './types';
import { DEFAULT_WAREHOUSE_SITES } from './warehouseZones';
import { IconBuilding, IconCheck, IconPlus, IconX, IconMapPin } from './icons';
import { playSuccessChime, hapticTap } from './audio';

interface WarehouseSiteSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeSite: string;
  onSelectSite: (siteId: string) => void;
}

const STORAGE_KEY_CUSTOM_SITES = 'pointage_custom_sites';

export function getCustomWarehouseSites(): WarehouseSite[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_SITES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCustomWarehouseSite(site: WarehouseSite): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const current = getCustomWarehouseSites();
    const updated = [...current.filter((s) => s.id !== site.id), site];
    localStorage.setItem(STORAGE_KEY_CUSTOM_SITES, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to save custom site:', err);
  }
}

export const WarehouseSiteSelectorModal: React.FC<WarehouseSiteSelectorModalProps> = ({
  isOpen,
  onClose,
  activeSite,
  onSelectSite,
}) => {
  const [customSites, setCustomSites] = useState<WarehouseSite[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteWilaya, setNewSiteWilaya] = useState('');

  useEffect(() => {
    if (isOpen) {
      setCustomSites(getCustomWarehouseSites());
      setShowAddForm(false);
      setNewSiteName('');
      setNewSiteWilaya('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const allSites: WarehouseSite[] = [
    ...DEFAULT_WAREHOUSE_SITES,
    ...customSites.filter((cs) => !DEFAULT_WAREHOUSE_SITES.some((ds) => ds.id === cs.id)),
  ];

  const handleSelect = (id: string) => {
    playSuccessChime();
    hapticTap('light');
    onSelectSite(id);
    onClose();
  };

  const handleAddSite = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newSiteName.trim();
    if (!name) return;

    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const newSite: WarehouseSite = {
      id,
      name,
      wilaya: newSiteWilaya.trim() || 'Algérie',
    };

    saveCustomWarehouseSite(newSite);
    setCustomSites((prev) => [...prev, newSite]);
    setShowAddForm(false);
    setNewSiteName('');
    setNewSiteWilaya('');
    handleSelect(id);
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
          maxWidth: 420,
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
                background: 'rgba(16, 185, 129, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent)',
                flexShrink: 0,
              }}
            >
              <IconBuilding size={20} />
            </div>
            <div>
              <div className="font-bold text-xs uppercase tracking-wider text-accent">
                Multi-Dépôts & Wilayas
              </div>
              <div className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                Sélectionner le Site Actif
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

        {/* Option: All Warehouses */}
        <div className="flex flex-col gap-2 mb-3">
          <button
            type="button"
            className="p-3 text-left transition-all flex items-center justify-between"
            style={{
              minHeight: 48,
              borderRadius: 16,
              background: activeSite === 'all' ? 'rgba(16, 185, 129, 0.16)' : 'var(--bg-card)',
              border: activeSite === 'all' ? '2px solid var(--accent)' : '1px solid var(--border)',
              cursor: 'pointer',
            }}
            onClick={() => handleSelect('all')}
          >
            <div>
              <div className="font-bold text-xs" style={{ color: activeSite === 'all' ? 'var(--accent)' : 'var(--text-primary)' }}>
                Tous les dépôts (Vue globale)
              </div>
              <div className="text-[11px] text-muted">Afficher l&apos;ensemble des bons de tous les sites</div>
            </div>
            {activeSite === 'all' && (
              <span className="text-accent flex items-center">
                <IconCheck size={16} />
              </span>
            )}
          </button>

          {/* Configured Sites */}
          {allSites.map((site) => {
            const isSelected = activeSite === site.id;
            return (
              <button
                key={site.id}
                type="button"
                className="p-3 text-left transition-all flex items-center justify-between"
                style={{
                  minHeight: 48,
                  borderRadius: 16,
                  background: isSelected ? 'rgba(16, 185, 129, 0.16)' : 'var(--bg-card)',
                  border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                  cursor: 'pointer',
                }}
                onClick={() => handleSelect(site.id)}
              >
                <div>
                  <div className="font-bold text-xs" style={{ color: isSelected ? 'var(--accent)' : 'var(--text-primary)' }}>
                    {site.name}
                  </div>
                  <div className="text-[11px] text-muted flex items-center gap-1 mt-0.5">
                    <IconMapPin size={11} />
                    <span>Wilaya : {site.wilaya} {site.wilayaCode ? `(${site.wilayaCode})` : ''}</span>
                    {site.isDefault && <span className="opacity-75">• Dépôt principal</span>}
                  </div>
                </div>
                {isSelected && (
                  <span className="text-accent flex items-center">
                    <IconCheck size={16} />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Add custom site accordion */}
        {!showAddForm ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm w-full flex items-center justify-center gap-1.5"
            style={{ borderRadius: 9999, border: '1px dashed var(--border)', padding: '8px 12px' }}
            onClick={() => setShowAddForm(true)}
          >
            <IconPlus size={14} />
            <span>Ajouter un nouveau site</span>
          </button>
        ) : (
          <form onSubmit={handleAddSite} className="p-3 border border-[var(--border)] rounded-2xl bg-[var(--bg-card)]">
            <div className="text-xs font-bold text-accent mb-2">Nouveau site / dépôt :</div>
            <input
              type="text"
              className="input input-sm w-full mb-2"
              style={{ borderRadius: 12 }}
              placeholder="Ex: Sétif — Dépôt Relais..."
              value={newSiteName}
              onChange={(e) => setNewSiteName(e.target.value)}
              autoFocus
            />
            <input
              type="text"
              className="input input-sm w-full mb-2.5"
              style={{ borderRadius: 12 }}
              placeholder="Wilaya (ex: Sétif 19)..."
              value={newSiteWilaya}
              onChange={(e) => setNewSiteWilaya(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                style={{ borderRadius: 9999 }}
                onClick={() => setShowAddForm(false)}
              >
                Annuler
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-xs"
                style={{ borderRadius: 9999, padding: '4px 12px' }}
                disabled={!newSiteName.trim()}
              >
                Créer et activer
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
