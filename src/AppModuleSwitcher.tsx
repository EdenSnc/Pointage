// ============================================================
// POINTAGE — Executive App Module Switcher
// Instant 1-Tap Switching Between the 4 Primary Business Engines:
// 1. Dépôt & Quai (Warehouse Operations & Pointage)
// 2. Commandes Gros B2B (Wholesale Orders, Volume Tiers & Reassort)
// 3. Commercial & Tournées (Field Reps, Encaissements, Créances)
// 4. Boutique Détail B2C (Retail Store, Bundles & El Feth Catalog)
// ============================================================

import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  IconBox,
  IconTruck,
  IconStore,
  IconBag,
  IconBriefcase,
  IconTrendingUp,
} from './icons';
import { hapticTap, playSuccessChime } from './audio';

export type AppModuleId = 'warehouse' | 'gros' | 'commercial' | 'detail' | 'cockpit';

interface AppModuleSwitcherProps {
  currentModule?: AppModuleId;
  variant?: 'floating_bottom' | 'header_pills';
}

export const AppModuleSwitcher: React.FC<AppModuleSwitcherProps> = ({
  variant = 'floating_bottom',
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  // Detect current active module based on path
  const currentPath = location.pathname;
  let activeModule: AppModuleId = 'warehouse';
  if (currentPath.startsWith('/gros')) activeModule = 'gros';
  else if (currentPath.startsWith('/commercial')) activeModule = 'commercial';
  else if (currentPath.startsWith('/detail')) activeModule = 'detail';
  else if (currentPath.startsWith('/cockpit')) activeModule = 'cockpit';

  const handleSwitch = (mod: AppModuleId, path: string) => {
    if (activeModule === mod && currentPath === path) return;
    hapticTap('selection');
    playSuccessChime();
    navigate(path);
  };

  const modules = [
    {
      id: 'gros' as AppModuleId,
      path: '/gros',
      label: 'Gros B2B',
      subtitle: 'Volume & Marges',
      icon: <IconBox size={18} />,
      accentColor: '#3b82f6', // Sapphire Blue
      badge: 'Priorité Cash',
    },
    {
      id: 'commercial' as AppModuleId,
      path: '/commercial',
      label: 'Commercial',
      subtitle: 'Terrain & Créances',
      icon: <IconTruck size={18} />,
      accentColor: '#10b981', // Emerald
      badge: 'Encaissements',
    },
    {
      id: 'warehouse' as AppModuleId,
      path: '/',
      label: 'Dépôt & Quai',
      subtitle: 'Pointage & Stock',
      icon: <IconStore size={18} />,
      accentColor: '#a855f7', // Amethyst Violet
      badge: 'Opérations',
    },
    {
      id: 'cockpit' as AppModuleId,
      path: '/cockpit',
      label: 'Cockpit Cash',
      subtitle: 'Valorisation Stock',
      icon: <IconTrendingUp size={18} />,
      accentColor: '#06b6d4', // Cyan
      badge: 'Trésorerie',
    },
    {
      id: 'detail' as AppModuleId,
      path: '/detail',
      label: 'Détail B2C',
      subtitle: 'Packs Rentrée',
      icon: <IconBag size={18} />,
      accentColor: '#f59e0b', // Amber
      badge: 'Boutique',
    },
  ];

  if (variant === 'header_pills') {
    return (
      <div
        className="app-module-header-pills flex items-center gap-1.5 p-1 overflow-x-auto"
        style={{
          background: 'rgba(0, 0, 0, 0.45)',
          borderRadius: 9999,
          border: '1px solid rgba(255, 255, 255, 0.08)',
          backdropFilter: 'blur(12px)',
        }}
      >
        {modules.map((m) => {
          const isActive = activeModule === m.id;
          return (
            <button
              key={m.id}
              type="button"
              className="flex items-center gap-2 px-3 py-1.5 rounded-full transition-all text-xs font-bold whitespace-nowrap"
              style={{
                backgroundColor: isActive ? m.accentColor : 'transparent',
                color: isActive ? '#ffffff' : 'var(--muted)',
                boxShadow: isActive ? `0 2px 10px ${m.accentColor}55` : 'none',
              }}
              onClick={() => handleSwitch(m.id, m.path)}
            >
              {m.icon}
              <span>{m.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // Floating Bottom Bar (Primary Mobile Ergonomic Thumb Zone)
  return (
    <div
      className="app-module-floating-bar"
      style={{
        position: 'fixed',
        bottom: 'max(10px, env(safe-area-inset-bottom, 10px))',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 24px)',
        maxWidth: 540,
        zIndex: 900,
        backgroundColor: 'rgba(18, 20, 26, 0.94)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: 28,
        padding: '6px 8px',
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: 4,
        boxShadow: '0 20px 45px rgba(0, 0, 0, 0.8), 0 0 25px rgba(59, 130, 246, 0.12)',
      }}
    >
      {modules.map((m) => {
        const isActive = activeModule === m.id;
        return (
          <button
            key={m.id}
            type="button"
            className="flex flex-col items-center justify-center transition-all relative"
            style={{
              padding: '6px 4px',
              borderRadius: 20,
              minHeight: 48, // Fitts's law: >= 48px touch target
              backgroundColor: isActive ? `${m.accentColor}22` : 'transparent',
              border: isActive ? `1px solid ${m.accentColor}66` : '1px solid transparent',
              color: isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.6)',
              cursor: 'pointer',
            }}
            onClick={() => handleSwitch(m.id, m.path)}
          >
            <div
              style={{
                color: isActive ? m.accentColor : 'inherit',
                transform: isActive ? 'scale(1.1)' : 'scale(1)',
                transition: 'transform 0.15s ease',
              }}
            >
              {m.icon}
            </div>
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: isActive ? 800 : 600,
                marginTop: 2,
                letterSpacing: '-0.01em',
              }}
            >
              {m.label}
            </span>
            {isActive && (
              <span
                style={{
                  position: 'absolute',
                  top: 3,
                  right: 4,
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  backgroundColor: m.accentColor,
                  boxShadow: `0 0 6px ${m.accentColor}`,
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
};
