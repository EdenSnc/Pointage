// ============================================================
// POINTAGE — WarehouseProcessFlow (Interactive Logistical Pipeline)
// Visual Pipeline Diagram: [Préparation] -> [Chargement] -> [Pointage]
// With luminous connectors, completion badges, active pulse, and VAKT feedback
// ============================================================

import React from 'react';
import type { Stage } from './types';
import { IconBox, IconTruck, IconClipboard, IconCheck } from './icons';
import { hapticTap } from './audio';

export interface StageFlowMetric {
  done: number;
  total: number;
  percent: number;
  operatorName?: string | null;
}

interface WarehouseProcessFlowProps {
  currentStage: Stage;
  onSelectStage: (stage: Stage) => void;
  metrics: Record<Stage, StageFlowMetric>;
  onToggleCollapse?: () => void;
  className?: string;
}

const STAGES: { id: Stage; label: string; icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }> }[] = [
  { id: 'preparation', label: 'Prépa', icon: IconBox },
  { id: 'chargement', label: 'Chargement', icon: IconTruck },
  { id: 'pointage', label: 'Pointage', icon: IconClipboard },
];

export function WarehouseProcessFlow({
  currentStage,
  onSelectStage,
  metrics,
  onToggleCollapse,
  className = '',
}: WarehouseProcessFlowProps) {
  const handleStageClick = (s: Stage) => {
    if (s !== currentStage) {
      hapticTap('light');
      onSelectStage(s);
    }
  };

  return (
    <div
      className={`warehouse-flow-container ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '12px 14px',
        background: 'var(--bg-card)',
        borderRadius: '24px',
        border: 'var(--glass-border)',
        boxShadow: 'var(--glass-shadow)',
        marginBottom: '14px',
        userSelect: 'none',
        position: 'relative',
      }}
    >
      {/* Optional Integrated Header with Collapse Toggle */}
      {onToggleCollapse && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
            paddingBottom: 6,
            borderBottom: '1px solid var(--glass-border-subtle)',
          }}
        >
          <span
            style={{
              fontSize: '0.68rem',
              fontWeight: 800,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}
          >
            Flux Logistique
          </span>
          <button
            type="button"
            className="btn btn-xs btn-ghost"
            style={{
              padding: '2px 8px',
              borderRadius: 9999,
              fontSize: '0.7rem',
              color: 'var(--text-secondary)',
              fontWeight: 600,
            }}
            onClick={onToggleCollapse}
          >
            ▲ Masquer
          </button>
        </div>
      )}

      {/* Nodes and Flow Connectors */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          width: '100%',
          position: 'relative',
        }}
      >
        {STAGES.map((st, idx) => {
          const isCurrent = currentStage === st.id;
          const metric = metrics[st.id] || { done: 0, total: 0, percent: 0 };
          const isComplete = metric.percent === 100 && metric.total > 0;
          const IconComponent = st.icon;

          return (
            <div
              key={st.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                flex: 1,
                minWidth: 0,
                position: 'relative',
              }}
              onClick={() => handleStageClick(st.id)}
            >
              {/* Perfectly centered connector line spanning to next column */}
              {idx < STAGES.length - 1 && (
                <div
                  style={{
                    position: 'absolute',
                    top: 20.5,
                    left: 'calc(50% + 25px)',
                    width: 'calc(100% - 50px)',
                    height: 3,
                    borderRadius: 9999,
                    background:
                      metric.percent === 100
                        ? 'linear-gradient(90deg, var(--accent) 0%, rgba(16, 185, 129, 0.4) 100%)'
                        : 'var(--bg-surface-elevated)',
                    transition: 'background 0.3s ease',
                    zIndex: 1,
                  }}
                />
              )}

              {/* Circular Icon Pill with Pulse */}
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: isCurrent
                    ? 'var(--accent)'
                    : isComplete
                    ? 'rgba(16, 185, 129, 0.2)'
                    : 'var(--bg-surface)',
                  color: isCurrent
                    ? '#ffffff'
                    : isComplete
                    ? 'var(--accent)'
                    : 'var(--text-muted)',
                  border: isCurrent
                    ? '2px solid rgba(255, 255, 255, 0.4)'
                    : isComplete
                    ? '1.5px solid var(--accent)'
                    : '1px solid var(--glass-border-subtle)',
                  boxShadow: isCurrent
                    ? '0 0 18px rgba(16, 185, 129, 0.45)'
                    : isComplete
                    ? '0 2px 8px rgba(16, 185, 129, 0.15)'
                    : 'none',
                  transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                  position: 'relative',
                  zIndex: 2,
                }}
              >
                <IconComponent size={20} />

                {/* Micro completion badge */}
                {isComplete && !isCurrent && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: -2,
                      right: -2,
                      width: 15,
                      height: 15,
                      borderRadius: '50%',
                      background: 'var(--accent)',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1.5px solid var(--bg-card)',
                    }}
                  >
                    <IconCheck size={9} />
                  </div>
                )}
              </div>

              {/* Label & Progress Capsule */}
              <div style={{ textAlign: 'center', minWidth: 0, width: '100%', zIndex: 2 }}>
                <div
                  style={{
                    fontSize: '0.78rem',
                    fontWeight: isCurrent ? 800 : 600,
                    color: isCurrent ? 'var(--text-primary)' : 'var(--text-secondary)',
                    lineHeight: 1.1,
                    letterSpacing: '-0.01em',
                  }}
                >
                  {st.label}
                </div>

                <div
                  style={{
                    marginTop: 3,
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    color: isComplete
                      ? 'var(--accent)'
                      : isCurrent
                      ? 'var(--text-primary)'
                      : 'var(--text-muted)',
                  }}
                >
                  {metric.percent}%
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
