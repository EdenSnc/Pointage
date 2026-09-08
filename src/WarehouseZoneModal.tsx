import React, { useState } from 'react';
import type { OrderLine } from './types';
import {
  WAREHOUSE_ZONES,
  getZoneInfo,
  getZoneLabel,
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
  const currentInfo = getZoneInfo(currentZoneNorm);

  // Auto-detect initial tab from current zone
  const [activeTab, setActiveTab] = useState<ZoneTab>(() => {
    if (!currentZoneNorm) return 'chambre';
    if (currentZoneNorm.startsWith('CO_')) return 'couloir';
    if (currentInfo?.category === 'custom') return 'custom';
    return 'chambre';
  });

  const [customInput, setCustomInput] = useState(() =>
    currentInfo?.category === 'custom' ? currentZoneNorm : ''
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSelectZone = async (zoneCode: string | null) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      playSuccessChime();
      hapticTap('medium');
      await updateProductWarehouseZone(
        line.id!,
        line.billId,
        line.reference,
        zoneCode,
        activeOperator || undefined
      );
      if (onZoneUpdated) {
        onZoneUpdated(zoneCode);
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
    handleSelectZone(trimmed);
  };

  const chambreZones = WAREHOUSE_ZONES.filter((z) => z.category === 'chambre');
  const couloirZones = WAREHOUSE_ZONES.filter((z) => z.category === 'couloir');

  return (
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(5px)',
        zIndex: 960,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 14,
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
          maxHeight: '90vh',
          overflowY: 'auto',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--glass-border-subtle)',
          boxShadow: 'var(--shadow-xl)',
          borderRadius: 22,
          padding: 18,
        }}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-2.5">
          <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                background: 'rgba(16, 185, 129, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent)',
                flexShrink: 0,
              }}
            >
              <IconMapPin size={20} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="font-bold text-sm text-accent uppercase tracking-wider flex items-center gap-1.5">
                <span>Emplacement Entrepôt</span>
              </div>
              <div className="font-bold text-sm truncate" title={line.designation}>
                {line.designation}
              </div>
              <div className="text-xs text-muted">
                {line.reference ? `Réf: ${line.reference}` : 'Sans référence'} • Article N°{line.no}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-icon"
            onClick={onClose}
            aria-label="Fermer"
          >
            <IconX size={18} />
          </button>
        </div>

        {/* Current Location Banner */}
        <div
          className="p-2 mb-3 rounded-xl flex items-center justify-between text-xs"
          style={{
            background: currentZoneNorm ? 'rgba(16, 185, 129, 0.10)' : 'rgba(255, 255, 255, 0.04)',
            border: `1px solid ${currentZoneNorm ? 'rgba(16, 185, 129, 0.3)' : 'var(--glass-border-subtle)'}`,
          }}
        >
          <div className="flex items-center gap-2">
            <IconCompass size={16} style={{ color: currentZoneNorm ? 'var(--accent)' : 'var(--text-muted)' }} />
            <div>
              <span className="text-muted">Actuel : </span>
              <strong style={{ color: currentZoneNorm ? 'var(--accent)' : 'inherit' }}>
                {getZoneLabel(currentZoneNorm) || 'Non assigné'}
              </strong>
            </div>
          </div>

          {currentZoneNorm && (
            <button
              type="button"
              className="btn btn-ghost btn-xs text-danger flex items-center gap-1"
              style={{ fontSize: '0.7rem', padding: '2px 6px' }}
              onClick={() => handleSelectZone(null)}
              title="Supprimer l'emplacement actuel"
            >
              <IconTrash size={12} /> Effacer
            </button>
          )}
        </div>

        {/* Category Navigation Tabs (1st Tap) */}
        <div className="flex gap-1 mb-3 p-1 rounded-xl" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
          <button
            type="button"
            className={`btn btn-xs flex-1 ${activeTab === 'chambre' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '0.74rem', padding: '6px 4px', borderRadius: 'var(--radius-sm)' }}
            onClick={() => setActiveTab('chambre')}
          >
            Chambre (9 zones)
          </button>
          <button
            type="button"
            className={`btn btn-xs flex-1 ${activeTab === 'couloir' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '0.74rem', padding: '6px 4px', borderRadius: 'var(--radius-sm)' }}
            onClick={() => setActiveTab('couloir')}
          >
            Couloir (Salles 1–4)
          </button>
          <button
            type="button"
            className={`btn btn-xs flex-1 ${activeTab === 'custom' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '0.74rem', padding: '6px 4px', borderRadius: 'var(--radius-sm)' }}
            onClick={() => setActiveTab('custom')}
          >
            Autre
          </button>
        </div>

        {/* Tab 1: Chambre Principale Compass Grid (3x3 spatial layout) */}
        {activeTab === 'chambre' && (
          <div>
            <div className="text-[11px] font-bold text-muted uppercase tracking-wider mb-2 flex justify-between items-center">
              <span>Grille Chambre Principale (9 zones) :</span>
              <span className="text-[10px] text-accent">1 Tap pour choisir</span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 6,
              }}
            >
              {[1, 2, 3].map((r) =>
                [1, 2, 3].map((c) => {
                  const z = chambreZones.find((item) => item.compassRow === r && item.compassCol === c);
                  if (!z) return <div key={`${r}-${c}`} />;
                  const isSelected = currentZoneNorm === z.code;
                  const isEntrance = z.code === 'CH_SW';
                  const isCouloirAccess = z.code === 'CH_W' || z.code === 'CH_NW';

                  return (
                    <button
                      key={z.code}
                      type="button"
                      className={`p-2 rounded-xl flex flex-col items-center justify-center text-center transition-all ${
                        isSelected ? 'border-accent bg-accent/15' : ''
                      }`}
                      style={{
                        minHeight: 64,
                        background: isSelected ? 'rgba(16, 185, 129, 0.18)' : 'var(--bg-input)',
                        border: isSelected ? '1.5px solid var(--accent)' : '1px solid var(--glass-border-subtle)',
                        cursor: 'pointer',
                        position: 'relative',
                      }}
                      onClick={() => handleSelectZone(z.code)}
                    >
                      <span
                        className="text-xs font-bold leading-tight"
                        style={{ color: isSelected ? 'var(--accent)' : 'var(--text-primary)' }}
                      >
                        {z.shortLabel.replace('CH • ', '')}
                      </span>

                      {isEntrance && (
                        <span
                          className="mt-1 px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider"
                          style={{
                            background: 'rgba(59, 130, 246, 0.2)',
                            color: '#60a5fa',
                            border: '1px solid rgba(59, 130, 246, 0.4)',
                          }}
                        >
                          Entrée
                        </span>
                      )}

                      {isCouloirAccess && !isEntrance && (
                        <span
                          className="mt-1 px-1 py-0.2 rounded text-[9px] text-muted font-semibold"
                          style={{
                            background: 'rgba(255, 255, 255, 0.05)',
                          }}
                        >
                          ⟵ Couloir
                        </span>
                      )}

                      {isSelected && (
                        <span className="flex items-center gap-0.5 text-[10px] text-accent font-bold mt-1">
                          <IconCheck size={11} /> Choisi
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Couloir (Salles 1 à 4, South to North) */}
        {activeTab === 'couloir' && (
          <div>
            <div className="text-[11px] font-bold text-muted uppercase tracking-wider mb-2 flex justify-between items-center">
              <span>Salles du Couloir (Sud ➔ Nord) :</span>
              <span className="text-[10px] text-accent">1 Tap pour choisir</span>
            </div>

            <div className="flex flex-col gap-2">
              <div className="text-[10px] font-mono text-muted text-right pr-2">▲ FOND DU COULOIR (NORD)</div>
              {couloirZones
                .slice()
                .sort((a, b) => (b.roomNumber || 0) - (a.roomNumber || 0))
                .map((z) => {
                  const isSelected = currentZoneNorm === z.code;
                  return (
                    <button
                      key={z.code}
                      type="button"
                      className="p-3 rounded-xl flex items-center justify-between text-left transition-all"
                      style={{
                        background: isSelected ? 'rgba(16, 185, 129, 0.18)' : 'var(--bg-input)',
                        border: isSelected ? '1.5px solid var(--accent)' : '1px solid var(--glass-border-subtle)',
                        cursor: 'pointer',
                      }}
                      onClick={() => handleSelectZone(z.code)}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 9,
                            background: isSelected ? 'var(--accent)' : 'rgba(255, 255, 255, 0.06)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: isSelected ? '#fff' : 'var(--text-muted)',
                            flexShrink: 0,
                          }}
                        >
                          {isSelected ? <IconCheck size={15} /> : <IconMapPin size={14} />}
                        </div>
                        <div>
                          <div className="text-sm font-bold">{z.label}</div>
                          <div className="text-[10px] text-muted">
                            {z.code === 'CO_R4' && 'Au bout du couloir • Face à la Chambre Nord-Ouest'}
                            {z.code === 'CO_R3' && 'Zone intermédiaire Nord'}
                            {z.code === 'CO_R2' && 'Zone intermédiaire Sud'}
                            {z.code === 'CO_R1' && 'Début du couloir • Accès direct Entrée Entrepôt SW'}
                          </div>
                        </div>
                      </div>
                      <span className="badge badge-exact font-bold">{z.shortLabel}</span>
                    </button>
                  );
                })}
              <div className="text-[10px] font-mono text-muted text-right pr-2">▼ ENTRÉE ENTREPÔT (SUD-OUEST)</div>
            </div>
          </div>
        )}

        {/* Tab 3: Custom / Rayon */}
        {activeTab === 'custom' && (
          <div>
            <div className="text-[11px] font-bold text-muted uppercase tracking-wider mb-2">
              Précision / Rayon personnalisé :
            </div>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                className="input input-sm flex-1"
                placeholder="Ex: Rayon B-04, Mezzanine..."
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                autoFocus
              />
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={handleApplyCustom}
                disabled={!customInput.trim()}
              >
                Enregistrer
              </button>
            </div>

            <div className="text-xs text-muted mb-1 font-semibold">Suggestions rapides :</div>
            <div className="flex flex-wrap gap-1.5">
              {['Quai Réception', 'Quai Expédition', 'Mezzanine', 'Entrée Atelier', 'Chambre Froide', 'Zone Tampon'].map((sug) => (
                <button
                  key={sug}
                  type="button"
                  className="btn btn-xs btn-secondary"
                  style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                  onClick={() => handleSelectZone(sug)}
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-4 pt-2 flex justify-end" style={{ borderTop: '1px solid var(--glass-border-subtle)' }}>
          <button type="button" className="btn btn-ghost btn-sm text-muted" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
