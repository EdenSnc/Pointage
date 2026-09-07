// ============================================================
// POINTAGE — StageDistributionBar (Capsule Distribution Bar)
// Segmented visual bar chart for Conforme, Incomplet, Excédent, Anomalies
// Zero sharp corners, 100% pill geometry, Apple Health style
// ============================================================
import { IconCheck, IconAlertTriangle, IconPlus, IconX } from './icons';

interface StageDistributionBarProps {
  total: number;
  conforme: number;
  shortCount: number;
  overCount: number;
  problemCount: number;
  className?: string;
}

export function StageDistributionBar({
  total,
  conforme,
  shortCount,
  overCount,
  problemCount,
  className = '',
}: StageDistributionBarProps) {
  const safeTotal = total > 0 ? total : 1;
  const pctConforme = Math.round((conforme / safeTotal) * 100);
  const pctShort = Math.round((shortCount / safeTotal) * 100);
  const pctOver = Math.round((overCount / safeTotal) * 100);
  const pctProblem = Math.round((problemCount / safeTotal) * 100);

  return (
    <div
      className={`stage-distribution-card ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: '16px 18px',
        background: 'var(--bg-card)',
        borderRadius: '24px',
        border: 'var(--glass-border)',
        boxShadow: 'var(--glass-shadow)',
        marginBottom: 16,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--text-primary)' }}>
          Répartition de Conformité ({total} lignes)
        </span>
        <span style={{ fontSize: '0.74rem', fontWeight: 800, color: 'var(--accent)' }}>
          {pctConforme}% conforme
        </span>
      </div>

      {/* Segmented Capsule Bar */}
      <div
        style={{
          display: 'flex',
          height: 12,
          width: '100%',
          borderRadius: 9999,
          overflow: 'hidden',
          background: 'var(--bg-surface-elevated)',
          gap: 2,
        }}
      >
        {pctConforme > 0 && (
          <div
            style={{
              width: `${pctConforme}%`,
              background: 'linear-gradient(90deg, #10b981, #059669)',
              borderRadius: '9999px',
              transition: 'width 0.4s ease',
            }}
            title={`Conforme: ${conforme} (${pctConforme}%)`}
          />
        )}
        {pctShort > 0 && (
          <div
            style={{
              width: `${pctShort}%`,
              background: 'linear-gradient(90deg, #fbbf24, #f59e0b)',
              borderRadius: '9999px',
              transition: 'width 0.4s ease',
            }}
            title={`Incomplet / Manquant: ${shortCount} (${pctShort}%)`}
          />
        )}
        {pctOver > 0 && (
          <div
            style={{
              width: `${pctOver}%`,
              background: 'linear-gradient(90deg, #c084fc, #9333ea)',
              borderRadius: '9999px',
              transition: 'width 0.4s ease',
            }}
            title={`Excédent: ${overCount} (${pctOver}%)`}
          />
        )}
        {pctProblem > 0 && (
          <div
            style={{
              width: `${pctProblem}%`,
              background: 'linear-gradient(90deg, #f87171, #ef4444)',
              borderRadius: '9999px',
              transition: 'width 0.4s ease',
            }}
            title={`Anomalies: ${problemCount} (${pctProblem}%)`}
          />
        )}
      </div>

      {/* Visual Legend with Micro-Pills */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: '0.7rem',
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 9999,
            background: 'rgba(16, 185, 129, 0.15)',
            color: 'var(--accent)',
          }}
        >
          <IconCheck size={11} /> {conforme} Conformes
        </span>

        {shortCount > 0 && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: '0.7rem',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 9999,
              background: 'rgba(245, 158, 11, 0.15)',
              color: 'var(--warning)',
            }}
          >
            <IconAlertTriangle size={11} /> {shortCount} Manquants
          </span>
        )}

        {overCount > 0 && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: '0.7rem',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 9999,
              background: 'rgba(168, 85, 247, 0.15)',
              color: '#a855f7',
            }}
          >
            <IconPlus size={11} /> +{overCount} Excédent
          </span>
        )}

        {problemCount > 0 && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: '0.7rem',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 9999,
              background: 'rgba(239, 68, 68, 0.15)',
              color: 'var(--danger)',
            }}
          >
            <IconX size={11} /> {problemCount} Anomalies
          </span>
        )}
      </div>
    </div>
  );
}
