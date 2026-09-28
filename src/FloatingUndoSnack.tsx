// ============================================================
// POINTAGE — FloatingUndoSnack
// Nielsen Heuristic #3: User Control & Freedom (Emergency Exit)
// Bastien-Scapin: Assistance in Error Handling & Recovery
// Reversible 4.5s countdown toast with 1-tap undo cushion
// ============================================================

import { useState, useEffect } from 'react';
import { IconUndo, IconCheck, IconX } from './icons';
import { hapticTap, playWarningBeep } from './audio';

export interface LastCountAction {
  lineId: number;
  lineNo: string;
  designation: string;
  quantity: number;
  stage: string;
  timestamp: number;
}

interface FloatingUndoSnackProps {
  action: LastCountAction | null;
  onUndo: (lineId: number) => Promise<void> | void;
  onDismiss: () => void;
  durationMs?: number;
}

export function FloatingUndoSnack({
  action,
  onUndo,
  onDismiss,
  durationMs = 4500,
}: FloatingUndoSnackProps) {
  const [progress, setProgress] = useState(100);
  const [isUndoing, setIsUndoing] = useState(false);

  useEffect(() => {
    if (!action) return;

    setProgress(100);
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remainingPct = Math.max(0, 100 - (elapsed / durationMs) * 100);
      setProgress(remainingPct);

      if (remainingPct <= 0) {
        clearInterval(interval);
        onDismiss();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [action, durationMs, onDismiss]);

  if (!action) return null;

  const handleUndoClick = async () => {
    if (isUndoing) return;
    setIsUndoing(true);
    hapticTap('medium');
    playWarningBeep();
    try {
      await onUndo(action.lineId);
    } finally {
      setIsUndoing(false);
      onDismiss();
    }
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 86,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 32px)',
        maxWidth: 440,
        zIndex: 1000,
        backgroundColor: 'rgba(22, 23, 27, 0.94)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(16, 185, 129, 0.35)',
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.6), 0 0 16px rgba(16, 185, 129, 0.15)',
        borderRadius: 20,
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        animation: 'slideUpSnack 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        {/* Left status badge & details */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent)',
              flexShrink: 0,
            }}
          >
            <IconCheck size={18} />
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  fontSize: '0.92rem',
                  fontWeight: 800,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.2px',
                }}
              >
                +{action.quantity}
              </span>
              <span
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  padding: '2px 6px',
                  borderRadius: 6,
                  color: 'var(--text-secondary)',
                }}
              >
                Ligne N°{action.lineNo}
              </span>
            </div>
            <div
              style={{
                fontSize: '0.78rem',
                color: 'var(--text-muted)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                marginTop: 2,
              }}
            >
              {action.designation}
            </div>
          </div>
        </div>

        {/* Action button: 48px thumb target */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            onClick={handleUndoClick}
            disabled={isUndoing}
            style={{
              minHeight: 44,
              padding: '0 14px',
              borderRadius: 12,
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              color: '#f87171',
              fontWeight: 800,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              transition: 'background-color 0.15s ease',
            }}
          >
            <IconUndo size={16} />
            <span>Annuler</span>
          </button>

          <button
            type="button"
            onClick={onDismiss}
            aria-label="Fermer"
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IconX size={16} />
          </button>
        </div>
      </div>

      {/* Countdown progress indicator */}
      <div
        style={{
          width: '100%',
          height: 3,
          backgroundColor: 'rgba(255, 255, 255, 0.08)',
          borderRadius: 9999,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${progress}%`,
            backgroundColor: 'var(--accent)',
            borderRadius: 9999,
            transition: 'width 0.05s linear',
          }}
        />
      </div>
    </div>
  );
}
