// ============================================================
// POINTAGE — ConcentricStageRings (Apple Watch Activity Style)
// Multi-Ring Visual Progress Indicator (Préparation / Chargement / Pointage)
// 100% SVG, Rounded Stroke Caps, Specular Glows, Zero Text Clutter
// ============================================================

import React from 'react';
import { IconCheck } from './icons';

export interface StageProgressValue {
  done: number;
  total: number;
  percent: number; // 0 to 100
}

interface ConcentricStageRingsProps {
  prep: StageProgressValue;
  load: StageProgressValue;
  point: StageProgressValue;
  size?: 'sm' | 'md' | 'lg';
  showCenterText?: boolean;
  className?: string;
  onClick?: () => void;
}

export function ConcentricStageRings({
  prep,
  load,
  point,
  size = 'sm',
  showCenterText = false,
  className = '',
  onClick,
}: ConcentricStageRingsProps) {
  // Dimension profiles
  const config = {
    sm: { size: 68, stroke: 5, gap: 2.5, fontSize: '0.65rem' },
    md: { size: 104, stroke: 7.5, gap: 3.5, fontSize: '0.88rem' },
    lg: { size: 140, stroke: 10, gap: 5, fontSize: '1.15rem' },
  }[size];

  const center = config.size / 2;

  // Radii for the 3 concentric rings (outer to inner)
  const rPrep = center - config.stroke / 2 - 2;
  const rLoad = rPrep - config.stroke - config.gap;
  const rPoint = rLoad - config.stroke - config.gap;

  // Circumferences
  const cPrep = 2 * Math.PI * rPrep;
  const cLoad = 2 * Math.PI * rLoad;
  const cPoint = 2 * Math.PI * rPoint;

  // Clamp percentages between 0 and 100
  const clampPct = (p: number) => Math.max(0, Math.min(100, Math.round(p || 0)));
  const pctPrep = clampPct(prep.percent);
  const pctLoad = clampPct(load.percent);
  const pctPoint = clampPct(point.percent);

  // Stroke Dashoffsets
  const offsetPrep = cPrep - (pctPrep / 100) * cPrep;
  const offsetLoad = cLoad - (pctLoad / 100) * cLoad;
  const offsetPoint = cPoint - (pctPoint / 100) * cPoint;

  // Average completion for center indicator
  const avgCompletion = Math.round((pctPrep + pctLoad + pctPoint) / 3);
  const isAllComplete = pctPrep === 100 && pctLoad === 100 && pctPoint === 100;

  // Unique SVG IDs per component instance
  const uid = React.useId().replace(/:/g, '');
  const gradPrepId = `ringPrepGrad-${uid}`;
  const gradLoadId = `ringLoadGrad-${uid}`;
  const gradPointId = `ringPointGrad-${uid}`;
  const glowFilterId = `ringGlow-${uid}`;

  return (
    <div
      className={`concentric-rings-wrapper ${className}`}
      style={{
        position: 'relative',
        width: config.size,
        height: config.size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none',
      }}
      onClick={onClick}
      title={`Préparation: ${pctPrep}% | Chargement: ${pctLoad}% | Pointage: ${pctPoint}%`}
    >
      <svg
        width={config.size}
        height={config.size}
        viewBox={`0 0 ${config.size} ${config.size}`}
        style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}
      >
        <defs>
          {/* Emerald Gradient for Préparation */}
          <linearGradient id={gradPrepId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>

          {/* Sapphire Blue Gradient for Chargement */}
          <linearGradient id={gradLoadId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#2563eb" />
          </linearGradient>

          {/* Amethyst Violet Gradient for Pointage */}
          <linearGradient id={gradPointId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#c084fc" />
            <stop offset="100%" stopColor="#7e22ce" />
          </linearGradient>

          {/* Subtle drop shadow glow */}
          <filter id={glowFilterId} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="rgba(0,0,0,0.5)" />
          </filter>
        </defs>

        {/* --- Background Tracks (Subtle Translucent Glass) --- */}
        <circle
          cx={center}
          cy={center}
          r={rPrep}
          fill="none"
          stroke="rgba(16, 185, 129, 0.15)"
          strokeWidth={config.stroke}
        />
        <circle
          cx={center}
          cy={center}
          r={rLoad}
          fill="none"
          stroke="rgba(59, 130, 246, 0.15)"
          strokeWidth={config.stroke}
        />
        <circle
          cx={center}
          cy={center}
          r={rPoint}
          fill="none"
          stroke="rgba(168, 85, 247, 0.15)"
          strokeWidth={config.stroke}
        />

        {/* --- Foreground Dynamic Progress Arcs with Rounded Caps --- */}
        {pctPrep > 0 && (
          <circle
            cx={center}
            cy={center}
            r={rPrep}
            fill="none"
            stroke={`url(#${gradPrepId})`}
            strokeWidth={config.stroke}
            strokeDasharray={cPrep}
            strokeDashoffset={offsetPrep}
            strokeLinecap="round"
            filter={`url(#${glowFilterId})`}
            style={{ transition: 'stroke-dashoffset 0.5s cubic-bezier(0.16, 1, 0.3, 1)' }}
          />
        )}

        {pctLoad > 0 && (
          <circle
            cx={center}
            cy={center}
            r={rLoad}
            fill="none"
            stroke={`url(#${gradLoadId})`}
            strokeWidth={config.stroke}
            strokeDasharray={cLoad}
            strokeDashoffset={offsetLoad}
            strokeLinecap="round"
            filter={`url(#${glowFilterId})`}
            style={{ transition: 'stroke-dashoffset 0.5s cubic-bezier(0.16, 1, 0.3, 1)' }}
          />
        )}

        {pctPoint > 0 && (
          <circle
            cx={center}
            cy={center}
            r={rPoint}
            fill="none"
            stroke={`url(#${gradPointId})`}
            strokeWidth={config.stroke}
            strokeDasharray={cPoint}
            strokeDashoffset={offsetPoint}
            strokeLinecap="round"
            filter={`url(#${glowFilterId})`}
            style={{ transition: 'stroke-dashoffset 0.5s cubic-bezier(0.16, 1, 0.3, 1)' }}
          />
        )}
      </svg>

      {/* Center Label (When enabled, e.g. medium or large display) */}
      {showCenterText && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            pointerEvents: 'none',
          }}
        >
          {isAllComplete ? (
            <IconCheck size={Math.round(config.size * 0.32)} style={{ color: 'var(--accent)' }} />
          ) : (
            <span
              style={{
                fontSize: config.fontSize,
                fontWeight: 800,
                color: 'var(--text-primary)',
                lineHeight: 1,
              }}
            >
              {avgCompletion}%
            </span>
          )}
        </div>
      )}
    </div>
  );
}
