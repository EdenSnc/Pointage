import React from 'react';

export type EmptyStateType = 'warning' | 'plus' | 'search' | 'archive' | 'info';

export interface EmptyStateIllustrationProps {
  type?: EmptyStateType;
  size?: number;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function EmptyStateIllustration({
  type = 'warning',
  size = 180,
  title,
  subtitle,
  action,
  className = '',
  style,
}: EmptyStateIllustrationProps) {
  // Badge configuration by type
  const badgeConfig = {
    warning: {
      gradStart: '#ff4b55',
      gradMid: '#e11d48',
      gradEnd: '#9f1239',
      glow: 'rgba(225, 29, 72, 0.45)',
      shadow: 'rgba(159, 18, 57, 0.6)',
    },
    plus: {
      gradStart: '#34d399',
      gradMid: '#10b981',
      gradEnd: '#047857',
      glow: 'rgba(16, 185, 129, 0.45)',
      shadow: 'rgba(4, 120, 87, 0.6)',
    },
    search: {
      gradStart: '#38bdf8',
      gradMid: '#0284c7',
      gradEnd: '#0369a1',
      glow: 'rgba(2, 132, 199, 0.45)',
      shadow: 'rgba(3, 105, 161, 0.6)',
    },
    archive: {
      gradStart: '#fbbf24',
      gradMid: '#d97706',
      gradEnd: '#92400e',
      glow: 'rgba(217, 119, 6, 0.45)',
      shadow: 'rgba(146, 64, 14, 0.6)',
    },
    info: {
      gradStart: '#818cf8',
      gradMid: '#6366f1',
      gradEnd: '#4338ca',
      glow: 'rgba(99, 102, 241, 0.45)',
      shadow: 'rgba(67, 56, 202, 0.6)',
    },
  }[type] || {
    gradStart: '#ff4b55',
    gradMid: '#e11d48',
    gradEnd: '#9f1239',
    glow: 'rgba(225, 29, 72, 0.45)',
    shadow: 'rgba(159, 18, 57, 0.6)',
  };

  const badgeId = `badgeGrad_${type}`;
  const badgeFilterId = `badgeGlow_${type}`;

  return (
    <div
      className={`empty-state ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '36px 16px',
        textAlign: 'center',
        userSelect: 'none',
        ...style,
      }}
    >
      <div className="empty-state-illustration" style={{ position: 'relative', width: size, height: Math.round(size * 0.9) }}>
        <svg
          width={size}
          height={Math.round(size * 0.9)}
          viewBox="0 0 200 180"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ overflow: 'visible', display: 'block' }}
        >
          <defs>
            {/* Box exterior gradients utilizing theme CSS tokens */}
            <linearGradient id="boxFaceLeft" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--empty-box-left-1, #252a34)" />
              <stop offset="100%" stopColor="var(--empty-box-left-2, #161920)" />
            </linearGradient>

            <linearGradient id="boxFaceRight" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--empty-box-right-1, #3b4252)" />
              <stop offset="100%" stopColor="var(--empty-box-right-2, #242833)" />
            </linearGradient>

            <linearGradient id="boxFlapFL" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--empty-box-flap-fl-1, #323846)" />
              <stop offset="100%" stopColor="var(--empty-box-flap-fl-2, #21252f)" />
            </linearGradient>

            <linearGradient id="boxFlapFR" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--empty-box-flap-fr-1, #4a5366)" />
              <stop offset="100%" stopColor="var(--empty-box-flap-fr-2, #2e3442)" />
            </linearGradient>

            <linearGradient id="boxFlapBL" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--empty-box-flap-bl-1, #2c323f)" />
              <stop offset="100%" stopColor="var(--empty-box-flap-bl-2, #1e222b)" />
            </linearGradient>

            <linearGradient id="boxFlapBR" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--empty-box-flap-br-1, #3f4757)" />
              <stop offset="100%" stopColor="var(--empty-box-flap-br-2, #272c37)" />
            </linearGradient>

            {/* Cavity depth gradient */}
            <linearGradient id="boxCavityDepth" x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="var(--empty-box-cavity-1, #08090d)" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.98" />
            </linearGradient>

            {/* Floor contact shadow */}
            <radialGradient id="floorShadowGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--empty-box-shadow, rgba(0,0,0,0.65))" />
              <stop offset="60%" stopColor="var(--empty-box-shadow, rgba(0,0,0,0.3))" />
              <stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </radialGradient>

            {/* Floating Badge 3D Gradients */}
            <linearGradient id={badgeId} x1="30%" y1="0%" x2="70%" y2="100%">
              <stop offset="0%" stopColor={badgeConfig.gradStart} />
              <stop offset="50%" stopColor={badgeConfig.gradMid} />
              <stop offset="100%" stopColor={badgeConfig.gradEnd} />
            </linearGradient>

            {/* Badge Glass/Specular Highlight */}
            <linearGradient id="badgeGlassGrad" x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.7" />
              <stop offset="40%" stopColor="#ffffff" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>

            {/* Badge Drop Shadow */}
            <filter id={badgeFilterId} x="-25%" y="-20%" width="150%" height="160%">
              <feDropShadow dx="0" dy="8" stdDeviation="6" floodColor={badgeConfig.shadow} floodOpacity="0.55" />
              <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000000" floodOpacity="0.35" />
            </filter>
          </defs>

          {/* 1. Floor Soft Shadow */}
          <ellipse cx="100" cy="153" rx="66" ry="14" fill="url(#floorShadowGrad)" />

          {/* 2. Back Flaps (Rendered behind cavity) */}
          {/* Back-Left Flap */}
          <polygon
            points="45,82 100,55 82,38 28,66"
            fill="url(#boxFlapBL)"
            stroke="var(--empty-box-edge, rgba(255,255,255,0.12))"
            strokeWidth="0.75"
            strokeLinejoin="round"
          />
          {/* Back-Right Flap */}
          <polygon
            points="100,55 155,82 172,66 118,38"
            fill="url(#boxFlapBR)"
            stroke="var(--empty-box-edge, rgba(255,255,255,0.12))"
            strokeWidth="0.75"
            strokeLinejoin="round"
          />

          {/* 3. Deep Box Cavity (Interior 3D walls) */}
          {/* Interior back-left wall */}
          <polygon
            points="45,82 100,55 100,95 45,122"
            fill="var(--empty-box-cavity-wall, #1a1e27)"
          />
          {/* Interior back-right wall */}
          <polygon
            points="100,55 155,82 155,122 100,95"
            fill="var(--empty-box-cavity-1, #0c0e14)"
          />
          {/* Interior floor / deep cavity shadow */}
          <polygon
            points="45,82 100,55 155,82 100,110"
            fill="url(#boxCavityDepth)"
          />

          {/* 4. Badge Shadow Inside Cavity */}
          <ellipse
            cx="100"
            cy="88"
            rx="14"
            ry="4.5"
            fill="rgba(0, 0, 0, 0.45)"
            className="empty-badge-shadow"
          />

          {/* 5. Front Exterior Box Faces */}
          {/* Front-Left Face (in shadow) */}
          <polygon
            points="45,82 100,110 100,150 45,122"
            fill="url(#boxFaceLeft)"
            stroke="var(--empty-box-edge, rgba(255,255,255,0.12))"
            strokeWidth="0.75"
            strokeLinejoin="round"
          />
          {/* Front-Right Face (highlighted) */}
          <polygon
            points="100,110 155,82 155,122 100,150"
            fill="url(#boxFaceRight)"
            stroke="var(--empty-box-edge, rgba(255,255,255,0.12))"
            strokeWidth="0.75"
            strokeLinejoin="round"
          />

          {/* Vertical Corner Crease Specular Accent */}
          <line
            x1="100"
            y1="110"
            x2="100"
            y2="150"
            stroke="var(--empty-box-edge, rgba(255,255,255,0.22))"
            strokeWidth="1"
          />

          {/* 6. Front Flaps (Folded downward) */}
          {/* Front-Left Flap */}
          <polygon
            points="45,82 100,110 78,128 24,98"
            fill="url(#boxFlapFL)"
            stroke="var(--empty-box-edge, rgba(255,255,255,0.15))"
            strokeWidth="0.75"
            strokeLinejoin="round"
          />
          {/* Front-Left Flap Thickness Bottom Lip */}
          <polygon
            points="24,98 78,128 78,130 24,100"
            fill="rgba(0,0,0,0.35)"
          />

          {/* Front-Right Flap */}
          <polygon
            points="100,110 155,82 176,98 122,128"
            fill="url(#boxFlapFR)"
            stroke="var(--empty-box-edge, rgba(255,255,255,0.18))"
            strokeWidth="0.75"
            strokeLinejoin="round"
          />
          {/* Front-Right Flap Thickness Bottom Lip */}
          <polygon
            points="122,128 176,98 176,100 122,130"
            fill="rgba(0,0,0,0.35)"
          />

          {/* 7. Floating 3D Glossy Badge (Animated) */}
          <g className="empty-floating-badge" filter={`url(#${badgeFilterId})`}>
            {/* Glossy Badge Body with Pointer */}
            <path
              d="M 88 23 L 112 23 A 10 10 0 0 1 122 33 L 122 47 A 10 10 0 0 1 112 57 L 106 57 L 100 67 L 94 57 L 88 57 A 10 10 0 0 1 78 47 L 78 33 A 10 10 0 0 1 88 23 Z"
              fill={`url(#${badgeId})`}
              stroke="rgba(255, 255, 255, 0.45)"
              strokeWidth="1"
            />

            {/* Specular Bevel Shine / Curved Glass Highlight */}
            <path
              d="M 81 32 C 81 26, 88 25, 100 25 C 112 25, 119 26, 119 32 C 119 39, 111 43, 100 43 C 89 43, 81 39, 81 32 Z"
              fill="url(#badgeGlassGrad)"
            />

            {/* Badge Icon Graphic */}
            {type === 'warning' && (
              <g fill="#ffffff">
                {/* 3D Glossy Exclamation Mark */}
                <rect x="98" y="31" width="4" height="13" rx="2" />
                <circle cx="100" cy="49" r="2.3" />
              </g>
            )}

            {type === 'plus' && (
              <g stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round">
                <line x1="100" y1="32" x2="100" y2="48" />
                <line x1="92" y1="40" x2="108" y2="40" />
              </g>
            )}

            {type === 'search' && (
              <g stroke="#ffffff" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="98" cy="38" r="6" strokeWidth="2.5" fill="none" />
                <line x1="103" y1="43" x2="108" y2="48" strokeWidth="2.8" />
              </g>
            )}

            {type === 'archive' && (
              <g fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M91 34 h18 v4 h-18 z" fill="#ffffff" />
                <path d="M92 38 h16 v11 a2 2 0 0 1 -2 2 h-12 a2 2 0 0 1 -2 -2 z" />
                <line x1="97" y1="43" x2="103" y2="43" />
              </g>
            )}

            {type === 'info' && (
              <g fill="#ffffff">
                <circle cx="100" cy="32" r="2.2" />
                <rect x="98.5" y="37" width="3" height="12" rx="1.5" />
              </g>
            )}
          </g>
        </svg>
      </div>

      {title && <div className="empty-state-title">{title}</div>}
      {subtitle && <div className="empty-state-subtitle">{subtitle}</div>}
      {action && <div className="empty-state-actions">{action}</div>}
    </div>
  );
}
