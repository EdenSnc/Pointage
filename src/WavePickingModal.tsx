// ============================================================
// POINTAGE — Modal Vague de Préparation (Wave Picking)
// High-Velocity Order Consolidation for Rush Hours
// Minimizes physical walking & groups orders by warehouse zone
// ============================================================

import React, { useState, useMemo } from 'react';
import type { Bill, OrderLine, ProductProfile, Stage } from './types';
import { generateWavePickingPlan, formatWavePickingManifest, type WavePickItem } from './wavePickingEngine';
import {
  IconBox,
  IconCheck,
  IconX,
  IconTruck,
  IconMapPin,
  IconClipboardCheck,
  IconChevronDown,
  IconChevronRight,
  IconZap,
} from './icons';
import { hapticTap, playSuccessChime } from './audio';

interface WavePickingModalProps {
  isOpen: boolean;
  onClose: () => void;
  bills: Bill[];
  lines: OrderLine[];
  catalog?: ProductProfile[];
  activeOperator?: string;
  onToast: (msg: string) => void;
}

export const WavePickingModal: React.FC<WavePickingModalProps> = ({
  isOpen,
  onClose,
  bills,
  lines,
  catalog = [],
  activeOperator,
  onToast,
}) => {
  const [selectedZone, setSelectedZone] = useState<string>('all');
  const [pickedRefs, setPickedRefs] = useState<Set<string>>(new Set());
  const [expandedRef, setExpandedRef] = useState<string | null>(null);

  const wave = useMemo(() => {
    return generateWavePickingPlan({
      bills,
      lines,
      catalog,
      stage: 'preparation',
    });
  }, [bills, lines, catalog]);

  if (!isOpen) return null;

  const filteredItems = wave.items.filter((item) => {
    if (selectedZone === 'all') return true;
    return item.warehouseZone === selectedZone;
  });

  const handleTogglePicked = (ref: string) => {
    hapticTap('medium');
    playSuccessChime();
    setPickedRefs((prev) => {
      const next = new Set(prev);
      if (next.has(ref)) next.delete(ref);
      else next.add(ref);
      return next;
    });
  };

  const handleCopyManifest = async () => {
    const text = formatWavePickingManifest(wave);
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        hapticTap('light');
        onToast('Feuille de vague copiée (Prête pour WhatsApp / Chariot quai)');
      }
    } catch {
      onToast('Erreur copie presse-papier');
    }
  };

  const progressPercent =
    wave.items.length > 0 ? Math.round((pickedRefs.size / wave.items.length) * 100) : 0;

  return (
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.88)',
        backdropFilter: 'blur(10px)',
        zIndex: 999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 10,
      }}
      onClick={onClose}
    >
      <div
        className="modal-content"
        style={{
          width: '100%',
          maxWidth: 720,
          maxHeight: '92vh',
          backgroundColor: '#12141a',
          borderRadius: 24,
          border: '1px solid rgba(255, 255, 255, 0.12)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.9)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'between',
            gap: 12,
          }}
        >
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                color: '#60a5fa',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <IconZap size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-extrabold text-white text-base">
                  Vague de Préparation Consolidée
                </span>
                <span
                  style={{
                    fontSize: '0.68rem',
                    padding: '2px 8px',
                    borderRadius: 9999,
                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                    color: '#60a5fa',
                    fontWeight: 800,
                  }}
                >
                  {wave.totalBills} Bons Actifs
                </span>
              </div>
              <div className="text-xs text-muted truncate">
                Circuit unique par allée • Élimine 80% des déplacements inutiles
              </div>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-sm btn-circle"
            onClick={onClose}
            style={{ width: 36, height: 36, borderRadius: 18 }}
          >
            <IconX size={18} />
          </button>
        </div>

        {/* Top KPIs & Zone Filter */}
        <div
          style={{
            padding: '12px 18px',
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div className="grid grid-cols-3 gap-2">
            <div
              style={{
                padding: '8px 10px',
                borderRadius: 12,
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              <div className="text-[10px] text-muted uppercase font-bold">Cartons à Ramasser</div>
              <div className="font-mono font-extrabold text-sm text-white">
                {wave.totalCartonsToPick} ctns
              </div>
            </div>

            <div
              style={{
                padding: '8px 10px',
                borderRadius: 12,
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              <div className="text-[10px] text-muted uppercase font-bold">Articles Uniques</div>
              <div className="font-mono font-extrabold text-sm text-blue-400">
                {wave.totalUniqueItems} réf.
              </div>
            </div>

            <div
              style={{
                padding: '8px 10px',
                borderRadius: 12,
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              <div className="text-[10px] text-muted uppercase font-bold">Progression Vague</div>
              <div className="font-mono font-extrabold text-sm text-accent">
                {progressPercent}% ({pickedRefs.size}/{wave.items.length})
              </div>
            </div>
          </div>

          {/* Zones pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              className="text-xs px-2.5 py-1 rounded-full font-bold transition-all shrink-0"
              style={{
                backgroundColor: selectedZone === 'all' ? '#3b82f6' : 'rgba(255,255,255,0.06)',
                color: selectedZone === 'all' ? '#fff' : 'var(--muted)',
              }}
              onClick={() => setSelectedZone('all')}
            >
              Toutes Allées ({wave.items.length})
            </button>
            {wave.zonesCovered.map((z) => (
              <button
                key={z}
                type="button"
                className="text-xs px-2.5 py-1 rounded-full font-bold transition-all shrink-0"
                style={{
                  backgroundColor: selectedZone === z ? '#3b82f6' : 'rgba(255,255,255,0.06)',
                  color: selectedZone === z ? '#fff' : 'var(--muted)',
                }}
                onClick={() => setSelectedZone(z)}
              >
                Zone {z}
              </button>
            ))}
          </div>
        </div>

        {/* Consolidated Pick Items List */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {filteredItems.length === 0 ? (
            <div className="text-center py-12 text-muted text-sm">
              Aucun article en attente de ramasse dans cette zone.
            </div>
          ) : (
            filteredItems.map((item) => {
              const isPicked = pickedRefs.has(item.reference);
              const isExpanded = expandedRef === item.reference;

              return (
                <div
                  key={item.reference}
                  style={{
                    backgroundColor: isPicked ? 'rgba(16, 185, 129, 0.06)' : 'rgba(255, 255, 255, 0.03)',
                    border: `1px solid ${
                      isPicked ? 'rgba(16, 185, 129, 0.35)' : 'rgba(255, 255, 255, 0.08)'
                    }`,
                    borderRadius: 16,
                    padding: '12px 14px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    {/* Checkbox button */}
                    <button
                      type="button"
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 10,
                        backgroundColor: isPicked ? '#10b981' : 'rgba(255,255,255,0.06)',
                        border: `1px solid ${isPicked ? '#10b981' : 'rgba(255,255,255,0.2)'}`,
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                      onClick={() => handleTogglePicked(item.reference)}
                      title={isPicked ? 'Marquer non ramassé' : 'Valider ramasse complète'}
                    >
                      {isPicked && <IconCheck size={18} />}
                    </button>

                    {/* Middle Info */}
                    <div
                      className="min-w-0 flex-1 cursor-pointer"
                      onClick={() => setExpandedRef(isExpanded ? null : item.reference)}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-sm text-white">
                          {item.reference}
                        </span>
                        <span
                          style={{
                            fontSize: '0.65rem',
                            padding: '1px 6px',
                            borderRadius: 6,
                            backgroundColor: 'rgba(168, 85, 247, 0.15)',
                            color: '#c084fc',
                            fontWeight: 700,
                          }}
                        >
                          {item.zoneShortLabel}
                        </span>
                        <span
                          style={{
                            fontSize: '0.65rem',
                            padding: '1px 6px',
                            borderRadius: 6,
                            backgroundColor: 'rgba(59, 130, 246, 0.15)',
                            color: '#60a5fa',
                            fontWeight: 700,
                          }}
                        >
                          {item.billCount} Bon(s)
                        </span>
                      </div>
                      <div className="text-xs text-muted truncate mt-0.5">
                        {item.designation}
                      </div>
                    </div>

                    {/* Total Cartons to Pick */}
                    <div className="text-right shrink-0">
                      <div className="font-mono font-extrabold text-base text-white">
                        {item.totalCartonsToPick > 0
                          ? `${item.totalCartonsToPick} ctns`
                          : `${item.totalRemainingQty} pcs`}
                      </div>
                      <div className="text-[10px] text-muted font-mono">
                        (x{item.outerPackSize} / ctn)
                      </div>
                    </div>
                  </div>

                  {/* Expanded Breakdown per Bill / Pallet */}
                  {isExpanded && (
                    <div
                      style={{
                        marginTop: 10,
                        paddingTop: 10,
                        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                      }}
                    >
                      <div className="text-[11px] font-bold text-muted uppercase">
                        Répartition par Bon de Commande (Éclatement Quai) :
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {item.allocations.map((alloc) => (
                          <div
                            key={alloc.billId}
                            style={{
                              padding: '6px 10px',
                              borderRadius: 10,
                              backgroundColor: 'rgba(0, 0, 0, 0.4)',
                              border: '1px solid rgba(255, 255, 255, 0.06)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'between',
                            }}
                          >
                            <div className="min-w-0 flex-1">
                              <span className="font-bold text-xs text-white">
                                {alloc.billNumber}
                              </span>
                              <div className="text-[10px] text-muted truncate">
                                {alloc.client}
                              </div>
                            </div>
                            <span className="font-mono font-extrabold text-xs text-blue-300 ml-2 shrink-0">
                              {alloc.remainingQty} pcs ({alloc.cartons} ctns)
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Bottom Actions Bar */}
        <div
          style={{
            padding: '12px 18px',
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
          }}
        >
          <button
            type="button"
            className="btn btn-secondary flex items-center justify-center gap-1.5"
            style={{ minHeight: 48, borderRadius: 14, fontWeight: 700 }}
            onClick={handleCopyManifest}
          >
            <IconClipboardCheck size={16} />
            <span>Copier Feuille Chariot</span>
          </button>

          <button
            type="button"
            className="btn btn-primary flex items-center justify-center gap-1.5"
            style={{ minHeight: 48, borderRadius: 14, fontWeight: 800 }}
            onClick={onClose}
          >
            <IconCheck size={16} />
            <span>Fermer & Retour Quai</span>
          </button>
        </div>
      </div>
    </div>
  );
};
