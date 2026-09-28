// ============================================================
// POINTAGE — HoldToConfirmModal
// Nielsen Heuristic #5: Error Prevention
// Bastien-Scapin: Assistance in Error Handling
// Replaces accidental single-taps and native window.confirm with
// a 1.5s tactile hold-to-confirm progress engine.
// ============================================================

import React, { useState, useRef, useEffect } from 'react';
import { IconAlertTriangle, IconCheck, IconX, IconLock } from './icons';
import { hapticTap, playSuccessChime, playWarningBeep } from './audio';

interface HoldToConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  dangerLevel?: 'danger' | 'warning' | 'primary';
  requiredHoldMs?: number;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export const HoldToConfirmModal: React.FC<HoldToConfirmModalProps> = ({
  isOpen,
  title,
  description,
  confirmLabel = 'Maintenir pour confirmer',
  dangerLevel = 'danger',
  requiredHoldMs = 1500,
  onConfirm,
  onCancel,
}) => {
  const [progress, setProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);

  const holdStartRef = useRef<number>(0);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setProgress(0);
      setIsHolding(false);
      setIsConfirmed(false);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const accentColor =
    dangerLevel === 'danger'
      ? 'var(--danger, #ef4444)'
      : dangerLevel === 'warning'
      ? 'var(--warning, #f59e0b)'
      : 'var(--accent, #10b981)';

  const startHold = () => {
    if (isConfirmed) return;
    setIsHolding(true);
    holdStartRef.current = Date.now();
    hapticTap('light');

    const update = () => {
      const elapsed = Date.now() - holdStartRef.current;
      const pct = Math.min(100, (elapsed / requiredHoldMs) * 100);
      setProgress(pct);

      if (pct >= 100) {
        setIsConfirmed(true);
        setIsHolding(false);
        hapticTap('heavy');
        playSuccessChime();
        setTimeout(async () => {
          await onConfirm();
        }, 150);
      } else {
        animFrameRef.current = requestAnimationFrame(update);
      }
    };

    animFrameRef.current = requestAnimationFrame(update);
  };

  const cancelHold = () => {
    if (isConfirmed) return;
    if (isHolding) {
      playWarningBeep();
      hapticTap('medium');
    }
    setIsHolding(false);
    setProgress(0);
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isConfirmed) {
          cancelHold();
          onCancel();
        }
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: 420,
          backgroundColor: 'var(--bg-card, #16171b)',
          border: '1px solid var(--glass-border-bright, rgba(255, 255, 255, 0.15))',
          borderRadius: 24,
          padding: 24,
          boxShadow: '0 20px 48px rgba(0, 0, 0, 0.8)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          animation: 'modalZoomIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Header with security icon */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              backgroundColor: `${accentColor}18`,
              border: `1px solid ${accentColor}44`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: accentColor,
              flexShrink: 0,
            }}
          >
            <IconAlertTriangle size={24} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <h3
              style={{
                margin: 0,
                fontSize: '1.15rem',
                fontWeight: 800,
                color: 'var(--text-primary, #ffffff)',
                letterSpacing: '-0.3px',
              }}
            >
              {title}
            </h3>
            <span
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-muted, #94a3b8)',
                fontWeight: 600,
              }}
            >
              Confirmation de sécurité (Poka-Yoke)
            </span>
          </div>
        </div>

        {/* Warning text description */}
        <div
          style={{
            fontSize: '0.9rem',
            lineHeight: 1.5,
            color: 'var(--text-secondary, #cbd5e1)',
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--glass-border-subtle, rgba(255, 255, 255, 0.08))',
            padding: 14,
            borderRadius: 14,
          }}
        >
          {description}
        </div>

        {/* Hold button area */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
          <button
            type="button"
            onPointerDown={startHold}
            onPointerUp={cancelHold}
            onPointerLeave={cancelHold}
            onContextMenu={(e) => e.preventDefault()}
            disabled={isConfirmed}
            style={{
              position: 'relative',
              width: '100%',
              minHeight: 56,
              borderRadius: 18,
              backgroundColor: isConfirmed
                ? 'var(--accent, #10b981)'
                : 'rgba(255, 255, 255, 0.06)',
              border: `2px solid ${isHolding ? accentColor : 'rgba(255, 255, 255, 0.18)'}`,
              color: '#ffffff',
              fontSize: '1rem',
              fontWeight: 800,
              cursor: 'pointer',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              touchAction: 'none',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: isHolding ? `0 0 20px ${accentColor}44` : 'none',
              transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
            }}
          >
            {/* Background progress fill */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: 0,
                width: `${progress}%`,
                backgroundColor: accentColor,
                opacity: 0.35,
                transition: isHolding ? 'none' : 'width 0.2s ease-out',
                zIndex: 1,
              }}
            />

            {/* Content label */}
            <span
              style={{
                position: 'relative',
                zIndex: 2,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {isConfirmed ? (
                <>
                  <IconCheck size={20} />
                  <span>Validé</span>
                </>
              ) : isHolding ? (
                <>
                  <IconLock size={18} />
                  <span>Maintenez... {Math.round(progress)}%</span>
                </>
              ) : (
                <>
                  <IconLock size={18} />
                  <span>{confirmLabel} (1.5s)</span>
                </>
              )}
            </span>
          </button>

          {/* Simple cancel button */}
          <button
            type="button"
            onClick={() => {
              cancelHold();
              onCancel();
            }}
            disabled={isConfirmed}
            style={{
              width: '100%',
              minHeight: 44,
              borderRadius: 14,
              backgroundColor: 'transparent',
              border: 'none',
              color: 'var(--text-muted, #94a3b8)',
              fontWeight: 700,
              fontSize: '0.88rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <IconX size={16} />
            <span>Annuler</span>
          </button>
        </div>
      </div>
    </div>
  );
};
