import React from 'react';
import type { Theme } from '../theme/tokens';

interface ProgressRingProps {
  theme: Theme;
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
}

export default function ProgressRing({ theme, value, size = 64, stroke = 6, color }: ProgressRingProps) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.min(Math.max(value, 0), 1));

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size}>
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={theme.surface2} strokeWidth={stroke}
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={color ?? theme.accent}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset .5s ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size > 60 ? 17 : 13, fontWeight: 700,
        color: theme.text, letterSpacing: -0.3,
      }}>
        {Math.round(value * 100)}%
      </div>
    </div>
  );
}
