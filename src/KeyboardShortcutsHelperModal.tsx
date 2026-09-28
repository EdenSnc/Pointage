// ============================================================
// POINTAGE — Modal Raccourcis Clavier & Douchette Haute Cadence
// Quick shortcuts guide for high-frequency warehouse workers
// ============================================================

import React from 'react';
import {
  IconX,
  IconCheck,
  IconZap,
  IconScan,
  IconSearch,
  IconBolt,
} from './icons';

interface KeyboardShortcutsHelperModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsHelperModal: React.FC<KeyboardShortcutsHelperModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const shortcuts = [
    {
      key: 'Espace',
      desc: 'Valider la ligne active / Confirmer conformité exacte',
      tag: 'Douchette & Clavier',
    },
    {
      key: 'Entrée',
      desc: 'Valider le scan code-barres et passer à l’article suivant',
      tag: 'Scanner',
    },
    {
      key: 'Alt + W',
      desc: 'Ouvrir la Vague de Préparation Consolidée (Wave Pick)',
      tag: 'Mode Rush',
    },
    {
      key: 'Alt + R',
      desc: 'Activer / Désactiver le Mode Rush (Haute Densité)',
      tag: 'Mode Rush',
    },
    {
      key: '+ / -',
      desc: 'Incrémenter / Décrémenter d’un carton complet (Outer Pack)',
      tag: 'Comptage',
    },
    {
      key: 'Ctrl + F ou /',
      desc: 'Focus instantané sur la recherche universelle',
      tag: 'Navigation',
    },
    {
      key: 'Échap',
      desc: 'Fermer immédiatement tout tiroir, popover ou modal',
      tag: 'Général',
    },
    {
      key: '?',
      desc: 'Afficher cette aide des raccourcis haute cadence',
      tag: 'Aide',
    },
  ];

  return (
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
      }}
      onClick={onClose}
    >
      <div
        className="modal-content"
        style={{
          width: '100%',
          maxWidth: 480,
          backgroundColor: '#12141a',
          borderRadius: 22,
          border: '1px solid rgba(255, 255, 255, 0.12)',
          padding: '20px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
          <div className="flex items-center gap-2">
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                backgroundColor: 'rgba(168, 85, 247, 0.15)',
                color: '#c084fc',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <IconZap size={18} />
            </div>
            <div>
              <div className="font-extrabold text-sm text-white">Raccourcis Haute Cadence</div>
              <div className="text-[11px] text-muted">Douchette & Clavier d'entrepôt</div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-circle"
            onClick={onClose}
          >
            <IconX size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {shortcuts.map((s) => (
            <div
              key={s.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'between',
                padding: '8px 10px',
                borderRadius: 12,
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              <div className="min-w-0 flex-1 pr-2">
                <div className="text-xs font-bold text-white">{s.desc}</div>
                <span className="text-[10px] text-muted font-mono">{s.tag}</span>
              </div>
              <kbd
                className="font-mono text-xs px-2.5 py-1 rounded-md shrink-0"
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  color: '#60a5fa',
                  fontWeight: 800,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.4)',
                }}
              >
                {s.key}
              </kbd>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="btn btn-primary w-full mt-4"
          style={{ minHeight: 44, borderRadius: 14, fontWeight: 800 }}
          onClick={onClose}
        >
          Compris
        </button>
      </div>
    </div>
  );
};
