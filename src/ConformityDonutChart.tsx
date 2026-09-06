import React from 'react';
import { IconBox, IconClipboard, IconCheck, IconUndo } from './icons';

interface ConformityDonutChartProps {
  totalLines: number;
  conformeCount: number;
  shortCount: number;
  overCount: number;
  problemCount: number;
  actualPieces: number;
  orderedPieces: number;
  totalAmountTtc?: number;
  isPriced?: boolean;
  billStatus?: 'active' | 'completed';
  onToggleStatus?: () => void;
}

export function ConformityDonutChart({
  totalLines,
  conformeCount,
  shortCount,
  overCount,
  problemCount,
  actualPieces,
  orderedPieces,
  totalAmountTtc,
  isPriced,
  billStatus,
  onToggleStatus,
}: ConformityDonutChartProps) {
  // Calculate completion / conformity percentage
  const total = totalLines || 1;
  const pctConforme = Math.min(100, Math.round((conformeCount / total) * 100));
  const isFullConform = problemCount === 0 && shortCount === 0 && actualPieces >= orderedPieces && orderedPieces > 0;

  // Donut geometry specs (Apple style)
  const size = 148;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2; // 67
  const circumference = 2 * Math.PI * radius; // ~420.97

  // Segment stroke dashes
  const conformeDash = (conformeCount / total) * circumference;
  const shortDash = (shortCount / total) * circumference;
  const problemDash = (problemCount / total) * circumference;

  const conformeOffset = 0;
  const shortOffset = -conformeDash;
  const problemOffset = -(conformeDash + shortDash);

  const diffPieces = actualPieces - orderedPieces;

  return (
    <div className="donut-card">
      {/* Top Header Row: Status Toggle */}
      {billStatus && onToggleStatus && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%', marginBottom: 4 }}>
          <button
            type="button"
            className="btn btn-xs flex items-center gap-1.5"
            style={{
              background: billStatus === 'completed' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(16, 185, 129, 0.12)',
              color: billStatus === 'completed' ? 'var(--text-muted)' : 'var(--accent)',
              border: billStatus === 'completed' ? 'var(--glass-border-subtle)' : '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: 9999,
              padding: '3px 10px',
              fontWeight: 700,
            }}
            onClick={onToggleStatus}
            title={billStatus === 'completed' ? 'Réouvrir ce bon' : 'Clôturer et archiver'}
          >
            {billStatus === 'completed' ? (
              <>
                <IconUndo size={11} /> Archivé
              </>
            ) : (
              <>
                <IconCheck size={11} /> Bon Actif
              </>
            )}
          </button>
        </div>
      )}

      {/* SVG Donut */}
      <div className="donut-wrapper">
        <svg
          className="donut-svg"
          viewBox={`0 0 ${size} ${size}`}
        >
          <defs>
            <linearGradient id="donutJadeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>
            <linearGradient id="donutAmberGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#d97706" />
            </linearGradient>
            <linearGradient id="donutDangerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f87171" />
              <stop offset="100%" stopColor="#dc2626" />
            </linearGradient>
          </defs>

          {/* Background Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--bg-surface-elevated, rgba(255, 255, 255, 0.08))"
            strokeWidth={strokeWidth}
          />

          {/* Conforme Segment */}
          {conformeCount > 0 && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="url(#donutJadeGrad)"
              strokeWidth={strokeWidth}
              strokeDasharray={`${conformeDash} ${circumference}`}
              strokeDashoffset={conformeOffset}
              strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 0.5s ease' }}
            />
          )}

          {/* Short / Incomplete Segment */}
          {shortCount > 0 && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="url(#donutAmberGrad)"
              strokeWidth={strokeWidth}
              strokeDasharray={`${shortDash} ${circumference}`}
              strokeDashoffset={shortOffset}
              strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 0.5s ease' }}
            />
          )}

          {/* Anomaly / Problem Segment */}
          {problemCount > 0 && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="url(#donutDangerGrad)"
              strokeWidth={strokeWidth}
              strokeDasharray={`${problemDash} ${circumference}`}
              strokeDashoffset={problemOffset}
              strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 0.5s ease' }}
            />
          )}
        </svg>

        {/* Center Glanceable KPI */}
        <div className="donut-center-content">
          <div className="donut-kpi-val">
            {isFullConform ? '100%' : `${pctConforme}%`}
          </div>
          <div
            className="donut-kpi-sub"
            style={{ color: isFullConform ? 'var(--accent)' : shortCount > 0 ? '#f59e0b' : 'var(--text-muted)' }}
          >
            {isFullConform ? 'Conforme' : diffPieces !== 0 ? `${diffPieces > 0 ? `+${diffPieces}` : diffPieces} pcs` : `${problemCount} écarts`}
          </div>
        </div>
      </div>

      {/* Glanceable Metrics Pills (Miller's chunk: 3 items max) */}
      <div className="donut-pills-row">
        <div className="donut-pill">
          <IconBox size={14} style={{ color: 'var(--text-muted)' }} />
          <span><strong>{actualPieces}</strong> / {orderedPieces} pièces</span>
        </div>

        <div className="donut-pill">
          <IconClipboard size={14} style={{ color: 'var(--text-muted)' }} />
          <span><strong>{totalLines}</strong> articles</span>
        </div>

        {isPriced && totalAmountTtc != null && totalAmountTtc > 0 && (
          <div className="donut-pill donut-pill-success font-mono">
            <span><strong>{totalAmountTtc.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</strong> DA</span>
          </div>
        )}
      </div>
    </div>
  );
}
