import React from 'react';
import {
  IconX,
  IconSun,
  IconMoon,
  IconKey,
  IconHelp,
  IconSparkles,
  IconCheck,
} from './icons';
import { useDailyApiQuota } from './ai/quotaTracker';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  onOpenKeyModal: () => void;
  onOpenWalkthrough: () => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  theme,
  toggleTheme,
  onOpenKeyModal,
  onOpenWalkthrough,
}: SettingsModalProps) {
  const quota = useDailyApiQuota();

  if (!isOpen) return null;

  const litePct = Math.min(100, Math.round((quota.liteUsed / quota.liteLimit) * 100));
  const flashPct = Math.min(100, Math.round((quota.flashUsed / quota.flashLimit) * 100));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div className="flex justify-between items-center mb-3">
          <div className="modal-title" style={{ margin: 0 }}>PARAMÈTRES & QUOTAS</div>
          <button
            className="btn btn-ghost btn-xs btn-icon"
            onClick={onClose}
            aria-label="Fermer"
            style={{ padding: 4 }}
          >
            <IconX size={18} />
          </button>
        </div>

        {/* Theme Section */}
        <div className="card mb-3" style={{ background: 'var(--bg-surface)' }}>
          <div className="flex justify-between items-center">
            <div>
              <div className="font-bold text-sm">Apparence & Thème</div>
              <div className="text-xs text-muted">
                {theme === 'dark' ? 'Mode Sombre OLED (Optimal entrepôt)' : 'Mode Clair Haute Lisibilité'}
              </div>
            </div>
            <button
              className="btn btn-sm btn-secondary flex items-center gap-2"
              onClick={toggleTheme}
            >
              {theme === 'dark' ? (
                <>
                  <IconSun size={15} /> Passer en Clair
                </>
              ) : (
                <>
                  <IconMoon size={15} /> Passer en Sombre
                </>
              )}
            </button>
          </div>
        </div>

        {/* API Quota Meters */}
        <div className="card mb-3" style={{ background: 'var(--bg-surface)' }}>
          <div className="flex items-center gap-2 mb-2">
            <IconSparkles size={16} style={{ color: 'var(--accent)' }} />
            <div className="font-bold text-sm">Consommation API Gemini (Aujourd'hui)</div>
          </div>
          <div className="text-xs text-muted mb-3">
            Quotas officiels gratuits Google AI Studio par jour :
          </div>

          {/* Flash Lite 3.5 */}
          <div className="mb-3">
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="font-semibold">Flash Lite 3.5 (Rapide • Recommandé)</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                {quota.liteUsed} / {quota.liteLimit} scans
              </span>
            </div>
            <div className="progress-bar" style={{ height: 8 }}>
              <div
                className="progress-fill"
                style={{
                  width: `${litePct}%`,
                  background: litePct > 90 ? 'var(--danger)' : 'var(--accent)',
                }}
              />
            </div>
            <div className="text-xs text-muted mt-1" style={{ fontSize: '0.72rem' }}>
              Il vous reste <strong>{Math.max(0, quota.liteLimit - quota.liteUsed)}</strong> scans aujourd'hui.
            </div>
          </div>

          {/* Flash 3.8 */}
          <div className="mb-2">
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="font-semibold">Flash 3.8 (Ultra-précis • BL complexes)</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                {quota.flashUsed} / {quota.flashLimit} scans
              </span>
            </div>
            <div className="progress-bar" style={{ height: 8 }}>
              <div
                className="progress-fill"
                style={{
                  width: `${flashPct}%`,
                  background: flashPct > 90 ? 'var(--danger)' : 'var(--warning)',
                }}
              />
            </div>
            <div className="text-xs text-muted mt-1" style={{ fontSize: '0.72rem' }}>
              Il vous reste <strong>{Math.max(0, quota.flashLimit - quota.flashUsed)}</strong> scans aujourd'hui.
            </div>
          </div>

          <div className="divider" style={{ margin: '10px 0' }} />
          <div className="text-xs text-muted text-center" style={{ fontSize: '0.72rem' }}>
            Réinitialisation automatique à minuit.
          </div>
        </div>

        {/* Configuration Actions */}
        <div className="flex flex-col gap-2">
          <button
            className="btn btn-secondary btn-full flex items-center justify-center gap-2"
            onClick={() => {
              onClose();
              onOpenKeyModal();
            }}
          >
            <IconKey size={16} /> Gérer la Clé API Gemini
          </button>

          <button
            className="btn btn-secondary btn-full flex items-center justify-center gap-2"
            onClick={() => {
              onClose();
              onOpenWalkthrough();
            }}
          >
            <IconHelp size={16} /> Relancer le Guide Interactif
          </button>
        </div>
      </div>
    </div>
  );
}
