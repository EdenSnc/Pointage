import { IconBox, IconClipboard, IconCheck, IconUndo, IconArchive } from './icons';

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
  // Calculate completion percentage based on pieces fulfilled (capped at 100%)
  const total = totalLines || 1;
  const totalPiecesFulfilled = Math.min(orderedPieces, actualPieces);
  const pctProgress = orderedPieces > 0
    ? Math.min(100, Math.round((totalPiecesFulfilled / orderedPieces) * 100))
    : (actualPieces > 0 ? 100 : 0);
  const diffPieces = actualPieces - orderedPieces;

  // Exact 100% full conformity requires 0 problems, 0 short, 0 over, and exact piece match
  const isFullConform =
    problemCount === 0 &&
    shortCount === 0 &&
    overCount === 0 &&
    actualPieces === orderedPieces &&
    orderedPieces > 0;

  const isNotStarted = actualPieces === 0;
  const hasSurplus = (overCount > 0 || diffPieces > 0) && shortCount === 0 && problemCount === 0;

  // Active segments count for clean boundary caps
  const activeSegmentsCount = [conformeCount, overCount, shortCount, problemCount].filter(c => c > 0).length;
  const strokeLinecap = activeSegmentsCount > 1 ? 'butt' : 'round';

  // Donut geometry specs (Apple style)
  const size = 148;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2; // 67
  const circumference = 2 * Math.PI * radius; // ~420.97

  // Segment stroke dashes
  const conformeDash = (conformeCount / total) * circumference;
  const overDash = (overCount / total) * circumference;
  const shortDash = (shortCount / total) * circumference;
  const problemDash = (problemCount / total) * circumference;

  const conformeOffset = 0;
  const overOffset = -conformeDash;
  const shortOffset = -(conformeDash + overDash);
  const problemOffset = -(conformeDash + overDash + shortDash);

  // Center KPI value & Subtitle determination
  let kpiVal = `${pctProgress}%`;
  let kpiSubText = 'Préparé';
  let kpiSubColor = 'var(--text-muted)';

  if (isNotStarted) {
    kpiVal = '0%';
    kpiSubText = 'À pointer';
    kpiSubColor = 'var(--text-muted)';
  } else if (isFullConform) {
    kpiVal = '100%';
    kpiSubText = 'Conforme';
    kpiSubColor = 'var(--accent)';
  } else if (hasSurplus) {
    // 100% of order was fulfilled, plus surplus units
    kpiVal = '100%';
    kpiSubText = `+${diffPieces > 0 ? diffPieces : overCount} pcs Excédent`;
    kpiSubColor = '#a855f7';
  } else if (problemCount > 0) {
    kpiVal = `${pctProgress}%`;
    kpiSubText = `${problemCount} anomalie${problemCount > 1 ? 's' : ''}`;
    kpiSubColor = '#ef4444';
  } else if (shortCount > 0) {
    const missing = Math.abs(diffPieces);
    kpiVal = `${pctProgress}%`;
    kpiSubText = missing > 0 ? `${missing} manquantes` : `${shortCount} incomplets`;
    kpiSubColor = '#f59e0b';
  }

  return (
    <div className="donut-card">
      {/* Top Header Row: Status Badge & Safe Action Button */}
      {billStatus && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, width: '100%', marginBottom: 6 }}>
          <span
            className="badge"
            style={{
              background: billStatus === 'completed' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(16, 185, 129, 0.12)',
              color: billStatus === 'completed' ? 'var(--text-muted)' : 'var(--accent)',
              border: billStatus === 'completed' ? 'var(--glass-border-subtle)' : '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: 9999,
              padding: '3px 10px',
              fontWeight: 700,
              fontSize: '0.72rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {billStatus === 'completed' ? <IconClipboard size={12} /> : <IconBox size={12} />}
            {billStatus === 'completed' ? 'Archivé' : 'Bon Actif'}
          </span>

          {onToggleStatus && (
            <button
              type="button"
              className={`btn btn-xs ${billStatus === 'completed' ? 'btn-primary' : 'btn-secondary'} flex items-center gap-1`}
              style={{
                borderRadius: 9999,
                padding: '3px 10px',
                fontSize: '0.72rem',
                fontWeight: 600,
              }}
              onClick={onToggleStatus}
              title={billStatus === 'completed' ? 'Restaurer dans les bons actifs' : 'Clôturer et archiver'}
            >
              {billStatus === 'completed' ? (
                <>
                  <IconUndo size={11} /> Restaurer
                </>
              ) : (
                <>
                  <IconArchive size={11} /> Archiver
                </>
              )}
            </button>
          )}
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
            <linearGradient id="donutPurpleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#c084fc" />
              <stop offset="100%" stopColor="#9333ea" />
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
              strokeLinecap={strokeLinecap}
              style={{ transition: 'stroke-dasharray 0.5s ease' }}
            />
          )}

          {/* Over / Surplus Segment */}
          {overCount > 0 && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="url(#donutPurpleGrad)"
              strokeWidth={strokeWidth}
              strokeDasharray={`${overDash} ${circumference}`}
              strokeDashoffset={overOffset}
              strokeLinecap={strokeLinecap}
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
              strokeLinecap={strokeLinecap}
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
              strokeLinecap={strokeLinecap}
              style={{ transition: 'stroke-dasharray 0.5s ease' }}
            />
          )}
        </svg>

        {/* Center Glanceable KPI */}
        <div className="donut-center-content">
          <div className="donut-kpi-val">
            {kpiVal}
          </div>
          <div
            className="donut-kpi-sub"
            style={{ color: kpiSubColor }}
          >
            {kpiSubText}
          </div>
        </div>
      </div>

      {/* Visual Line Breakdown Legend */}
      {(conformeCount > 0 || overCount > 0 || shortCount > 0 || problemCount > 0) && (
        <div className="donut-legend">
          {conformeCount > 0 && (
            <span className="donut-legend-item">
              <span className="donut-legend-dot" style={{ background: 'var(--accent)' }} />
              {conformeCount} conforme{conformeCount > 1 ? 's' : ''}
            </span>
          )}
          {overCount > 0 && (
            <span className="donut-legend-item">
              <span className="donut-legend-dot" style={{ background: '#a855f7' }} />
              {overCount} excédent{overCount > 1 ? 's' : ''}
            </span>
          )}
          {shortCount > 0 && (
            <span className="donut-legend-item">
              <span className="donut-legend-dot" style={{ background: '#f59e0b' }} />
              {shortCount} incomplet{shortCount > 1 ? 's' : ''}
            </span>
          )}
          {problemCount > 0 && (
            <span className="donut-legend-item">
              <span className="donut-legend-dot" style={{ background: '#ef4444' }} />
              {problemCount} anomalie{problemCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

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
