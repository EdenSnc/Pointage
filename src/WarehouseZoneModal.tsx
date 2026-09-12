import React, { useState } from 'react';
import type { OrderLine } from './types';
import {
  WAREHOUSE_ZONES,
  getZoneInfo,
  getZoneLabel,
  getZoneShortLabel,
  parseZoneCodes,
  updateProductWarehouseZone,
} from './warehouseZones';
import { IconCompass, IconMapPin, IconX, IconCheck, IconTrash } from './icons';
import { playSuccessChime, hapticTap } from './audio';

interface WarehouseZoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  line: OrderLine;
  currentZone?: string | null;
  activeOperator?: string | null;
  onZoneUpdated?: (newZone: string | null) => void;
}

type ZoneTab = 'chambre' | 'couloir' | 'custom';

export const WarehouseZoneModal: React.FC<WarehouseZoneModalProps> = ({
  isOpen,
  onClose,
  line,
  currentZone,
  activeOperator,
  onZoneUpdated,
}) => {
  if (!isOpen) return null;

  const currentZoneNorm = currentZone || line.warehouseZone || null;
  const initialSelected = parseZoneCodes(currentZoneNorm);

  const [selectedZones, setSelectedZones] = useState<string[]>(initialSelected);

  // Auto-detect initial tab from first selected zone
  const [activeTab, setActiveTab] = useState<ZoneTab>(() => {
    const first = initialSelected[0];
    if (!first) return 'chambre';
    if (first.startsWith('CO_')) return 'couloir';
    const info = getZoneInfo(first);
    if (info?.category === 'custom') return 'custom';
    return 'chambre';
  });

  const [customInput, setCustomInput] = useState(() => {
    const first = initialSelected[0];
    const info = getZoneInfo(first);
    return info?.category === 'custom' ? first : '';
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 640 : false));

  React.useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleToggleZone = (code: string) => {
    hapticTap('light');
    setSelectedZones((prev) => {
      if (prev.includes(code)) {
        return prev.filter((c) => c !== code);
      }
      if (prev.length < 2) {
        return [...prev, code];
      }
      // If already 2 selected, replace the 2nd zone
      return [prev[0], code];
    });
  };

  const handleSave = async (zonesToSave?: string[]) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      playSuccessChime();
      hapticTap('medium');
      let finalZones = zonesToSave !== undefined ? [...zonesToSave] : [...selectedZones];

      // Auto-commit typed custom zone if user didn't explicitly click "Ajouter"
      if (activeTab === 'custom' && customInput.trim()) {
        const trimmed = customInput.trim();
        if (!finalZones.includes(trimmed)) {
          finalZones = [...finalZones, trimmed].slice(0, 2);
        }
      }

      const zoneString = finalZones.length > 0 ? finalZones.join(', ') : null;
      if (!line.id) {
        throw new Error('Identifiant d’article manquant');
      }

      await updateProductWarehouseZone(
        line.id,
        line.billId,
        line.reference,
        zoneString,
        activeOperator || undefined
      );
      if (onZoneUpdated) {
        onZoneUpdated(zoneString);
      }
      onClose();
    } catch (err) {
      console.error('Failed to update warehouse zone:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApplyCustom = () => {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    handleToggleZone(trimmed);
  };

  const chambreZones = WAREHOUSE_ZONES.filter((z) => z.category === 'chambre');
  const couloirZones = WAREHOUSE_ZONES.filter((z) => z.category === 'couloir');

  return (
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(8px)',
        zIndex: 960,
        display: 'flex',
        alignItems: isMobile ? 'stretch' : 'center',
        justifyContent: 'center',
        padding: isMobile ? 0 : 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: isMobile ? '100%' : 440,
          height: isMobile ? '100%' : 'auto',
          maxHeight: isMobile ? '100vh' : '90vh',
          borderRadius: isMobile ? 0 : 24,
          overflowY: 'auto',
          backgroundColor: 'var(--bg-surface)',
          border: isMobile ? 'none' : '1px solid var(--border)',
          boxShadow: 'var(--shadow-xl)',
          padding: isMobile ? '16px 14px' : 20,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-2.5" style={{ minWidth: 0 }}>
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
              <IconMapPin size={22} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="font-bold text-xs text-accent uppercase tracking-wider">
                Emplacement Rayon (Max 2)
              </div>
              <div className="font-bold text-sm truncate" title={line.designation}>
                {line.designation}
              </div>
              <div className="text-xs text-muted">
                {line.reference ? `Réf: ${line.reference}` : 'Sans réf'} • N°{line.no}
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

        {/* Selected Locations Banner */}
        <div
          className="p-2.5 mb-3 flex items-center justify-between text-xs"
          style={{
            borderRadius: 16,
            background: selectedZones.length > 0 ? 'rgba(16, 185, 129, 0.10)' : 'var(--bg-card)',
            border: `1px solid ${selectedZones.length > 0 ? 'rgba(16, 185, 129, 0.3)' : 'var(--border)'}`,
          }}
        >
          <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
            <IconCompass size={17} style={{ color: selectedZones.length > 0 ? 'var(--accent)' : 'var(--text-muted)', flexShrink: 0 }} />
            <div className="truncate">
              <span className="text-muted">Sélection ({selectedZones.length}/2) : </span>
              <strong style={{ color: selectedZones.length > 0 ? 'var(--accent)' : 'inherit' }}>
                {selectedZones.length > 0
                  ? selectedZones.map((c) => getZoneShortLabel(c)).join(' + ')
                  : 'Aucun emplacement'}
              </strong>
            </div>
          </div>

          {selectedZones.length > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-xs text-danger flex items-center gap-1"
              style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: 9999, flexShrink: 0 }}
              onClick={() => setSelectedZones([])}
              title="Vider la sélection"
            >
              <IconTrash size={12} /> Vider
            </button>
          )}
        </div>

        {/* Category Navigation Tabs (Pill style - 0 sharp corners) */}
        <div
          className="flex gap-1 mb-3 p-1"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 9999,
          }}
        >
          <button
            type="button"
            className={`btn btn-xs flex-1 ${activeTab === 'chambre' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '0.75rem', padding: '6px 10px', borderRadius: 9999 }}
            onClick={() => setActiveTab('chambre')}
          >
            Chambre
          </button>
          <button
            type="button"
            className={`btn btn-xs flex-1 ${activeTab === 'couloir' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '0.75rem', padding: '6px 10px', borderRadius: 9999 }}
            onClick={() => setActiveTab('couloir')}
          >
            Couloir (Salles 1–4)
          </button>
          <button
            type="button"
            className={`btn btn-xs flex-1 ${activeTab === 'custom' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '0.75rem', padding: '6px 10px', borderRadius: 9999 }}
            onClick={() => setActiveTab('custom')}
          >
            Autre
          </button>
        </div>

        {/* Tab 1: Chambre Principale Compass Grid (3x3 spatial layout) */}
        {activeTab === 'chambre' && (
          <div>
            <div className="text-[11px] font-bold text-muted uppercase tracking-wider mb-2 flex justify-between items-center px-1">
              <span>Chambre Principale</span>
              <span className="text-[10px] text-muted">Touchez pour sélectionner (max 2)</span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 8,
              }}
            >
              {[1, 2, 3].map((r) =>
                [1, 2, 3].map((c) => {
                  const z = chambreZones.find((item) => item.compassRow === r && item.compassCol === c);
                  if (!z) return <div key={`${r}-${c}`} />;
                  const index = selectedZones.indexOf(z.code);
                  const isSelected = index !== -1;
                  const isEntrance = z.code === 'CH_SW';
                  const isCouloirAccess = z.code === 'CH_W' || z.code === 'CH_NW';

                  return (
                    <button
                      key={z.code}
                      type="button"
                      className="flex flex-col items-center justify-center text-center transition-all"
                      style={{
                        minHeight: 64,
                        padding: '8px 4px',
                        borderRadius: 16,
                        background: isSelected ? 'rgba(16, 185, 129, 0.18)' : 'var(--bg-card)',
                        border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                        cursor: 'pointer',
                        position: 'relative',
                      }}
                      onClick={() => handleToggleZone(z.code)}
                    >
                      <span
                        className="text-xs font-bold leading-tight"
                        style={{ color: isSelected ? 'var(--accent)' : 'var(--text-primary)' }}
                      >
                        {z.shortLabel.replace('CH • ', '')}
                      </span>

                      {isEntrance && (
                        <span
                          className="mt-1 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                          style={{
                            borderRadius: 9999,
                            background: 'rgba(59, 130, 246, 0.2)',
                            color: '#60a5fa',
                          }}
                        >
                          Entrée
                        </span>
                      )}

                      {isCouloirAccess && !isEntrance && (
                        <span
                          className="mt-1 px-1.5 py-0.5 text-[9px] text-muted font-semibold"
                          style={{
                            borderRadius: 9999,
                            background: 'rgba(255, 255, 255, 0.05)',
                          }}
                        >
                          Couloir
                        </span>
                      )}

                      {isSelected && (
                        <span
                          className="mt-1 px-1.5 py-0.5 text-[10px] text-accent font-extrabold flex items-center gap-0.5"
                          style={{ borderRadius: 9999, background: 'rgba(16, 185, 129, 0.15)' }}
                        >
                          <IconCheck size={11} />
                          {selectedZones.length > 1 ? `#${index + 1}` : 'Choisi'}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Couloir (Salles 1 à 4) */}
        {activeTab === 'couloir' && (
          <div>
            <div className="text-[11px] font-bold text-muted uppercase tracking-wider mb-2 flex justify-between items-center px-1">
              <span>Salles du Couloir</span>
              <span className="text-[10px] text-muted">Touchez pour sélectionner (max 2)</span>
            </div>

            <div className="flex flex-col gap-2">
              {couloirZones
                .slice()
                .sort((a, b) => (a.order || 0) - (b.order || 0))
                .map((z) => {
                  const index = selectedZones.indexOf(z.code);
                  const isSelected = index !== -1;
                  return (
                    <button
                      key={z.code}
                      type="button"
                      className="p-3 flex items-center justify-between text-left transition-all"
                      style={{
                        borderRadius: 16,
                        background: isSelected ? 'rgba(16, 185, 129, 0.18)' : 'var(--bg-card)',
                        border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                        cursor: 'pointer',
                      }}
                      onClick={() => handleToggleZone(z.code)}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: 10,
                            background: isSelected ? 'var(--accent)' : 'rgba(255, 255, 255, 0.06)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: isSelected ? '#fff' : 'var(--text-muted)',
                            flexShrink: 0,
                          }}
                        >
                          {isSelected ? <IconCheck size={16} /> : <IconMapPin size={15} />}
                        </div>
                        <div>
                          <div className="text-sm font-bold">{z.label}</div>
                          <div className="text-[11px] text-muted">
                            {z.code === 'CO_R4' && 'Nord • Fond du couloir'}
                            {z.code === 'CO_R3' && 'Intermédiaire Nord'}
                            {z.code === 'CO_R2' && 'Intermédiaire Sud'}
                            {z.code === 'CO_R1' && 'Sud • Accès direct entrée SW'}
                          </div>
                        </div>
                      </div>
                      <span
                        className="badge font-bold"
                        style={{
                          borderRadius: 9999,
                          background: isSelected ? 'var(--accent)' : 'rgba(255, 255, 255, 0.08)',
                          color: isSelected ? '#fff' : 'inherit',
                        }}
                      >
                        {isSelected && selectedZones.length > 1 ? `#${index + 1} • ` : ''}
                        {z.shortLabel}
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>
        )}

        {/* Tab 3: Custom / Rayon */}
        {activeTab === 'custom' && (
          <div>
            <div className="text-[11px] font-bold text-muted uppercase tracking-wider mb-2 px-1">
              Précision ou Rayon Spécifique :
            </div>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                className="input input-sm flex-1"
                style={{ borderRadius: 14 }}
                placeholder="Ex: Rayon B-04, Mezzanine..."
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                autoFocus
              />
              <button
                type="button"
                className="btn btn-sm btn-primary"
                style={{ borderRadius: 9999, padding: '4px 14px' }}
                onClick={handleApplyCustom}
                disabled={!customInput.trim()}
              >
                Ajouter
              </button>
            </div>

            <div className="text-xs text-muted mb-1.5 font-semibold px-1">Suggestions rapides :</div>
            <div className="flex flex-wrap gap-1.5">
              {['Quai Réception', 'Quai Expédition', 'Mezzanine', 'Entrée Atelier', 'Chambre Froide', 'Zone Tampon'].map((sug) => (
                <button
                  key={sug}
                  type="button"
                  className="btn btn-xs btn-secondary"
                  style={{ fontSize: '0.74rem', padding: '4px 10px', borderRadius: 9999 }}
                  onClick={() => handleToggleZone(sug)}
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Actions Footer */}
        <div
          className="mt-4 pt-3 flex items-center justify-between gap-2"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <button
            type="button"
            className="btn btn-ghost btn-sm text-muted"
            style={{ borderRadius: 9999 }}
            onClick={onClose}
          >
            Annuler
          </button>
          <button
            type="button"
            className="btn btn-sm btn-success flex items-center gap-1.5 font-bold"
            style={{ borderRadius: 9999, padding: '7px 18px' }}
            disabled={isSubmitting}
            onClick={() => handleSave()}
          >
            <IconCheck size={16} />
            <span>
              {selectedZones.length === 0
                ? 'Enregistrer (Aucun)'
                : `Enregistrer (${selectedZones.length} zone${selectedZones.length > 1 ? 's' : ''})`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
