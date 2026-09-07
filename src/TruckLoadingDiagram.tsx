// ============================================================
// POINTAGE — TruckLoadingDiagram (Visual Cargo & Dock Map)
// Intuitive graphical map of truck cargo vs dock staging
// Zero text clutter, pure visual boxes with status indicators
// ============================================================
import { IconTruck, IconBox } from './icons';

interface TruckLoadingDiagramProps {
  tripNumber?: number;
  totalTrips?: number;
  loadedContainersCount: number;
  loadedUnitsCount: number;
  dockRemainingContainersCount: number;
  dockRemainingUnitsCount: number;
  isFullyShipped?: boolean;
  className?: string;
}

export function TruckLoadingDiagram({
  tripNumber = 1,
  totalTrips = 1,
  loadedContainersCount,
  loadedUnitsCount,
  dockRemainingContainersCount,
  dockRemainingUnitsCount,
  isFullyShipped = false,
  className = '',
}: TruckLoadingDiagramProps) {
  return (
    <div
      className={`truck-loading-diagram ${className}`}
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
      {/* Header with Visual Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: isFullyShipped ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)',
              color: isFullyShipped ? 'var(--accent)' : '#3b82f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IconTruck size={17} />
          </div>
          <span style={{ fontSize: '0.86rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            Plan de Chargement — Voyage {tripNumber} {totalTrips > 1 ? `/ ${totalTrips}` : ''}
          </span>
        </div>

        <span
          style={{
            fontSize: '0.72rem',
            fontWeight: 800,
            padding: '3px 10px',
            borderRadius: '9999px',
            background: isFullyShipped ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
            color: isFullyShipped ? 'var(--accent)' : 'var(--warning)',
          }}
        >
          {isFullyShipped ? '✓ Expédition Complète' : 'En rotation'}
        </span>
      </div>

      {/* Visual Two-Zone Grid: [Camion] | [Quai d'attente] */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 4 }}>
        {/* Zone 1: Dans le Camion */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: '12px 14px',
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1.5px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--accent)' }}>
              🚚 Dans ce Camion
            </span>
            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--accent)' }}>
              {loadedContainersCount} colis
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {loadedUnitsCount}
            </span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>pièces chargées</span>
          </div>

          {/* Visual Miniature Parcel Icons */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
            {Array.from({ length: Math.min(6, loadedContainersCount || 1) }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 6,
                  background: 'var(--accent)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title={`Colis chargé #${i + 1}`}
              >
                <IconBox size={11} />
              </div>
            ))}
            {loadedContainersCount > 6 && (
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--accent)', alignSelf: 'center' }}>
                +{loadedContainersCount - 6}
              </span>
            )}
          </div>
        </div>

        {/* Zone 2: Reste à Quai */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: '12px 14px',
            background: dockRemainingContainersCount > 0 ? 'rgba(245, 158, 11, 0.08)' : 'var(--bg-surface)',
            border: dockRemainingContainersCount > 0 ? '1.5px solid rgba(245, 158, 11, 0.3)' : '1px solid var(--glass-border-subtle)',
            borderRadius: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{
                fontSize: '0.74rem',
                fontWeight: 700,
                color: dockRemainingContainersCount > 0 ? 'var(--warning)' : 'var(--text-muted)',
              }}
            >
              📦 Reste à Quai
            </span>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 800,
                color: dockRemainingContainersCount > 0 ? 'var(--warning)' : 'var(--text-muted)',
              }}
            >
              {dockRemainingContainersCount} colis
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {dockRemainingUnitsCount}
            </span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>pièces en attente</span>
          </div>

          {/* Visual Miniature Parcel Icons */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
            {dockRemainingContainersCount > 0 ? (
              <>
                {Array.from({ length: Math.min(6, dockRemainingContainersCount) }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 6,
                      background: 'rgba(245, 158, 11, 0.7)',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    title={`Colis à quai #${i + 1}`}
                  >
                    <IconBox size={11} />
                  </div>
                ))}
                {dockRemainingContainersCount > 6 && (
                  <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--warning)', alignSelf: 'center' }}>
                    +{dockRemainingContainersCount - 6}
                  </span>
                )}
              </>
            ) : (
              <span style={{ fontSize: '0.72rem', color: 'var(--accent)', fontWeight: 700 }}>
                Quai libéré ✓
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
